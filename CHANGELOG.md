# Changelog

## [0.2.3] - 2026-07-20

### Fixed
- `phs` binary and `physure-lsp` server detection now append `.exe` on Windows and check `~/.cargo/bin`, so a `cargo install`-ed native binary is found even outside a Cargo workspace folder.
- Interpreter/binary lookup fallback now uses `where` on Windows instead of the POSIX-only `which`, which previously failed silently.

## [0.2.2] - 2026-07-20

### Added
- Native standalone Rust `phs` binary launcher for `runFile` and `openRepl` commands.
- `vsc-physure.newFile` command ("Physure: New PHS File") with `#!/usr/bin/env phs` shebang template.
- FirstLine regex pattern (`^#!.*\bphs\b`) to auto-detect PHS shebang scripts.
- Added `vsc-physure.phsBinaryPath` configuration setting.
- Native Rust PHS engine support and integration with `phs` standalone binary CLI for sub-millisecond document evaluations.
- Real-time PHS diagnostics and completion items accelerated by `physure-lsp` Rust server.

### Changed
- Direct execution of `.phs` script files (`python -m physure file.phs`) without shell redirection for improved cross-platform and Windows terminal compatibility.

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
