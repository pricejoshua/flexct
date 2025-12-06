# -*- coding: utf-8 -*-
#
# ExportTextsToJSON_UI.py
# FlexTools Module to Export Interlinear Texts to JSON with UI Configuration
#
# Author: Created for FLEx 9.1 with FlexTools
# Version: 1.2
#

from flextoolslib import *

# SIL.LCModel imports for FLEx data access
from SIL.LCModel import *
from SIL.LCModel.Core.KernelInterfaces import ITsString

from text_filter_dialog import TextFilterDialog, create_organizer_by_description_prefix
import tkinter as tk

# Python standard library
import json
import re
import os

# ----------------------------------------------------------------
# Documentation
# ----------------------------------------------------------------

docs = {
    FTM_Name: "Export Texts to JSON (UI)",
    FTM_Version: "1.2",
    FTM_ModifiesDB: False,
    FTM_Synopsis: "Export interlinear texts to JSON with UI configuration.",
    FTM_Help: """
This module exports interlinear texts from FLEx to JSON format.

FEATURES:
- Configure all options through the UI dialog
- Choose between single or multiple file export
- Select output directory
- Filter texts by description marker or export all
- Custom filename prefix

HOW TO USE:
1. Run this module from FlexTools
2. Click "Configure" to set your preferences:
   - Export Mode: One file per text OR all texts in one file
   - Text Selection: Only marked texts OR all texts
   - Output Directory: Where to save files
   - Filename Prefix: Custom prefix for output files
3. Click "Run" to export

TEXT MARKING (Optional):
To filter texts, set the Description field in FLEx to 'y' or 'Y'
for texts you want to export. Otherwise, all texts will be exported.

JSON OUTPUT STRUCTURE:
{
  "textTitle": "Text Name",
  "paragraphs": [
    {
      "segments": [
        {
          "hvo": 12345,
          "baseline": ["word1", "word2", "word3."]
        }
      ]
    }
  ]
}
""",
    FTM_Description: """
Export interlinear texts to JSON format with full UI configuration control.
Configure export mode, output location, and text selection through the dialog.
"""}

# ----------------------------------------------------------------
# Configuration Class
# ----------------------------------------------------------------

class Config:
    """Configuration parameters with UI-friendly names and defaults"""

    # Export Mode Options
    EXPORT_MODE_SINGLE = "One file per text"
    EXPORT_MODE_COMBINED = "All texts in one file"

    # Text Selection Options
    TEXT_SELECTION_MARKED = "Only texts marked with 'y' in Description"
    TEXT_SELECTION_ALL = "All texts in project"

    def __init__(self):
        self.export_mode = self.EXPORT_MODE_SINGLE
        self.text_selection = self.TEXT_SELECTION_ALL
        self.output_directory = "."
        self.filename_prefix = "exported_text"
        self.include_empty_segments = False

# Global configuration instance
config = Config()

# ----------------------------------------------------------------
# Configurables for FlexTools UI
# ----------------------------------------------------------------

def configurables():
    """
    Define configuration options that appear in FlexTools dialog.
    Returns a list of tuples defining UI elements.
    """
    return [
        # Header/Instructions
        ("_instructions", "instructions",
         "Configure export settings below, then click OK and Run.",
         FTM_Label),

        # Export Mode - Radio buttons / Dropdown
        ("export_mode", "Export Mode",
         config.export_mode,
         FTM_List,
         [Config.EXPORT_MODE_SINGLE, Config.EXPORT_MODE_COMBINED]),

        # Text Selection - Radio buttons / Dropdown
        ("text_selection", "Text Selection",
         config.text_selection,
         FTM_List,
         [Config.TEXT_SELECTION_ALL, Config.TEXT_SELECTION_MARKED]),

        # Output Directory - Text input
        ("output_directory", "Output Directory",
         config.output_directory,
         FTM_String),

        # Filename Prefix - Text input
        ("filename_prefix", "Filename Prefix",
         config.filename_prefix,
         FTM_String),

        # Include Empty Segments - Checkbox
        ("include_empty_segments", "Include segments with no baseline text",
         config.include_empty_segments,
         FTM_Boolean),
    ]

# ----------------------------------------------------------------
# Configuration Handler
# ----------------------------------------------------------------

