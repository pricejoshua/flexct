// Shared Sync Module

import { supabase } from '../config.js';
import {
  saveToLocalStorage,
  addToSyncQueue,
  removeFromSyncQueue,
  getSyncQueue
} from './storage.js';

let saveTimeout = null;
let saveIndicatorTimeout = null;
let syncInterval = null;
let autoSyncEnabled = true;

/**
 * Save project with debouncing
 */
export function debouncedSave(project, onSaveIndicator) {
  clearTimeout(saveTimeout);

  // Save to localStorage immediately
  saveToLocalStorage(project);

  if (onSaveIndicator) {
    onSaveIndicator('unsaved');
  }

  // Debounce server save
  saveTimeout = setTimeout(async () => {
    await saveProjectToServer(project, onSaveIndicator);
  }, 1500);
}

/**
 * Save project to Supabase server
 */
export async function saveProjectToServer(project, onSaveIndicator) {
  if (!project || !project.id) return;

  if (onSaveIndicator) {
    onSaveIndicator('syncing');
  }

  try {
    const { error } = await supabase
      .from('projects')
      .update({
        json_data: project.json_data,
        updated_at: new Date().toISOString()
      })
      .eq('id', project.id);

    if (error) throw error;

    // Success - remove from sync queue
    removeFromSyncQueue(project.id);

    if (onSaveIndicator) {
      onSaveIndicator('saved');
    }
  } catch (error) {
    console.error('Save error:', error);

    // Add to sync queue for retry
    addToSyncQueue(project.id);

    if (onSaveIndicator) {
      onSaveIndicator('error');
    }
  }
}

/**
 * Process sync queue (retry failed saves)
 */
export async function processSyncQueue(projectGetter, onSaveIndicator) {
  const queue = getSyncQueue();

  for (const projectId of queue) {
    const project = projectGetter ? projectGetter(projectId) : null;
    if (project) {
      await saveProjectToServer(project, onSaveIndicator);
    }
  }
}

/**
 * Start background sync (every 30 seconds)
 */
export function startBackgroundSync(getCurrentProject, onSaveIndicator) {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    if (autoSyncEnabled) {
      const project = getCurrentProject();
      if (project) {
        await saveProjectToServer(project, onSaveIndicator);
      }
    }
  }, 30000); // 30 seconds
}

/**
 * Stop background sync
 */
export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Enable/disable auto-sync
 */
export function setAutoSync(enabled) {
  autoSyncEnabled = enabled;
}

/**
 * Get auto-sync status
 */
export function isAutoSyncEnabled() {
  return autoSyncEnabled;
}

/**
 * Clear save timeout
 */
export function clearSaveTimeout() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}

/**
 * Clear save indicator timeout
 */
export function clearSaveIndicatorTimeout() {
  if (saveIndicatorTimeout) {
    clearTimeout(saveIndicatorTimeout);
    saveIndicatorTimeout = null;
  }
}
