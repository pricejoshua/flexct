// Verb Table Interface

import { supabase } from './config.js';
import { getCurrentUser } from './shared/auth.js';
import { escapeHtml } from './shared/utils.js';
import { parseVerbTableHash, buildVerbTableHash } from './shared/router.js';
import { debouncedSave, saveProjectToServer } from './shared/sync.js';
import { saveToLocalStorage, loadFromLocalStorage } from './shared/storage.js';

// ===== STATE =====
let currentUser = null;
let currentProject = null;
let currentTableIndex = 0;
let currentLexemeIndex = 0;

// ===== INITIALIZATION =====

async function init() {
  // Set app title
  document.getElementById('app-title').textContent = t('verb_tables');
  document.getElementById('loading-text').textContent = t('loading');

  // Add language selector
  document.getElementById('language-selector').innerHTML = createLanguageSelector();

  // Listen for language changes
  window.addEventListener('languageChanged', () => {
    if (currentProject) {
      renderInterface();
    }
  });

  // Check auth
  currentUser = await getCurrentUser();

  // Route
  await router();
}

// ===== ROUTER =====

async function router() {
  const hash = window.location.hash;
  const parsed = parseVerbTableHash(hash);

  if (parsed && parsed.shareCode) {
    await loadVerbTablePage(parsed.shareCode, parsed.tableIndex);
  } else {
    showError(t('error'), t('failed_to_load_project', {error: 'Invalid URL'}));
  }
}

// ===== LOAD PROJECT =====

async function loadVerbTablePage(shareCode, tableIndex = 0) {
  try {
    // Try to load from Supabase
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('share_code', shareCode)
      .eq('project_type', 'verb_table')
      .single();

    if (error) {
      // Try loading from localStorage as fallback
      const cached = loadFromLocalStorage(shareCode);
      if (cached && cached.project_type === 'verb_table') {
        currentProject = cached;
      } else {
        throw error;
      }
    } else {
      currentProject = project;
      // Save to localStorage
      saveToLocalStorage(currentProject);
    }

    currentTableIndex = tableIndex;

    // Validate project structure
    if (!currentProject.json_data || !currentProject.json_data.tables) {
      throw new Error('Invalid verb table structure');
    }

    // Ensure table index is valid
    if (currentTableIndex >= currentProject.json_data.tables.length) {
      currentTableIndex = 0;
    }

    // Backup original JSON on first load
    backupOriginalJSON(shareCode, currentProject.json_data);

    // Check if this is first visit and prompt for name
    checkAndPromptForName(shareCode);

    renderInterface();

  } catch (error) {
    console.error('Load error:', error);
    showError(t('error'), t('failed_to_load_project', {error: escapeHtml(error.message)}));
  }
}

function backupOriginalJSON(shareCode, jsonData) {
  const backupKey = `verb_table_original_${shareCode}`;

  // Only backup if not already backed up
  if (!localStorage.getItem(backupKey)) {
    const backup = {
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(jsonData)) // Deep clone
    };
    localStorage.setItem(backupKey, JSON.stringify(backup));
    console.log('Original JSON backed up:', backupKey);
  }
}

