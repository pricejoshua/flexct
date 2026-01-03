# -*- coding: utf-8 -*-
#
# text_filter_dialog.py
# Hierarchical text selection dialog for FlexTools modules
#
# Provides a tri-state tree view for selecting FLEx texts organized hierarchically
#

import tkinter as tk
from tkinter import ttk
from typing import List, Set, Optional, Dict, Any
from collections import OrderedDict


class TriStateTreeView:
    """
    A tree view widget with tri-state checkboxes supporting arbitrary nesting depth.

    States:
    - checked: all descendants are checked
    - unchecked: no descendants are checked
    - indeterminate: some descendants are checked
    """

    # Unicode symbols for checkbox states
    CHECKED = "☑"
    UNCHECKED = "☐"
    INDETERMINATE = "▣"

    def __init__(self, parent):
        self.frame = ttk.Frame(parent)

        # Create tree with scrollbars
        self.tree = ttk.Treeview(self.frame, selectmode='browse')
        self.tree.pack(side='left', fill='both', expand=True)

        scrollbar_y = ttk.Scrollbar(self.frame, orient='vertical', command=self.tree.yview)
        scrollbar_y.pack(side='right', fill='y')
        self.tree.configure(yscrollcommand=scrollbar_y.set)

        scrollbar_x = ttk.Scrollbar(self.frame, orient='horizontal', command=self.tree.xview)
        scrollbar_x.pack(side='bottom', fill='x')
        self.tree.configure(xscrollcommand=scrollbar_x.set)

        # Track node states and data
        self._node_states = {}  # node_id -> bool (checked state)
        self._node_data = {}    # node_id -> associated data object

        # Bind events
        self.tree.bind('<space>', self._on_space_press)
        self.tree.bind('<Button-1>', self._on_click)
        self.tree.bind('<Double-Button-1>', self._on_double_click)

    def pack(self, **kwargs):
        """Pack the frame"""
        self.frame.pack(**kwargs)

    def grid(self, **kwargs):
        """Grid the frame"""
        self.frame.grid(**kwargs)

    def insert(self, parent, index, text, data=None, checked=False, tags=()):
        """
        Insert a node into the tree.

        Args:
            parent: parent node ID ('' for root)
            index: position ('end' for append)
            text: display text
            data: associated data object (e.g., IStText)
            checked: initial checked state
            tags: additional tags

        Returns:
            node_id of inserted item
        """
        display_text = f"{self.UNCHECKED} {text}"
        node_id = self.tree.insert(parent, index, text=display_text, tags=tags)
        self._node_states[node_id] = False
        self._node_data[node_id] = data

        if checked:
            self._set_node_checked(node_id, True, cascade=True)

        return node_id

    def _get_display_text(self, node_id):
        """Get the text without the checkbox symbol"""
        current = self.tree.item(node_id, 'text')
        # Remove checkbox symbols
        for symbol in [self.CHECKED, self.UNCHECKED, self.INDETERMINATE]:
            current = current.replace(symbol + " ", "")
        return current

    def _update_display(self, node_id):
        """Update the visual state of a node"""
        state = self._get_node_state(node_id)
        text = self._get_display_text(node_id)

        if state is True:
            symbol = self.CHECKED
        elif state is False:
            symbol = self.UNCHECKED
        else:
            symbol = self.INDETERMINATE

        self.tree.item(node_id, text=f"{symbol} {text}")

    def _get_node_state(self, node_id):
        """
        Get the tri-state value of a node.

        Returns:
            True: checked
            False: unchecked
            None: indeterminate
        """
        children = self.tree.get_children(node_id)

        if not children:
            # Leaf node
            return self._node_states.get(node_id, False)

        # Non-leaf: calculate from children
        child_states = [self._get_node_state(child) for child in children]

        if all(s is True for s in child_states):
            return True
        elif all(s is False for s in child_states):
            return False
        else:
            return None  # Indeterminate

    def _set_node_checked(self, node_id, checked, cascade=True):
        """
        Set the checked state of a node.

        Args:
            node_id: node to update
            checked: True/False
            cascade: if True, update all descendants
        """
        self._node_states[node_id] = checked

        if cascade:
            # Update all descendants
            for child in self.tree.get_children(node_id):
                self._set_node_checked(child, checked, cascade=True)

        # Update display
        self._update_display(node_id)

        # Update ancestors
        parent = self.tree.parent(node_id)
        if parent:
            self._update_ancestor_states(parent)

    def _update_ancestor_states(self, node_id):
        """Recursively update ancestor states based on descendants"""
        self._update_display(node_id)

        parent = self.tree.parent(node_id)
        if parent:
            self._update_ancestor_states(parent)

    def _toggle_node(self, node_id):
        """Toggle a node's checked state"""
        current_state = self._get_node_state(node_id)

        # If indeterminate or unchecked -> check
        # If checked -> uncheck
        new_state = False if current_state is True else True

        self._set_node_checked(node_id, new_state, cascade=True)

    def _on_space_press(self, event):
        """Handle space key press"""
        selection = self.tree.selection()
        if selection:
            self._toggle_node(selection[0])
        return 'break'

    def _on_click(self, event):
        """Handle single click"""
        item = self.tree.identify_row(event.y)
        if item:
            # Just select, don't toggle
            self.tree.selection_set(item)

    def _on_double_click(self, event):
        """Handle double click - toggle the node"""
        item = self.tree.identify_row(event.y)
        if item:
            self._toggle_node(item)
        return 'break'

    def get_checked_data(self):
        """
        Get all data objects associated with checked nodes.

        Returns:
            List of data objects in preorder traversal order (deduplicated)
        """
        result = []
        seen = set()

        def traverse(node_id):
            state = self._get_node_state(node_id)
            data = self._node_data.get(node_id)

            # If checked or indeterminate, include this node's data
            if state is True and data is not None:
                # Use id() for deduplication since we can't rely on __hash__
                data_id = id(data)
                if data_id not in seen:
                    seen.add(data_id)
                    result.append(data)

            # Traverse children (even if parent is checked, in case of indeterminate)
            for child in self.tree.get_children(node_id):
                traverse(child)

        # Start from all root nodes
        for root in self.tree.get_children(''):
            traverse(root)

        return result

    def set_checked_data(self, data_objects):
        """
        Check nodes associated with given data objects.

        Args:
            data_objects: iterable of data objects to check
        """
        data_set = set(id(obj) for obj in data_objects)

        def update_tree(node_id):
            data = self._node_data.get(node_id)
            if data is not None and id(data) in data_set:
                self._set_node_checked(node_id, True, cascade=False)

            for child in self.tree.get_children(node_id):
                update_tree(child)

        # Update all nodes
        for root in self.tree.get_children(''):
            update_tree(root)

        # Now update ancestors
        for root in self.tree.get_children(''):
            self._update_display_recursive(root)

    def _update_display_recursive(self, node_id):
        """Recursively update display for node and all descendants"""
        for child in self.tree.get_children(node_id):
            self._update_display_recursive(child)
        self._update_display(node_id)

    def prune_to_data(self, data_objects):
        """
        Show only nodes that match data_objects or are ancestors of matches.

        Args:
            data_objects: iterable of data objects to keep visible
        """
        if not data_objects:
            return

        data_set = set(id(obj) for obj in data_objects)
        nodes_to_keep = set()

        def mark_keepers(node_id):
            """Mark this node and ancestors if it contains target data"""
            data = self._node_data.get(node_id)
            keep = False

            # Check children first
            for child in self.tree.get_children(node_id):
                if mark_keepers(child):
                    keep = True

            # Check this node
            if data is not None and id(data) in data_set:
                keep = True

            if keep:
                nodes_to_keep.add(node_id)
                # Mark all ancestors
                parent = self.tree.parent(node_id)
                while parent:
                    nodes_to_keep.add(parent)
                    parent = self.tree.parent(parent)

            return keep

        # Find keepers
        for root in self.tree.get_children(''):
            mark_keepers(root)

        # Remove non-keepers
        def remove_non_keepers(node_id):
            children = list(self.tree.get_children(node_id))
            for child in children:
                if child not in nodes_to_keep:
                    self.tree.delete(child)
                else:
                    remove_non_keepers(child)

        # Start pruning from roots
        roots = list(self.tree.get_children(''))
        for root in roots:
            if root not in nodes_to_keep:
                self.tree.delete(root)
            else:
                remove_non_keepers(root)


