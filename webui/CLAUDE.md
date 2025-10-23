# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **FLEX Interlinear Translation Web App** - a collaborative translation tool for linguists working with FieldWorks Language Explorer (FLEx). The application allows linguists to export interlinear texts from FLEx, share them with community members for translation, and import the results back into FLEx.

**Key Design Philosophy:**
- Vanilla JavaScript (no build step, no framework)
- Offline-first with automatic sync when online
- Two user types: authenticated linguists and anonymous community translators
- Mobile-first translation experience with optional desktop view

## Tech Stack

- **Frontend:** Vanilla JavaScript, HTML, CSS
- **Backend:** Supabase (PostgreSQL + Auth + Row Level Security)
- **Data Storage:** JSONB in PostgreSQL + LocalStorage for offline caching
- **Deployment:** Static hosting (Netlify, Vercel, Cloudflare Pages, or simple HTTP server)

## File Structure

```
webui/
├── index.html           # Desktop view entry point
├── mobile.html          # Mobile-optimized entry point
├── app.js              # Main desktop app logic (~1125 lines)
├── mobile.js           # Mobile translation flow (~729 lines)
├── i18n.js             # Internationalization system
├── config.js           # Supabase configuration
├── styles.css          # Desktop styles
├── mobile.css          # Mobile-specific styles
├── schema.sql          # Database schema with RLS policies
├── README.md           # User documentation
└── projectbrief.md     # Original requirements document
```

## Data Format

### JSON Structure (imported from/exported to FLEx)

The core data structure stored in `projects.json_data` is **an array of text objects** per the [JSON Schema](schema.json):

```json
[
  {
    "textTitle": "Story Name",
    "textAbbreviation": "STORY1",
    "paragraphs": [{
      "segments": [{
        "hvo": 12345,
        "baseline": ["word1", "word2", "word3"],
        "baselineChanges": [
          {
            "wordIndex": 0,
            "originalValue": "word1",
            "newValue": "corrected1",
            "timestamp": "2025-01-15T10:30:00Z"
          }
        ],
        "literalTranslation": {"en": ["word", "of", "first"]},
        "literalTranslationMerges": [
          {
            "wordIndices": [1, 2],
            "gloss": "multi-word gloss"
          }
        ],
        "freeTranslation": {"en": "The first word"}
      }]
    }]
  },
  {
    "textTitle": "Another Story",
    "textAbbreviation": "STORY2",
    "paragraphs": [...]
  }
]
```

**Important Notes:**
- **Multi-text support:** JSON is an array of text objects. Single-object files are automatically normalized to arrays.
- Each text has `textTitle` and optional `textAbbreviation`
- Users can switch between texts using the selector dropdown (desktop) or URL parameter
- `baseline` is read-only vernacular language words from FLEx
- `baselineChanges` tracks corrections without modifying original baseline array
- `literalTranslation` is now an **array** (one-to-one with baseline), not a string
- `literalTranslationMerges` handles multi-word glossing (e.g., compound words)
- Translation languages use ISO codes (currently only "en" is supported)

## Key Architecture Patterns

### 1. Dual Interface Design

**Desktop View ([app.js](app.js)):**
- Table-based layout showing all segments at once
- Rows: Baseline (editable), WFW (Word-For-Word), Free Translation
- Supports cell merging for multi-word glosses
- Inline editing with debounced autosave
- Designed for linguists and power users

**Mobile View ([mobile.js](mobile.js)):**
- State machine-based flow: `LOADING → CHUNK_SELECT → FREE_TRANSLATION → WORD_TRANSLATION → CHUNK_COMPLETE`
- One chunk (segment) at a time
- One word at a time for WFW translation
- Progress tracking and completion reports
- Optimized for community translators on phones

### 2. Offline-First Architecture

**Local Storage Strategy:**
- All changes save to LocalStorage immediately
- Server sync happens asynchronously (1.5s debounced)
- Sync queue tracks failed uploads
- Periodic background sync every 30 seconds
- Conflict resolution: "last modified wins"

**Key Functions:**
- `saveToLocalStorage(project)` - Immediate local save with `_lastModified` timestamp
- `loadFromLocalStorage(shareCode)` - Fallback when offline
- `addToSyncQueue(projectId)` - Track pending syncs
- `processSyncQueue()` - Retry failed syncs
- `syncInBackground(shareCode)` - Background sync with conflict resolution

### 3. Authentication & Access Control

**Two Access Patterns:**

1. **Linguist (Authenticated):**
   - Email/password via Supabase Auth
   - Access to dashboard: upload, download, delete projects
   - RLS policy: `auth.uid() = linguist_id`

2. **Community (Anonymous):**
   - No login required
   - Access via share code in URL: `#p/ABC123XYZ`
   - RLS policy: Permissive SELECT/UPDATE (validated client-side)

