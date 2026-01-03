# Downloading Translated Results

This guide explains how to download the translations from your project and prepare them for import back into FLEx.

## When to Download

You can download your project at any time:
- While community members are still working (partial translations)
- When the project is 100% complete
- To create a backup of current progress
- Before the final import into FLEx

**Good to know:** Downloading doesn't stop community members from continuing to work. You can download multiple times and always get the latest version.

## Step 1: Log Into Your Dashboard

1. Open the web application
2. Log in with your email and password
3. You'll see all your projects listed

## Step 2: Find Your Project

1. Look through your project list
2. Find the project you want to download
3. Check the progress percentage to see how complete it is

## Step 3: Download the JSON File

1. Click the **"Download JSON"** button next to your project
2. Your browser will download a file
3. The file will be named something like: `project-[date]-[time].json`
4. The file goes to your browser's default download location (usually the Downloads folder)

## Step 4: Save the File

1. Find the downloaded file in your Downloads folder
2. Rename it if you want (keep the .json extension)
3. Move it to a safe location where you keep your FLEx project files

**Recommended naming:** `[TextName]-translated-[date].json`
- Example: `CreationStory-translated-2025-12-09.json`

## What's in the Downloaded File?

The JSON file contains:
- The original vernacular text (baseline)
- Word-for-word translations added by community members
- Free translations added by community members
- All the technical data needed for FLEx import
- The unique IDs (HVOs) that link translations back to FLEx

## Importing Back into FLEx

After downloading:

1. Open your FLEx project
2. Use the FlexTools import script
3. Select the downloaded JSON file
4. The script will:
   - Match translations to the correct segments
   - Update your FLEx database
   - Preserve all linguistic annotations

**See the FlexTools import guide** for detailed instructions on this process.

## Understanding Progress

The progress percentage shows:
- How many segments have free translations
- A segment is "complete" when it has at least a free translation
- Word-for-word translations are extra but don't affect the percentage

Examples:
- **25% complete** = 1 out of 4 segments has a free translation
- **100% complete** = All segments have free translations

## Checking What Was Translated

Before importing into FLEx, you can:

1. Open the JSON file in a text editor (Notepad, TextEdit, etc.)
2. Look for `"freeTranslation"` and `"literalTranslation"` entries
3. See which segments have translations

**Tip:** JSON files are human-readable but can be confusing. Don't edit them manually - use FLEx to view the translations properly.

## Downloading Multiple Times

You can download as many times as you want:
- Each download is a snapshot of current progress
- Keep multiple versions to track progress over time
- Always download before final import to ensure you have the latest

**Best practice:** Download regularly as backups, especially for large projects.

## Troubleshooting

### "Download button doesn't work"
- Refresh the page
- Try logging out and back in
- Check your internet connection
- Try a different browser

### "File downloads but won't open"
- Make sure it has the .json extension
- Don't try to open it - use it with FlexTools import
- If you must view it, use a text editor, not Word

### "I can't find the downloaded file"
- Check your Downloads folder
- Check browser download history (usually Ctrl+J)
- Try downloading again
- Check if your browser blocked the download

### "The file seems empty or wrong"
- Check the file size - should be at least a few KB
- Make sure you downloaded from the correct project
- Try downloading again
- Verify community members actually added translations

### "Downloaded file won't import into FLEx"
- Make sure you're using the correct FlexTools import script
- Check that the file isn't corrupted
- Verify the file has the .json extension
- Don't edit the file manually

## File Management Tips

1. **Create a dedicated folder** for translated JSON files
2. **Use consistent naming** - include text name and date
3. **Keep original exports** - don't overwrite the files you uploaded
4. **Back up regularly** - save copies in multiple locations
5. **Track versions** - if you download multiple times, keep version numbers

Example folder structure:
```
My FLEx Projects/
  └── Translations/
      ├── Originals/
      │   └── CreationStory-export-2025-12-01.json
      └── Translated/
          ├── CreationStory-translated-2025-12-05.json (partial)
          ├── CreationStory-translated-2025-12-08.json (more progress)
          └── CreationStory-translated-2025-12-09.json (final)
```

## What's Next?

After downloading:
1. Back up the file
2. Import into FLEx using FlexTools (see FlexTools import guide)
3. Review the translations in FLEx
4. Make any necessary corrections
5. Thank your community members!

## Quality Checking

Before final import:
- Ask a second person to review translations if possible
- Check a sample of translations for accuracy
- Verify that cultural terms are translated appropriately
- Make sure free translations are natural, not word-for-word

## Keeping Community Members Informed

After downloading and reviewing:
- Let community members know you received their work
- Thank them for their contributions
- Share any interesting findings
- Invite them to help with future projects
- Consider sharing the final published materials with them
