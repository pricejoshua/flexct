# -*- coding: utf-8 -*-
#
# example_integration.py
# Example showing how to integrate TextFilterDialog into a FlexTools module
#

"""
This example shows two ways to integrate the text filter dialog:

1. Simple integration - just get all text names
2. Advanced integration - use hierarchical organization and filtering
"""

from text_filter_dialog import (
    TextFilterDialog,
    create_organizer_by_description_prefix,
    create_organizer_by_genre
)


# ----------------------------------------------------------------
# Example 1: Simple - Just get all text names in a flat list
# ----------------------------------------------------------------

def example_simple_integration(project, parent_window=None):
    """
    Simplest integration: show all texts in a flat list.

    Args:
        project: FlexTools project object
        parent_window: tkinter parent window (create one if None)

    Returns:
        List of selected IStText objects, or None if cancelled
    """
    import tkinter as tk
    from SIL.LCModel import ITextRepository

    # Create parent window if needed
    if parent_window is None:
        parent_window = tk.Tk()
        parent_window.withdraw()

    cache = project.project
    sl = cache.ServiceLocator
    text_repo = sl.GetService(ITextRepository)

    # Create dialog
    dialog = TextFilterDialog(parent_window, "Select Texts to Export")

    # Load texts (no organization)
    dialog.load_texts_from_flex(cache, text_repo, organize_by=None)

    # Show and get result
    selected_texts = dialog.show()

    return selected_texts


# ----------------------------------------------------------------
# Example 2: Organize by Description field prefix
# ----------------------------------------------------------------

def example_organized_by_description(project, parent_window=None):
    """
    Organize texts by prefix in Description field.

    If a text's Description is "Narrative: The Fox Story", it will be
    grouped under "Narrative".

    Args:
        project: FlexTools project object
        parent_window: tkinter parent window (create one if None)

    Returns:
        List of selected IStText objects, or None if cancelled
    """
    import tkinter as tk
    from SIL.LCModel import ITextRepository

    if parent_window is None:
        parent_window = tk.Tk()
        parent_window.withdraw()

    cache = project.project
    sl = cache.ServiceLocator
    text_repo = sl.GetService(ITextRepository)

    # Create dialog
    dialog = TextFilterDialog(parent_window, "Select Texts to Export")
    dialog.set_label("Select texts to export (organized by type):")

    # Load texts with organization
    organizer = create_organizer_by_description_prefix(cache)
    dialog.load_texts_from_flex(cache, text_repo, organize_by=organizer)

    # Show and get result
    selected_texts = dialog.show()

    return selected_texts


# ----------------------------------------------------------------
# Example 3: Custom organization by genre
# ----------------------------------------------------------------

def example_organized_by_genre(project, parent_window=None):
    """
    Organize texts by genre (if available in FLEx).

    Args:
        project: FlexTools project object
        parent_window: tkinter parent window (create one if None)

    Returns:
        List of selected IStText objects, or None if cancelled
    """
    import tkinter as tk
    from SIL.LCModel import ITextRepository

    if parent_window is None:
        parent_window = tk.Tk()
        parent_window.withdraw()

    cache = project.project
    sl = cache.ServiceLocator
    text_repo = sl.GetService(ITextRepository)

    # Create dialog
    dialog = TextFilterDialog(parent_window, "Select Texts to Export")
    dialog.set_label("Select texts by genre:")

    # Load texts with genre organization
    organizer = create_organizer_by_genre(cache)
    dialog.load_texts_from_flex(cache, text_repo, organize_by=organizer)

    # Show and get result
    selected_texts = dialog.show()

    return selected_texts


# ----------------------------------------------------------------
# Example 4: With initial selection and pruning
# ----------------------------------------------------------------

def example_with_initial_selection(project, initially_selected=None,
                                  show_only=None, parent_window=None):
    """
    Advanced example with initial selection and pruning.

    Args:
        project: FlexTools project object
        initially_selected: list of IStText objects to check initially
        show_only: list of IStText objects to show (prune tree to these)
        parent_window: tkinter parent window (create one if None)

    Returns:
        List of selected IStText objects, or None if cancelled
    """
    import tkinter as tk
    from SIL.LCModel import ITextRepository

    if parent_window is None:
        parent_window = tk.Tk()
        parent_window.withdraw()

    cache = project.project
    sl = cache.ServiceLocator
    text_repo = sl.GetService(ITextRepository)

    # Create dialog
    dialog = TextFilterDialog(parent_window, "Select Texts to Export")

    # Load texts with organization
    organizer = create_organizer_by_description_prefix(cache)
    dialog.load_texts_from_flex(cache, text_repo, organize_by=organizer)

    # Set initial selection if provided
    if initially_selected:
        dialog.set_initial_selection(initially_selected)

    # Prune to specific texts if provided
    if show_only:
        dialog.prune_to_texts(show_only)

    # Show and get result
    selected_texts = dialog.show()

    return selected_texts


