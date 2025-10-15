// App state
let currentUser = null;
let currentProject = null;
let saveTimeout = null;
let saveIndicatorTimeout = null;
let syncQueue = [];
let isSyncing = false;
let autoSyncEnabled = true;
let syncInterval = null;

// Local storage keys
const STORAGE_PREFIX = 'flex_translation_';
const getProjectKey = (projectId) => `${STORAGE_PREFIX}${projectId}`;
const getSyncQueueKey = () => `${STORAGE_PREFIX}sync_queue`;

// Router - handle page navigation
async function router() {
  const path = window.location.pathname;
  const hash = window.location.hash;

  // Check auth state
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;

  updateAuthStatus();

  // Route to appropriate page
  if (path.includes('/p/') || hash.includes('#p/')) {
    // Community translation page - extract share code properly
    let shareCode;
    if (path.includes('/p/')) {
      shareCode = path.split('/p/')[1].split('?')[0]; // Remove query params
    } else {
      // Extract from hash - the regex handles this cleanly
      const hashMatch = hash.match(/#p\/([A-Z0-9]+)/i);
      if (hashMatch) {
        shareCode = hashMatch[1];
      } else {
        // Fallback: split and clean
        shareCode = hash.split('#p/')[1].split('?')[0];
      }
    }
    // Trim whitespace
    shareCode = shareCode.trim();
    await loadTranslationPage(shareCode);
  } else if (currentUser) {
    // Linguist dashboard
    await loadDashboard();
  } else {
    // Auth page
    loadAuthPage();
  }
}

// Update auth status display
function updateAuthStatus() {
  const authStatus = document.getElementById('auth-status');
  if (currentUser) {
    authStatus.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span>${currentUser.email}</span>
        <button onclick="signOut()" class="button-secondary button-small">Sign Out</button>
      </div>
    `;
  } else {
    authStatus.innerHTML = '';
  }
}

// Sign out
async function signOut() {
  await supabase.auth.signOut();
  currentUser = null;
  router();
}

// Auth page
function loadAuthPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="auth-container">
      <h2 class="mb-20">Linguist Sign In</h2>
      <div id="auth-message"></div>
      <form class="auth-form" onsubmit="handleAuth(event)">
        <input type="email" id="email" placeholder="Email" required>
        <input type="password" id="password" placeholder="Password" required>
        <button type="submit">Sign In / Sign Up</button>
      </form>
      <p class="text-center" style="margin-top: 20px; font-size: 14px; color: #64748b;">
        Community members: Use the link provided by your linguist
      </p>
    </div>
  `;
}

// Handle authentication
async function handleAuth(event) {
  event.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const messageDiv = document.getElementById('auth-message');

  messageDiv.innerHTML = '';

  // Try sign in first
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // If sign in fails, try sign up
  if (error) {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      messageDiv.innerHTML = `<div class="error-message">${signUpError.message}</div>`;
      return;
    }

    if (signUpData.user && !signUpData.session) {
      messageDiv.innerHTML = `<div class="success-message">Check your email to confirm your account</div>`;
      return;
    }

    data = signUpData;
  }

  currentUser = data.user;
  router();
}

// Dashboard page
async function loadDashboard() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="dashboard">
      <h2 class="mb-20">Your Projects</h2>

      <div class="upload-section">
        <h3 class="mb-10">Upload New Project</h3>
        <input type="file" id="json-file" accept=".json">
        <button onclick="uploadProject()" style="margin-left: 10px;">Upload</button>
        <div id="upload-status" style="margin-top: 10px;"></div>
      </div>

      <div class="projects-list" id="projects-list">
        <p>Loading projects...</p>
      </div>
    </div>
  `;

  await loadProjects();
}

// Load linguist's projects
async function loadProjects() {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('linguist_id', currentUser.id)
    .order('created_at', { ascending: false });

  const listDiv = document.getElementById('projects-list');

  if (error) {
    listDiv.innerHTML = `<div class="error-message">Error loading projects: ${error.message}</div>`;
    return;
  }

  if (projects.length === 0) {
    listDiv.innerHTML = `<p style="color: #64748b;">No projects yet. Upload a JSON file to get started.</p>`;
    return;
  }

  listDiv.innerHTML = projects.map(project => {
    const url = `${window.location.origin}${window.location.pathname}#p/${project.share_code}`;
    return `
      <div class="project-item">
        <h3>${project.title || 'Untitled Project'}</h3>
        <p style="font-size: 14px; color: #64748b;">
          Created: ${new Date(project.created_at).toLocaleDateString()}
        </p>
        <div class="share-code-display">
          <div style="font-size: 14px; margin-bottom: 5px;">Share this link:</div>
          <div style="font-family: monospace; font-size: 12px; word-break: break-all;">
            ${url}
          </div>
          <button onclick="copyToClipboard('${url}')" class="button-small" style="margin-top: 10px;">
            Copy Link
          </button>
        </div>
        <div class="project-actions">
          <button onclick="downloadProject('${project.id}')" class="button-small">
            Download JSON
          </button>
          <button onclick="deleteProject('${project.id}')" class="button-small button-secondary">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Upload new project
async function uploadProject() {
  const fileInput = document.getElementById('json-file');
  const statusDiv = document.getElementById('upload-status');

  if (!fileInput.files[0]) {
    statusDiv.innerHTML = `<div class="error-message">Please select a file</div>`;
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const jsonData = JSON.parse(e.target.result);

      // Generate share code
      const shareCode = Math.random().toString(36).substr(2, 9).toUpperCase();

      // Insert project
      const { data, error } = await supabase
        .from('projects')
        .insert({
          linguist_id: currentUser.id,
          share_code: shareCode,
          title: jsonData.textTitle || 'Untitled',
          json_data: jsonData
        })
        .select()
        .single();

      if (error) throw error;

      statusDiv.innerHTML = `<div class="success-message">Project uploaded successfully!</div>`;
      fileInput.value = '';

      // Reload projects
      await loadProjects();

    } catch (error) {
      statusDiv.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
  };

  reader.readAsText(file);
}

// Download project JSON
async function downloadProject(projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('json_data, title')
    .eq('id', projectId)
    .single();

  if (error) {
    alert('Error downloading project: ' + error.message);
    return;
  }

  // Create download link
  const blob = new Blob([JSON.stringify(data.json_data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.title || 'project'}_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Delete project
async function deleteProject(projectId) {
  if (!confirm('Are you sure you want to delete this project?')) return;

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    alert('Error deleting project: ' + error.message);
    return;
  }

  await loadProjects();
}

// Copy to clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Link copied to clipboard!');
  });
}

// Translation page (community access)
async function loadTranslationPage(shareCode) {
  // Always try to load from server first, fall back to localStorage if offline
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('share_code', shareCode.trim())
      .single();

    if (error) throw error;

    if (!project) {
      throw new Error('Project not found');
    }

    currentProject = project;
    saveToLocalStorage(currentProject);
    renderTranslationInterface();

    // Start periodic background sync
    startPeriodicSync();
  } catch (error) {
    console.error('Error loading from server:', error);

    // Try to load from local storage as fallback
    const cachedProject = loadFromLocalStorage(shareCode);

    if (cachedProject && cachedProject.json_data && cachedProject.json_data.paragraphs) {
      currentProject = cachedProject;
      renderTranslationInterface();
      showSaveIndicator('offline');

      // Try to sync in background
      syncInBackground(shareCode);
      startPeriodicSync();
    } else {
      // No cached data and can't reach server
      const main = document.getElementById('main-content');
      main.innerHTML = `
        <div class="auth-container">
          <div class="error-message">
            Project not found. ${error.message || 'Please check your link and internet connection.'}
          </div>
        </div>
      `;
    }
  }
}

// Render translation interface
function renderTranslationInterface() {
  const main = document.getElementById('main-content');
  let jsonData = currentProject.json_data;

  // Handle array format (schema.json) - extract first text object
  if (Array.isArray(jsonData) && jsonData.length > 0) {
    jsonData = jsonData[0];
  }

  if (!jsonData || !jsonData.paragraphs || !Array.isArray(jsonData.paragraphs)) {
    console.error('Invalid data structure - failing validation');
    main.innerHTML = `
      <div class="auth-container">
        <div class="error-message">Invalid project data. Please contact your linguist.</div>
      </div>
    `;
    return;
  }

  // Store normalized jsonData back
  currentProject.json_data = jsonData;

  // Calculate progress
  const allSegments = jsonData.paragraphs.flatMap(p => p.segments || []);
  const completedSegments = allSegments.filter(s =>
    s.freeTranslation?.en && s.freeTranslation.en.trim() !== ''
  ).length;
  const progress = allSegments.length > 0 ? (completedSegments / allSegments.length * 100) : 0;

  main.innerHTML = `
    <div class="project-info">
      <div class="project-title">${jsonData.textTitle || 'Translation Project'}</div>
      <div class="project-stats">
        <span>Total segments: ${allSegments.length}</span>
        <span>Completed: ${completedSegments}</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      </div>
      <div class="sync-controls">
        <label class="sync-toggle">
          <input type="checkbox" id="auto-sync-toggle" ${autoSyncEnabled ? 'checked' : ''} onchange="toggleAutoSync()">
          Auto-sync
        </label>
        <button class="button-small" onclick="manualSync()">Sync Now</button>
        <span class="save-indicator" id="save-indicator"></span>
      </div>
    </div>
    <div id="segments-container"></div>
  `;

  renderSegments();
}

// Render all segments
function renderSegments() {
  const container = document.getElementById('segments-container');
  const jsonData = currentProject.json_data;

  let segmentIndex = 0;
  const segmentsHtml = jsonData.paragraphs.map((paragraph, pIdx) => {
    const segments = paragraph.segments || [];
    return segments.map((segment, sIdx) => {
      const html = renderSegment(segment, segmentIndex);
      segmentIndex++;
      return html;
    }).join('');
  }).join('');

  container.innerHTML = segmentsHtml;

  // Attach event listeners
  attachInputListeners();
}

// Render single segment
function renderSegment(segment, index) {
  const words = segment.baseline || [];
  const literalTranslation = segment.literalTranslation?.en || '';
  const freeTranslation = segment.freeTranslation?.en || '';
  const baselineChanges = segment.baselineChanges || [];
  const merges = segment.literalTranslationMerges || [];

  // Split literal translation by words (if it exists)
  const literalWords = literalTranslation ? literalTranslation.split(' ') : [];

  // Track which baseline words have pending changes
  const changesMap = {};
  baselineChanges.forEach(change => {
    changesMap[change.wordIndex] = change.newValue;
  });

  // Build merge map: wordIndex -> {colspan, mergedIndices, gloss, isHidden}
  const mergeMap = {};
  merges.forEach(merge => {
    const firstIdx = merge.wordIndices[0];
    mergeMap[firstIdx] = {
      colspan: merge.wordIndices.length,
      mergedIndices: merge.wordIndices,
      gloss: merge.gloss || ''
    };
    // Mark other indices as hidden
    for (let i = 1; i < merge.wordIndices.length; i++) {
      mergeMap[merge.wordIndices[i]] = { isHidden: true };
    }
  });

  // Split words into chunks for multi-row display
  const WORDS_PER_ROW = 10;
  const wordChunks = [];
  for (let i = 0; i < words.length; i += WORDS_PER_ROW) {
    wordChunks.push({
      startIdx: i,
      endIdx: Math.min(i + WORDS_PER_ROW, words.length),
      words: words.slice(i, i + WORDS_PER_ROW)
    });
  }

  // Generate rows for each chunk
  const rowsHtml = wordChunks.map(chunk => {
    const baselineRow = `
      <tr>
        <td>Baseline</td>
        ${chunk.words.map((w, localIdx) => {
          const i = chunk.startIdx + localIdx;
          const hasChange = changesMap[i] !== undefined;
          const displayValue = hasChange ? changesMap[i] : w;
          return `
            <td class="baseline-cell ${hasChange ? 'baseline-changed' : ''}">
              <input
                type="text"
                data-segment="${index}"
                data-word="${i}"
                data-field="baseline"
                data-original="${escapeHtml(w)}"
                value="${escapeHtml(displayValue)}"
                class="baseline-input"
                title="${hasChange ? 'Original: ' + escapeHtml(w) : ''}"
                onfocus="showResetButton(this)"
                onblur="hideResetButton(this)"
              >
              <button class="reset-button hidden" onclick="resetBaselineWord(${index}, ${i})" onmousedown="event.preventDefault()">↺</button>
            </td>
          `;
        }).join('')}
      </tr>
    `;

    const wfwRow = `
      <tr>
        <td>WFW</td>
        ${chunk.words.map((w, localIdx) => {
          const i = chunk.startIdx + localIdx;
          const mergeInfo = mergeMap[i];

          // Skip if this cell is merged into a previous cell
          if (mergeInfo && mergeInfo.isHidden) {
            return `<td class="wfw-cell merged-cell" data-segment="${index}" data-word="${i}" style="display: none;"></td>`;
          }

          const colspan = mergeInfo ? mergeInfo.colspan : 1;
          const mergedIndices = mergeInfo ? mergeInfo.mergedIndices.join(',') : '';
          const glossValue = mergeInfo ? mergeInfo.gloss : (literalWords[i] || '');
          const isMerged = colspan > 1;

          return `
            <td class="wfw-cell" data-segment="${index}" data-word="${i}" ${colspan > 1 ? `colspan="${colspan}"` : ''}>
              <textarea
                data-segment="${index}"
                data-word="${i}"
                data-field="literal"
                class="wfw-textarea"
                placeholder=""
                ${mergedIndices ? `data-merged-words="${mergedIndices}"` : ''}
              >${escapeHtml(glossValue)}</textarea>
              <div class="wfw-buttons">
                <button
                  class="merge-button"
                  onclick="mergeWFWCells(${index}, ${i})"
                  title="Merge with next cell"
                  ${i === words.length - 1 ? 'disabled' : ''}
                >→</button>
                <button
                  class="unmerge-button ${isMerged ? '' : 'hidden'}"
                  onclick="unmergeWFWCells(${index}, ${i})"
                  title="Unmerge cells"
                >↶</button>
              </div>
            </td>
          `;
        }).join('')}
      </tr>
    `;

    return baselineRow + wfwRow;
  }).join('');

  return `
    <div class="segment-container" data-segment-index="${index}">
      <table class="segment-table">
        ${rowsHtml}
        <tr class="free-row">
          <td colspan="${WORDS_PER_ROW + 1}">
            <div style="display: grid; grid-template-columns: 100px 1fr;">
              <div style="padding: 8px; font-weight: 600; background: #f8fafc; border-right: 1px solid #e2e8f0;">Free</div>
              <textarea
                data-segment="${index}"
                data-field="free"
              >${escapeHtml(freeTranslation)}</textarea>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

// Attach input event listeners
function attachInputListeners() {
  const inputs = document.querySelectorAll('input[data-segment], textarea[data-segment]');

  inputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const segmentIndex = parseInt(e.target.dataset.segment);
      const field = e.target.dataset.field;
      const value = e.target.value;

      if (field === 'baseline') {
        const wordIndex = parseInt(e.target.dataset.word);
        const originalValue = e.target.dataset.original;
        handleBaselineChange(segmentIndex, wordIndex, value, originalValue);
      } else if (field === 'literal') {
        const wordIndex = parseInt(e.target.dataset.word);
        handleLiteralTranslationChange(segmentIndex, wordIndex, value);
      } else if (field === 'free') {
        handleFreeTranslationChange(segmentIndex, value);
      }
    });
  });
}

