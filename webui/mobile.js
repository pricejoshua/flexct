// Mobile word-by-word translation flow
// Flow: Choose Text → Chunk Selection → Free Translation → Word-by-Word → Reports → Loop

// App state
let currentProject = null;
let currentChunkIndex = 0;
let currentWordIndex = 0;
let chunkData = [];
let saveTimeout = null;

// Flow states
const FLOW_STATES = {
  LOADING: 'loading',
  PROJECT_SELECT: 'project_select',
  CHUNK_SELECT: 'chunk_select',
  FREE_TRANSLATION: 'free_translation',
  WORD_TRANSLATION: 'word_translation',
  CHUNK_COMPLETE: 'chunk_complete',
  ERROR: 'error'
};

let currentState = FLOW_STATES.LOADING;

// Dev mode - enabled via URL parameter ?dev=true
let devMode = false;

// Initialize app
async function init() {
  // Check for dev mode
  const urlParams = new URLSearchParams(window.location.search);
  devMode = urlParams.get('dev') === 'true';

  if (devMode) {
    console.log('🔧 DEV MODE ENABLED');
    enableDevMode();
  }

  // Check if we have a share code in the URL
  const hash = window.location.hash;
  const shareCodeMatch = hash.match(/#p\/([A-Z0-9]+)/i);

  if (shareCodeMatch) {
    const shareCode = shareCodeMatch[1];
    await loadProject(shareCode);
  } else {
    showError(t('error'), 'No project specified. Please use a valid share link.');
  }
}

// Load project from share code
async function loadProject(shareCode) {
  setState(FLOW_STATES.LOADING);

  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('share_code', shareCode.trim())
      .single();

    if (error) throw error;
    if (!project) throw new Error('Project not found');

    currentProject = project;
    prepareChunks();
    setState(FLOW_STATES.CHUNK_SELECT);
  } catch (error) {
    console.error('Error loading project:', error);
    showError(t('error'), 'Failed to load project: ' + error.message);
  }
}

// Prepare chunks from project data
function prepareChunks() {
  let jsonData = currentProject.json_data;

  // Handle array format
  if (Array.isArray(jsonData) && jsonData.length > 0) {
    jsonData = jsonData[0];
  }

  if (!jsonData || !jsonData.paragraphs) {
    throw new Error('Invalid project data structure');
  }

  // Flatten all segments into chunks
  chunkData = [];
  jsonData.paragraphs.forEach((paragraph, pIdx) => {
    if (paragraph.segments && Array.isArray(paragraph.segments)) {
      paragraph.segments.forEach((segment, sIdx) => {
        chunkData.push({
          paragraphIndex: pIdx,
          segmentIndex: sIdx,
          segment: segment,
          id: `${pIdx}-${sIdx}`
        });
      });
    }
  });

  // Update project reference
  currentProject.json_data = jsonData;
}

// Set current state and render
function setState(state) {
  currentState = state;
  render();
}

// Main render function
function render() {
  const main = document.getElementById('main-content');

  switch (currentState) {
    case FLOW_STATES.LOADING:
      main.innerHTML = renderLoading();
      break;
    case FLOW_STATES.CHUNK_SELECT:
      main.innerHTML = renderChunkSelect();
      break;
    case FLOW_STATES.FREE_TRANSLATION:
      main.innerHTML = renderFreeTranslation();
      attachFreeTranslationListeners();
      break;
    case FLOW_STATES.WORD_TRANSLATION:
      main.innerHTML = renderWordTranslation();
      attachWordTranslationListeners();
      break;
    case FLOW_STATES.CHUNK_COMPLETE:
      main.innerHTML = renderChunkComplete();
      break;
    case FLOW_STATES.ERROR:
      // Error already rendered by showError
      break;
  }
}

// Render loading state
function renderLoading() {
  return `
    <div class="loading">
      <div class="spinner"></div>
      <p>${t('loading')}</p>
    </div>
  `;
}

