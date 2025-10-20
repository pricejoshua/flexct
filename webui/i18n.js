// Internationalization (i18n) system
// Supports multiple languages with user-editable labels (future feature)

// Default language
let currentLanguage = 'en';

// Translation strings organized by language
// Structure designed to be easily editable and extensible
const translations = {
  en: {
    // Common UI elements
    app_title: 'FLEX Interlinear Translation',
    loading: 'Loading...',
    error: 'Error',
    ok: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    next: 'Next',
    back: 'Back',
    finish: 'Finish',

    // Auth & Navigation
    sign_in: 'Sign In',
    sign_out: 'Sign Out',
    sign_up: 'Sign Up',
    email: 'Email',
    password: 'Password',
    linguist_sign_in: 'Linguist Sign In',
    community_link_note: 'Community members: Use the link provided by your linguist',

    // Desktop view (existing interface)
    desktop_view: 'Desktop View',
    mobile_view: 'Mobile View',
    switch_to_mobile: 'Switch to Mobile View',
    switch_to_desktop: 'Switch to Desktop View',

    // Mobile flow labels
    choose_text: 'Choose Text',
    chunk: 'Chunk',
    free_translation: 'Free Translation',
    word_for_word: 'Word-for-Word',
    analysis_language: 'Analysis Language',

    // Progress & Reports
    reports: 'Reports',
    finished: 'Finished',
    progress: 'Progress',
    completed: 'Completed',
    continue_question: 'Would you like to work on another chunk?',
    yes: 'Yes',
    no: 'No',

    // Language Selector
    language: 'Language',
    select_language: 'Select Language',

    // Translation interface
    baseline: 'Baseline',
    wfw: 'WFW',
    free: 'Free',
    word: 'Word',

    // Status messages
    saving: 'Saving...',
    saved: 'Saved',
    syncing: 'Syncing...',
    synced: 'Synced',
    offline: 'Offline',
    saved_locally: 'Saved locally',
    will_sync: 'Will sync when online',
    saved_locally_sync_when_online: 'Saved locally (will sync when online)',
    error_saving: 'Error saving',
    auto_sync: 'Auto-sync',
    sync_now: 'Sync Now',

    // Instructions
    upload_instruction: 'Upload a JSON file to get started',
    select_chunk: 'Select a chunk to translate',
    translate_instruction: 'Translate each word below',

    // Counts & Stats
    total_segments: 'Total segments',
    total_chunks: 'Total chunks',
    words_remaining: 'words remaining',
    chunk_of: 'Chunk {current} of {total}',

    // Dashboard
    my_projects: 'My Projects',
    upload_new_project: 'Upload New Project',
    upload: 'Upload',
    loading_projects: 'Loading projects...',
    no_projects_yet: 'No projects yet. Upload a JSON file to get started.',
    share_code: 'Share Code',
    created: 'Created',
    copy_share_link: 'Copy Share Link',
    download_json: 'Download JSON',
    delete: 'Delete',
    please_select_file: 'Please select a file',
    project_uploaded: 'Project uploaded! Share code: <strong>{shareCode}</strong>',
    share_link_copied: 'Share link copied to clipboard!',
    confirm_delete: 'Are you sure you want to delete this project?',
    download_failed: 'Download failed: {error}',
    delete_failed: 'Delete failed: {error}',
    upload_failed: 'Upload failed: {error}',
    error_loading_projects: 'Error loading projects: {error}',
    failed_to_load_project: 'Failed to load project: {error}',
    account_created: 'Account created! Please check your email for verification.',

    // Translation interface labels
    translation_project: 'Translation Project',
    words_linked: '{count} words linked',
    word_of: '{current} of {total}',
    link_another_word: 'Link another word',
    link_with_next_word: 'Link with next word',
    unlink_all: 'Unlink All',
    merge_with_next: 'Merge with next cell',
    unmerge_cells: 'Unmerge cells',
    all_chunks_completed: 'All chunks completed!',
    original: 'Original',
    reload: 'Reload',
  },

  azj: {
    // Common UI elements
    app_title: 'FLEX Sətirlərarası Tərcümə',
    loading: 'Yüklənir...',
    error: 'Xəta',
    ok: 'Tamam',
    cancel: 'Ləğv et',
    save: 'Saxla',
    next: 'Növbəti',
    back: 'Geri',
    finish: 'Bitir',

    // Auth & Navigation
    sign_in: 'Daxil ol',
    sign_out: 'Çıxış',
    sign_up: 'Qeydiyyat',
    email: 'E-poçt',
    password: 'Şifrə',
    linguist_sign_in: 'Dilçi Daxil Olması',
    community_link_note: 'İcma üzvləri: Dilçiniz tərəfindən verilən linkdən istifadə edin',

    // Desktop view (existing interface)
    desktop_view: 'Masaüstü görünüş',
    mobile_view: 'Mobil görünüş',
    switch_to_mobile: 'Mobil görünüşə keç',
    switch_to_desktop: 'Masaüstü görünüşə keç',

    // Mobile flow labels
    choose_text: 'Mətn seç',
    chunk: 'Hissə',
    free_translation: 'Sərbəst tərcümə',
    word_for_word: 'Sözbəsöz',
    analysis_language: 'Təhlil dili',

    // Progress & Reports
    reports: 'Hesabatlar',
    finished: 'Bitdi',
    progress: 'Gedişat',
    completed: 'Tamamlandı',
    continue_question: 'Başqa bir hissə üzərində işləmək istəyirsiniz?',
    yes: 'Bəli',
    no: 'Xeyr',

    // Language Selector
    language: 'Dil',
    select_language: 'Dil seçin',

    // Translation interface
    baseline: 'Əsas',
    wfw: 'SBS',
    free: 'Sərbəst',
    word: 'Söz',

    // Status messages
    saving: 'Saxlanılır...',
    saved: 'Saxlanıldı',
    syncing: 'Sinxronlaşdırılır...',
    synced: 'Sinxronlaşdırıldı',
    offline: 'Oflayn',
    saved_locally: 'Lokal olaraq saxlanıldı',
    will_sync: 'Onlayn olanda sinxronlaşdırılacaq',
    saved_locally_sync_when_online: 'Lokal olaraq saxlanıldı (onlayn olanda sinxronlaşdırılacaq)',
    error_saving: 'Saxlama xətası',
    auto_sync: 'Avtomatik sinxronlaşdırma',
    sync_now: 'İndi Sinxronlaşdır',

    // Instructions
    upload_instruction: 'Başlamaq üçün JSON faylı yükləyin',
    select_chunk: 'Tərcümə etmək üçün hissə seçin',
    translate_instruction: 'Aşağıdakı hər bir sözü tərcümə edin',

    // Counts & Stats
    total_segments: 'Ümumi seqmentlər',
    total_chunks: 'Ümumi hissələr',
    words_remaining: 'qalan sözlər',
    chunk_of: 'Hissə {current} / {total}',

    // Dashboard
    my_projects: 'Mənim Layihələrim',
    upload_new_project: 'Yeni Layihə Yüklə',
    upload: 'Yüklə',
    loading_projects: 'Layihələr yüklənir...',
    no_projects_yet: 'Hələ layihə yoxdur. Başlamaq üçün JSON faylı yükləyin.',
    share_code: 'Paylaşma Kodu',
    created: 'Yaradıldı',
    copy_share_link: 'Paylaşma Linkini Kopyala',
    download_json: 'JSON Yüklə',
    delete: 'Sil',
    please_select_file: 'Zəhmət olmasa fayl seçin',
    project_uploaded: 'Layihə yükləndi! Paylaşma kodu: <strong>{shareCode}</strong>',
    share_link_copied: 'Paylaşma linki panoya kopyalandı!',
    confirm_delete: 'Bu layihəni silmək istədiyinizə əminsiniz?',
    download_failed: 'Yükləmə uğursuz oldu: {error}',
    delete_failed: 'Silmə uğursuz oldu: {error}',
    upload_failed: 'Yükləmə uğursuz oldu: {error}',
    error_loading_projects: 'Layihələr yüklənərkən xəta: {error}',
    failed_to_load_project: 'Layihə yüklənə bilmədi: {error}',
    account_created: 'Hesab yaradıldı! Təsdiq üçün e-poçtunuzu yoxlayın.',

    // Translation interface labels
    translation_project: 'Tərcümə Layihəsi',
    words_linked: '{count} söz əlaqələndirildi',
    word_of: '{current} / {total}',
    link_another_word: 'Başqa söz əlaqələndir',
    link_with_next_word: 'Növbəti sözlə əlaqələndir',
    unlink_all: 'Hamısını Ayır',
    merge_with_next: 'Növbəti hüceyrə ilə birləşdir',
    unmerge_cells: 'Hüceyrələri ayır',
    all_chunks_completed: 'Bütün hissələr tamamlandı!',
    original: 'Orijinal',
    reload: 'Yenidən Yüklə',
  },
};

