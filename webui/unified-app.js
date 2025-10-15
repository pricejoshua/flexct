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

    // Update view toggle
    updateViewToggle(shareCode);

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
  const ft = chunk.segment.freeTranslation?.en || '';
  return ft.trim().length > 0;
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
  const totalWords = words.length;

  const literalWords = (segment.literalTranslation?.en || '').split(' ').filter(w => w.trim());
  const currentWord = words[currentWordIndex] || '';
  const currentTranslation = literalWords[currentWordIndex] || '';

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
          <div class="mobile-context-text">${escapeHtml(freeTranslation)}</div>
        </div>

        <div class="mobile-word-card">
          <div class="mobile-word-display">
            <div class="mobile-word-label">${t('baseline')}</div>
            <div class="mobile-word-text">${escapeHtml(currentWord)}</div>
            <div class="mobile-word-counter">${currentWordIndex + 1} of ${totalWords}</div>
          </div>

          <div class="mobile-input-container">
            <label class="mobile-label">${t('analysis_language')}</label>
            <input
              type="text"
              id="mobile-word-input"
              class="mobile-word-input"
              value="${escapeHtml(currentTranslation)}"
              placeholder="${t('translate_instruction')}..."
              autofocus
            >
          </div>
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

  const literalWords = (segment.literalTranslation?.en || '').split(' ').filter(w => w.trim());

  while (literalWords.length <= currentWordIndex) {
    literalWords.push('');
  }
  literalWords[currentWordIndex] = value;

  if (!segment.literalTranslation) {
    segment.literalTranslation = {};
  }
  segment.literalTranslation.en = literalWords.join(' ');

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

// ===== DESKTOP VIEW =====
// (Include your existing desktop rendering code from app.js here)
// For brevity, I'll include a simplified version

function renderDesktopView() {
  const main = document.getElementById('main-content');
  const jsonData = currentProject.json_data;

  main.innerHTML = `
    <div class="project-info">
      <div class="project-title">${escapeHtml(jsonData.textTitle || 'Untitled')}</div>
      <div class="project-stats">
        <span>Segments: ${countSegments(jsonData)}</span>
        <span>Progress: ${calculateProgress(jsonData)}%</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${calculateProgress(jsonData)}%"></div>
        </div>
      </div>
    </div>
    <div id="segments-container">
      ${renderAllSegments(jsonData)}
    </div>
  `;

  // Attach desktop event listeners
  attachDesktopListeners();
}

function countSegments(jsonData) {
  return jsonData.paragraphs.reduce((count, p) => count + (p.segments?.length || 0), 0);
}

function calculateProgress(jsonData) {
  const allSegments = jsonData.paragraphs.flatMap(p => p.segments || []);
  const completed = allSegments.filter(s => s.freeTranslation?.en?.trim()).length;
  return allSegments.length > 0 ? Math.round((completed / allSegments.length) * 100) : 0;
}

function renderAllSegments(jsonData) {
  let html = '';
  jsonData.paragraphs.forEach((paragraph, pIdx) => {
    if (paragraph.segments && Array.isArray(paragraph.segments)) {
      paragraph.segments.forEach((segment, sIdx) => {
        html += renderDesktopSegment(segment, pIdx, sIdx);
      });
    }
  });
  return html;
}

function renderDesktopSegment(segment, pIdx, sIdx) {
  const baseline = segment.baseline || [];
  const literalTranslation = segment.literalTranslation?.en || '';
  const freeTranslation = segment.freeTranslation?.en || '';

  return `
    <div class="segment-container">
      <table class="segment-table">
        <tr>
          <td>Baseline</td>
          <td>${baseline.map((word, wIdx) =>
            `<span class="baseline-word" data-p="${pIdx}" data-s="${sIdx}" data-w="${wIdx}">${escapeHtml(word)}</span>`
          ).join(' ')}</td>
        </tr>
        <tr>
          <td>WFW</td>
          <td>
            <input type="text"
              class="wfw-input"
              data-p="${pIdx}"
              data-s="${sIdx}"
              value="${escapeHtml(literalTranslation)}"
              placeholder="Word-for-word translation...">
          </td>
        </tr>
        <tr class="free-row">
          <td>Free</td>
          <td>
            <textarea
              class="free-input"
              data-p="${pIdx}"
              data-s="${sIdx}"
              placeholder="Free translation...">${escapeHtml(freeTranslation)}</textarea>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function attachDesktopListeners() {
  // WFW inputs
  document.querySelectorAll('.wfw-input').forEach(input => {
    input.addEventListener('input', handleDesktopWFWChange);
  });

  // Free translation inputs
  document.querySelectorAll('.free-input').forEach(textarea => {
    textarea.addEventListener('input', handleDesktopFreeChange);
  });
}

function handleDesktopWFWChange(e) {
  const pIdx = parseInt(e.target.dataset.p);
  const sIdx = parseInt(e.target.dataset.s);
  const value = e.target.value;

  currentProject.json_data.paragraphs[pIdx].segments[sIdx].literalTranslation = { en: value };
  debouncedSave();
}

function handleDesktopFreeChange(e) {
  const pIdx = parseInt(e.target.dataset.p);
  const sIdx = parseInt(e.target.dataset.s);
  const value = e.target.value;

  currentProject.json_data.paragraphs[pIdx].segments[sIdx].freeTranslation = { en: value };
  debouncedSave();
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
  let indicator = document.getElementById('save-indicator');

  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'save-indicator';
    indicator.className = 'save-indicator';
    document.body.appendChild(indicator);
  }

  indicator.className = `save-indicator ${status}`;

  const messages = {
    unsaved: t('unsaved', 'Unsaved'),
    syncing: t('saving', 'Saving...'),
    saved: t('saved', 'Saved'),
    error: t('error', 'Error')
  };

  indicator.textContent = messages[status] || status;
  indicator.style.display = 'inline-block';

  if (status === 'saved' || status === 'error') {
    setTimeout(() => {
      indicator.style.display = 'none';
    }, 2000);
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
    setView: (mode) => setViewMode(mode)
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
window.setViewMode = setViewMode;
window.selectChunk = selectChunk;
window.backToChunkSelect = backToChunkSelect;
window.proceedToWordTranslation = proceedToWordTranslation;
window.backToFreeTranslation = backToFreeTranslation;
window.nextWord = nextWord;
window.previousWord = previousWord;
window.continueToNextChunk = continueToNextChunk;

// ===== START APP =====

init();