**Security Note:**
Current RLS policies are permissive for community access. For production, consider Supabase Edge Functions or separate translations table with better row-level policies (see [schema.sql:50-53](schema.sql#L50-L53)).

### 4. Baseline Changes System

The app supports **non-destructive baseline editing**:

- Original baseline words are never modified in the `baseline` array
- Changes tracked in `baselineChanges` array with `wordIndex`, `originalValue`, `newValue`, `timestamp`
- UI shows changed words with visual highlighting (yellow background)
- Reset button appears on focus to restore original value
- This preserves the original FLEx data while allowing corrections

**Implementation:**
- `handleBaselineChange()` in [app.js:591-636](app.js#L591-L636)
- `resetBaselineWord()` in [app.js:657-663](app.js#L657-L663)

### 5. WFW Cell Merging

Supports **multi-word glossing** (e.g., "go to" → "went"):

- Merge button (`→`) combines adjacent cells
- Unmerge button (`↶`) splits merged cells
- Stored in `literalTranslationMerges` with `wordIndices` array and `gloss`
- Uses `colspan` and hidden cells for UI rendering
- Desktop view only (mobile has word-by-word flow)

**Implementation:**
- `mergeWFWCells()` in [app.js:807-842](app.js#L807-L842)
- `unmergeWFWCells()` in [app.js:845-873](app.js#L845-L873)
- `saveMergeToData()` in [app.js:876-899](app.app.js#L876-L899)

### 6. Multi-Row Table Layout

**Desktop tables split long segments into multiple rows** to prevent horizontal scrolling:

- `WORDS_PER_ROW = 10` (configurable)
- Each segment can span multiple baseline+WFW row pairs
- Free translation row spans full width at bottom
- Implementation in `renderSegment()` at [app.js:426-565](app.js#L426-L565)

## Common Development Tasks

### Running Locally

```bash
# Python
python -m http.server 8000

# Node.js
npx serve

# Access at http://localhost:8000
```

### Database Setup

1. Create Supabase project at [supabase.com](https://supabase.com)
2. Run SQL from [schema.sql](schema.sql) in SQL Editor
3. Update [config.js](config.js) with your project URL and anon key

### Testing with Sample Data

Sample JSON structure for testing:

```json
{
  "textTitle": "Test Story",
  "paragraphs": [{
    "segments": [{
      "hvo": 1,
      "baseline": ["hello", "world"],
      "literalTranslation": {"en": ""},
      "freeTranslation": {"en": ""}
    }]
  }]
}
```

Upload via linguist dashboard or insert directly:

```sql
INSERT INTO projects (linguist_id, share_code, title, json_data)
VALUES (
  'your-user-id',
  'ABC123XYZ',
  'Test Project',
  '{"textTitle":"Test Story","paragraphs":[...]}'::jsonb
);
```

### Adding Translation Languages

Currently only English (`en`) is supported. To add more languages:

1. Update `literalTranslation` and `freeTranslation` structure in data
2. Add language selector UI
3. Modify save handlers to target correct language code
4. Update i18n system in [i18n.js](i18n.js) for UI labels

### Internationalization (i18n) - IMPORTANT

**All user-facing text MUST be localized** using the `t()` function from [i18n.js](i18n.js).

**NEVER hardcode English text in the UI.** Always add a translation key and use `${t('key_name')}` in template strings.

**When adding new UI text:**

1. **Add the key to [i18n.js](i18n.js)** in ALL language sections (currently `en` and `azj`):
   ```javascript
   en: {
     // ... existing keys
     your_new_key: 'Your English Text',
   },
   azj: {
     // ... existing keys
     your_new_key: 'Azərbaycanca tərcümə',
   }
   ```

2. **Use the key in your code** with the `t()` function:
   ```javascript
   // In template strings:
   `<button>${t('your_new_key')}</button>`

   // In JavaScript:
   const message = t('your_new_key');

   // With placeholders:
   `<p>${t('chunk_of', {current: 1, total: 10})}</p>`
   ```

3. **Common patterns to avoid:**
   - ❌ `<button>Save</button>` - Hardcoded text
   - ✅ `<button>${t('save')}</button>` - Localized
   - ❌ `alert('Error loading')` - Hardcoded
   - ✅ `alert(t('error_loading'))` - Localized

4. **When reviewing code:**
   - Search for hardcoded strings in template literals and UI code
   - Ensure all user-facing text has a corresponding i18n key
   - Check that new features include translations for all supported languages

**Supported Languages:**
- `en` - English (default)
- `azj` - Azerbaijani

The language selector appears in the top-right corner of the app. Users can switch languages at any time, and their preference is saved to localStorage.

### Mobile Dev Mode

Access `mobile.html?dev=true` to enable:
- Dev tools in console (`devTools.inspectChunk(0)`)
- Double-tap chunks to inspect in modal
- Visual dev mode indicator in header

## Critical Implementation Details

### Router Pattern

Hash-based routing with multi-text support:

```javascript
// app.js router handles:
// - / (root) → Auth page or Dashboard
// - #p/SHARECODE → Translation interface (defaults to text 0)
// - #p/SHARECODE/text/0 → Translation interface for first text
// - #p/SHARECODE/text/1 → Translation interface for second text

// currentTextIndex tracks which text in the array is active
// getCurrentText() helper returns currentProject.json_data[currentTextIndex]
```

**Text Selection UI:**
- Desktop view shows a dropdown selector when multiple texts are present
- Selecting a text updates the URL hash and re-renders the interface
- All data operations use `getCurrentText()` to access the active text

### Debounced Save with Sync Queue

```javascript
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveToLocalStorage(currentProject);  // Immediate
  showSaveIndicator('unsaved');

  saveTimeout = setTimeout(async () => {
    await saveProject();  // Try server after 1.5s
  }, 1500);
}
```

If server save fails, project ID is added to sync queue and retried every 30 seconds.

### Data Normalization

The app normalizes single-text and multi-text formats:

```javascript
// Single text object → normalized to array with one element
{"textTitle": "...", "paragraphs": [...]}
// becomes:
[{"textTitle": "...", "paragraphs": [...]}]

// Multi-text array → used as-is
[
  {"textTitle": "Story 1", "paragraphs": [...]},
  {"textTitle": "Story 2", "paragraphs": [...]}
]

// Normalization in uploadProject():
let textsArray = Array.isArray(jsonData) ? jsonData : [jsonData];

// Normalization in loadTranslationPage():
if (!Array.isArray(currentProject.json_data)) {
  currentProject.json_data = [currentProject.json_data];
}
```

### Progress Calculation

```javascript
const currentText = getCurrentText();
const allSegments = currentText.paragraphs.flatMap(p => p.segments || []);
const completedSegments = allSegments.filter(s =>
  s.freeTranslation?.en && s.freeTranslation.en.trim() !== ''
).length;
const progress = (completedSegments / allSegments.length) * 100;
```

A segment is "completed" when it has a non-empty free translation. Progress is calculated **per text**, not across all texts in a project.

## Known Issues & Gotchas

### Unicode Normalization
- FLEx uses NFD (decomposed) Unicode internally
- Browsers use NFC (composed) Unicode
- May cause issues when importing back to FLEx
- **Future fix:** Normalize to NFD before exporting JSON

### Writing System Codes
- Current implementation uses simple `"en"` for translations
- FLEx expects full codes like `"en-Latn-US"` or `"en-US"`
- **Important:** Check FLEx project settings for correct writing system codes

### Concurrent Edits
- Current strategy: "last write wins"
- No real-time collaboration or conflict detection
- If multiple users edit simultaneously, later save overwrites earlier one
- **Future enhancement:** Add version tracking or operational transforms

### Share Code Security
- Share codes are 9-character alphanumeric (36^9 ≈ 101 billion combinations)
- No expiration or revocation mechanism
- RLS policies are permissive for anonymous access
- **Production recommendation:** Use Supabase Edge Functions to validate share codes server-side

### Mobile Safari Issues
- iOS Safari aggressive memory management may clear LocalStorage
- Service Workers not implemented yet
- **Workaround:** Sync queue retries when app reopens

## Testing Checklist

When making changes, test:

1. **Linguist Flow:**
   - Sign up / Sign in
   - Upload JSON file
   - Copy share link
   - Download updated JSON

2. **Community Flow (Desktop):**
   - Access via share link (no login)
   - Edit baseline words
   - Add WFW translations
   - Merge/unmerge cells
   - Add free translation
   - Verify autosave indicator

3. **Community Flow (Mobile):**
   - Access via share link
   - Select chunk
   - Add free translation
   - Word-by-word translation flow
   - Complete chunk and continue to next

4. **Offline Mode:**
   - Disable network in DevTools
   - Make edits (should save locally)
   - Re-enable network
   - Verify sync happens automatically

5. **Data Integrity:**
   - Download JSON after edits
   - Verify structure matches input format
   - Check `baselineChanges` and `literalTranslationMerges` are valid
   - Test with very long segments (>20 words)
   - Test with Unicode characters (combining diacritics)

## Related Files

The parent directory (`../`) contains Python scripts for FLEx integration:

- `fleximport.ipynb` - Import translated JSON back into FLEx
- `flextest.ipynb` - Testing and validation scripts

These are separate from the web app but part of the complete workflow.

## Future Enhancements (from projectbrief.md)

- Multiple analysis languages (es, fr, az, etc.)
- Keyboard shortcuts (Tab between cells)
- Undo/redo functionality
- Offline mode with Service Workers
- Comments/notes on segments
- Version history
- Share code expiration
- Real-time collaboration
- Audio/video playback for segments
