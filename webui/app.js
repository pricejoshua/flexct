// Unified FLEX Translation App - Responsive Desktop + Mobile Views
// Automatically switches between table view (desktop) and flow view (mobile)

// ===== CONFIGURATION =====

// View modes
const VIEW_MODES = {
  DESKTOP: 'desktop',
  MOBILE: 'mobile',
  AUTO: 'auto'
};

// Mobile flow states
const FLOW_STATES = {
  LOADING: 'loading',
  CHUNK_SELECT: 'chunk_select',
  FREE_TRANSLATION: 'free_translation',
  WORD_TRANSLATION: 'word_translation',
  CHUNK_COMPLETE: 'chunk_complete',
  ERROR: 'error'
};

// ===== APP STATE =====

let currentUser = null;
let currentProject = null;
let currentViewMode = VIEW_MODES.AUTO; // User preference
let activeViewMode = VIEW_MODES.DESKTOP; // Actual active view
let saveTimeout = null;
let saveIndicatorTimeout = null;
let syncQueue = [];
let isSyncing = false;
let autoSyncEnabled = true;
let syncInterval = null;

// Mobile flow state
let currentChunkIndex = 0;
let currentWordIndex = 0;
let chunkData = [];
let mobileFlowState = FLOW_STATES.LOADING;

// Desktop state
const WORDS_PER_ROW = 10;

// Local storage keys
const STORAGE_PREFIX = 'flex_translation_';
const getProjectKey = (projectId) => `${STORAGE_PREFIX}${projectId}`;
const getSyncQueueKey = () => `${STORAGE_PREFIX}sync_queue`;
const VIEW_MODE_KEY = `${STORAGE_PREFIX}view_mode`;

// Dev mode
let devMode = false;

// ===== INITIALIZATION =====

async function init() {
  // Check for dev mode
  const urlParams = new URLSearchParams(window.location.search);
  devMode = urlParams.get('dev') === 'true';

  if (devMode) {
    console.log('🔧 DEV MODE ENABLED');
    enableDevMode();
  }

  // Load user's view preference
  const savedViewMode = localStorage.getItem(VIEW_MODE_KEY);
  if (savedViewMode && Object.values(VIEW_MODES).includes(savedViewMode)) {
    currentViewMode = savedViewMode;
  }

  // Determine active view based on screen size and preference
  updateActiveView();

  // Listen for window resize
  window.addEventListener('resize', debounce(handleResize, 250));

  // Start routing
  await router();

  // Listen for hashchange
  window.addEventListener('hashchange', router);
}

// ===== VIEW MODE MANAGEMENT =====

function updateActiveView() {
  const isSmallScreen = window.innerWidth < 768;

  if (currentViewMode === VIEW_MODES.AUTO) {
    activeViewMode = isSmallScreen ? VIEW_MODES.MOBILE : VIEW_MODES.DESKTOP;
  } else {
    activeViewMode = currentViewMode;
  }

  // Update body class for CSS targeting
  document.body.className = `view-${activeViewMode}`;
}

function handleResize() {
  const previousView = activeViewMode;
  updateActiveView();

  // Re-render if view mode changed and we're on a translation page
  if (previousView !== activeViewMode && currentProject) {
    renderTranslationInterface();
  }
}

// ===== ROUTER =====

async function router() {
  const path = window.location.pathname;
  const hash = window.location.hash;

  // Check auth state
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;

  updateAuthStatus();

  // Route to appropriate page
  if (path.includes('/p/') || hash.includes('#p/')) {
    let shareCode;
    if (path.includes('/p/')) {
      shareCode = path.split('/p/')[1].split('?')[0];
    } else {
      const hashMatch = hash.match(/#p\/([A-Z0-9]+)/i);
      if (hashMatch) {
        shareCode = hashMatch[1];
      } else {
        shareCode = hash.split('#p/')[1].split('?')[0];
      }
    }
    shareCode = shareCode.trim();
    await loadTranslationPage(shareCode);
  } else if (currentUser) {
    await loadDashboard();
  } else {
    loadAuthPage();
  }
}

// ===== AUTH & DASHBOARD (Desktop Only) =====

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

async function signOut() {
  await supabase.auth.signOut();
  currentUser = null;
  router();
}

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

async function handleAuth(event) {
  event.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const messageDiv = document.getElementById('auth-message');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        messageDiv.innerHTML = '<div class="success-message">Account created! Please check your email for verification.</div>';
      } else {
        throw error;
      }
    } else {
      currentUser = data.user;
      router();
    }
  } catch (error) {
    messageDiv.innerHTML = `<div class="error-message">${error.message}</div>`;
  }
}