# ----------------------------------------------------------------
# Example 5: Custom multi-level organization
# ----------------------------------------------------------------

def example_custom_multilevel_organization(project, parent_window=None):
    """
    Create a custom multi-level organization.

    This example creates a 3-level hierarchy:
    - Genre (from genre field)
      - Year (extracted from date)
        - Text name

    Args:
        project: FlexTools project object
        parent_window: tkinter parent window

    Returns:
        List of selected IStText objects, or None if cancelled
    """
    import tkinter as tk
    from SIL.LCModel import ITextRepository
    from collections import OrderedDict

    if parent_window is None:
        parent_window = tk.Tk()
        parent_window.withdraw()

    cache = project.project
    sl = cache.ServiceLocator
    text_repo = sl.GetService(ITextRepository)

    # Create dialog
    dialog = TextFilterDialog(parent_window, "Select Texts to Export")

    # Build custom multi-level structure
    # Structure: genre -> year -> text
    hierarchy = OrderedDict()

    for text in text_repo.AllInstances():
        # Get title
        title = text.Name.BestVernacularAnalysisAlternative
        if not title or not hasattr(title, 'Text') or not title.Text:
            continue
        title_text = title.Text

        # Get genre
        genre = "Unknown Genre"
        if hasattr(text, 'GenresRC') and text.GenresRC.Count > 0:
            genre_obj = text.GenresRC.ToArray()[0]
            if hasattr(genre_obj, 'Name') and genre_obj.Name.BestAnalysisAlternative:
                genre = genre_obj.Name.BestAnalysisAlternative.Text

        # Get year from date recorded (if available)
        year = "Unknown Date"
        if hasattr(text, 'DateCreated') and text.DateCreated:
            year = str(text.DateCreated.Year)

        # Build hierarchy
        if genre not in hierarchy:
            hierarchy[genre] = OrderedDict()
        if year not in hierarchy[genre]:
            hierarchy[genre][year] = []

        hierarchy[genre][year].append((title_text, text))

    # Manually build tree with custom structure
    for genre, years in hierarchy.items():
        genre_node = dialog.tree_view.insert('', 'end', genre)

        for year, texts in years.items():
            year_node = dialog.tree_view.insert(genre_node, 'end', year)

            for title_text, text in sorted(texts):
                dialog.tree_view.insert(year_node, 'end', title_text, data=text)

    # Show and get result
    selected_texts = dialog.show()

    return selected_texts


# ----------------------------------------------------------------
# Example 6: Integration with marked texts (like your current system)
# ----------------------------------------------------------------

def example_with_marked_texts(project, parent_window=None):
    """
    Show only texts marked with 'y' in Description field,
    matching your current ExportTextsToJSON_UI.py behavior.

    Args:
        project: FlexTools project object
        parent_window: tkinter parent window

    Returns:
        List of selected IStText objects, or None if cancelled
    """
    import tkinter as tk
    from SIL.LCModel import ITextRepository

    if parent_window is None:
        parent_window = tk.Tk()
        parent_window.withdraw()

    cache = project.project
    sl = cache.ServiceLocator
    text_repo = sl.GetService(ITextRepository)
    wsa = cache.DefaultAnalWs

    # Filter to only marked texts
    marked_texts = []

    for text in text_repo.AllInstances():
        description = text.Description.get_String(wsa)
        if description is not None and hasattr(description, "Text") and description.Text:
            if description.Text.lower() == 'y':
                marked_texts.append(text)

    if not marked_texts:
        import tkinter.messagebox as messagebox
        messagebox.showwarning(
            "No Marked Texts",
            "No texts are marked with 'y' in the Description field.",
            parent=parent_window
        )
        return None

    # Create dialog
    dialog = TextFilterDialog(parent_window, "Select Marked Texts to Export")
    dialog.set_label(f"Found {len(marked_texts)} marked text(s). Select which to export:")

    # Load texts with organization
    organizer = create_organizer_by_description_prefix(cache)
    dialog.load_texts_from_flex(cache, text_repo, organize_by=organizer)

    # Prune to only marked texts
    dialog.prune_to_texts(marked_texts)

    # Initially select all marked texts
    dialog.set_initial_selection(marked_texts)

    # Show and get result
    selected_texts = dialog.show()

    return selected_texts
