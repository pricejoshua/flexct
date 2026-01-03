import pandas as pd
import json
import re

# Read the Excel file
df = pd.read_excel(r'C:\Users\swag_\Downloads\verbs_5.xlsx')
df = df.fillna('')

# The first column contains lemma info (with translations) for the first verb
# Row 0: English column headers (Potential, Perfective, etc.)
# Row 1: Russian translations
# Row 2: Azerbaijani translations
# Row 3+: Noun class rows (I, II, III, IV, pl. I,II, pl. III,IV)

# Extract column headers from the first three rows
en_headers = df.iloc[0].tolist()
ru_headers = df.iloc[1].tolist()
azj_headers = df.iloc[2].tolist()

# The columns are: [lemma_col, description_col, TAME1, TAME2, ...]
# First column has lemma info, second has noun class descriptions
lemma_column = df.columns[0]

# Build TAME categories from columns 2 onwards
tame_categories = []
for i in range(2, len(df.columns)):
    en_label = en_headers[i].strip() if en_headers[i] else f"col_{i}"
    ru_label = ru_headers[i].strip() if ru_headers[i] else ""
    azj_label = azj_headers[i].strip() if azj_headers[i] else ""

    # Create ID from English label (lowercase, replace spaces with underscores)
    cat_id = en_label.lower().replace(' ', '_').replace('-', '_')

    category = {
        "id": cat_id,
        "labels": {
            "en": en_label
        }
    }
    if ru_label:
        category["labels"]["ru"] = ru_label
    if azj_label:
        category["labels"]["azj"] = azj_label

    tame_categories.append(category)

# Noun class categories (rows)
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

# Process lexemes
lexemes = []
lexeme_id = 1

# First lexeme info is in row 0 (the column header itself)
first_lemma_header = str(df.columns[0]).strip()
match = re.match(r'^([^\(]+)\s*\(([^)]+)\)', first_lemma_header)
if match:
    first_lemma = match.group(1).strip()
    gloss_parts = [g.strip() for g in match.group(2).split('/')]
    first_gloss = gloss_parts[0] if gloss_parts else ""
else:
    first_lemma = first_lemma_header
    first_gloss = ""

# Start from row 3 (after header rows 0-2)
i = 3
current_lemma = first_lemma
current_gloss = first_gloss

while i < len(df):
    row = df.iloc[i]
    first_col = str(row[lemma_column]).strip()

    # Check if this is a new lemma row (full title with translations)
    if first_col and '(' in first_col and ')' in first_col:
        # This is a new lexeme header
        match = re.match(r'^([^\(]+)\s*\(([^)]+)\)', first_col)
        if match:
            current_lemma = match.group(1).strip()
            gloss_parts = [g.strip() for g in match.group(2).split('/')]
            current_gloss = gloss_parts[0] if gloss_parts else ""
        else:
            current_lemma = first_col
            current_gloss = ""
        i += 1
        continue

    # Check if this is a noun class row that starts a paradigm
    if first_col in ['I', 'II', 'III', 'IV', 'pl. I, II', 'pl. III, IV']:
        # We're starting a new paradigm - use current lemma
        lemma = current_lemma
        gloss = current_gloss

        # Create paradigm structure
        paradigm = {}
        for tame_cat in tame_categories:
            paradigm[tame_cat['id']] = {}

        # Read the next rows for this lexeme (up to 6 noun classes + blank rows)
        # We need to find rows with noun class markers
        lexeme_rows = []
        j = i
        while j < len(df) and j < i + 15:  # Look ahead up to 15 rows
            row_data = df.iloc[j]
            first_val = str(row_data[lemma_column]).strip()

            # Stop if we hit the next lexeme (has parentheses)
            if first_val and '(' in first_val and ')' in first_val and j > i:
                break

            lexeme_rows.append(row_data)
            j += 1

        # Map noun class rows
        noun_class_map = {
            'I': 'I',
            'II': 'II',
            'III': 'III',
            'IV': 'IV',
            'pl. I, II': 'pl_I_II',
            'pl. III, IV': 'pl_III_IV'
        }

        # Process each row to fill paradigm
        for row_data in lexeme_rows:
            first_val = str(row_data[lemma_column]).strip()

            if first_val in noun_class_map:
                noun_class_id = noun_class_map[first_val]

                # Fill in forms for each TAME category
                for col_idx, tame_cat in enumerate(tame_categories):
                    form = str(row_data.iloc[col_idx + 2]).strip()  # +2 because first two columns are lemma/description
                    paradigm[tame_cat['id']][noun_class_id] = form

        # Add lexeme
        lexemes.append({
            "id": f"lex_{lexeme_id:03d}",
            "lemma": lemma,
            "gloss": gloss,
            "paradigm": paradigm
        })

        lexeme_id += 1
        i = j  # Move to next position
    else:
        i += 1

# Build final JSON structure
output = {
    "projectType": "verb_table",
    "version": "1.0",
    "tables": [
        {
            "tableTitle": "Udi Verb Paradigms",
            "tableAbbreviation": "UDI-V",
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
output_path = r'C:\Users\swag_\Downloads\udi_verb_paradigms.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Conversion complete!")
print(f"Output saved to: {output_path}")
print(f"Total lexemes: {len(lexemes)}")
print(f"TAME categories: {len(tame_categories)}")
print(f"Noun classes: {len(noun_class_categories)}")