async function loadDashboard() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="dashboard">
      <h2>My Projects</h2>
      <div class="upload-section">
        <h3>Upload New Project</h3>
        <input type="file" id="json-file" accept=".json">
        <button onclick="uploadProject()" style="margin-top: 10px;">Upload</button>
        <div id="upload-message"></div>
      </div>
      <div id="projects-list" class="projects-list">
        <p>Loading projects...</p>
      </div>
    </div>
  `;

  await loadProjects();
}

async function loadProjects() {
  const listDiv = document.getElementById('projects-list');

  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('linguist_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (projects.length === 0) {
      listDiv.innerHTML = '<p>No projects yet. Upload a JSON file to get started.</p>';
      return;
    }

    listDiv.innerHTML = projects.map(project => `
      <div class="project-item">
        <h3>${escapeHtml(project.title)}</h3>
        <p>Share Code: <strong>${project.share_code}</strong></p>
        <p>Created: ${new Date(project.created_at).toLocaleDateString()}</p>
        <div class="project-actions">
          <button onclick="copyShareLink('${project.share_code}')">Copy Share Link</button>
          <button onclick="downloadProject('${project.id}')">Download JSON</button>
          <button onclick="deleteProject('${project.id}')" class="button-secondary">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    listDiv.innerHTML = `<div class="error-message">Error loading projects: ${error.message}</div>`;
  }
}

async function uploadProject() {
  const fileInput = document.getElementById('json-file');
  const messageDiv = document.getElementById('upload-message');

  if (!fileInput.files[0]) {
    messageDiv.innerHTML = '<div class="error-message">Please select a file</div>';
    return;
  }

  try {
    const file = fileInput.files[0];
    const text = await file.text();
    const jsonData = JSON.parse(text);

    let projectData = jsonData;
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      projectData = jsonData[0];
    }

    const title = projectData.textTitle || file.name.replace('.json', '');
    const shareCode = generateShareCode();

    const { error } = await supabase
      .from('projects')
      .insert({
        linguist_id: currentUser.id,
        title: title,
        share_code: shareCode,
        json_data: jsonData
      });

    if (error) throw error;

    messageDiv.innerHTML = `<div class="success-message">Project uploaded! Share code: <strong>${shareCode}</strong></div>`;
    fileInput.value = '';
    await loadProjects();
  } catch (error) {
    messageDiv.innerHTML = `<div class="error-message">Upload failed: ${error.message}</div>`;
  }
}

function generateShareCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 9; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function copyShareLink(shareCode) {
  const url = `${window.location.origin}${window.location.pathname}#p/${shareCode}`;
  navigator.clipboard.writeText(url);
  alert('Share link copied to clipboard!');
}

async function downloadProject(projectId) {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) throw error;

    const blob = new Blob([JSON.stringify(project.json_data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title}_translated.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert('Download failed: ' + error.message);
  }
}

async function deleteProject(projectId) {
  if (!confirm('Are you sure you want to delete this project?')) return;

  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;
    await loadProjects();
  } catch (error) {
    alert('Delete failed: ' + error.message);
  }
}

// ===== TRANSLATION PAGE LOADING =====

async function loadTranslationPage(shareCode) {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('share_code', shareCode.trim())
      .single();

    if (error) throw error;
    if (!project) throw new Error('Project not found');

    currentProject = project;

    // Normalize JSON data
    let jsonData = currentProject.json_data;
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      jsonData = jsonData[0];
    }
    currentProject.json_data = jsonData;

    // Prepare data for both views
    prepareChunksForMobile();

    // Start background sync
    startBackgroundSync();

    // Render based on active view mode
    renderTranslationInterface();

  } catch (error) {
    showError('Error', 'Failed to load project: ' + error.message);
  }
}