// Handle baseline word change
function handleBaselineChange(segmentIndex, wordIndex, newValue, originalValue) {
  const allSegments = currentProject.json_data.paragraphs.flatMap(p => p.segments || []);
  const segment = allSegments[segmentIndex];

  if (!segment) return;

  // Initialize baselineChanges if it doesn't exist
  if (!segment.baselineChanges) segment.baselineChanges = [];

  // Get the input cell to update its styling
  const inputCell = document.querySelector(`input[data-segment="${segmentIndex}"][data-word="${wordIndex}"][data-field="baseline"]`);
  const cell = inputCell?.closest('td');

  // Check if value changed back to original
  if (newValue === originalValue) {
    // Remove the change entry if exists
    segment.baselineChanges = segment.baselineChanges.filter(
      change => change.wordIndex !== wordIndex
    );
    // Remove the changed class
    if (cell) cell.classList.remove('baseline-changed');
  } else {
    // Find existing change or create new one
    const existingChangeIndex = segment.baselineChanges.findIndex(
      change => change.wordIndex === wordIndex
    );

    const change = {
      wordIndex: wordIndex,
      originalValue: originalValue,
      newValue: newValue,
      timestamp: new Date().toISOString()
    };

    if (existingChangeIndex >= 0) {
      segment.baselineChanges[existingChangeIndex] = change;
    } else {
      segment.baselineChanges.push(change);
    }
    // Add the changed class
    if (cell) cell.classList.add('baseline-changed');
  }

  debouncedSave();
}

