# Physure (PHS) VS Code Extension 🚀

This extension provides comprehensive native support for the **Physure Meta-Lang (PHS)** (.phs) syntax in Visual Studio Code, Cursor, and related VS Code forks.

## Features ✨

*   **Live Results Evaluation (CodeLens)**: Evaluate `.phs` calculations on demand directly within the editor. Displays `▶ Result:` annotations aligned with exact line numbers.
*   **Export Tools**:
    *   **Export to Python (.py)**: Convert `.phs` engineering notes into executable Python scripts using Physure quantity objects.
    *   **Export to Markdown (.md)**: Generate clean Markdown calculation reports complete with summary tables.
*   **Robust Syntax Highlighting**: Semantic coloring for comments (`#`), numbers, physical units, conversion operators (`=>` / `->`), assertions (`==`), uncertainties (`+/-` or `±`), variables, superscripts, and functions.
*   **Rapid File Execution**: Run the active `.phs` file using your configured Python virtual environment.
*   **Interactive REPL Integration**:
    *   Initialize an interactive Physure REPL session in the integrated terminal.
    *   Send selected text or line to the REPL (`Shift + Enter`).
*   **Python Interpreter Selector**: Quick picker command to select the active Python virtual environment containing the `physure` library.
*   **Real-Time Diagnostics**: Inline error reporting for unexpected characters, syntax errors, and unbalanced parentheses.
*   **Unit Autocomplete & Hover Docs**: Live unit suggestions from your active Physure environment and hover descriptions for variables and units.
*   **Document Outline**: Variable and function definitions appear in the Outline view (`Ctrl+Shift+O`).

## Keyboard Shortcuts ⌨️

| Action | Shortcut (Linux/Windows) | Shortcut (macOS) |
|---|---|---|
| **Run Current PHS File** | `F5` or `Ctrl + Alt + N` | `F5` or `Cmd + Alt + N` |
| **Send Line/Selection to REPL** | `Shift + Enter` | `Shift + Enter` |

## Installation & Configuration ⚙️

### 1. Manual Installation
To install this extension locally, create a symbolic link pointing to the extension directory inside your editor's extension folder. Run this from inside your clone of this repo:

**Linux / macOS:**
```bash
# Standard VS Code / Cursor:
ln -s "$(pwd)" ~/.vscode/extensions/vsc-physure

# VS Code OSS / VSCodium:
ln -s "$(pwd)" ~/.vscode-oss/extensions/vsc-physure
```

### 2. Installing the `physure` Python Library 🐍

The extension requires the `physure` Python package to execute calculations, live previews, and exported scripts.

#### Option A: Direct Command Palette Setup (Recommended)
Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and run:
`Physure: Install physure Python Package (pip)`

#### Option B: Terminal Installation
Run one of the following commands in your shell:

```bash
# Install in active virtual environment (.venv)
pip install physure

# Install globally for user PATH
pip install --user physure

# Install in editable mode for local development
pip install -e /path/to/physure-python
```

> 💡 **Automatic Setup**: If `physure` is missing when selecting an interpreter or running a file, the extension will automatically show a prompt asking if you want to install it into your active environment or user PATH via `pip`.

### 3. Graphical Configuration
The Python interpreter and virtual environment path can be customized directly in the VS Code graphical settings interface:
1. Open VS Code Settings (`Ctrl + ,` or `Cmd + ,`).
2. Search for `Physure`.
3. Configure the **Python Path** property (`vsc-physure.pythonPath`).

Alternatively, add the setting directly to your `settings.json`:
```json
"vsc-physure.pythonPath": "/path/to/your/.venv/bin/python3"
```
By default, the extension automatically attempts to locate the virtual environment (`.venv`) at your workspace root or by traversing directories upward from the open file.