function prepareChunksForMobile() {
  chunkData = [];
  const jsonData = currentProject.json_data;

  if (!jsonData || !jsonData.paragraphs) {
    throw new Error('Invalid project data structure');
  }

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
}


function renderTranslationInterface() {
  if (activeViewMode === VIEW_MODES.MOBILE) {
    renderMobileView();
  } else {
    renderDesktopView();
  }
}

// ===== MOBILE VIEW =====

function renderMobileView() {
  mobileFlowState = FLOW_STATES.CHUNK_SELECT;
  renderMobileState();
}

function renderMobileState() {
  const main = document.getElementById('main-content');

  switch (mobileFlowState) {
    case FLOW_STATES.LOADING:
      main.innerHTML = renderMobileLoading();
      break;
    case FLOW_STATES.CHUNK_SELECT:
      main.innerHTML = renderMobileChunkSelect();
      break;
    case FLOW_STATES.FREE_TRANSLATION:
      main.innerHTML = renderMobileFreeTranslation();
      attachMobileFreeTranslationListeners();
      break;
    case FLOW_STATES.WORD_TRANSLATION:
      main.innerHTML = renderMobileWordTranslation();
      attachMobileWordTranslationListeners();
      break;
    case FLOW_STATES.CHUNK_COMPLETE:
      main.innerHTML = renderMobileChunkComplete();
      break;
  }
}

function renderMobileLoading() {
  return `
    <div class="mobile-loading">
      <div class="spinner"></div>
      <p>${t('loading')}</p>
    </div>
  `;
}

