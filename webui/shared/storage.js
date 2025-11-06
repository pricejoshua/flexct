// Shared LocalStorage Module

const STORAGE_PREFIX = 'flex_translation_';

/**
 * Get project key for localStorage
 */
export function getProjectKey(projectId) {
  return `${STORAGE_PREFIX}${projectId}`;
}

/**
 * Get sync queue key
 */
export function getSyncQueueKey() {
  return `${STORAGE_PREFIX}sync_queue`;
}

/**
 * Get view mode key
 */
export function getViewModeKey() {
  return `${STORAGE_PREFIX}view_mode`;
}

/**
 * Save project to localStorage
 */
export function saveToLocalStorage(project) {
  if (!project || !project.id) return;

  const key = getProjectKey(project.id);
  const dataToSave = {
    ...project,
    _lastModified: new Date().toISOString()
  };

  try {
    localStorage.setItem(key, JSON.stringify(dataToSave));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

/**
 * Load project from localStorage
 */
export function loadFromLocalStorage(projectId) {
  const key = getProjectKey(projectId);

  try {
    const data = localStorage.getItem(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading from localStorage:', error);
  }

  return null;
}

/**
 * Remove project from localStorage
 */
export function removeFromLocalStorage(projectId) {
  const key = getProjectKey(projectId);
  localStorage.removeItem(key);
}

/**
 * Get sync queue from localStorage
 */
export function getSyncQueue() {
  try {
    const data = localStorage.getItem(getSyncQueueKey());
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading sync queue:', error);
    return [];
  }
}

/**
 * Save sync queue to localStorage
 */
export function saveSyncQueue(queue) {
  try {
    localStorage.setItem(getSyncQueueKey(), JSON.stringify(queue));
  } catch (error) {
    console.error('Error saving sync queue:', error);
  }
}

/**
 * Add project to sync queue
 */
export function addToSyncQueue(projectId) {
  const queue = getSyncQueue();
  if (!queue.includes(projectId)) {
    queue.push(projectId);
    saveSyncQueue(queue);
  }
}

/**
 * Remove project from sync queue
 */
export function removeFromSyncQueue(projectId) {
  const queue = getSyncQueue();
  const filtered = queue.filter(id => id !== projectId);
  saveSyncQueue(filtered);
}

/**
 * Get view mode preference
 */
export function getViewMode() {
  return localStorage.getItem(getViewModeKey());
}

/**
 * Save view mode preference
 */
export function saveViewMode(mode) {
  localStorage.setItem(getViewModeKey(), mode);
}
