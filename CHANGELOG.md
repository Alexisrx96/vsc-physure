# Changelog

## [0.2.0] - 2026-07-18

### Added
- **Live Results Evaluation (CodeLens)**: Evaluate `.phs` expressions directly in the editor with precise line tracking and inline `▶ Result:` displays.
- **Export Capabilities**: Export `.phs` files to standalone Python (`.py`) scripts or formatted Markdown (`.md`) calculation reports.
- **Python Interpreter Selection**: Command to easily select and persist workspace Python virtual environments.
- **Document Formatting**: Auto-formatting support for `.phs` files.

### Changed
- File extension updated to `.phs` (language id `phs`, grammar scope `source.phs`).
- Enhanced unit autocomplete and hover documentation support.

### Added
- Syntax highlighting for Physure Meta-Lang (`.phs`) files.
- Run the current `.phs` file via the configured Python interpreter.
- Interactive REPL: open a session, send the current line or selection.
- Real-time diagnostics for unexpected characters and unbalanced parentheses.
- Autocomplete for physical units, sourced live from the configured physure
  installation (falls back to a static list if the interpreter can't be queried).
- Hover documentation for units and variable definitions.
- Document outline (symbol) support for variable assignments.
