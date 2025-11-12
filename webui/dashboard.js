// Unified Dashboard for Interlinear and Verb Table Projects

import { supabase } from './config.js';
import { getCurrentUser, signOut as authSignOut } from './shared/auth.js';
import { generateShareCode, escapeHtml } from './shared/utils.js';
import { buildInterlinearHash, buildVerbTableHash } from './shared/router.js';

// ===== STATE =====
let currentUser = null;
let allProjects = [];
let currentFilter = 'all'; // 'all', 'interlinear', 'verb_table'

// ===== INITIALIZATION =====

async function init() {
  // Set app title
  document.getElementById('app-title').textContent = t('app_title');
  document.getElementById('loading-text').textContent = t('loading');

  // Add language selector
  document.getElementById('language-selector').innerHTML = createLanguageSelector();

  // Listen for language changes
  window.addEventListener('languageChanged', () => {
    router(); // Re-render on language change
  });

  // Check auth and route
  await router();
}

// ===== ROUTER =====

async function router() {
  const hash = window.location.hash;

  // Check if hash contains project routes - redirect to appropriate interface
  if (hash.startsWith('#p/')) {
    // Interlinear translation project
    window.location.href = `interlinear.html${hash}`;
    return;
  } else if (hash.startsWith('#vt/')) {
    // Verb table project
    window.location.href = `verb-table.html${hash}`;
    return;
  }

  currentUser = await getCurrentUser();

  updateAuthStatus();

  if (currentUser) {
    await loadDashboard();
  } else {
    loadAuthPage();
  }
}

// ===== AUTH =====

function updateAuthStatus() {
  const authStatus = document.getElementById('auth-status');
  if (currentUser) {
    authStatus.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span>${escapeHtml(currentUser.email)}</span>
        <button onclick="signOut()" class="button-secondary button-small">${t('sign_out')}</button>
      </div>
    `;
  } else {
    authStatus.innerHTML = '';
  }
}

async function signOut() {
  await authSignOut();
  router();
}

function loadAuthPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="auth-container">
      <h2 style="margin-bottom: 1.5rem;">${t('linguist_sign_in')}</h2>
      <div id="auth-message"></div>
      <form class="auth-form" id="auth-form">
        <input type="email" id="email" placeholder="${t('email')}" required>
        <input type="password" id="password" placeholder="${t('password')}" required>
        <button type="submit">${t('sign_in')} / ${t('sign_up')}</button>
      </form>
      <p style="margin-top: 1.5rem; font-size: 0.875rem; color: #64748b; text-align: center;">
        ${t('community_link_note')}
      </p>
    </div>
  `;

  document.getElementById('auth-form').addEventListener('submit', handleAuth);
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
      await router();
    }
  } catch (error) {
    messageDiv.innerHTML = `<div class="error-message">${escapeHtml(error.message)}</div>`;
  }
}

// ===== DASHBOARD =====

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

      <div class="project-filter">
        <button class="filter-button active" onclick="filterProjects('all', this)">
          ${t('all_projects')}
        </button>
        <button class="filter-button" onclick="filterProjects('interlinear', this)">
          ${t('interlinear_projects')}
        </button>
        <button class="filter-button" onclick="filterProjects('verb_table', this)">
          ${t('verb_table_projects')}
        </button>
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

    allProjects = projects;
    renderProjects();

  } catch (error) {
    listDiv.innerHTML = `<div class="error-message">${t('error_loading_projects', {error: escapeHtml(error.message)})}</div>`;
  }
}

