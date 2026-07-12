# vsc_measurekit — Marketplace Publish Readiness

Date: 2026-07-11

## Goal

Take the MeasureKit Meta-Lang (MKML) VS Code extension from an unpublished
v0.1.0 (no git repo, no tests, no CI, placeholder publisher) to something
installable from the VS Code Marketplace under a real publisher identity,
with functional correctness verified rather than assumed and a test suite
guarding the logic most likely to regress.

Publisher ID: `irvintorres`. Repository pointer: `github.com/Alexisrx96/vsc-measurekit`.

Actually creating the GitHub remote and running `vsce publish` are explicit,
manual, confirmed steps outside this work — this design only gets the repo
to the point where those two actions are all that's left.

## Current state (as of this read-through)

- `src/extension.ts` (~410 lines): single file mixing VS Code glue with
  pure logic (tokenizer/diagnostics regex, hover variable lookup, outline
  symbol extraction, Python interpreter discovery).
- No git repository, no tests, no CI, no `.vscodeignore`, no `CHANGELOG.md`.
- `package.json`: `publisher: "gemini"` (placeholder), no `repository`,
  `bugs`, `homepage`, `license`, or `keywords` fields.
- `engines.vscode: "^1.60.0"` — a 5+ year old floor, not deliberately chosen.
- Known correctness suspects to verify/fix:
  - `sendToRepl` sends text to a freshly spawned REPL terminal after a
    hardcoded `setTimeout(1000)` — racy if the shell/REPL is slow to start.
  - Diagnostics (`updateDiagnostics`) rescan the entire document on every
    `onDidChangeTextDocument` event with no debounce. Likely fine at typical
    `.mkml` file sizes, but unverified.

## Components

### 1. Version control & repo wiring
- `git init` (done), initial commit once the spec is in place.
- `.gitignore`: `node_modules/`, `out/`, `*.vsix`, `.vscode-test/`.
- `package.json` additions: `repository` (git+https URL), `bugs`, `homepage`,
  `license: "MIT"`, `keywords`, `publisher: "irvintorres"`.

### 2. Refactor for testability
Extract the VS-Code-API-free logic into `src/tokenizer.ts`:
- The token regex and diagnostic computation, taking a plain document text
  (string, or array of line strings) and returning structured diagnostics
  (line, range, message, severity) instead of `vscode.Diagnostic` directly.
- The backward variable-definition search used by both hover and outline.

`src/extension.ts` keeps only: activation wiring, `vscode.Diagnostic`
construction from the pure results, command registration, terminal
handling, and the `findPythonPath` filesystem walk (this one stays
Node-only but touches the real filesystem, so it's tested indirectly via
the manual smoke test rather than unit tests).

### 3. Correctness fixes
- `sendToRepl`: replace the blind 1s `setTimeout` with a deliberate,
  documented wait strategy — check if `vscode.window.onDidOpenTerminal` /
  shell integration events give a real "ready" signal; if not, keep a
  timeout but make the tradeoff explicit in a comment rather than silent.
- Diagnostics debounce: profile first (type into a large `.mkml` file,
  measure). Only add a debounce if it's measurably janky — don't add
  speculative debounce logic.
- `engines.vscode`: pick a real minimum version deliberately (e.g. match
  whatever `@types/vscode` version is installed) instead of carrying the
  scaffold default forward.

### 4. Test suite
- `node:test` + `node:assert` (Node stdlib, zero new dependencies) against
  the extracted `src/tokenizer.ts` functions.
- Coverage: valid tokens, unexpected characters (`BAD` group), unbalanced
  parens (both directions), comments stripped correctly, superscript
  sequences, variable-definition lookup (found / not found / shadowed by
  a later redefinition).
- `npm test` script; wired into CI (see below).

### 5. Packaging & Marketplace metadata
- `.vscodeignore` excluding `src/`, `.claude/`, `docs/`, test files, and
  dev-only config, keeping `out/`, `syntaxes/`, `icons/`, `language-configuration.json`,
  `README.md`, `LICENSE`, `icon.jpg`.
- `CHANGELOG.md` starting at `0.1.0`.
- Icon check: VS Code Marketplace recommends a 128×128 PNG; verify
  `icon.jpg` meets size/format expectations or convert it.
- Dry-run `npx vsce package` and `npx vsce ls` to confirm the produced
  `.vsix` file list matches intent (no stray dev files, nothing missing).

### 6. CI
Minimal GitHub Actions workflow (`.github/workflows/ci.yml`): on push/PR,
`npm ci` → `npm run compile` → `npm test`. No publish step — `vsce publish`
stays manual.

## Out of scope
- Running `vsce publish` / actual Marketplace submission.
- Creating the GitHub remote repository.
- Any work on the `measurekit` (core library) or `measurekit-landing`
  repos — separate follow-up passes, tracked independently.

## Testing strategy
- Unit tests (`node:test`) on all extracted pure logic.
- `tsc --strict` (already configured in `tsconfig.json`) as the type gate,
  run via `npm run compile`.
- Manual smoke test at the end: `vsce package`, install the resulting
  `.vsix` in a real VS Code instance, open a sample `.mkml` file, verify
  syntax highlighting, diagnostics, hover, outline, "Run Current MKML File",
  and REPL send/open all work end to end.

## Amendment (2026-07-11): live unit data source

During implementation, user feedback flagged that `STANDARD_UNITS` (originally
scoped as a straight extraction of the existing ~60-entry hardcoded list) does
not reflect the real `measurekit` library's unit registry. Changed to: query
the configured Python interpreter's live `measurekit` installation
(`measurekit.get_active_system().UNIT_SYMBOL_REGISTRY`) for autocomplete/hover
data, caching per interpreter for the session, falling back to the static
list if the interpreter can't be queried (missing, measurekit not installed,
timeout, bad output). See the implementation plan's Task 3 for the verified
query and exact design. This adds `src/units.ts` (untested directly, since it
does real subprocess I/O — same rationale as `findPythonPath`) and two new
pure, tested functions in `src/tokenizer.ts` (`filterValidUnitSymbols`,
`parseUnitListJson`).