def UpdateConfig(configDict):
    """
    Called by FlexTools to update configuration from UI
    """
    config.export_mode = configDict.get("export_mode", config.export_mode)
    config.text_selection = configDict.get("text_selection", config.text_selection)
    config.output_directory = configDict.get("output_directory", config.output_directory)
    config.filename_prefix = configDict.get("filename_prefix", config.filename_prefix)
    config.include_empty_segments = configDict.get("include_empty_segments", config.include_empty_segments)

# ----------------------------------------------------------------
# Main Processing Function
# ----------------------------------------------------------------

def MainFunction(project, report, modifyAllowed):
    """
    Main function called by FlexTools
    """
    # Import LCModel types here to ensure they're available at runtime
    from SIL.LCModel import ITextRepository, IStTxtPara, IWfiWordformRepository, IWfiGlossRepository, IPunctuationFormRepository, IWfiAnalysisRepository

    cache = project.project
    lp = cache.LangProject
    sl = cache.ServiceLocator
    wsv = cache.DefaultVernWs
    wsa = cache.DefaultAnalWs

    # Prepare output directory
    output_dir = os.path.abspath(config.output_directory)
    if not os.path.exists(output_dir):
        try:
            os.makedirs(output_dir)
            report.Info(f"Created output directory: {output_dir}")
        except Exception as e:
            report.Error(f"Failed to create output directory: {e}")
            return

    # Get text repository
    text_repo = sl.GetService(ITextRepository)

    # Collect texts based on selection mode
    text_para_dict = {}
    exported_count = 0
    skipped_count = 0
    total_count = 0

    use_marker = (config.text_selection == Config.TEXT_SELECTION_MARKED)

    for text in text_repo.AllInstances():
        total_count += 1

        # Get title
        title = text.Name.BestVernacularAnalysisAlternative
        if not title or not hasattr(title, 'Text') or not title.Text:
            skipped_count += 1
            continue

        title_text = title.Text

        # Check if we should process this text
        if use_marker:
            description = text.Description.get_String(wsa)
            is_marked = (description is not None and
                        hasattr(description, "Text") and
                        description.Text is not None and
                        description.Text.lower() == 'y')

            if not is_marked:
                skipped_count += 1
                continue

        # Get paragraphs
        paragraphs = []
        sttext = text.ContentsOA

        if sttext is not None and hasattr(sttext, "ParagraphsOS"):
            for para in sttext.ParagraphsOS:
                if hasattr(para, 'Contents'):
                    txtpara = para
                else:
                    txtpara = IStTxtPara(para)
                paragraphs.append(txtpara)

        if paragraphs:
            text_para_dict[title] = paragraphs
            exported_count += 1
        else:
            skipped_count += 1

    # Summary
    report.Info(f"Found {total_count} text(s), exporting {exported_count}")

    if not text_para_dict:
        if use_marker:
            report.Warning("No texts marked for export. Set Description to 'y' in FLEx.")
        else:
            report.Warning("No valid texts found to export.")
        return

    # Export to JSON
    try:
        single_mode = (config.export_mode == Config.EXPORT_MODE_SINGLE)
        base_path = os.path.join(output_dir, config.filename_prefix)

        files_created = create_json(
            base_path,
            text_para_dict,
            cache,
            wsv,
            single_mode,
            config.include_empty_segments,
            report
        )

        report.Info(f"Successfully created {len(files_created)} file(s):")
        for filepath in files_created:
            filename = os.path.basename(filepath)
            filesize = os.path.getsize(filepath)
            # report.Info(f"  {filename} ({filesize:,} bytes)")

    except Exception as e:
        report.Error(f"Export failed: {str(e)}")
        import traceback
        report.Error(traceback.format_exc())

# ----------------------------------------------------------------
# Helper Functions
# ----------------------------------------------------------------

