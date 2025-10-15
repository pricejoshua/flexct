# **project brief: flex interlinear translation web app**

## **the whole deal**
linguists work in fieldworks language explorer (flex). they have interlinear texts (sentence broken into words with glosses). they need community members to add translations. current workflow sucks bc flex isn't collaborative. 

**solution:** export json from flex → web ui where community adds translations → import updated json back to flex

## **core user flow**
1. linguist exports interlinear data to json via flextools (python script, separate concern)
2. linguist uploads json to web app, gets shareable link like `app.com/p/xyz789`
3. linguist sends link to community member
4. community member opens link, sees table of sentences, adds translations
5. changes autosave to database
6. linguist downloads updated json later
7. linguist imports json back to flex via flextools (separate concern)

## **ui requirements**

### **table layout per segment (sentence):**
```
┌─────────────┬──────────┬──────────┬─────────┬───────┐
│ Baseline    │ word1    │ word2    │ word3   │ word4 │ <- read only
├─────────────┼──────────┼──────────┼─────────┼───────┤
│ Changes     │ [input]  │ [input]  │ [input] │[input]│ <- editable
├─────────────┼──────────┼──────────┼─────────┼───────┤
│ WFW         │ [input]  │ [input]  │ [input] │[input]│ <- editable
├─────────────┴──────────┴──────────┴─────────┴───────┤
│ Free        │ [single textarea spanning all cols]   │ <- editable
└─────────────────────────────────────────────────────┘
```

- baseline row: vernacular language words (from flex)
- wfw row: word-for-word literal translation (one input per word)
- free row: sentence-level free translation (full width textarea)
- changes row: placeholder for future, leave empty divs

### **display all segments** vertically stacked, one table per segment

### **autosave behavior:**
- debounce 1-2 sec after user stops typing
- visual indicator (saving... / saved / error)
- optimistic updates (appear instant, sync background)

## **auth & sharing**

### **two user types:**
- **linguist**: needs account (email/pw or magic link), can upload/download
- **community**: NO account needed, just needs share code

### **recommended pattern:**
- community members access via url only: `app.com/p/ABC123`
- no signup wall for community = better ux
- share code validates against db, grants read/write to that project only
- linguist dashboard shows their projects + download buttons

## **data schema**

### **json input format (from flextools):**
```json
{
  "textTitle": "Story Name",
  "paragraphs": [{
    "segments": [{
      "hvo": 12345,
      "baseline": ["word1", "word2", "word3"],
      "literalTranslation": {"en": ""},
      "freeTranslation": {"en": ""}
    }]
  }]
}
```

### **database (supabase postgres):**
```sql
-- linguists table (supabase auth handles this)
users (id, email, created_at)

-- projects table
projects (
  id uuid primary key,
  linguist_id uuid references users,
  share_code text unique,
  title text,
  json_data jsonb, -- store entire json here
  created_at timestamp,
  updated_at timestamp
)

-- row level security:
-- linguists can crud their own projects
-- anyone with valid share_code can read/update that project
```

**alternative schema** if you want separate segments table:
```sql
segments (
  id uuid primary key,
  project_id uuid references projects,
  hvo integer,
  baseline text[],
  literal_translation jsonb, -- {"en": "text"}
  free_translation jsonb,
  word_order integer
)
```

**rec:** start with jsonb in projects table. simpler. optimize later if perf sucks.

## **tech stack**

### **frontend:**
- vanilla js (no react, no build step)
- single `index.html` or minimal static site
- `app.js` - render tables, handle inputs, save to db
- `styles.css` - table borders, basic layout
- supabase-js from cdn OR raw fetch to supabase rest api

### **backend:**
- supabase (postgres + auth + storage + realtime if you want)
- row level security policies for access control
- optional: storage bucket for json files (or just store in jsonb column)

### **hosting:**
- vercel/netlify/cloudflare pages - all have free tier
- literally just deploy static html/js/css
- supabase handles all backend

## **key implementation details**

### **rendering:**
```js
function renderSegment(segment) {
  const words = segment.baseline;
  const table = `
    <table>
      <tr>
        <td>Baseline</td>
        ${words.map(w => `<td>${w}</td>`).join('')}
      </tr>
      <tr>
        <td>Changes</td>
        ${words.map(() => '<td></td>').join('')}
      </tr>
      <tr>
        <td>WFW</td>
        ${words.map((w, i) => 
          `<td><input data-segment="${segment.hvo}" data-word="${i}"></td>`
        ).join('')}
      </tr>
      <tr>
        <td colspan="${words.length + 1}">
          <textarea data-segment="${segment.hvo}"></textarea>
        </td>
      </tr>
    </table>
  `;
  return table;
}
```

### **autosave:**
```js
let saveTimeout;
input.addEventListener('input', (e) => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveToSupabase(segmentId, fieldType, value);
  }, 1500);
});
```

### **share code generation:**
```js
// when linguist uploads
const shareCode = Math.random().toString(36).substr(2, 9).toUpperCase();
// ABC123XYZ style
```

### **access control (supabase rls):**
```sql
-- linguists can see their own projects
create policy "linguists_own_projects"
  on projects for all
  using (auth.uid() = linguist_id);

-- anyone can read/update project with valid share code
create policy "public_share_code_access"
  on projects for select, update
  using (share_code = current_setting('request.headers')::json->>'x-share-code');
```

## **MVP scope (v1)**

### **must have:**
- [ ] linguist signup/login
- [ ] upload json → generate share link
- [ ] render interlinear table from json
- [ ] editable wfw + free translation fields
- [ ] autosave to database
- [ ] download updated json
- [ ] works on mobile (responsive tables)

### **nice to have (v2):**
- [ ] multiple analysis languages (en, es, fr)
- [ ] keyboard shortcuts (tab between cells)
- [ ] undo/redo
- [ ] offline mode (localforage + sync later)
- [ ] bulk operations (mark all as reviewed)
- [ ] comments/notes on segments

### **explicitly NOT doing rn:**
- no real-time collab (multiple users editing simultaneously)
- no version history (just overwrite)
- no complex morpheme glossing 
- no audio/video playback 

### **flextools export script (partially complete elsewhere):**
- python script to read flex project file, output json in format specified above. Don't worry about implementing this now.

### **flextools import script (your responsibility):**
- python script to read updated json, update flex project file. Don't worry about implementing this now.

## **success criteria**
- community member can open link and start translating in < 10 seconds
- autosave works reliably, no data loss
- linguist can download json that imports cleanly to flex
- app loads in < 2 seconds on 3g
- total bundle size < 50kb (excluding supabase sdk)

## **things that will bite you:**
- unicode normalization (flex uses nfd internally, web uses nfc)
- writing system codes (en vs en-US vs en-Latn-US. Use en-Latn-US when possible)
- punctuation in baseline creating extra columns
- very long sentences breaking mobile layout
- concurrent edits from multiple community members (last write wins for mvp)

## **nice ux touches:**
- show word count + segment count
- progress bar (x of y segments have translations)
- highlight unsaved changes
- "copy baseline to wfw" button for borrowings
- export includes timestamp + contributor metadata

---

**tl;dr:** vanilla js table that saves to supabase. linguist uploads json, shares link, community types translations, linguist downloads. no auth for community, just url validation. keep it simple.