function renderMobileChunkSelect() {
  const totalChunks = chunkData.length;
  const completedChunks = chunkData.filter(c => isChunkCompleted(c)).length;
  const progress = totalChunks > 0 ? (completedChunks / totalChunks * 100) : 0;

  return `
    <div class="mobile-screen">
      <div class="mobile-card">
        <div class="mobile-card-header">
          <h2 class="mobile-card-title">${currentProject.json_data.textTitle || t('choose_text')}</h2>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <p class="mobile-card-subtitle">${completedChunks} / ${totalChunks} ${t('completed')}</p>
          </div>
        </div>

        <div class="mobile-chunk-list">
          ${chunkData.map((chunk, index) => {
            const isCompleted = isChunkCompleted(chunk);
            const status = isCompleted ? 'completed' : '';
            return `
              <button class="mobile-chunk-button ${status}" onclick="selectChunk(${index})">
                <span class="chunk-number">${index + 1}</span>
                <span class="chunk-label">${t('chunk')}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function isChunkCompleted(chunk) {
  const segment = chunk.segment;

  // Check if free translation exists
  const ft = segment.freeTranslation?.en || '';
  if (ft.trim().length === 0) {
    return false;
  }

  // Check if all baseline words have literal translations
  const baselineWords = segment.baseline || [];
  const literalWords = (segment.literalTranslation?.en || '').split(' ').filter(w => w.trim());
  const merges = segment.literalTranslationMerges || [];

  // Count how many words are covered by merges
  const mergedWordIndices = new Set();
  merges.forEach(merge => {
    merge.wordIndices.forEach(idx => mergedWordIndices.add(idx));
  });

  // Check each baseline word
  for (let i = 0; i < baselineWords.length; i++) {
    const isMerged = mergedWordIndices.has(i);

    if (isMerged) {
      // For merged words, check that the merge has a gloss
      const merge = merges.find(m => m.wordIndices.includes(i));
      if (!merge || !merge.gloss || merge.gloss.trim().length === 0) {
        return false;
      }
    } else {
      // For non-merged words, check literal translation exists
      if (!literalWords[i] || literalWords[i].trim().length === 0) {
        return false;
      }
    }
  }

  return true;
}

function selectChunk(index) {
  currentChunkIndex = index;
  currentWordIndex = 0;
  mobileFlowState = FLOW_STATES.FREE_TRANSLATION;
  renderMobileState();
}

function renderMobileFreeTranslation() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const baselineText = (segment.baseline || []).join(' ');
  const freeTranslation = segment.freeTranslation?.en || '';

  return `
    <div class="mobile-screen">
      <div class="mobile-card">
        <div class="mobile-card-header">
          <h2 class="mobile-card-title">${t('chunk')} ${currentChunkIndex + 1} / ${chunkData.length}</h2>
        </div>

        <div class="mobile-baseline">${escapeHtml(baselineText)}</div>

        <div class="mobile-input-container">
          <label class="mobile-label">${t('free_translation')}</label>
          <textarea
            id="mobile-free-input"
            class="mobile-textarea"
            placeholder="${t('translate_instruction')}..."
          >${escapeHtml(freeTranslation)}</textarea>
        </div>

        <div class="mobile-button-group">
          <button class="mobile-button mobile-button-secondary" onclick="backToChunkSelect()">
            ${t('back')}
          </button>
          <button class="mobile-button" onclick="proceedToWordTranslation()">
            ${t('ok')}
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachMobileFreeTranslationListeners() {
  const input = document.getElementById('mobile-free-input');
  if (input) {
    input.addEventListener('input', handleMobileFreeTranslationChange);
  }
}

function handleMobileFreeTranslationChange(e) {
  const chunk = chunkData[currentChunkIndex];
  const value = e.target.value;

  if (!chunk.segment.freeTranslation) {
    chunk.segment.freeTranslation = {};
  }
  chunk.segment.freeTranslation.en = value;

  debouncedSave();
}

function proceedToWordTranslation() {
  currentWordIndex = 0;
  mobileFlowState = FLOW_STATES.WORD_TRANSLATION;
  renderMobileState();
}

function backToChunkSelect() {
  mobileFlowState = FLOW_STATES.CHUNK_SELECT;
  renderMobileState();
}

function renderMobileWordTranslation() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const words = segment.baseline || [];
  const baselineText = (segment.baseline || []).join(' ');
  const totalWords = words.length;

  // Check if current word is linked with other words
  const merges = segment.literalTranslationMerges || [];
  let currentMerge = null;
  let linkedWords = [words[currentWordIndex]];
  let linkedTranslation = '';
  let linkedIndices = [currentWordIndex];

  for (const merge of merges) {
    if (merge.wordIndices.includes(currentWordIndex)) {
      currentMerge = merge;
      linkedIndices = merge.wordIndices;
      linkedWords = merge.wordIndices.map(idx => words[idx]);
      linkedTranslation = merge.gloss || '';
      break;
    }
  }

  const isLinked = currentMerge !== null;
  const lastLinkedIndex = isLinked ? Math.max(...linkedIndices) : currentWordIndex;
  const canLinkMore = lastLinkedIndex < totalWords - 1;

  const freeTranslation = segment.freeTranslation?.en || '';
  const progress = totalWords > 0 ? ((currentWordIndex + 1) / totalWords * 100) : 0;

  return `
    <div class="mobile-screen">
      <div class="mobile-card">
        <div class="mobile-card-header">
          <h2 class="mobile-card-title">${t('chunk')} ${currentChunkIndex + 1}</h2>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <p class="mobile-progress-text">${t('word')} ${currentWordIndex + 1} / ${totalWords}</p>
          </div>
        </div>

        <div class="mobile-context">
          <div class="mobile-context-label">${t('free_translation')}</div>
          <div class="mobile-context-text">${escapeHtml(baselineText)}</div>
        </div>

        <div class="mobile-word-card">
          <div class="mobile-word-display">
            <div class="mobile-word-label">${t('baseline')}</div>
            <div class="mobile-word-text ${isLinked ? 'mobile-word-linked' : ''}">${escapeHtml(linkedWords.join(' + '))}</div>
            <div class="mobile-word-counter">${currentWordIndex + 1} of ${totalWords}${isLinked ? ` (${linkedWords.length} words linked)` : ''}</div>
            ${isLinked ? `
              <button class="mobile-unlink-button" onclick="unlinkMobileWords()">
                Unlink All ↶
              </button>
            ` : ''}
          </div>

          <div class="mobile-input-container">
            <label class="mobile-label">${t('analysis_language')}</label>
            <input
              type="text"
              id="mobile-word-input"
              class="mobile-word-input"
              value="${escapeHtml(linkedTranslation || '')}"
              placeholder="${t('translate_instruction')}..."
              autofocus
            >
          </div>

          ${canLinkMore ? `
            <button class="mobile-link-button" onclick="linkWithNextWord()">
              ${isLinked ? 'Link another word' : 'Link with next word'} (${escapeHtml(words[lastLinkedIndex + 1])}) →
            </button>
          ` : ''}
        </div>

        <div class="mobile-button-group">
          ${currentWordIndex > 0 ? `
            <button class="mobile-button mobile-button-secondary" onclick="previousWord()">
              ${t('back')}
            </button>
          ` : `
            <button class="mobile-button mobile-button-secondary" onclick="backToFreeTranslation()">
              ${t('back')}
            </button>
          `}
          <button class="mobile-button" onclick="nextWord()">
            ${currentWordIndex < totalWords - 1 ? t('next') : t('finish')}
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachMobileWordTranslationListeners() {
  const input = document.getElementById('mobile-word-input');
  if (input) {
    input.addEventListener('input', handleMobileWordTranslationChange);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nextWord();
      }
    });
  }
}