// Render chunk selection screen
function renderChunkSelect() {
  const totalChunks = chunkData.length;

  return `
    <div class="screen active">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${currentProject.json_data.textTitle || t('choose_text')}</h2>
          <p class="card-subtitle">${t('total_chunks')}: ${totalChunks}</p>
        </div>

        <div class="chunk-list">
          ${chunkData.map((chunk, index) => {
            const isCompleted = isChunkCompleted(chunk);
            const status = isCompleted ? 'completed' : '';
            return `
              <button class="chunk-button ${status}" onclick="selectChunk(${index})" ${devMode ? `ondblclick="inspectChunk(${index})"` : ''}>
                <span>${index + 1}</span>
                <span class="chunk-button-label">${t('chunk')}</span>
              </button>
            `;
          }).join('')}
        </div>
        ${devMode ? '<p style="margin-top: 16px; font-size: 12px; color: #64748b;">🔧 Dev Mode: Double-tap chunk to inspect</p>' : ''}
      </div>
    </div>
  `;
}

// Check if chunk is completed (has free translation)
function isChunkCompleted(chunk) {
  const ft = chunk.segment.freeTranslation?.en || '';
  return ft.trim().length > 0;
}

// Select a chunk to work on
function selectChunk(index) {
  currentChunkIndex = index;
  currentWordIndex = 0;
  setState(FLOW_STATES.FREE_TRANSLATION);
}

// Render free translation screen
function renderFreeTranslation() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const baselineText = (segment.baseline || []).join(' ');
  const freeTranslation = segment.freeTranslation?.en || '';

  return `
    <div class="screen active free-translation-screen">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${t('chunk')} ${currentChunkIndex + 1} / ${chunkData.length}</h2>
        </div>

        <div class="baseline-text">${escapeHtml(baselineText)}</div>

        <div class="translation-input-container">
          <label class="input-label">${t('free_translation')}</label>
          <textarea
            id="free-translation-input"
            placeholder="${t('translate_instruction')}..."
          >${escapeHtml(freeTranslation)}</textarea>
        </div>

        <div class="button-group">
          <button class="button button-secondary" onclick="backToChunkSelect()">
            ${t('back')}
          </button>
          <button class="button" onclick="proceedToWordTranslation()">
            ${t('ok')}
          </button>
        </div>
      </div>
    </div>
  `;
}

// Attach event listeners for free translation
function attachFreeTranslationListeners() {
  const input = document.getElementById('free-translation-input');
  if (input) {
    input.addEventListener('input', handleFreeTranslationChange);
  }
}

// Handle free translation change
function handleFreeTranslationChange(e) {
  const chunk = chunkData[currentChunkIndex];
  const value = e.target.value;

  if (!chunk.segment.freeTranslation) {
    chunk.segment.freeTranslation = {};
  }
  chunk.segment.freeTranslation.en = value;

  debouncedSave();
}

// Proceed to word-by-word translation
function proceedToWordTranslation() {
  currentWordIndex = 0;
  setState(FLOW_STATES.WORD_TRANSLATION);
}

// Back to chunk selection
function backToChunkSelect() {
  setState(FLOW_STATES.CHUNK_SELECT);
}