class TextFilterDialog:
    """
    Modal dialog for selecting FLEx texts using a hierarchical tree view.

    Features:
    - Tri-state checkboxes with arbitrary nesting depth
    - Initial selection support
    - Pruning to show only specific texts
    - Keyboard accessible (Space=toggle, Enter=OK, Esc=Cancel)
    """

    def __init__(self, parent, title="Select Texts"):
        """
        Initialize the dialog.

        Args:
            parent: parent window
            title: dialog title
        """
        self.parent = parent
        self.result = None
        self.tree_label = "Select texts to export:"

        # Create modal dialog
        self.dialog = tk.Toplevel(parent)
        self.dialog.title(title)
        self.dialog.transient(parent)
        self.dialog.grab_set()

        # Set minimum size
        self.dialog.minsize(400, 300)
        self.dialog.geometry("600x500")

        self._build_ui()

        # Bind keyboard shortcuts
        self.dialog.bind('<Return>', lambda e: self._on_ok())
        self.dialog.bind('<Escape>', lambda e: self._on_cancel())

        # Center on parent
        self.dialog.update_idletasks()
        x = parent.winfo_rootx() + (parent.winfo_width() // 2) - (self.dialog.winfo_width() // 2)
        y = parent.winfo_rooty() + (parent.winfo_height() // 2) - (self.dialog.winfo_height() // 2)
        self.dialog.geometry(f"+{x}+{y}")

    def _build_ui(self):
        """Build the dialog UI"""
        # Main container
        main_frame = ttk.Frame(self.dialog, padding=10)
        main_frame.pack(fill='both', expand=True)

        # Label
        self.label = ttk.Label(main_frame, text=self.tree_label)
        self.label.pack(anchor='w', pady=(0, 5))

        # Tree view
        self.tree_view = TriStateTreeView(main_frame)
        self.tree_view.pack(fill='both', expand=True, pady=(0, 10))

        # Status label
        self.status_label = ttk.Label(main_frame, text="")
        self.status_label.pack(anchor='w', pady=(0, 10))

        # Button frame
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill='x')

        self.ok_button = ttk.Button(button_frame, text="OK", command=self._on_ok)
        self.ok_button.pack(side='right', padx=(5, 0))

        self.cancel_button = ttk.Button(button_frame, text="Cancel", command=self._on_cancel)
        self.cancel_button.pack(side='right')

    def set_label(self, text):
        """Set the label text above the tree"""
        self.tree_label = text
        if hasattr(self, 'label'):
            self.label.config(text=text)

    def _is_scripture_text(self, text, cache):
        """
        Check if a text is part of scripture.

        Args:
            text: IStText object
            cache: FLEx LcmCache

        Returns:
            True if text is scripture, False otherwise
        """
        try:
            # Scripture texts are owned by ScrSection objects
            # Navigate up the ownership chain to check
            owner = text.Owner
            while owner is not None:
                class_name = owner.ClassName
                if class_name == 'ScrSection' or class_name == 'ScrBook':
                    return True
                if hasattr(owner, 'Owner'):
                    owner = owner.Owner
                else:
                    break
            return False
        except:
            return False

    def load_texts_from_flex(self, cache, text_repo=None, organize_by=None,
                            texts_to_show=None, exclude_scripture=True):
        """
        Load texts from FLEx into the tree.

        Args:
            cache: FLEx LcmCache object
            text_repo: ITextRepository (optional, will get from cache if not provided)
            organize_by: function(text) -> category_name to organize texts (optional)
            texts_to_show: iterable of IStText to show (optional, shows all if None)
            exclude_scripture: if True, filter out scripture texts (default: True)
        """
        from SIL.LCModel import ITextRepository

        if text_repo is None:
            sl = cache.ServiceLocator
            text_repo = sl.GetService(ITextRepository)

        # Get all texts or use provided subset
        if texts_to_show is not None:
            all_texts = list(texts_to_show)
        else:
            all_texts = list(text_repo.AllInstances())

        # Filter out scripture texts if requested
        if exclude_scripture:
            try:
                from SIL.LCModel import IScrBookRepository
                sl = cache.ServiceLocator

                # Check if scripture exists
                scr_repo = sl.GetService(IScrBookRepository)
                has_scripture = any(scr_repo.AllInstances())

                if has_scripture:
                    # Filter out scripture texts
                    # Check if text is part of scripture by checking its owner
                    all_texts = [text for text in all_texts
                               if not self._is_scripture_text(text, cache)]
            except:
                # If scripture checking fails, continue with all texts
                pass

        # Organize texts into categories
        categories = OrderedDict()
        uncategorized = []

        for text in all_texts:
            # Get title
            title = text.Name.BestVernacularAnalysisAlternative
            if not title or not hasattr(title, 'Text') or not title.Text:
                continue

            title_text = title.Text

            # Organize if function provided
            if organize_by:
                category = organize_by(text)
                if category:
                    if category not in categories:
                        categories[category] = []
                    categories[category].append((title_text, text))
                else:
                    uncategorized.append((title_text, text))
            else:
                uncategorized.append((title_text, text))

        # Build tree
        if categories:
            for category_name, texts in categories.items():
                category_node = self.tree_view.insert('', 'end', category_name)
                for title_text, text in sorted(texts):
                    self.tree_view.insert(category_node, 'end', title_text, data=text)

        if uncategorized:
            if categories:
                # Add "Other" category
                other_node = self.tree_view.insert('', 'end', "Other")
                for title_text, text in sorted(uncategorized):
                    self.tree_view.insert(other_node, 'end', title_text, data=text)
            else:
                # No categories, add directly to root
                for title_text, text in sorted(uncategorized):
                    self.tree_view.insert('', 'end', title_text, data=text)

        self._update_status()

    def load_texts_simple(self, text_dict):
        """
        Load texts from a simple dictionary structure.

        Args:
            text_dict: dict mapping category -> [(name, text_object), ...]
                      or list of (name, text_object) tuples
        """
        if isinstance(text_dict, dict):
            for category_name, texts in text_dict.items():
                category_node = self.tree_view.insert('', 'end', category_name)
                for title_text, text in texts:
                    self.tree_view.insert(category_node, 'end', title_text, data=text)
        else:
            # Flat list
            for title_text, text in text_dict:
                self.tree_view.insert('', 'end', title_text, data=text)

        self._update_status()

    def set_initial_selection(self, text_objects):
        """
        Set which texts are initially checked.

        Args:
            text_objects: iterable of text objects to check
        """
        self.tree_view.set_checked_data(text_objects)
        self._update_status()

    def prune_to_texts(self, text_objects):
        """
        Show only specified texts and their ancestor paths.

        Args:
            text_objects: iterable of text objects to show
        """
        self.tree_view.prune_to_data(text_objects)

    def _update_status(self):
        """Update the status label with selection count"""
        checked = self.tree_view.get_checked_data()
        count = len(checked)
        self.status_label.config(text=f"{count} text(s) selected")

    def _on_ok(self):
        """Handle OK button"""
        self.result = self.tree_view.get_checked_data()

        if not self.result:
            # Show warning
            import tkinter.messagebox as messagebox
            response = messagebox.askyesno(
                "No Selection",
                "No texts are selected. Export with empty selection?",
                parent=self.dialog
            )
            if not response:
                return

        self.dialog.destroy()

    def _on_cancel(self):
        """Handle Cancel button"""
        self.result = None
        self.dialog.destroy()

    def show(self):
        """
        Show the dialog and wait for result.

        Returns:
            List of selected text objects, or None if cancelled
        """
        # Wait for dialog to close
        self.parent.wait_window(self.dialog)
        return self.result


def create_organizer_by_description_prefix(cache):
    """
    Factory function: create an organizer that groups texts by Description field prefix.

    Returns a function that extracts category from text Description field.
    Text descriptions like "Narrative: Story name" -> category "Narrative"
    """
    wsa = cache.DefaultAnalWs

    def organizer(text):
        description = text.Description.get_String(wsa)
        if description is not None and hasattr(description, "Text") and description.Text:
            desc_text = description.Text
            # Look for prefix before colon or hyphen
            for separator in [':', '-', '|']:
                if separator in desc_text:
                    return desc_text.split(separator)[0].strip()
        return None

    return organizer


def create_organizer_by_genre(cache):
    """
    Factory function: create an organizer that groups texts by genre (if available in FLEx).

    Returns a function that extracts genre from text.
    """
    def organizer(text):
        # Check if text has genre property
        if hasattr(text, 'GenresRC') and text.GenresRC.Count > 0:
            genre = text.GenresRC.ToArray()[0]
            if hasattr(genre, 'Name') and genre.Name.BestAnalysisAlternative:
                return genre.Name.BestAnalysisAlternative.Text
        return None

    return organizer


# Example usage (for testing/documentation)
if __name__ == "__main__":
    # Simple example without FLEx
    root = tk.Tk()
    root.withdraw()

    # Create sample data
    sample_texts = {
        "Narratives": [
            ("The Fox and the Rooster", "text1"),
            ("The Bear Story", "text2"),
        ],
        "Procedural": [
            ("How to Make Tea", "text3"),
            ("Cooking Instructions", "text4"),
        ],
        "Expository": [
            ("About Our Village", "text5"),
        ]
    }

    dialog = TextFilterDialog(root, "Select Texts to Export")
    dialog.load_texts_simple(sample_texts)
    dialog.set_initial_selection(["text1", "text3"])

    result = dialog.show()

    if result:
        print(f"Selected: {result}")
    else:
        print("Cancelled")