// Show reset button when baseline input is focused
function showResetButton(input) {
  const cell = input.closest('td');
  const resetButton = cell.querySelector('.reset-button');
  if (resetButton) {
    resetButton.classList.remove('hidden');
  }
}

// Hide reset button when baseline input loses focus
function hideResetButton(input) {
  const cell = input.closest('td');
  const resetButton = cell.querySelector('.reset-button');
  if (resetButton) {
    resetButton.classList.add('hidden');
  }
}

// Reset baseline word to original value
function resetBaselineWord(segmentIndex, wordIndex) {
  const input = document.querySelector(`input[data-segment="${segmentIndex}"][data-word="${wordIndex}"][data-field="baseline"]`);
  const originalValue = input.dataset.original;

  input.value = originalValue;
  handleBaselineChange(segmentIndex, wordIndex, originalValue, originalValue);
}

// Handle literal translation change
function handleLiteralTranslationChange(segmentIndex, wordIndex, value) {
  // Update local data
  const allSegments = currentProject.json_data.paragraphs.flatMap(p => p.segments);
  const segment = allSegments[segmentIndex];

  if (!segment) return;

  // Check if this textarea is part of a merge
  const textarea = document.querySelector(`textarea[data-segment="${segmentIndex}"][data-word="${wordIndex}"]`);
  const mergedWords = textarea?.dataset.mergedWords;

  if (mergedWords) {
    // Update the merge gloss in literalTranslationMerges
    const wordIndices = mergedWords.split(',').map(Number);
    saveMergeToData(segmentIndex, wordIndices, value);
  }

  // Get all word textareas for this segment (not hidden ones)
  const wordTextareas = document.querySelectorAll(`textarea[data-segment="${segmentIndex}"][data-field="literal"]`);
  const literalWords = [];

  wordTextareas.forEach(ta => {
    const cell = ta.closest('td');
    if (cell && cell.style.display !== 'none') {
      literalWords.push(ta.value);
    }
  });

  // Update segment data
  if (!segment.literalTranslation) segment.literalTranslation = {};
  segment.literalTranslation.en = literalWords.join(' ');

  debouncedSave();
}

