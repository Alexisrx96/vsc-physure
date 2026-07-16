# Changelog

## [Unreleased]

### Changed
- File extension renamed from `.mkml` to `.phs` (language id `mkml` -> `phs`,
  grammar scope `source.mkml` -> `source.phs`). Existing `.mkml` files must be
  renamed manually.

## [0.1.0] - 2026-07-11

### Added
- Syntax highlighting for Physure Meta-Lang (`.phs`) files.
- Run the current `.phs` file via the configured Python interpreter.
- Interactive REPL: open a session, send the current line or selection.
- Real-time diagnostics for unexpected characters and unbalanced parentheses.
- Autocomplete for physical units, sourced live from the configured physure
  installation (falls back to a static list if the interpreter can't be queried).
- Hover documentation for units and variable definitions.
- Document outline (symbol) support for variable assignments.