// Render word-by-word translation screen
function renderWordTranslation() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const words = segment.baseline || [];
  const totalWords = words.length;

  // Get existing literal translation words
  const literalWords = (segment.literalTranslation?.en || '').split(' ').filter(w => w.trim());
  const currentWord = words[currentWordIndex] || '';
  const currentTranslation = literalWords[currentWordIndex] || '';

  const freeTranslation = segment.freeTranslation?.en || '';
  const progress = totalWords > 0 ? ((currentWordIndex + 1) / totalWords * 100) : 0;

  return `
    <div class="screen active word-translation-screen">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${t('chunk')} ${currentChunkIndex + 1}</h2>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <p class="progress-text">${t('word')} ${currentWordIndex + 1} / ${totalWords}</p>
        </div>

        <div class="context-display">
          <div class="context-label">${t('free_translation')}</div>
          <div class="context-text">${escapeHtml(freeTranslation)}</div>
        </div>

        <div class="word-card">
          <div class="word-display">
            <div class="word-label">${t('baseline')}</div>
            <div class="word-text">${escapeHtml(currentWord)}</div>
            <div class="word-counter">${currentWordIndex + 1} of ${totalWords}</div>
          </div>

          <div class="translation-input-container">
            <label class="input-label">${t('analysis_language')}</label>
            <input
              type="text"
              id="word-translation-input"
              class="word-input"
              value="${escapeHtml(currentTranslation)}"
              placeholder="${t('translate_instruction')}..."
              autofocus
            >
          </div>
        </div>

        <div class="button-group">
          ${currentWordIndex > 0 ? `
            <button class="button button-secondary" onclick="previousWord()">
              ${t('back')}
            </button>
          ` : `
            <button class="button button-secondary" onclick="backToFreeTranslation()">
              ${t('back')}
            </button>
          `}
          <button class="button" onclick="nextWord()" id="next-word-btn">
            ${currentWordIndex < totalWords - 1 ? t('next') : t('finish')}
          </button>
        </div>
      </div>
    </div>
  `;
}

// Attach event listeners for word translation
function attachWordTranslationListeners() {
  const input = document.getElementById('word-translation-input');
  if (input) {
    input.addEventListener('input', handleWordTranslationChange);

    // Enter key to proceed
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nextWord();
      }
    });
  }
}

// Handle word translation change
function handleWordTranslationChange(e) {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const value = e.target.value;

  // Get current literal translation words
  const literalWords = (segment.literalTranslation?.en || '').split(' ').filter(w => w.trim());

  // Update or add the current word's translation
  while (literalWords.length <= currentWordIndex) {
    literalWords.push('');
  }
  literalWords[currentWordIndex] = value;

  // Update segment
  if (!segment.literalTranslation) {
    segment.literalTranslation = {};
  }
  segment.literalTranslation.en = literalWords.join(' ');

  debouncedSave();
}

// Next word
function nextWord() {
  const chunk = chunkData[currentChunkIndex];
  const totalWords = (chunk.segment.baseline || []).length;

  if (currentWordIndex < totalWords - 1) {
    currentWordIndex++;
    setState(FLOW_STATES.WORD_TRANSLATION);
  } else {
    // Finished all words in this chunk
    setState(FLOW_STATES.CHUNK_COMPLETE);
  }
}

// Previous word
function previousWord() {
  if (currentWordIndex > 0) {
    currentWordIndex--;
    setState(FLOW_STATES.WORD_TRANSLATION);
  }
}

// Back to free translation
function backToFreeTranslation() {
  setState(FLOW_STATES.FREE_TRANSLATION);
}

// Render chunk completion screen
function renderChunkComplete() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const wordCount = (segment.baseline || []).length;

  // Calculate completion stats
  const completedChunks = chunkData.filter(c => isChunkCompleted(c)).length;
  const totalChunks = chunkData.length;
  const hasMoreChunks = currentChunkIndex < totalChunks - 1;

  return `
    <div class="screen active report-screen">
      <div class="report-summary">
        <h2>${t('finished')}</h2>
        <p>${t('chunk')} ${currentChunkIndex + 1} ${t('completed').toLowerCase()}</p>
      </div>

      <div class="report-stats">
        <div class="stat-card">
          <div class="stat-value">${wordCount}</div>
          <div class="stat-label">${t('word_for_word')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${completedChunks}/${totalChunks}</div>
          <div class="stat-label">${t('progress')}</div>
        </div>
      </div>

      ${hasMoreChunks ? `
        <div class="card continue-prompt">
          <h3>${t('continue_question')}</h3>
          <div class="button-group">
            <button class="button button-secondary" onclick="backToChunkSelect()">
              ${t('no')}
            </button>
            <button class="button button-success" onclick="continueToNextChunk()">
              ${t('yes')}
            </button>
          </div>
        </div>
      ` : `
        <div class="card continue-prompt">
          <h3>All chunks completed!</h3>
          <button class="button button-success" onclick="backToChunkSelect()">
            ${t('finish')}
          </button>
        </div>
      `}
    </div>
  `;
}

