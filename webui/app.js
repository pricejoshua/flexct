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
let currentTextIndex = 0; // Track which text in the array we're working on
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
    let textIndex = 0;

    if (path.includes('/p/')) {
      const parts = path.split('/p/')[1].split('/');
      shareCode = parts[0].split('?')[0];
      if (parts[1] === 'text' && parts[2]) {
        textIndex = parseInt(parts[2], 10) || 0;
      }
    } else {
      // Match patterns: #p/SHARECODE or #p/SHARECODE/text/0
      const hashMatch = hash.match(/#p\/([A-Z0-9]+)(?:\/text\/(\d+))?/i);
      if (hashMatch) {
        shareCode = hashMatch[1];
        textIndex = hashMatch[2] ? parseInt(hashMatch[2], 10) : 0;
      } else {
        shareCode = hash.split('#p/')[1].split('?')[0].split('/')[0];
      }
    }
    shareCode = shareCode.trim();
    await loadTranslationPage(shareCode, textIndex);
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
        <button onclick="signOut()" class="button-secondary button-small">${t('sign_out')}</button>
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
      <h2 class="mb-20">${t('linguist_sign_in')}</h2>
      <div id="auth-message"></div>
      <form class="auth-form" onsubmit="handleAuth(event)">
        <input type="email" id="email" placeholder="${t('email')}" required>
        <input type="password" id="password" placeholder="${t('password')}" required>
        <button type="submit">${t('sign_in')} / ${t('sign_up')}</button>
      </form>
      <p class="text-center" style="margin-top: 20px; font-size: 14px; color: #64748b;">
        ${t('community_link_note')}
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
        messageDiv.innerHTML = `<div class="success-message">${t('account_created')}</div>`;
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
      <h2>${t('my_projects')}</h2>
      <div class="upload-section">
        <h3>${t('upload_new_project')}</h3>
        <input type="file" id="json-file" accept=".json">
        <button onclick="uploadProject()" style="margin-top: 10px;">${t('upload')}</button>
        <div id="upload-message"></div>
      </div>
      <div id="projects-list" class="projects-list">
        <p>${t('loading_projects')}</p>
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
      listDiv.innerHTML = `<p>${t('no_projects_yet')}</p>`;
      return;
    }

    listDiv.innerHTML = projects.map(project => `
      <div class="project-item">
        <h3>${escapeHtml(project.title)}</h3>
        <p>${t('share_code')}: <strong>${project.share_code}</strong></p>
        <p>${t('created')}: ${new Date(project.created_at).toLocaleDateString()}</p>
        <div class="project-actions">
          <button onclick="copyShareLink('${project.share_code}')">${t('copy_share_link')}</button>
          <button onclick="downloadProject('${project.id}')">${t('download_json')}</button>
          <button onclick="deleteProject('${project.id}')" class="button-secondary">${t('delete')}</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    listDiv.innerHTML = `<div class="error-message">${t('error_loading_projects', {error: error.message})}</div>`;
  }
}

async function uploadProject() {
  const fileInput = document.getElementById('json-file');
  const messageDiv = document.getElementById('upload-message');

  if (!fileInput.files[0]) {
    messageDiv.innerHTML = `<div class="error-message">${t('please_select_file')}</div>`;
    return;
  }

  try {
    const file = fileInput.files[0];
    const text = await file.text();
    const jsonData = JSON.parse(text);

    // Normalize to array format: single object becomes array with one element
    let textsArray = Array.isArray(jsonData) ? jsonData : [jsonData];

    // Validate that we have at least one text
    if (textsArray.length === 0) {
      throw new Error('JSON file contains no texts');
    }

    // Use first text's title for project title, or filename
    const title = textsArray[0].textTitle || file.name.replace('.json', '');
    const shareCode = generateShareCode();

    const { error } = await supabase
      .from('projects')
      .insert({
        linguist_id: currentUser.id,
        title: title,
        share_code: shareCode,
        json_data: textsArray
      });

    if (error) throw error;

    messageDiv.innerHTML = `<div class="success-message">${t('project_uploaded', {shareCode})}</div>`;
    fileInput.value = '';
    await loadProjects();
  } catch (error) {
    messageDiv.innerHTML = `<div class="error-message">${t('upload_failed', {error: error.message})}</div>`;
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
  alert(t('share_link_copied'));
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
    alert(t('download_failed', {error: error.message}));
  }
}

async function deleteProject(projectId) {
  if (!confirm(t('confirm_delete'))) return;

  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;
    await loadProjects();
  } catch (error) {
    alert(t('delete_failed', {error: error.message}));
  }
}

// ===== TRANSLATION PAGE LOADING =====

// Migrate old string-based literalTranslation format to array format
function migrateLiteralTranslationFormat(jsonData) {
  if (!jsonData || !jsonData.paragraphs) return;

  jsonData.paragraphs.forEach(paragraph => {
    if (!paragraph.segments || !Array.isArray(paragraph.segments)) return;

    paragraph.segments.forEach(segment => {
      // Check if literalTranslation exists and has language keys
      if (!segment.literalTranslation) return;

      Object.keys(segment.literalTranslation).forEach(lang => {
        const value = segment.literalTranslation[lang];

        // If it's a string, convert to array
        if (typeof value === 'string') {
          // Split by spaces and filter empty strings
          const words = value.split(' ').filter(w => w.trim());

          // Ensure array is same length as baseline
          const baselineLength = (segment.baseline || []).length;
          const literalArray = new Array(baselineLength).fill('');

          // Fill array with words (may be shorter than baseline if incomplete)
          words.forEach((word, idx) => {
            if (idx < baselineLength) {
              literalArray[idx] = word;
            }
          });

          // Check for merges and repeat the gloss at those positions
          const merges = segment.literalTranslationMerges || [];
          merges.forEach(merge => {
            const gloss = merge.gloss || '';
            merge.wordIndices.forEach(idx => {
              if (idx < baselineLength) {
                literalArray[idx] = gloss;
              }
            });
          });

          segment.literalTranslation[lang] = literalArray;
        }
        // If it's already an array, ensure it's the right length and apply merges
        else if (Array.isArray(value)) {
          const baselineLength = (segment.baseline || []).length;
          while (value.length < baselineLength) {
            value.push('');
          }

          // Ensure merged positions have the gloss repeated
          const merges = segment.literalTranslationMerges || [];
          merges.forEach(merge => {
            const gloss = merge.gloss || '';
            merge.wordIndices.forEach(idx => {
              if (idx < baselineLength) {
                value[idx] = gloss;
              }
            });
          });
        }
      });
    });
  });
}

async function loadTranslationPage(shareCode, textIndex = 0) {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('share_code', shareCode.trim())
      .single();

    if (error) throw error;
    if (!project) throw new Error('Project not found');

    currentProject = project;

    // Ensure json_data is an array (normalize old single-object format)
    if (!Array.isArray(currentProject.json_data)) {
      currentProject.json_data = [currentProject.json_data];
    }

    // Validate text index
    if (textIndex < 0 || textIndex >= currentProject.json_data.length) {
      textIndex = 0;
    }
    currentTextIndex = textIndex;

    // Migrate old string-based literalTranslation to array format for all texts
    currentProject.json_data.forEach(text => {
      migrateLiteralTranslationFormat(text);
    });

    // Prepare data for both views
    prepareChunksForMobile();

    // Start background sync
    startBackgroundSync();

    // Render based on active view mode
    renderTranslationInterface();

  } catch (error) {
    showError(t('error'), t('failed_to_load_project', {error: error.message}));
  }
}

function prepareChunksForMobile() {
  chunkData = [];
  const currentText = getCurrentText();

  if (!currentText || !currentText.paragraphs) {
    throw new Error('Invalid project data structure');
  }

  currentText.paragraphs.forEach((paragraph, pIdx) => {
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

// Helper function to get the current text object
function getCurrentText() {
  if (!currentProject || !currentProject.json_data) return null;
  return currentProject.json_data[currentTextIndex];
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
          <h2 class="mobile-card-title">${getCurrentText().textTitle || t('choose_text')}</h2>
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

        <button class="mobile-button mobile-button-secondary" style="margin-top: 16px;" onclick="openFullTextModal()">${t('view_full_text')}</button>
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
  const literalWords = segment.literalTranslation?.en || [];
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

        <button class="mobile-button mobile-button-secondary" style="margin-top: 16px;" onclick="openFullTextModal()">${t('view_full_text')}</button>
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
  const literalWords = segment.literalTranslation?.en || [];
  let currentMerge = null;
  let linkedWords = [words[currentWordIndex]];
  let linkedTranslation = literalWords[currentWordIndex] || '';
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
          <div class="mobile-context-label">${t('baseline')}</div>
          <div class="mobile-context-text">${escapeHtml(baselineText)}</div>
        </div>

        <div class="mobile-word-card">
          <div class="mobile-word-display">
            <div class="mobile-word-label">${t('baseline')}</div>
            <div class="mobile-word-text ${isLinked ? 'mobile-word-linked' : ''}">${escapeHtml(linkedWords.join(' + '))}</div>
            <div class="mobile-word-counter">${t('word_of', {current: currentWordIndex + 1, total: totalWords})}${isLinked ? ` (${t('words_linked', {count: linkedWords.length})})` : ''}</div>
            ${isLinked ? `
              <button class="mobile-unlink-button" onclick="unlinkMobileWords()">
                ${t('unlink_all')} ↶
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
              ${isLinked ? t('link_another_word') : t('link_with_next_word')} (${escapeHtml(words[lastLinkedIndex + 1])}) 🔗
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

        <button class="mobile-button mobile-button-secondary" style="margin-top: 16px;" onclick="openFullTextModal()">${t('view_full_text')}</button>
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
    if (!segment.literalTranslation) {
      segment.literalTranslation = {};
    }
    if (!Array.isArray(segment.literalTranslation.en)) {
      segment.literalTranslation.en = [];
    }
    const literalWords = segment.literalTranslation.en;

    // Ensure array is same length as baseline
    const baselineLength = (segment.baseline || []).length;
    while (literalWords.length < baselineLength) {
      literalWords.push('');
    }
    literalWords[currentWordIndex] = value;
  }

  debouncedSave();
}