// Handle free translation change
function handleFreeTranslationChange(segmentIndex, value) {
  // Update local data
  const allSegments = currentProject.json_data.paragraphs.flatMap(p => p.segments);
  const segment = allSegments[segmentIndex];

  if (!segment) return;

  if (!segment.freeTranslation) segment.freeTranslation = {};
  segment.freeTranslation.en = value;

  debouncedSave();
}

// Debounced save
function debouncedSave() {
  clearTimeout(saveTimeout);
  showSaveIndicator('unsaved');

  // Save to local storage immediately
  saveToLocalStorage(currentProject);

  saveTimeout = setTimeout(async () => {
    await saveProject();
  }, 1500);
}

// Save project to database
async function saveProject() {
  // Save to local storage first
  saveToLocalStorage(currentProject);
  showSaveIndicator('syncing');

  try {
    const { error } = await supabase
      .from('projects')
      .update({
        json_data: currentProject.json_data,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentProject.id);

    if (error) throw error;

    // Remove from sync queue on success
    removeFromSyncQueue(currentProject.id);
    showSaveIndicator('saved');
  } catch (error) {
    console.error('Save error:', error);

    // Add to sync queue for retry
    addToSyncQueue(currentProject.id);
    showSaveIndicator('offline');
  }
}

// Show save indicator
function showSaveIndicator(status) {
  const indicator = document.getElementById('save-indicator');
  if (!indicator) return;

  clearTimeout(saveIndicatorTimeout);

  indicator.className = `save-indicator ${status}`;

  if (status === 'unsaved') {
    indicator.textContent = '✓ Saved locally';
  } else if (status === 'syncing') {
    indicator.textContent = 'Syncing...';
  } else if (status === 'saved') {
    indicator.textContent = '✓ Synced';
    saveIndicatorTimeout = setTimeout(() => {
      indicator.textContent = '';
      indicator.className = 'save-indicator';
    }, 2000);
  } else if (status === 'offline') {
    indicator.textContent = '✓ Saved locally (will sync when online)';
  } else if (status === 'error') {
    indicator.textContent = 'Error saving';
  }
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    router();
  }
});