// Continue to next chunk
function continueToNextChunk() {
  // Find next incomplete chunk
  for (let i = currentChunkIndex + 1; i < chunkData.length; i++) {
    if (!isChunkCompleted(chunkData[i])) {
      selectChunk(i);
      return;
    }
  }

  // If all are complete, go to first chunk
  selectChunk(currentChunkIndex + 1 < chunkData.length ? currentChunkIndex + 1 : 0);
}

// Debounced save
function debouncedSave() {
  clearTimeout(saveTimeout);
  showSaveIndicator('saving');

  saveTimeout = setTimeout(async () => {
    await saveProject();
  }, 1500);
}

// Save project to database
async function saveProject() {
  showSaveIndicator('saving');

  try {
    // Update the project's json_data in the database
    const { error } = await supabase
      .from('projects')
      .update({
        json_data: currentProject.json_data,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentProject.id);

    if (error) throw error;

    showSaveIndicator('saved');
  } catch (error) {
    console.error('Save error:', error);
    showSaveIndicator('error');
  }
}

// Show save indicator
function showSaveIndicator(status) {
  let indicator = document.getElementById('save-indicator');

  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'save-indicator';
    indicator.className = 'save-indicator';
    document.body.appendChild(indicator);
  }

  indicator.className = `save-indicator ${status}`;

  if (status === 'saving') {
    indicator.textContent = t('saving');
  } else if (status === 'saved') {
    indicator.textContent = t('saved');
  } else if (status === 'error') {
    indicator.textContent = t('error');
  }

  indicator.classList.add('visible');

  // Auto-hide after 2 seconds for saved/error
  if (status === 'saved' || status === 'error') {
    setTimeout(() => {
      indicator.classList.remove('visible');
    }, 2000);
  }
}