function nextWord() {
  const chunk = chunkData[currentChunkIndex];
  const segment = chunk.segment;
  const totalWords = (segment.baseline || []).length;
  const merges = segment.literalTranslationMerges || [];

  // Find if current word is part of a merge
  let currentMerge = null;
  for (const merge of merges) {
    if (merge.wordIndices.includes(currentWordIndex)) {
      currentMerge = merge;
      break;
    }
  }

  // If in a merge, jump to the word after the last linked word
  if (currentMerge) {
    const lastLinkedIndex = Math.max(...currentMerge.wordIndices);
    currentWordIndex = lastLinkedIndex + 1;
  } else {
    // Otherwise just go to next word
    currentWordIndex++;
  }

  // Check if we've reached the end
  if (currentWordIndex >= totalWords) {
    mobileFlowState = FLOW_STATES.CHUNK_COMPLETE;
  }

  renderMobileState();
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
          <button class="mobile-button mobile-button-secondary" style="margin-top: 16px;" onclick="openFullTextModal()">${t('view_full_text')}</button>
        </div>
      ` : `
        <div class="mobile-card">
          <h3>${t('all_chunks_completed')}</h3>
          <button class="mobile-button mobile-button-success" onclick="backToChunkSelect()">
            ${t('finish')}
          </button>
          <button class="mobile-button mobile-button-secondary" style="margin-top: 16px;" onclick="openFullTextModal()">${t('view_full_text')}</button>
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

  // Initialize literalTranslationMerges if it doesn't exist
  if (!segment.literalTranslationMerges) {
    segment.literalTranslationMerges = [];
  }

  // Initialize literalTranslation array if needed
  if (!segment.literalTranslation) segment.literalTranslation = {};
  if (!Array.isArray(segment.literalTranslation.en)) {
    segment.literalTranslation.en = [];
  }
  // Ensure array is same length as baseline
  const baselineLength = (segment.baseline || []).length;
  while (segment.literalTranslation.en.length < baselineLength) {
    segment.literalTranslation.en.push('');
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
    // Find the last word in the existing merge
    const lastLinkedIndex = Math.max(...existingMerge.wordIndices);
    const nextWordIndex = lastLinkedIndex + 1;

    // Extend existing merge to include next word
    if (nextWordIndex < words.length && !existingMerge.wordIndices.includes(nextWordIndex)) {
      existingMerge.wordIndices.push(nextWordIndex);
      existingMerge.wordIndices.sort((a, b) => a - b);
      existingMerge.gloss = glossValue; // Update the gloss

      // Repeat the gloss for all merged word positions
      existingMerge.wordIndices.forEach(idx => {
        segment.literalTranslation.en[idx] = glossValue;
      });
    }
  } else {
    // Create new merge with current word and next word
    const nextWordIndex = currentWordIndex + 1;
    if (nextWordIndex < words.length) {
      segment.literalTranslationMerges.push({
        wordIndices: [currentWordIndex, nextWordIndex],
        gloss: glossValue
      });

      // Repeat the gloss in array for both merged words
      segment.literalTranslation.en[currentWordIndex] = glossValue;
      segment.literalTranslation.en[nextWordIndex] = glossValue;
    }
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
  const currentText = getCurrentText();
  const textsArray = currentProject.json_data;

  // Calculate progress
  const allSegments = currentText.paragraphs.flatMap(p => p.segments || []);
  const completedSegments = allSegments.filter(s =>
    s.freeTranslation?.en && s.freeTranslation.en.trim() !== ''
  ).length;
  const progress = allSegments.length > 0 ? (completedSegments / allSegments.length * 100) : 0;

  // Build text selector if multiple texts
  const textSelectorHtml = textsArray.length > 1 ? `
    <div class="text-selector">
      <label for="text-select">${t('select_text')}:</label>
      <select id="text-select" onchange="switchText(this.value)">
        ${textsArray.map((text, idx) => `
          <option value="${idx}" ${idx === currentTextIndex ? 'selected' : ''}>
            ${escapeHtml(text.textTitle || `Text ${idx + 1}`)}
          </option>
        `).join('')}
      </select>
      <span class="text-count">${t('text_of', {current: currentTextIndex + 1, total: textsArray.length})}</span>
    </div>
  ` : '';

  main.innerHTML = `
    <div class="project-info">
      ${textSelectorHtml}
      <div class="project-title">${escapeHtml(currentText.textTitle || t('translation_project'))}</div>
      <div class="project-stats">
        <span>${t('total_segments')}: ${allSegments.length}</span>
        <span>${t('completed')}: ${completedSegments}</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      </div>
      <div class="sync-controls">
        <label class="sync-toggle">
          <input type="checkbox" id="auto-sync-toggle" ${autoSyncEnabled ? 'checked' : ''} onchange="toggleAutoSync()">
          ${t('auto_sync')}
        </label>
        <button class="button-small" onclick="manualSync()">${t('sync_now')}</button>
        <button class="button-small view-full-text-button" onclick="openFullTextModal()">${t('view_full_text')}</button>
        <span class="save-indicator" id="save-indicator"></span>
      </div>
    </div>
    <div id="segments-container"></div>
  `;

  renderDesktopSegments();
}

// Switch to a different text
function switchText(textIndex) {
  textIndex = parseInt(textIndex, 10);
  if (textIndex === currentTextIndex) return;

  const shareCode = currentProject.share_code;
  window.location.hash = `#p/${shareCode}/text/${textIndex}`;
}

function renderDesktopSegments() {
  const container = document.getElementById('segments-container');
  const currentText = getCurrentText();

  let segmentIndex = 0;
  const segmentsHtml = currentText.paragraphs.map((paragraph, pIdx) => {
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
  const freeTranslation = segment.freeTranslation?.en || '';
  const baselineChanges = segment.baselineChanges || [];
  const merges = segment.literalTranslationMerges || [];

  // Get literal translation array (one-to-one with baseline)
  const literalWords = segment.literalTranslation?.en || [];

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
        <td>${t('baseline')}</td>
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
                title="${hasChange ? t('original') + ': ' + escapeHtml(w) : ''}"
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
        <td>${t('wfw')}</td>
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
                  title="${t('merge_with_next')}"
                  ${i === words.length - 1 ? 'disabled' : ''}
                >🔗</button>
                <button
                  class="unmerge-button ${isMerged ? '' : 'hidden'}"
                  onclick="unmergeWFWCells(${index}, ${i})"
                  title="${t('unmerge_cells')}"
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
              <div style="padding: 8px; font-weight: 600; background: #f8fafc; border-right: 1px solid #e2e8f0;">${t('free')}</div>
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
  const currentText = getCurrentText();
  const allSegments = currentText.paragraphs.flatMap(p => p.segments || []);
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
  const currentText = getCurrentText();
  const allSegments = currentText.paragraphs.flatMap(p => p.segments);
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

  // Get all word textareas for this segment
  const wordTextareas = document.querySelectorAll(`textarea[data-segment="${segmentIndex}"][data-field="literal"]`);

  // Initialize literalTranslation array
  if (!segment.literalTranslation) segment.literalTranslation = {};
  if (!Array.isArray(segment.literalTranslation.en)) {
    segment.literalTranslation.en = [];
  }

  // Ensure array is same length as baseline
  const baselineLength = (segment.baseline || []).length;
  while (segment.literalTranslation.en.length < baselineLength) {
    segment.literalTranslation.en.push('');
  }

  // Update the array with values from textareas
  wordTextareas.forEach(ta => {
    const idx = parseInt(ta.dataset.word);
    segment.literalTranslation.en[idx] = ta.value;
  });

  debouncedSave();
}

function handleFreeTranslationChange(segmentIndex, value) {
  // Update local data
  const currentText = getCurrentText();
  const allSegments = currentText.paragraphs.flatMap(p => p.segments);
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
  const currentText = getCurrentText();
  const allSegments = currentText.paragraphs.flatMap(p => p.segments || []);
  const segment = allSegments[segmentIndex];

  if (!segment) return;

  // Initialize literalTranslationMerges if it doesn't exist
  if (!segment.literalTranslationMerges) segment.literalTranslationMerges = [];

  // Initialize literalTranslation array if needed
  if (!segment.literalTranslation) segment.literalTranslation = {};
  if (!Array.isArray(segment.literalTranslation.en)) {
    segment.literalTranslation.en = [];
  }

  // Ensure array is same length as baseline
  const baselineLength = (segment.baseline || []).length;
  while (segment.literalTranslation.en.length < baselineLength) {
    segment.literalTranslation.en.push('');
  }

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

    // Repeat the gloss in literalTranslation array for each merged cell
    wordIndices.forEach(idx => {
      segment.literalTranslation.en[idx] = gloss || '';
    });
  }

  debouncedSave();
}

function removeMergeFromData(segmentIndex, wordIndices) {
  const currentText = getCurrentText();
  const allSegments = currentText.paragraphs.flatMap(p => p.segments || []);
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
    indicator.textContent = t('saved_locally');
  } else if (status === 'syncing') {
    indicator.textContent = t('syncing');
  } else if (status === 'saved') {
    indicator.textContent = t('synced');
    saveIndicatorTimeout = setTimeout(() => {
      indicator.textContent = '';
      indicator.className = 'save-indicator';
    }, 2000);
  } else if (status === 'offline') {
    indicator.textContent = t('saved_locally_sync_when_online');
  } else if (status === 'error') {
    indicator.textContent = t('error_saving');
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
      <button onclick="window.location.reload()" style="margin-top: 20px;">${t('reload')}</button>
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

// ===== FULL TEXT MODAL =====

function openFullTextModal() {
  if (!currentProject || !currentProject.json_data) {
    return;
  }

  const modalHtml = generateFullTextModalHtml();

  // Add modal to body
  const modalContainer = document.createElement('div');
  modalContainer.id = 'full-text-modal';
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Close on overlay click
  const overlay = modalContainer.querySelector('.modal-overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeFullTextModal();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', handleModalEscape);
}

function closeFullTextModal() {
  const modal = document.getElementById('full-text-modal');
  if (modal) {
    modal.remove();
  }

  // Restore body scroll
  document.body.style.overflow = '';

  // Remove escape key listener
  document.removeEventListener('keydown', handleModalEscape);
}

function handleModalEscape(e) {
  if (e.key === 'Escape') {
    closeFullTextModal();
  }
}

function generateFullTextModalHtml() {
  const currentText = getCurrentText();
  const title = currentText.textTitle || 'Translation Text';

  // Generate full text content
  const fullTextContent = generateFullTextContent();

  return `
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(title)}</h2>
          <button class="modal-close" onclick="closeFullTextModal()" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          ${fullTextContent}
        </div>
        <div class="modal-footer">
          <button class="button-secondary" onclick="closeFullTextModal()">Close</button>
        </div>
      </div>
    </div>
  `;
}

function generateFullTextContent() {
  const currentText = getCurrentText();
  const paragraphs = currentText.paragraphs || [];

  const baselineTexts = [];

  paragraphs.forEach((paragraph) => {
    const segments = paragraph.segments || [];

    segments.forEach((segment) => {
      // Get baseline text (with changes applied)
      const baselineWords = (segment.baseline || []).map((word, idx) => {
        const change = (segment.baselineChanges || []).find(c => c.wordIndex === idx);
        return change ? change.newValue : word;
      });
      const baselineText = baselineWords.join(' ');
      if (baselineText.trim()) {
        baselineTexts.push(baselineText);
      }
    });
  });

  if (baselineTexts.length === 0) {
    return '<p class="full-text-empty">No text available</p>';
  }

  // Join all baseline texts with spaces to create flowing text
  const fullText = baselineTexts.join(' ');

  return `<div class="full-text-display">${escapeHtml(fullText)}</div>`;
}

// ===== START APP =====

init();