// Initialize app
router();

// Handle back/forward navigation
window.addEventListener('hashchange', router);
window.addEventListener('popstate', router);

// ===== WFW CELL MERGING =====

// Merge WFW cells for multi-word glossing
function mergeWFWCells(segmentIndex, wordIndex) {
  const cell = document.querySelector(`td.wfw-cell[data-segment="${segmentIndex}"][data-word="${wordIndex}"]`);
  const nextCell = document.querySelector(`td.wfw-cell[data-segment="${segmentIndex}"][data-word="${wordIndex + 1}"]`);

  if (!cell || !nextCell) return;

  // Get current merged words
  const textarea = cell.querySelector('textarea');
  const currentWords = textarea.dataset.mergedWords
    ? textarea.dataset.mergedWords.split(',').map(Number)
    : [wordIndex];

  // Add next word to merge
  const nextWordIndex = wordIndex + 1;
  currentWords.push(nextWordIndex);

  // Update colspan
  const currentColspan = parseInt(cell.getAttribute('colspan') || '1');
  cell.setAttribute('colspan', currentColspan + 1);

  // Hide next cell
  nextCell.style.display = 'none';
  nextCell.classList.add('merged-cell');

  // Update textarea merged words tracking
  textarea.dataset.mergedWords = currentWords.join(',');

  // Show unmerge button, keep merge button visible
  const unmergeButton = cell.querySelector('.unmerge-button');
  if (unmergeButton) {
    unmergeButton.classList.remove('hidden');
  }

  // Save merge to data
  saveMergeToData(segmentIndex, currentWords, textarea.value);
}