// Show error screen
function showError(title, message) {
  const main = document.getElementById('main-content');
  currentState = FLOW_STATES.ERROR;

  main.innerHTML = `
    <div class="card">
      <div class="error-message">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
      </div>
      <button class="button" onclick="window.location.reload()">
        ${t('reload', 'Reload')}
      </button>
    </div>
  `;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== DEV MODE FUNCTIONS =====

function enableDevMode() {
  // Add dev tools to window object for console access
  window.devTools = {
    inspectChunk: (index) => inspectChunk(index),
    inspectCurrentChunk: () => inspectChunk(currentChunkIndex),
    inspectAll: () => {
      console.log('📦 All Chunks:', chunkData);
      console.log('📄 Current Project:', currentProject);
      console.log('🎯 Current State:', currentState);
      console.log('📍 Current Chunk Index:', currentChunkIndex);
      console.log('📍 Current Word Index:', currentWordIndex);
    },
    exportData: () => {
      console.log('📤 Exporting project data...');
      const dataStr = JSON.stringify(currentProject.json_data, null, 2);
      console.log(dataStr);
      return currentProject.json_data;
    },
    getChunk: (index) => chunkData[index],
    getAllChunks: () => chunkData,
    getCurrentChunk: () => chunkData[currentChunkIndex]
  };

  console.log('Available dev tools:');
  console.log('  devTools.inspectChunk(index) - Inspect specific chunk');
  console.log('  devTools.inspectCurrentChunk() - Inspect current chunk');
  console.log('  devTools.inspectAll() - Show all data');
  console.log('  devTools.exportData() - Export project JSON');
  console.log('  devTools.getChunk(index) - Get chunk by index');
  console.log('  devTools.getAllChunks() - Get all chunks');
  console.log('  devTools.getCurrentChunk() - Get current chunk');

  // Add dev mode indicator to header
  const header = document.querySelector('header h1');
  if (header) {
    header.innerHTML += ' <span style="font-size: 12px; color: #f59e0b; font-weight: 400;">🔧 DEV</span>';
  }
}

function inspectChunk(index) {
  const chunk = chunkData[index];
  if (!chunk) {
    console.error('Chunk not found:', index);
    return;
  }

  console.group(`🔍 Chunk #${index + 1} (ID: ${chunk.id})`);
  console.log('📍 Indices:', {
    paragraphIndex: chunk.paragraphIndex,
    segmentIndex: chunk.segmentIndex
  });
  console.log('📝 Baseline:', chunk.segment.baseline);
  console.log('🌍 Free Translation:', chunk.segment.freeTranslation);
  console.log('📖 Literal Translation:', chunk.segment.literalTranslation);
  console.log('✅ Completed:', isChunkCompleted(chunk));
  console.log('📦 Full Segment:', chunk.segment);
  console.groupEnd();

  // Also create a modal overlay for easier reading on mobile
  showDevInspector(chunk, index);
}

function showDevInspector(chunk, index) {
  const existingModal = document.getElementById('dev-inspector-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'dev-inspector-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    width: 100%;
  `;

  const baseline = (chunk.segment.baseline || []).join(' ');
  const freeTranslation = chunk.segment.freeTranslation?.en || '(empty)';
  const literalTranslation = chunk.segment.literalTranslation?.en || '(empty)';
  const isCompleted = isChunkCompleted(chunk);

  content.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
      <h2 style="margin: 0; color: #1e293b;">🔍 Chunk #${index + 1}</h2>
      <button onclick="document.getElementById('dev-inspector-modal').remove()"
        style="background: #f1f5f9; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 14px;">
        Close
      </button>
    </div>

    <div style="margin-bottom: 16px; padding: 12px; background: ${isCompleted ? '#d1fae5' : '#fef3c7'}; border-radius: 8px;">
      <strong>Status:</strong> ${isCompleted ? '✅ Completed' : '⏳ In Progress'}
    </div>

    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 4px;">INDICES</div>
      <div style="font-family: monospace; font-size: 14px; background: #f8fafc; padding: 8px; border-radius: 4px;">
        Paragraph: ${chunk.paragraphIndex}, Segment: ${chunk.segmentIndex}
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 4px;">BASELINE</div>
      <div style="background: #fef3c7; padding: 12px; border-radius: 8px; font-weight: 500;">
        ${escapeHtml(baseline)}
      </div>
      <div style="font-family: monospace; font-size: 11px; color: #64748b; margin-top: 4px;">
        Array: [${chunk.segment.baseline.map(w => `"${w}"`).join(', ')}]
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 4px;">FREE TRANSLATION</div>
      <div style="background: #f8fafc; padding: 12px; border-radius: 8px; ${!chunk.segment.freeTranslation?.en ? 'opacity: 0.5; font-style: italic;' : ''}">
        ${escapeHtml(freeTranslation)}
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 4px;">LITERAL TRANSLATION (WFW)</div>
      <div style="background: #f8fafc; padding: 12px; border-radius: 8px; ${!chunk.segment.literalTranslation?.en ? 'opacity: 0.5; font-style: italic;' : ''}">
        ${escapeHtml(literalTranslation)}
      </div>
    </div>

    <details style="margin-top: 16px;">
      <summary style="cursor: pointer; font-weight: 600; color: #64748b; margin-bottom: 8px;">
        📦 Full JSON Data
      </summary>
      <pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 11px; margin-top: 8px;">${JSON.stringify(chunk.segment, null, 2)}</pre>
    </details>
  `;

  modal.appendChild(content);
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  };

  document.body.appendChild(modal);
}

// Make functions globally available
window.selectChunk = selectChunk;
window.backToChunkSelect = backToChunkSelect;
window.proceedToWordTranslation = proceedToWordTranslation;
window.backToFreeTranslation = backToFreeTranslation;
window.nextWord = nextWord;
window.previousWord = previousWord;
window.continueToNextChunk = continueToNextChunk;
window.inspectChunk = inspectChunk;

// Initialize on load
init();
