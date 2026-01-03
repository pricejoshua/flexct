# %%
import flexlibs
from SIL.LCModel import *
from SIL.LCModel.Core.KernelInterfaces import ITsString, ITsTextProps, ITsStrFactory, ITsPropsFactory, ITsStrBldr, ITsIncStrBldr, ITsPropsBldr, ITsMultiString, FwTextPropType, FwTextPropVar
from SIL.LCModel.Core.Text import TsStringUtils,TsIncStrBldr, TsStrBldr, TsStringComparer
from SIL.LCModel.Core.Cellar import CellarPropertyType, CellarPropertyTypeFilter, GenDate
from SIL.LCModel.Core.WritingSystems import CoreWritingSystemDefinition
from SIL.LCModel.Infrastructure import IFwMetaDataCacheManaged
from System import Guid, String, DateTime, Byte
from docx.shared import Inches, Pt
import unicodedata
import docx
# import tkinter as tk
# from tkinter import ttk

flexlibs.FLExInitialize()

# %%
project = flexlibs.FLExProject()
project.OpenProject('tkr-lexicon-flex')
# project.OpenProject('IndonesianTest')
project.ProjectName()
cache = project.project
lp = cache.LangProject
lexicon = lp.LexDbOA
sl = cache.ServiceLocator
mdcm = IFwMetaDataCacheManaged(cache.MetaDataCacheAccessor)
ddbf = cache.DomainDataByFlid
wsv = cache.DefaultVernWs
wsa = cache.DefaultAnalWs

entry = next(iter(lexicon.Entries))


# %%
analysis_ws_list = project.GetAllAnalysisWSs()

test_tag = None

# Iterate through each analysis writing system
for ws_tag in analysis_ws_list:
    ws_handle = project.WSHandle(ws_tag)
    ws_name = project.WSUIName(ws_tag)
    
    print(ws_tag, ws_handle, ws_name)
    test_handle = ws_handle
    if ws_tag == 'en':
        wsa = ws_handle



# %%
# returns the form, and if it should split on a punctuation
def get_form(analysis, wsv) -> tuple[str, bool] | None:
    
    class_name = analysis.ClassName
    hvo = analysis.Hvo
    
    try:
        if class_name == "WfiWordform":
            obj = cache.ServiceLocator.GetService(IWfiWordformRepository).GetObject(hvo)
            return (obj.Form.get_String(wsv).Text, False)
            
        elif class_name == "WfiGloss":
            obj = cache.ServiceLocator.GetService(IWfiGlossRepository).GetObject(hvo)
            analysis = obj.Owner
            word_form = analysis.Owner
            wf = cache.ServiceLocator.GetService(IWfiWordformRepository).GetObject(word_form.Hvo)
            return (wf.Form.get_String(wsv).Text, False)
            
        elif class_name == "PunctuationForm":
            obj = cache.ServiceLocator.GetService(IPunctuationFormRepository).GetObject(hvo)
            return (str(obj.Form), True)
            
        elif class_name == "WfiAnalysis":
            obj = cache.ServiceLocator.GetService(IWfiAnalysisRepository).GetObject(hvo)
            if obj.Owner:
                return (obj.Owner.Form.get_String(wsv).Text, False)
            
    except Exception as e:
        print(f"Error with {class_name}: {e}")

# %%
def GetAllCustomFields():
    for flid in mdcm.GetFieldIds():
        if mdcm.IsCustom(flid):
            yield(flid, mdcm.GetOwnClsId(flid), mdcm.GetOwnClsName(flid), mdcm.GetFieldType(flid),
            mdcm.GetFieldName(flid), mdcm.GetFieldWs(flid), mdcm.GetFieldListRoot(flid))
    

customFields = GetAllCustomFields()
for field in customFields :
    print(field[0],field[1],field[2],field[3],field[4],field[5],field[6], sep=", ")

# %%
text_repo = sl.GetService(ITextRepository)
notebook_repo = sl.GetService(IRnGenericRecRepository)