// Unmerge WFW cells
function unmergeWFWCells(segmentIndex, wordIndex) {
  const cell = document.querySelector(`td.wfw-cell[data-segment="${segmentIndex}"][data-word="${wordIndex}"]`);
  const textarea = cell.querySelector('textarea');
  const mergedWords = textarea.dataset.mergedWords?.split(',').map(Number) || [wordIndex];

  // Find all merged cells and unhide them
  mergedWords.forEach((idx, i) => {
    if (i > 0) {
      const mergedCell = document.querySelector(`td.wfw-cell[data-segment="${segmentIndex}"][data-word="${idx}"]`);
      if (mergedCell) {
        mergedCell.style.display = '';
        mergedCell.classList.remove('merged-cell');
      }
    }
  });

  // Reset main cell
  cell.setAttribute('colspan', '1');
  delete textarea.dataset.mergedWords;

  // Hide unmerge button
  const unmergeButton = cell.querySelector('.unmerge-button');
  if (unmergeButton) {
    unmergeButton.classList.add('hidden');
  }

  // Remove merge from data
  removeMergeFromData(segmentIndex, mergedWords);
}

// Save merge to segment data
function saveMergeToData(segmentIndex, wordIndices, gloss) {
  const allSegments = currentProject.json_data.paragraphs.flatMap(p => p.segments || []);
  const segment = allSegments[segmentIndex];

  if (!segment) return;

  // Initialize literalTranslationMerges if it doesn't exist
  if (!segment.literalTranslationMerges) segment.literalTranslationMerges = [];

  // Remove any existing merge that includes these words
  segment.literalTranslationMerges = segment.literalTranslationMerges.filter(merge => {
    return !merge.wordIndices.some(idx => wordIndices.includes(idx));
  });

  // Add new merge if more than one word
  if (wordIndices.length > 1) {
    segment.literalTranslationMerges.push({
      wordIndices: wordIndices,
      gloss: gloss || ''
    });
  }

  debouncedSave();
}

// Remove merge from segment data
function removeMergeFromData(segmentIndex, wordIndices) {
  const allSegments = currentProject.json_data.paragraphs.flatMap(p => p.segments || []);
  const segment = allSegments[segmentIndex];

  if (!segment || !segment.literalTranslationMerges) return;

  // Remove merge that matches these words
  segment.literalTranslationMerges = segment.literalTranslationMerges.filter(merge => {
    return !arraysEqual(merge.wordIndices, wordIndices);
  });

  debouncedSave();
}

// Helper to compare arrays
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Update literal translation change handler to save merges
const originalHandleLiteralTranslationChange = handleLiteralTranslationChange;