function handleMobileWordTranslationChange(e) {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const value = e.target.value;

  // Check if current word is part of a merge
  const merges = segment.literalTranslationMerges || [];
  let mergeForCurrentWord = null;

  for (const merge of merges) {
    if (merge.wordIndices.includes(currentWordIndex)) {
      mergeForCurrentWord = merge;
      break;
    }
  }

  if (mergeForCurrentWord) {
    // Update the merge gloss
    mergeForCurrentWord.gloss = value;
  } else {
    // Update individual word translation
    const literalWords = (segment.literalTranslation?.en || '').split(' ').filter(w => w.trim());

    while (literalWords.length <= currentWordIndex) {
      literalWords.push('');
    }
    literalWords[currentWordIndex] = value;

    if (!segment.literalTranslation) {
      segment.literalTranslation = {};
    }
    segment.literalTranslation.en = literalWords.join(' ');
  }

  debouncedSave();
}

function nextWord() {
  const chunk = chunkData[currentChunkIndex];
  const totalWords = (chunk.segment.baseline || []).length;

  if (currentWordIndex < totalWords - 1) {
    currentWordIndex++;
    renderMobileState();
  } else {
    mobileFlowState = FLOW_STATES.CHUNK_COMPLETE;
    renderMobileState();
  }
}

function previousWord() {
  if (currentWordIndex > 0) {
    currentWordIndex--;
    renderMobileState();
  }
}

function backToFreeTranslation() {
  mobileFlowState = FLOW_STATES.FREE_TRANSLATION;
  renderMobileState();
}

function renderMobileChunkComplete() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const wordCount = (segment.baseline || []).length;

  const completedChunks = chunkData.filter(c => isChunkCompleted(c)).length;
  const totalChunks = chunkData.length;
  const hasMoreChunks = currentChunkIndex < totalChunks - 1;

  return `
    <div class="mobile-screen">
      <div class="mobile-report">
        <h2>${t('finished')}</h2>
        <p>${t('chunk')} ${currentChunkIndex + 1} ${t('completed').toLowerCase()}</p>
      </div>

      <div class="mobile-stats">
        <div class="mobile-stat">
          <div class="mobile-stat-value">${wordCount}</div>
          <div class="mobile-stat-label">${t('word_for_word')}</div>
        </div>
        <div class="mobile-stat">
          <div class="mobile-stat-value">${completedChunks}/${totalChunks}</div>
          <div class="mobile-stat-label">${t('progress')}</div>
        </div>
      </div>

      ${hasMoreChunks ? `
        <div class="mobile-card">
          <h3>${t('continue_question')}</h3>
          <div class="mobile-button-group">
            <button class="mobile-button mobile-button-secondary" onclick="backToChunkSelect()">
              ${t('no')}
            </button>
            <button class="mobile-button mobile-button-success" onclick="continueToNextChunk()">
              ${t('yes')}
            </button>
          </div>
        </div>
      ` : `
        <div class="mobile-card">
          <h3>All chunks completed!</h3>
          <button class="mobile-button mobile-button-success" onclick="backToChunkSelect()">
            ${t('finish')}
          </button>
        </div>
      `}
    </div>
  `;
}