# Get all texts using the repository
count = 0
text_para_dict = {}
for text in text_repo.AllInstances():
    count += 1
    if count > 5:
        break
        
    comment = text.Description.get_String(wsa)
    if comment is not None and hasattr(comment, "Text") and comment.Text is not None:
        if comment.Text.lower() == 'y':
            paragraphs = []

            title = text.Name.BestVernacularAnalysisAlternative
            if title != None:
                # Safe to access .Text property
                title_text = title.Text
                if title_text:  # Check if the text content is not empty
                    print(title_text)
            # Access the structured content
            sttext = text.ContentsOA
            tags = sttext.TagsOC
            texts = []

            if sttext is not None and hasattr(sttext, "ParagraphsOS"):
                # print(f"Number of paragraphs: {sttext.ParagraphsOS.Count}")
                # Access baseline text from paragraphs
                for para in sttext.ParagraphsOS:
                    # Cast to IStTxtPara to access Contents
                    if hasattr(para, 'Contents'):
                        # It's already IStTxtPara
                        txtpara = para
                    else:
                        # Cast from IStPara to IStTxtPara
                        txtpara = IStTxtPara(para)
                    paragraphs.append(txtpara)

            text_para_dict[title] = paragraphs
# create_docx("testdoc2", text_para_dict)
create_json("project", text_para_dict)
                
        

# %%
def create_docx(doc_name: str, title_para_dict: dict):
    doc = docx.Document()
    doc.sections[0].left_margin = Inches(0.5)
    doc.sections[0].right_margin = Inches(0.5)

    for title, paragraphs in title_para_dict.items():
        # doc.add_heading(title)
        print(title, "+", len(paragraphs))
        for p in paragraphs:
            create_table(p, doc)
            doc.add_page_break()
    
    doc.save(doc_name + ".docx")
    

# %%
def create_json(doc_name: str, title_para_dict: dict, single_text=True):
    import json
    import re

    texts = []

    for title, paragraphs in title_para_dict.items():
        title_text = title.Text if hasattr(title, 'Text') else str(title)

        text_obj = {
            "textTitle": title_text,
            "paragraphs": []
        }

        for txtpara in paragraphs:
            paragraph_data = {
                "segments": []
            }

            for segment in txtpara.SegmentsOS:
                # Get forms for this segment
                tup_forms = []
                for analysis in segment.AnalysesRS:
                    tup = get_form(analysis, wsv)
                    if tup is not None:
                        tup_forms.append(tup)

                # Combine forms with punctuation
                forms = []
                for i, (form, punctuation) in enumerate(tup_forms):
                    if punctuation:
                        if i != 0:
                            forms[-1] = forms[-1] + form
                    else:
                        forms.append(form)

                if not forms:
                    continue

                segment_data = {
                    "hvo": segment.Hvo,
                    "baseline": forms
                }

                paragraph_data["segments"].append(segment_data)

            if paragraph_data["segments"]:  # Only add paragraphs with segments
                text_obj["paragraphs"].append(paragraph_data)

        if text_obj["paragraphs"]:  # Only add texts with paragraphs
            texts.append(text_obj)

    if single_text:
        # Export one JSON file per text
        for text_obj in texts:
            # Sanitize the title for use as a filename
            safe_title = re.sub(r'[<>:"/\\|?*]', '_', text_obj["textTitle"])
            filename = f"{doc_name}_{safe_title}.json"

            # Wrap in array to conform to schema (array with single item)
            with open(filename, "w", encoding="utf-8") as f:
                json.dump([text_obj], f, ensure_ascii=False, indent=2)

            print(f"Saved {filename}")
    else:
        # Export all texts into a single project file
        with open(doc_name + ".json", "w", encoding="utf-8") as f:
            json.dump(texts, f, ensure_ascii=False, indent=2)

        print(f"Saved {doc_name}.json")