// Make functions available globally
window.mergeWFWCells = mergeWFWCells;
window.unmergeWFWCells = unmergeWFWCells;

// ===== LOCAL STORAGE & SYNC FUNCTIONS =====

// Save project to local storage
function saveToLocalStorage(project) {
  try {
    const key = getProjectKey(project.id);
    localStorage.setItem(key, JSON.stringify({
      ...project,
      _lastModified: Date.now()
    }));
  } catch (error) {
    console.error('Error saving to local storage:', error);
  }
}

// Load project from local storage
function loadFromLocalStorage(shareCodeOrId) {
  try {
    // Try to find by share code
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(STORAGE_PREFIX)) {
        const data = localStorage.getItem(key);
        const project = JSON.parse(data);
        if (project.share_code === shareCodeOrId || project.id === shareCodeOrId) {
          return project;
        }
      }
    }
  } catch (error) {
    console.error('Error loading from local storage:', error);
  }
  return null;
}

// Add project to sync queue
function addToSyncQueue(projectId) {
  try {
    const queueKey = getSyncQueueKey();
    const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');

    if (!queue.includes(projectId)) {
      queue.push(projectId);
      localStorage.setItem(queueKey, JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Error adding to sync queue:', error);
  }
}

// Remove project from sync queue
function removeFromSyncQueue(projectId) {
  try {
    const queueKey = getSyncQueueKey();
    let queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    queue = queue.filter(id => id !== projectId);
    localStorage.setItem(queueKey, JSON.stringify(queue));
  } catch (error) {
    console.error('Error removing from sync queue:', error);
  }
}

// Sync in background
async function syncInBackground(shareCode) {
  if (isSyncing) return;

  try {
    isSyncing = true;

    // Try to fetch latest from server
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('share_code', shareCode.trim())
      .single();

    if (!error && project) {
      // Merge server data with local changes
      const localProject = loadFromLocalStorage(project.id);

      if (localProject && localProject._lastModified) {
        const serverModified = new Date(project.updated_at).getTime();
        const localModified = localProject._lastModified;

        // If local is newer, push to server
        if (localModified > serverModified) {
          await supabase
            .from('projects')
            .update({
              json_data: localProject.json_data,
              updated_at: new Date().toISOString()
            })
            .eq('id', project.id);

          removeFromSyncQueue(project.id);
          showSaveIndicator('saved');
        } else {
          // Server is newer, update local
          currentProject = project;
          saveToLocalStorage(project);
          renderTranslationInterface();
        }
      } else {
        // No local data, use server version
        currentProject = project;
        saveToLocalStorage(project);
      }
    }
  } catch (error) {
    console.error('Background sync error:', error);
  } finally {
    isSyncing = false;
  }
}

// Process sync queue
async function processSyncQueue() {
  if (isSyncing) return;

  try {
    const queueKey = getSyncQueueKey();
    const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');

    for (const projectId of queue) {
      const project = loadFromLocalStorage(projectId);
      if (!project) continue;

      try {
        const { error } = await supabase
          .from('projects')
          .update({
            json_data: project.json_data,
            updated_at: new Date().toISOString()
          })
          .eq('id', projectId);

        if (!error) {
          removeFromSyncQueue(projectId);
          if (currentProject?.id === projectId) {
            showSaveIndicator('saved');
          }
        }
      } catch (error) {
        console.error('Error syncing project:', projectId, error);
      }
    }
  } catch (error) {
    console.error('Error processing sync queue:', error);
  }
}

// Start periodic sync
function startPeriodicSync() {
  if (syncInterval) clearInterval(syncInterval);

  if (!autoSyncEnabled) return;

  // Sync every 30 seconds
  syncInterval = setInterval(() => {
    processSyncQueue();
  }, 30000);

  // Also sync immediately if online
  window.addEventListener('online', processSyncQueue);
}

// Toggle auto-sync on/off
function toggleAutoSync() {
  const toggle = document.getElementById('auto-sync-toggle');
  autoSyncEnabled = toggle.checked;

  if (autoSyncEnabled) {
    startPeriodicSync();
    showSaveIndicator('syncing');
    processSyncQueue();
  } else {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
    showSaveIndicator('unsaved');
  }
}

// Manual sync button
async function manualSync() {
  showSaveIndicator('syncing');
  await processSyncQueue();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (syncInterval) clearInterval(syncInterval);
});
