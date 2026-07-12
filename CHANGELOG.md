# Changelog

## [0.1.0] - 2026-07-11

### Added
- Syntax highlighting for MeasureKit Meta-Lang (`.mkml`) files.
- Run the current `.mkml` file via the configured Python interpreter.
- Interactive REPL: open a session, send the current line or selection.
- Real-time diagnostics for unexpected characters and unbalanced parentheses.
- Autocomplete for physical units, sourced live from the configured measurekit
  installation (falls back to a static list if the interpreter can't be queried).
- Hover documentation for units and variable definitions.
- Document outline (symbol) support for variable assignments.