def get_form(analysis, wsv, cache):
    """
    Get the word form from an analysis object

    Returns: tuple of (form_string, is_punctuation) or None
    """
    from SIL.LCModel import IWfiWordformRepository, IWfiGlossRepository, IPunctuationFormRepository, IWfiAnalysisRepository

    class_name = analysis.ClassName
    hvo = analysis.Hvo

    try:
        if class_name == "WfiWordform":
            obj = cache.ServiceLocator.GetService(IWfiWordformRepository).GetObject(hvo)
            form_text = obj.Form.get_String(wsv).Text
            return (form_text if form_text else "", False)

        elif class_name == "WfiGloss":
            obj = cache.ServiceLocator.GetService(IWfiGlossRepository).GetObject(hvo)
            analysis_obj = obj.Owner
            word_form = analysis_obj.Owner
            wf = cache.ServiceLocator.GetService(IWfiWordformRepository).GetObject(word_form.Hvo)
            form_text = wf.Form.get_String(wsv).Text
            return (form_text if form_text else "", False)

        elif class_name == "PunctuationForm":
            obj = cache.ServiceLocator.GetService(IPunctuationFormRepository).GetObject(hvo)
            return (str(obj.Form), True)

        elif class_name == "WfiAnalysis":
            obj = cache.ServiceLocator.GetService(IWfiAnalysisRepository).GetObject(hvo)
            if obj.Owner:
                form_text = obj.Owner.Form.get_String(wsv).Text
                return (form_text if form_text else "", False)

    except Exception as e:
        print(f"Error getting form for {class_name} (HVO: {hvo}): {e}")

    return None

def create_json(base_path, title_para_dict, cache, wsv, single_text=True, include_empty=False, report=None):
    """
    Create JSON file(s) from the text data

    Parameters:
    - base_path: Base path (including directory and filename prefix)
    - title_para_dict: Dictionary mapping titles to paragraph lists
    - cache: FLEx LCM cache object
    - wsv: Vernacular writing system
    - single_text: If True, create one file per text; if False, combine all texts
    - include_empty: If True, include segments with no baseline text
    - report: FlexTools report object (optional)

    Returns: List of full file paths created
    """
    texts = []
    files_created = []

    for title, paragraphs in title_para_dict.items():
        title_text = title.Text if hasattr(title, 'Text') else str(title)

        text_obj = {
            "textTitle": title_text,
            "paragraphs": []
        }

        total_segments = 0
        empty_segments = 0

        for para_idx, txtpara in enumerate(paragraphs):
            paragraph_data = {
                "segments": []
            }

            for seg_idx, segment in enumerate(txtpara.SegmentsOS):
                # Get forms for this segment
                tup_forms = []

                for analysis in segment.AnalysesRS:
                    tup = get_form(analysis, wsv, cache)
                    if tup is not None:
                        tup_forms.append(tup)

                # Combine forms with punctuation
                forms = []
                for i, (form, punctuation) in enumerate(tup_forms):
                    if punctuation:
                        # Attach punctuation to previous word
                        if i != 0 and forms:
                            forms[-1] = forms[-1] + form
                        else:
                            forms.append(form)
                    else:
                        forms.append(form)

                if not forms:
                    empty_segments += 1
                    if not include_empty:
                        continue

                segment_data = {
                    "hvo": segment.Hvo,
                    "baseline": forms
                }

                paragraph_data["segments"].append(segment_data)
                total_segments += 1

            if paragraph_data["segments"]:
                text_obj["paragraphs"].append(paragraph_data)

        if text_obj["paragraphs"]:
            texts.append(text_obj)

    if not texts:
        if report:
            report.Warning("⚠ No valid text data to export")
        return files_created

    if single_text:
        # Export one JSON file per text
        for text_obj in texts:
            # Sanitize the title for use as a filename
            safe_title = re.sub(r'[<>:"/\\|?*]', '_', text_obj["textTitle"])
            filename = f"{base_path}_{safe_title}.json"

            # Wrap in array to match schema format
            with open(filename, "w", encoding="utf-8") as f:
                json.dump([text_obj], f, ensure_ascii=False, indent=2)

            files_created.append(filename)
    else:
        # Export all texts into a single project file
        filename = f"{base_path}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(texts, f, ensure_ascii=False, indent=2)

        files_created.append(filename)

    return files_created

# ----------------------------------------------------------------
# Module Entry Point
# ----------------------------------------------------------------

FlexToolsModule = FlexToolsModuleClass(runFunction = MainFunction,
                                       docs = docs,
                                       )