# %%
# with help from Claude
def create_table(txtpara, doc: docx.Document):
    char_width = 0.12  # average width per character in inches
    min_width = 0.4    # minimum cell width in inches
    max_table_width = 7.0
    # Define the row types you want
    row_types = [
        {"label": "Baseline", "merge": False},
        {"label": "Changes", "merge": False},
        {"label": "WFW", "merge": False}, 
    ]
    seg_count = 0
    label_col_width = 0.8  # slightly smaller label column
    for segment in txtpara.SegmentsOS:
        seg_count += 1
        paragraph = doc.add_paragraph()
        run = paragraph.add_run(str(segment.Hvo))
        run.font.size = Pt(0.1)
        tup_forms = []
        for analysis in segment.AnalysesRS:
            tup = get_form(analysis, wsv)
            if tup is not None:
                tup_forms.append(tup)
        # Combine forms with punctuation
        forms = []
        for i, (form, punctuation) in enumerate(tup_forms):
            if punctuation:
                if i != 0:
                    forms[-1] = forms[-1] + form
            else:
                forms.append(form)
        if not forms:
            continue
        # Split forms into chunks that fit within max_table_width
        form_chunks = split_forms_into_chunks(forms, char_width, min_width, max_table_width)
        # Create a table for each chunk
        for chunk_idx, chunk_forms in enumerate(form_chunks):
            table = doc.add_table(rows=len(row_types), cols=(len(chunk_forms) + 1))
            table.autofit = True
            # Set first column width for labels (enforced, all rows)
            for row in table.rows:
                cell = row.cells[0]
                cell.width = Inches(label_col_width)
            # Calculate desired widths for word columns
            word_col_widths = []
            for form in chunk_forms:
                if form is not None:
                    word_col_widths.append(max(len(form) * char_width, min_width))
                else:
                    word_col_widths.append(min_width)
            total_width = label_col_width + sum(word_col_widths)
            if total_width > max_table_width:
                available_width = max_table_width - label_col_width
                scale = available_width / sum(word_col_widths)
                word_col_widths = [w * scale for w in word_col_widths]
            # Set widths for word columns and add baseline text
            for col_idx, (form, width) in enumerate(zip(chunk_forms, word_col_widths), start=1):
                for row in table.rows:
                    cell = row.cells[col_idx]
                    cell.width = Inches(width)
                table.rows[0].cells[col_idx].text = form
            # Set row labels and handle merging
            for row_idx, row_type in enumerate(row_types):
                table.rows[row_idx].cells[0].text = row_type["label"]
                if row_type["merge"] and len(chunk_forms) > 0:
                    base_cell = table.rows[row_idx].cells[1]
                    for merge_idx in range(2, len(chunk_forms) + 1):
                        base_cell = base_cell.merge(table.rows[row_idx].cells[merge_idx])
        # Free translation row table (always same label width)
        if form_chunks:
            chunk_forms = form_chunks[-1]
            table = doc.add_table(rows=1, cols=(len(chunk_forms) + 1))
            table.autofit = False
            cell = table.rows[0].cells[0]
            cell.width = Inches(label_col_width)
            for col_idx, form in enumerate(chunk_forms, start=1):
                width = max(len(form) * char_width, min_width)
                cell = table.rows[0].cells[col_idx]
                cell.width = Inches(width)
            table.rows[0].cells[0].text = "Free"
            if len(chunk_forms) > 0:
                base_cell = table.rows[0].cells[1]
                for merge_idx in range(2, len(chunk_forms) + 1):
                    base_cell = base_cell.merge(table.rows[0].cells[merge_idx])
        doc.add_paragraph()
def split_forms_into_chunks(forms, char_width, min_width, max_table_width):
    """
    Split forms into chunks where each chunk fits within max_table_width.
    This uses a column-aware algorithm that maintains alignment.
    """
    if not forms:
        return []
    chunks = []
    current_chunk = []
    current_width = min_width  # Start with label column width
    for form in forms:
        form_width = max(len(form) * char_width, min_width) if form else min_width
        if current_chunk and (current_width + form_width > max_table_width):
            chunks.append(current_chunk)
            current_chunk = [form]
            current_width = min_width + form_width
        else:
            current_chunk.append(form)
            current_width += form_width
    if current_chunk:
        chunks.append(current_chunk)
    return chunks

# %%


# %%
project.CloseProject();


