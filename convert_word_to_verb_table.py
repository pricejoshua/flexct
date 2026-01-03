import json
import re
from docx import Document
import os
import sys

# Ensure UTF-8 output for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def process_word_document(word_file, output_path):
    """
    Process a Word document containing verb paradigm tables and convert to JSON.

    The Word document contains tables with:
    - Row 0: Lemma header with translations repeated across columns
    - Row 1: English TAME category headers
    - Row 2: Russian translations
    - Row 3: Azerbaijani translations
    - Row 4+: Noun class rows (I, II, III, IV, pl. I,II, pl. III,IV)
    """

    # Check if file exists
    if not os.path.exists(word_file):
        print(f"Error: File not found: {word_file}")
        return

    print(f"Processing: {os.path.basename(word_file)}")

    # TAME categories will be extracted from first table
    tame_categories = []

    # Noun class categories (consistent structure)
    noun_class_categories = [
        {
            "id": "I",
            "labels": {"en": "I"},
            "description": "çoc (brother) - Male human"
        },
        {
            "id": "II",
            "labels": {"en": "II"},
            "description": "içiy (girl) - Female human"
        },
        {
            "id": "III",
            "labels": {"en": "III"},
            "description": "zer (cow) - Animal"
        },
        {
            "id": "IV",
            "labels": {"en": "IV"},
            "description": "kar (thing) - Inanimate"
        },
        {
            "id": "pl_I_II",
            "labels": {"en": "pl. I, II"},
            "description": "cəm insanar (human plural)"
        },
        {
            "id": "pl_III_IV",
            "labels": {"en": "pl. III, IV"},
            "description": "cəm həyvanar / karbı (nonhuman plural)"
        }
    ]

    lexemes = []
    lexeme_id = 1

    # Noun class mapping
    noun_class_map = {
        'I': 'I',
        'II': 'II',
        'III': 'III',
        'IV': 'IV',
        'pl. I, II': 'pl_I_II',
        'pl. III, IV': 'pl_III_IV'
    }

    # Load the Word document
    doc = Document(word_file)

    # Process each table in the document
    for table_idx, table in enumerate(doc.tables):
        if len(table.rows) < 4:
            print(f"  Skipping table {table_idx + 1}: too few rows")
            continue

        # Extract lemma from first row
        first_row = table.rows[0]
        lemma_cell = first_row.cells[0].text.strip()

        # Parse lemma and gloss from format: "lemma (translation1 / translation2 / translation3)"
        match = re.match(r'^([^\(]+)\s*\(([^)]+)\)', lemma_cell)
        if match:
            lemma = match.group(1).strip()
            gloss_parts = [g.strip() for g in match.group(2).split('/')]
            gloss = gloss_parts[0] if gloss_parts else ""
        else:
            print(f"  Warning: Could not parse lemma from '{lemma_cell[:50]}...'")
            lemma = lemma_cell
            gloss = ""

        # Extract TAME categories from rows 1-3 (only once, from first table)
        if not tame_categories:
            row_1 = table.rows[1]
            row_2 = table.rows[2]
            row_3 = table.rows[3]

            # Start from column 2 (skip first two columns: noun class and description)
            for col_idx in range(2, len(row_1.cells)):
                en_label = row_1.cells[col_idx].text.strip()
                ru_label = row_2.cells[col_idx].text.strip()
                azj_label = row_3.cells[col_idx].text.strip()

                if not en_label:
                    continue

                # Create ID from English label
                cat_id = en_label.lower().replace(' ', '_').replace('-', '_')

                category = {
                    "id": cat_id,
                    "labels": {"en": en_label}
                }
                if ru_label:
                    category["labels"]["ru"] = ru_label
                if azj_label:
                    category["labels"]["azj"] = azj_label

                tame_categories.append(category)

        # Create paradigm structure
        paradigm = {}
        for tame_cat in tame_categories:
            paradigm[tame_cat['id']] = {}

        # Process rows starting from row 4 (after header rows)
        for row_idx in range(4, len(table.rows)):
            row = table.rows[row_idx]
            first_col = row.cells[0].text.strip()

            # Check if this is a noun class row
            if first_col in noun_class_map:
                noun_class_id = noun_class_map[first_col]

                # Fill in forms for each TAME category (starting from column 2)
                for col_idx, tame_cat in enumerate(tame_categories):
                    cell_idx = col_idx + 2  # +2 to skip first two columns
                    if cell_idx < len(row.cells):
                        form = row.cells[cell_idx].text.strip()
                        paradigm[tame_cat['id']][noun_class_id] = form

        # Add lexeme
        lexemes.append({
            "id": f"lex_{lexeme_id:03d}",
            "lemma": lemma,
            "gloss": gloss,
            "paradigm": paradigm
        })

        print(f"  Added lexeme: {lemma} ({gloss})")
        lexeme_id += 1

    # Build final JSON structure
    output = {
        "projectType": "verb_table",
        "version": "1.0",
        "tables": [
            {
                "tableTitle": "Verb Paradigms",
                "tableAbbreviation": "VERB-TABLE",
                "dimensions": {
                    "rows": {
                        "label": "Noun Classes",
                        "categories": noun_class_categories
                    },
                    "columns": {
                        "label": "TAME Categories",
                        "categories": tame_categories
                    }
                },
                "lexemes": lexemes
            }
        ]
    }

    # Save to file
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Conversion complete!")
    print(f"Output saved to: {output_path}")
    print(f"Total lexemes: {len(lexemes)}")
    print(f"TAME categories: {len(tame_categories)}")
    print(f"Noun classes: {len(noun_class_categories)}")
    print(f"{'='*60}")


if __name__ == "__main__":
    # Check command-line arguments
    if len(sys.argv) < 2:
        print("Usage: python convert_word_to_verb_table.py <input_file.docx> [output_file.json]")
        print("Example: python convert_word_to_verb_table.py SampleWordDoc.docx")
        print("         python convert_word_to_verb_table.py SampleWordDoc.docx custom_output.json")
        sys.exit(1)

    # Get input path from command line
    word_file = sys.argv[1]

    # Determine output path
    if len(sys.argv) > 2:
        # Use custom output path if provided
        output_path = sys.argv[2]
    else:
        # Use the same name as the input file, with .json extension
        # Save in the current directory (where the script is run)
        input_basename = os.path.basename(word_file)
        output_filename = os.path.splitext(input_basename)[0] + '.json'
        output_path = output_filename

    # Process the document
    process_word_document(word_file, output_path)