function downloadOriginalJSON() {
  const backupKey = `verb_table_original_${currentProject.share_code}`;
  const backupStr = localStorage.getItem(backupKey);

  if (!backupStr) {
    alert(t('no_backup_found'));
    return;
  }

  const backup = JSON.parse(backupStr);
  const blob = new Blob([JSON.stringify(backup.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentProject.title || 'verb-table'}_ORIGINAL_${currentProject.share_code}.json`;
  a.click();
  URL.revokeObjectURL(url);

  alert(t('original_backup_downloaded', {date: new Date(backup.timestamp).toLocaleString()}));
}

function checkAndPromptForName(shareCode) {
  const storageKey = `verb_table_user_name_${shareCode}`;
  let userName = localStorage.getItem(storageKey);

  if (!userName) {
    userName = prompt(t('enter_your_name'));
    if (userName && userName.trim()) {
      localStorage.setItem(storageKey, userName.trim());
      // Show welcome message
      setTimeout(() => {
        alert(t('welcome_message', {name: userName.trim()}));
      }, 100);
    }
  }
}

function getUserName(shareCode) {
  const storageKey = `verb_table_user_name_${shareCode}`;
  return localStorage.getItem(storageKey) || t('anonymous_user');
}

// ===== RENDER INTERFACE =====

function renderInterface() {
  const main = document.getElementById('main-content');
  const table = getCurrentTable();

  if (!table) {
    showError(t('error'), 'No table data found');
    return;
  }

  main.innerHTML = `
    <div class="verb-table-interface">
      <div class="interface-header">
        <h2>${escapeHtml(currentProject.title || t('verb_tables'))}</h2>
        <div class="interface-actions">
          <button onclick="downloadJSON()">${t('download_json')}</button>
          <button onclick="downloadOriginalJSON()" class="button-secondary">${t('download_original')}</button>
          <button onclick="exportCSV()" class="button-secondary">${t('export_csv')}</button>
        </div>
      </div>

      ${renderTableSelector()}
      ${renderLexemeList()}
      ${renderParadigmTable()}
    </div>
  `;

  // Update empty cell styling
  updateEmptyCells();
}

function renderTableSelector() {
  const tables = currentProject.json_data.tables;
  if (tables.length <= 1) return '';

  return `
    <div class="table-selector">
      <label>${t('select_table')}:</label>
      <select onchange="switchTable(parseInt(this.value))">
        ${tables.map((table, index) => `
          <option value="${index}" ${index === currentTableIndex ? 'selected' : ''}>
            ${escapeHtml(table.tableTitle || `${t('table')} ${index + 1}`)}
          </option>
        `).join('')}
      </select>
      <span style="margin-left: 1rem; color: #64748b; font-size: 0.875rem;">
        ${t('table_of', {current: currentTableIndex + 1, total: tables.length})}
      </span>
    </div>
  `;
}

function renderLexemeList() {
  const table = getCurrentTable();
  const lexemes = table.lexemes || [];

  return `
    <div class="lexeme-list">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3>${t('lexemes') || 'Lexemes'}</h3>
        <button onclick="addLexeme()" class="button-small">${t('add_lexeme')}</button>
      </div>

      ${lexemes.length === 0 ? `
        <p style="color: #64748b; font-size: 0.875rem;">${t('no_lexemes')}</p>
      ` : lexemes.map((lexeme, index) => `
        <div class="lexeme-item ${index === currentLexemeIndex ? 'active' : ''}" onclick="selectLexeme(${index})">
          <div class="lexeme-item-header">
            <div>
              <div class="lexeme-item-title">${escapeHtml(lexeme.lemma || 'Untitled')}</div>
              ${lexeme.gloss ? `<div class="lexeme-item-gloss">${escapeHtml(lexeme.gloss)}</div>` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderParadigmTable() {
  const table = getCurrentTable();
  const lexemes = table.lexemes || [];

  if (lexemes.length === 0) {
    return '<div class="paradigm-table-container"><p style="color: #64748b;">' + t('no_lexemes') + '</p></div>';
  }

  const lexeme = lexemes[currentLexemeIndex];
  if (!lexeme) {
    return '<div class="paradigm-table-container"><p style="color: #64748b;">Select a lexeme</p></div>';
  }

  const rows = table.dimensions.rows;
  const cols = table.dimensions.columns;

  // Get current language for column labels
  const currentLang = getLanguage();

  // Calculate progress
  const totalCells = rows.categories.length * cols.categories.length;
  let filledCells = 0;
  rows.categories.forEach(row => {
    cols.categories.forEach(col => {
      const value = lexeme.paradigm?.[col.id]?.[row.id];
      if (value && value.trim() !== '') filledCells++;
    });
  });
  const progress = totalCells > 0 ? (filledCells / totalCells * 100).toFixed(0) : 0;

  return `
    <div class="paradigm-table-container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="margin: 0;">
          ${escapeHtml(lexeme.lemma)}
          ${lexeme.gloss ? `<span style="color: #64748b; font-weight: normal; font-size: 0.875rem;"> — ${escapeHtml(lexeme.gloss)}</span>` : ''}
        </h3>
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="previousLexeme()" ${currentLexemeIndex === 0 ? 'disabled' : ''} class="button-secondary button-small">← ${t('back')}</button>
          <button onclick="nextLexeme()" ${currentLexemeIndex >= lexemes.length - 1 ? 'disabled' : ''} class="button-secondary button-small">${t('next')} →</button>
        </div>
      </div>

      <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
        <table class="paradigm-table">
          <thead>
            <tr>
              <th>${escapeHtml(rows.label)}</th>
              ${cols.categories.map(col => `
                <th>${escapeHtml(col.labels[currentLang] || col.labels.en || col.id)}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.categories.map((row, rowIdx) => `
              <tr>
                <td>
                  ${escapeHtml(row.labels ? (row.labels[currentLang] || row.labels.en || row.id) : row.id)}
                  ${row.description ? `<br><small style="color: #64748b;">${escapeHtml(row.description)}</small>` : ''}
                </td>
                ${cols.categories.map((col, colIdx) => {
                  const value = lexeme.paradigm?.[col.id]?.[row.id] || '';
                  return `
                    <td>
                      <input
                        type="text"
                        value="${escapeHtml(value)}"
                        data-row="${row.id}"
                        data-col="${col.id}"
                        oninput="handleCellChange(event)"
                        class="${value.trim() === '' ? 'empty' : ''}"
                      />
                    </td>
                  `;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="progress-bar">
        <div class="progress-label">${t('cells_filled', {filled: filledCells, total: totalCells})}</div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      </div>
    </div>
  `;
}

// ===== HELPERS =====

function getCurrentTable() {
  return currentProject?.json_data?.tables?.[currentTableIndex];
}

function switchTable(index) {
  currentTableIndex = index;
  currentLexemeIndex = 0;

  // Update URL
  window.location.hash = buildVerbTableHash(currentProject.share_code, index);

  renderInterface();
}

function selectLexeme(index) {
  // Allow switching lexemes regardless of completion status
  currentLexemeIndex = index;
  renderInterface();
}

function nextLexeme() {
  const table = getCurrentTable();
  if (currentLexemeIndex < table.lexemes.length - 1) {
    currentLexemeIndex++;
    renderInterface();
  }
}

function previousLexeme() {
  if (currentLexemeIndex > 0) {
    currentLexemeIndex--;
    renderInterface();
  }
}

function addLexeme() {
  const table = getCurrentTable();
  const lemma = prompt(t('lemma') + ':');
  if (!lemma) return;

  const gloss = prompt(t('gloss') + ' (' + t('optional') + '):');

  // Generate ID
  const existingIds = table.lexemes.map(l => parseInt(l.id.replace('lex_', '')) || 0);
  const maxId = Math.max(0, ...existingIds);
  const newId = `lex_${String(maxId + 1).padStart(3, '0')}`;

  // Initialize empty paradigm
  const paradigm = {};
  table.dimensions.columns.categories.forEach(col => {
    paradigm[col.id] = {};
    table.dimensions.rows.categories.forEach(row => {
      paradigm[col.id][row.id] = '';
    });
  });

  const newLexeme = {
    id: newId,
    lemma: lemma,
    gloss: gloss || '',
    paradigm: paradigm
  };

  table.lexemes.push(newLexeme);
  currentLexemeIndex = table.lexemes.length - 1;

  saveChanges();
  renderInterface();
}

function deleteLexeme(index) {
  if (!confirm(t('confirm_delete_lexeme'))) return;

  const table = getCurrentTable();
  table.lexemes.splice(index, 1);

  if (currentLexemeIndex >= table.lexemes.length) {
    currentLexemeIndex = Math.max(0, table.lexemes.length - 1);
  }

  saveChanges();
  renderInterface();
}

function handleCellChange(event) {
  const input = event.target;
  const rowId = input.dataset.row;
  const colId = input.dataset.col;
  const value = input.value;

  const table = getCurrentTable();
  const lexeme = table.lexemes[currentLexemeIndex];

  // Initialize paradigm structure if needed
  if (!lexeme.paradigm) lexeme.paradigm = {};
  if (!lexeme.paradigm[colId]) lexeme.paradigm[colId] = {};

  // Update value
  lexeme.paradigm[colId][rowId] = value;

  // Update empty class
  if (value.trim() === '') {
    input.classList.add('empty');
  } else {
    input.classList.remove('empty');
  }

  // Save changes
  saveChanges();
}

function updateEmptyCells() {
  // Update empty cell styling after render
  document.querySelectorAll('.paradigm-table input[type="text"]').forEach(input => {
    if (input.value.trim() === '') {
      input.classList.add('empty');
    } else {
      input.classList.remove('empty');
    }
  });
}

function saveChanges() {
  debouncedSave(currentProject, showSaveIndicator);
}

function showSaveIndicator(status) {
  const indicator = document.getElementById('save-indicator');
  if (!indicator) return;

  indicator.className = `save-indicator ${status}`;

  if (status === 'unsaved') {
    indicator.textContent = t('saved_locally');
  } else if (status === 'syncing') {
    indicator.textContent = t('syncing');
  } else if (status === 'saved') {
    indicator.textContent = t('synced');
    setTimeout(() => {
      indicator.textContent = '';
      indicator.className = 'save-indicator';
    }, 2000);
  } else if (status === 'error') {
    indicator.textContent = t('error_saving');
  }
}

// ===== EXPORT =====

function downloadJSON() {
  const blob = new Blob([JSON.stringify(currentProject.json_data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentProject.title || 'verb-table'}_${currentProject.share_code}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const table = getCurrentTable();
  const lexeme = table.lexemes[currentLexemeIndex];

  if (!lexeme) {
    alert(t('no_lexemes'));
    return;
  }

  const rows = table.dimensions.rows;
  const cols = table.dimensions.columns;
  const currentLang = getLanguage();

  // Build CSV
  let csv = '';

  // Header row
  csv += `"${rows.label}"`;
  cols.categories.forEach(col => {
    csv += `,"${col.labels[currentLang] || col.labels.en || col.id}"`;
  });
  csv += '\n';

  // Data rows
  rows.categories.forEach(row => {
    csv += `"${row.labels ? (row.labels[currentLang] || row.labels.en || row.id) : row.id}"`;
    cols.categories.forEach(col => {
      const value = lexeme.paradigm?.[col.id]?.[row.id] || '';
      csv += `,"${value.replace(/"/g, '""')}"`;
    });
    csv += '\n';
  });

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${lexeme.lemma}_paradigm.csv`;
  a.click();
  URL.revokeObjectURL(url);

  alert(t('csv_export_success'));
}

// ===== ERROR DISPLAY =====

function showError(title, message) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div style="text-align: center; padding: 4rem 2rem;">
      <h3>${escapeHtml(title)}</h3>
      <p style="color: #64748b; margin-top: 1rem;">${escapeHtml(message)}</p>
      <button onclick="window.location.reload()" style="margin-top: 2rem;">${t('reload')}</button>
    </div>
  `;
}

// ===== EXPOSE FUNCTIONS =====

window.switchTable = switchTable;
window.selectLexeme = selectLexeme;
window.nextLexeme = nextLexeme;
window.previousLexeme = previousLexeme;
window.addLexeme = addLexeme;
window.deleteLexeme = deleteLexeme;
window.handleCellChange = handleCellChange;
window.downloadJSON = downloadJSON;
window.downloadOriginalJSON = downloadOriginalJSON;
window.exportCSV = exportCSV;

// ===== START =====

init();
