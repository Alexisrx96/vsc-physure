# MeasureKit (MKML) VS Code Extension 🚀

This extension provides comprehensive native support for the **MeasureKit Meta-Lang (MKML)** (.mkml) syntax in Visual Studio Code, Cursor, and related VS Code forks.

## Features ✨

*   **Robust Syntax Highlighting**: Semantic coloring for comments (`#`), numbers, physical units, conversion operators (`=>` / `->`), assertions (`==`), uncertainties (`+/-` or `±`), variables, and superscripts (exponents).
*   **Rapid File Execution**: Run the active `.mkml` file using the configured Python virtual environment.
*   **Interactive REPL Integration**:
    *   Initialize an interactive MeasureKit REPL session directly in the integrated terminal.
    *   Send the current line or selection to the REPL via keyboard shortcuts for efficient prototyping.
*   **Real-Time Diagnostics**: Inline errors for unexpected characters and unbalanced parentheses as you type.
*   **Unit Autocomplete**: Suggests physical units as you type, sourced live from your configured `measurekit` installation (falls back to a built-in list if the interpreter can't be queried).
*   **Hover Documentation**: Hover a unit for a quick description, or a variable to see where it was defined.
*   **Document Outline**: Every variable assignment shows up in the Outline view (`Ctrl+Shift+O`) for quick navigation.

## Keyboard Shortcuts ⌨️

| Action | Shortcut (Linux/Windows) | Shortcut (macOS) |
|---|---|---|
| **Run Current MKML File** | `Ctrl + Alt + N` | `Cmd + Alt + N` |
| **Send Line/Selection to REPL** | `Shift + Enter` | `Shift + Enter` |

## Installation & Configuration ⚙️

### 1. Manual Installation
To install this extension locally, create a symbolic link pointing to the extension directory inside your editor's extension folder. Run this from inside your clone of this repo:

**Linux / macOS:**
```bash
# Standard VS Code / Cursor:
ln -s "$(pwd)" ~/.vscode/extensions/vsc-measurekit

# VS Code OSS / VSCodium:
ln -s "$(pwd)" ~/.vscode-oss/extensions/vsc-measurekit
```

### 2. Graphical Configuration
The Python interpreter and virtual environment path can be customized directly in the VS Code graphical settings interface:
1. Open VS Code Settings (`Ctrl + ,` or `Cmd + ,`).
2. Search for `MeasureKit`.
3. Configure the **Python Path** property (`vsc-measurekit.pythonPath`).

Alternatively, add the setting directly to your `settings.json`:
```json
"vsc-measurekit.pythonPath": "/path/to/your/.venv/bin/python3"
```
By default, the extension automatically attempts to locate the virtual environment (`.venv`) at your workspace root or by traversing directories upward from the open file.