function continueToNextChunk() {
  for (let i = currentChunkIndex + 1; i < chunkData.length; i++) {
    if (!isChunkCompleted(chunkData[i])) {
      selectChunk(i);
      return;
    }
  }
  selectChunk(currentChunkIndex + 1 < chunkData.length ? currentChunkIndex + 1 : 0);
}

// Mobile word linking functions
function linkWithNextWord() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const words = segment.baseline || [];

  if (currentWordIndex >= words.length - 1) return;

  // Initialize literalTranslationMerges if it doesn't exist
  if (!segment.literalTranslationMerges) {
    segment.literalTranslationMerges = [];
  }

  // Get current translation value from input
  const input = document.getElementById('mobile-word-input');
  const glossValue = input ? input.value : '';

  // Check if current word is already part of a merge
  let existingMerge = null;
  for (const merge of segment.literalTranslationMerges) {
    if (merge.wordIndices.includes(currentWordIndex)) {
      existingMerge = merge;
      break;
    }
  }

  if (existingMerge) {
    // Extend existing merge to include next word
    if (!existingMerge.wordIndices.includes(currentWordIndex + 1)) {
      existingMerge.wordIndices.push(currentWordIndex + 1);
      existingMerge.wordIndices.sort((a, b) => a - b);
    }
  } else {
    // Create new merge
    segment.literalTranslationMerges.push({
      wordIndices: [currentWordIndex, currentWordIndex + 1],
      gloss: glossValue
    });
  }

  debouncedSave();
  renderMobileState();
}

function unlinkMobileWords() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;

  if (!segment.literalTranslationMerges) return;

  // Find and remove the merge containing current word
  const mergeIndex = segment.literalTranslationMerges.findIndex(merge =>
    merge.wordIndices.includes(currentWordIndex)
  );

  if (mergeIndex >= 0) {
    segment.literalTranslationMerges.splice(mergeIndex, 1);
    debouncedSave();
    renderMobileState();
  }
}

// ===== DESKTOP VIEW =====
// (Include your existing desktop rendering code from app.js here)
// For brevity, I'll include a simplified version

