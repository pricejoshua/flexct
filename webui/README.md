# FLEX Interlinear Translation Web App

A lightweight web application for collaborative translation of FLEX interlinear texts. Linguists can export data from FLEx, share it with community members for translation, and import the results back.

## Features

- **No-build vanilla JavaScript** - just HTML, CSS, and JS
- **Linguist dashboard** - upload JSON, manage projects, download updated data
- **Share links** - community members access via URL, no account needed
- **Autosave** - changes save automatically with visual feedback
- **Responsive design** - works on mobile and desktop
- **Table layout** - baseline, word-for-word, and free translation rows

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to **Settings** → **API** and copy:
   - Project URL
   - Anon/Public key

### 2. Set Up Database

1. In your Supabase project, go to **SQL Editor**
2. Copy the contents of `schema.sql`
3. Run the SQL script to create tables and policies

### 3. Configure the App

1. Open `config.js`
2. Replace the placeholder values:
   ```javascript
   const SUPABASE_CONFIG = {
     url: 'https://your-project.supabase.co',
     anonKey: 'your-anon-key-here'
   };
   ```

### 4. Deploy

#### Option A: Netlify (Recommended)

1. Install Netlify CLI: `npm install -g netlify-cli`
2. Run: `netlify deploy --dir=webui --prod`
3. Follow the prompts

#### Option B: Vercel

1. Install Vercel CLI: `npm install -g vercel`
2. Run: `vercel --prod`
3. Select the `webui` directory

#### Option C: Cloudflare Pages

1. Go to Cloudflare Pages dashboard
2. Create a new project from your Git repository
3. Set build directory to `webui`
4. Deploy

#### Option D: Local Development

1. Use any static file server
2. Python: `python -m http.server 8000`
3. Node.js: `npx serve`
4. Open `http://localhost:8000`

## Usage

### For Linguists

1. **Sign up/Sign in**
   - Create an account with email and password
   - You'll receive a confirmation email

2. **Upload Project**
   - Export your interlinear text from FLEx using the flextools script
   - Click "Upload New Project" and select the JSON file
   - A share code and link will be generated

3. **Share with Community**
   - Copy the generated link (e.g., `app.com/#p/ABC123XYZ`)
   - Send to community members via email, WhatsApp, etc.

4. **Download Results**
   - Return to your dashboard anytime
   - Click "Download JSON" to get the updated file
   - Import back into FLEx using the flextools import script

### For Community Members

1. **Open Link**
   - Click the link provided by your linguist
   - No account or sign-up required

2. **Add Translations**
   - **WFW row**: Add word-for-word translations (one input per word)
   - **Free row**: Add free translation for the entire sentence
   - Changes save automatically (watch for "Saving..." → "Saved" indicator)

3. **Track Progress**
   - Progress bar shows how many segments are completed
   - A segment is "completed" when it has a free translation

## File Structure

```
webui/
├── index.html          # Main HTML file
├── styles.css          # All styles
├── app.js             # Main application logic
├── config.js          # Supabase configuration
├── schema.sql         # Database schema
├── README.md          # This file
└── projectbrief.md    # Original project requirements
```

## JSON Format

### Input Format (from FLEx)

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

### Output Format (after translation)

Same structure, but with filled translations:

```json
{
  "textTitle": "Story Name",
  "paragraphs": [{
    "segments": [{
      "hvo": 12345,
      "baseline": ["kata", "ya", "kwanza"],
      "literalTranslation": {"en": "word of first"},
      "freeTranslation": {"en": "The first word"}
    }]
  }]
}
```

## Security Notes

- **Row Level Security (RLS)** is enabled on the database
- Linguists can only access their own projects
- Community members can access projects via share code
- Share codes are random 9-character strings (36^9 ≈ 101 billion combinations)
- For production use, consider:
  - Adding rate limiting
  - Implementing share code expiration
  - Using Supabase Edge Functions for additional validation

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Bundle size: ~5KB HTML/CSS/JS (excluding Supabase SDK)
- Supabase SDK: ~50KB (loaded from CDN)
- Target load time: <2s on 3G

## Troubleshooting

### "Project not found" error
- Check that the share code is correct
- Verify the project exists in Supabase dashboard
- Check RLS policies are properly set up

### Changes not saving
- Check browser console for errors
- Verify Supabase URL and key in `config.js`
- Check RLS policies allow updates

### Authentication issues
- Check email confirmation
- Verify Supabase Auth is enabled
- Clear browser cache and try again

## Future Enhancements

See `projectbrief.md` for v2 features:
- Multiple analysis languages
- Keyboard shortcuts
- Offline mode
- Undo/redo
- Comments on segments

## License

MIT License - feel free to modify and use for your linguistics projects!