// Get translated string by key
// Supports simple placeholder replacement: {key}
function t(key, replacements = {}) {
  let text = translations[currentLanguage]?.[key] || translations['en']?.[key] || key;

  // Replace placeholders like {current}, {total}
  Object.keys(replacements).forEach(placeholder => {
    text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), replacements[placeholder]);
  });

  return text;
}

// Set current language
function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    localStorage.setItem('flex_language', lang);

    // Trigger custom event so UI can update
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    return true;
  }
  return false;
}

// Get current language
function getLanguage() {
  return currentLanguage;
}

// Get all available languages
function getAvailableLanguages() {
  return Object.keys(translations);
}

// Get language display names
function getLanguageName(langCode) {
  const names = {
    'en': 'English',
    'azj': 'Azərbaycanca'
  };
  return names[langCode] || langCode;
}

// Create language selector HTML
function createLanguageSelector() {
  const languages = getAvailableLanguages();
  const currentLang = getLanguage();

  return `
    <div class="language-selector">
      <label for="language-select" title="${t('select_language')}">
        <span class="language-label">🌐</span>
      </label>
      <select id="language-select" onchange="handleLanguageChange(this.value)">
        ${languages.map(lang => `
          <option value="${lang}" ${lang === currentLang ? 'selected' : ''}>
            ${getLanguageName(lang)}
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

// Handle language change
function handleLanguageChange(lang) {
  setLanguage(lang);
}

// Initialize language from localStorage or browser
function initLanguage() {
  // Try localStorage first
  const savedLang = localStorage.getItem('flex_language');
  if (savedLang && translations[savedLang]) {
    currentLanguage = savedLang;
    return;
  }

  // Try browser language
  const browserLang = navigator.language?.split('-')[0];
  if (browserLang && translations[browserLang]) {
    currentLanguage = browserLang;
    return;
  }

  // Default to English
  currentLanguage = 'en';
}

// Export for future: allow users to add/edit translations
function exportTranslations() {
  return JSON.stringify(translations, null, 2);
}

// Import custom translations (for future user-editable feature)
function importTranslations(jsonString) {
  try {
    const customTranslations = JSON.parse(jsonString);
    Object.assign(translations, customTranslations);
    return true;
  } catch (e) {
    console.error('Failed to import translations:', e);
    return false;
  }
}

// Initialize on load
initLanguage();

// Make functions globally available
window.t = t;
window.setLanguage = setLanguage;
window.getLanguage = getLanguage;
window.getAvailableLanguages = getAvailableLanguages;
window.getLanguageName = getLanguageName;
window.createLanguageSelector = createLanguageSelector;
window.handleLanguageChange = handleLanguageChange;
window.exportTranslations = exportTranslations;
window.importTranslations = importTranslations;