function renderDesktopView() {
  const main = document.getElementById('main-content');
  const jsonData = currentProject.json_data;

  // Calculate progress
  const allSegments = jsonData.paragraphs.flatMap(p => p.segments || []);
  const completedSegments = allSegments.filter(s =>
    s.freeTranslation?.en && s.freeTranslation.en.trim() !== ''
  ).length;
  const progress = allSegments.length > 0 ? (completedSegments / allSegments.length * 100) : 0;

  main.innerHTML = `
    <div class="project-info">
      <div class="project-title">${escapeHtml(jsonData.textTitle || 'Translation Project')}</div>
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

  renderDesktopSegments();
}

function renderDesktopSegments() {
  const container = document.getElementById('segments-container');
  const jsonData = currentProject.json_data;

  let segmentIndex = 0;
  const segmentsHtml = jsonData.paragraphs.map((paragraph, pIdx) => {
    const segments = paragraph.segments || [];
    return segments.map((segment, sIdx) => {
      const html = renderDesktopSegment(segment, segmentIndex);
      segmentIndex++;
      return html;
    }).join('');
  }).join('');

  container.innerHTML = segmentsHtml;

  // Attach event listeners
  attachDesktopInputListeners();
}

function renderDesktopSegment(segment, index) {
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

function attachDesktopInputListeners() {
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

function showResetButton(input) {
  const cell = input.closest('td');
  const resetButton = cell.querySelector('.reset-button');
  if (resetButton) {
    resetButton.classList.remove('hidden');
  }
}

function hideResetButton(input) {
  const cell = input.closest('td');
  const resetButton = cell.querySelector('.reset-button');
  if (resetButton) {
    resetButton.classList.add('hidden');
  }
}

function resetBaselineWord(segmentIndex, wordIndex) {
  const input = document.querySelector(`input[data-segment="${segmentIndex}"][data-word="${wordIndex}"][data-field="baseline"]`);
  const originalValue = input.dataset.original;

  input.value = originalValue;
  handleBaselineChange(segmentIndex, wordIndex, originalValue, originalValue);
}

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

function handleFreeTranslationChange(segmentIndex, value) {
  // Update local data
  const allSegments = currentProject.json_data.paragraphs.flatMap(p => p.segments);
  const segment = allSegments[segmentIndex];

  if (!segment) return;

  if (!segment.freeTranslation) segment.freeTranslation = {};
  segment.freeTranslation.en = value;

  debouncedSave();
}

// WFW Cell Merging Functions
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

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ===== SAVE & SYNC =====

function debouncedSave() {
  clearTimeout(saveTimeout);
  showSaveIndicator('unsaved');

  saveTimeout = setTimeout(async () => {
    await saveProject();
  }, 1500);
}

async function saveProject() {
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

    showSaveIndicator('saved');
  } catch (error) {
    console.error('Save error:', error);
    showSaveIndicator('error');
  }
}

function showSaveIndicator(status) {
  const indicator = document.getElementById('save-indicator');
  if (!indicator) return;

  clearTimeout(saveIndicatorTimeout);

  indicator.className = `save-indicator ${status}`;

  if (status === 'unsaved') {
    indicator.textContent = 'Saved locally';
  } else if (status === 'syncing') {
    indicator.textContent = 'Syncing...';
  } else if (status === 'saved') {
    indicator.textContent = 'Synced';
    saveIndicatorTimeout = setTimeout(() => {
      indicator.textContent = '';
      indicator.className = 'save-indicator';
    }, 2000);
  } else if (status === 'offline') {
    indicator.textContent = 'Saved locally (will sync when online)';
  } else if (status === 'error') {
    indicator.textContent = 'Error saving';
  }
}

function startBackgroundSync() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    if (autoSyncEnabled && currentProject) {
      saveProject();
    }
  }, 30000); // Every 30 seconds
}

// ===== UTILITIES =====

function showError(title, message) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="error-container" style="text-align: center; padding: 40px;">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <button onclick="window.location.reload()" style="margin-top: 20px;">Reload</button>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ===== DEV MODE =====

function enableDevMode() {
  window.devTools = {
    inspectChunk: (index) => console.log(chunkData[index]),
    inspectProject: () => console.log(currentProject),
    exportData: () => JSON.stringify(currentProject.json_data, null, 2),
  };

  console.log('🔧 Dev tools available: devTools.inspectChunk(index), devTools.inspectProject(), devTools.exportData(), devTools.setView(mode)');
}

// ===== GLOBAL FUNCTIONS =====

window.handleAuth = handleAuth;
window.signOut = signOut;
window.uploadProject = uploadProject;
window.copyShareLink = copyShareLink;
window.downloadProject = downloadProject;
window.deleteProject = deleteProject;
window.selectChunk = selectChunk;
window.backToChunkSelect = backToChunkSelect;
window.proceedToWordTranslation = proceedToWordTranslation;
window.backToFreeTranslation = backToFreeTranslation;
window.nextWord = nextWord;
window.previousWord = previousWord;
window.continueToNextChunk = continueToNextChunk;
window.linkWithNextWord = linkWithNextWord;
window.unlinkMobileWords = unlinkMobileWords;
window.mergeWFWCells = mergeWFWCells;
window.unmergeWFWCells = unmergeWFWCells;
window.showResetButton = showResetButton;
window.hideResetButton = hideResetButton;
window.resetBaselineWord = resetBaselineWord;
window.toggleAutoSync = toggleAutoSync;
window.manualSync = manualSync;

// ===== SYNC FUNCTIONS =====

function toggleAutoSync() {
  const toggle = document.getElementById('auto-sync-toggle');
  if (!toggle) return;

  autoSyncEnabled = toggle.checked;

  if (autoSyncEnabled) {
    startBackgroundSync();
    showSaveIndicator('syncing');
    saveProject();
  } else {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
    showSaveIndicator('unsaved');
  }
}

async function manualSync() {
  showSaveIndicator('syncing');
  await saveProject();
}

// ===== START APP =====

init();