function renderProjects() {
  const listDiv = document.getElementById('projects-list');

  // Filter projects
  let filtered = allProjects;
  if (currentFilter !== 'all') {
    filtered = allProjects.filter(p => p.project_type === currentFilter);
  }

  if (filtered.length === 0) {
    listDiv.innerHTML = `<p>${t('no_projects_yet')}</p>`;
    return;
  }

  listDiv.innerHTML = filtered.map(project => {
    const projectType = project.project_type || 'interlinear';
    const typeBadge = projectType === 'verb_table' ? t('verb_table') : t('interlinear');

    return `
      <div class="project-item">
        <div class="project-header">
          <h3>${escapeHtml(project.title || 'Untitled')}</h3>
          <span class="project-type-badge ${projectType}">${typeBadge}</span>
        </div>
        <p>${t('share_code')}: <strong>${project.share_code}</strong></p>
        <p>${t('created')}: ${new Date(project.created_at).toLocaleDateString()}</p>
        <div class="project-actions">
          <button onclick="openProject('${project.share_code}', '${projectType}')">${t('open')}</button>
          <button onclick="copyShareLink('${project.share_code}', '${projectType}')">${t('copy_share_link')}</button>
          <button onclick="downloadProject('${project.id}')">${t('download_json')}</button>
          <button onclick="deleteProject('${project.id}')" class="button-secondary">${t('delete')}</button>
        </div>
      </div>
    `;
  }).join('');
}

function filterProjects(filter, buttonElement) {
  currentFilter = filter;

  // Update button states
  document.querySelectorAll('.filter-button').forEach(btn => {
    btn.classList.remove('active');
  });
  if (buttonElement) {
    buttonElement.classList.add('active');
  }

  renderProjects();
}

// ===== PROJECT ACTIONS =====

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

    // Detect project type
    const projectType = detectProjectType(jsonData);

    // Get project title
    let title;
    if (projectType === 'verb_table') {
      title = jsonData.tables?.[0]?.tableTitle || file.name.replace('.json', '');
    } else {
      const textsArray = Array.isArray(jsonData) ? jsonData : [jsonData];
      title = textsArray[0]?.textTitle || file.name.replace('.json', '');
    }

    const shareCode = generateShareCode();

    const { error } = await supabase
      .from('projects')
      .insert({
        linguist_id: currentUser.id,
        share_code: shareCode,
        title: title,
        project_type: projectType,
        json_data: jsonData
      });

    if (error) throw error;

    messageDiv.innerHTML = `<div class="success-message">${t('project_uploaded', {shareCode})}</div>`;

    // Reload projects
    await loadProjects();

    // Clear file input
    fileInput.value = '';

  } catch (error) {
    messageDiv.innerHTML = `<div class="error-message">${t('upload_failed', {error: escapeHtml(error.message)})}</div>`;
  }
}

function detectProjectType(jsonData) {
  // Check if it's a verb table project
  if (jsonData.projectType === 'verb_table' || jsonData.tables) {
    return 'verb_table';
  }
  // Default to interlinear
  return 'interlinear';
}

function openProject(shareCode, projectType) {
  const hash = projectType === 'verb_table'
    ? buildVerbTableHash(shareCode)
    : buildInterlinearHash(shareCode);

  // Open in new window
  const baseUrl = window.location.origin + window.location.pathname.replace('dashboard.html', '').replace('index.html', '');
  const targetFile = projectType === 'verb_table' ? 'verb-table.html' : 'interlinear.html';
  window.open(`${baseUrl}${targetFile}${hash}`, '_blank');
}

function copyShareLink(shareCode, projectType) {
  const baseUrl = window.location.origin + window.location.pathname.replace('dashboard.html', '').replace('index.html', '');
  const targetFile = projectType === 'verb_table' ? 'verb-table.html' : 'interlinear.html';
  const hash = projectType === 'verb_table'
    ? buildVerbTableHash(shareCode)
    : buildInterlinearHash(shareCode);

  const link = `${baseUrl}${targetFile}${hash}`;

  navigator.clipboard.writeText(link).then(() => {
    alert(t('share_link_copied'));
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
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
    a.download = `${project.title || 'project'}_${project.share_code}.json`;
    a.click();
    URL.revokeObjectURL(url);

  } catch (error) {
    alert(t('download_failed', {error: escapeHtml(error.message)}));
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
    alert(t('delete_failed', {error: escapeHtml(error.message)}));
  }
}

// ===== EXPOSE FUNCTIONS =====

window.signOut = signOut;
window.uploadProject = uploadProject;
window.openProject = openProject;
window.copyShareLink = copyShareLink;
window.downloadProject = downloadProject;
window.deleteProject = deleteProject;
window.filterProjects = filterProjects;

// ===== START =====

init();
