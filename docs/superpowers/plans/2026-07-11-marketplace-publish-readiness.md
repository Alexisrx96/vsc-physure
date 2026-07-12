# vsc_measurekit Marketplace Publish Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the vsc_measurekit VS Code extension (currently unpublished v0.1.0, no tests, no CI, placeholder publisher) to a state where the only remaining steps are creating the GitHub remote and running `vsce publish`.

**Architecture:** Extract the VS-Code-API-free logic (tokenizer/diagnostics, hover variable lookup, outline symbol extraction) out of `src/extension.ts` into a plain `src/tokenizer.ts` module with zero `vscode` imports, so it's testable with Node's built-in test runner. `extension.ts` keeps only VS Code glue: activation, commands, providers that call into the pure functions and translate results into `vscode.*` types. Unit autocomplete/hover data is sourced live from the configured Python interpreter's actual `measurekit` installation (via a small `src/units.ts` subprocess helper), falling back to a static list when that's unavailable. Packaging metadata, `.vscodeignore`, `CHANGELOG.md`, and a CI workflow round out Marketplace readiness.

**Tech Stack:** TypeScript 5.9 (strict mode, already configured), `node:test` + `node:assert/strict` (Node stdlib, zero new runtime deps), `@vscode/vsce` (new devDependency, for packaging), GitHub Actions.

Spec: `docs/superpowers/specs/2026-07-11-marketplace-publish-readiness-design.md` (amended 2026-07-11 — see "Amendment" section at the bottom: unit data source changed from a static hardcoded list to a live query against the configured interpreter's `measurekit` installation).

---

### Task 1: package.json metadata + .gitignore

**Status: DONE (landed in commits 6b2542d, 00a77be)**

---

### Task 2: Extract pure tokenizer/diagnostics logic with tests

**Status: DONE (landed in commit 5bbdad4)**

---

### Task 3: Dynamic unit list from the configured interpreter

**Files:**
- Modify: `src/tokenizer.ts` (add two pure functions)
- Modify: `src/test/tokenizer.test.ts` (add tests for them)
- Create: `src/units.ts`

**Why:** `STANDARD_UNITS` in `tokenizer.ts` is a ~60-entry hardcoded guess. The real `measurekit` library registers far more unit symbols (9216, verified), and the exact set depends on what's installed/configured. Autocomplete and hover should reflect the real, live registry of whatever Python environment the user has configured — not a guess baked into the extension. Verified working query: `measurekit.get_active_system().UNIT_SYMBOL_REGISTRY` is a `dict[str, UnitDefinition]` keyed by every registered unit symbol/alias. A one-liner (`python -c "import json,measurekit; print(json.dumps(sorted(measurekit.get_active_system().UNIT_SYMBOL_REGISTRY.keys())))"`) prints them as a JSON array of strings, but the output includes a handful of garbage entries from config-parsing artifacts (e.g. literal strings like `] #` and `'] #`) that must be filtered out.

- [ ] **Step 1: Write tests for the new pure functions in `src/test/tokenizer.test.ts`**

Add these tests to the existing file (keep all 13 existing tests as-is, add these below them), and add `filterValidUnitSymbols, parseUnitListJson` to the existing `import { ... } from '../tokenizer';` line:

```typescript
test('filterValidUnitSymbols: keeps clean unit symbols', () => {
    const result = filterValidUnitSymbols(['kg', 'm/s', 'm^2', 'degC', 'µm', '°C']);
    assert.deepEqual(result, ['kg', 'm/s', 'm^2', 'degC', 'µm', '°C']);
});

test('filterValidUnitSymbols: drops entries with whitespace or bracket/quote artifacts', () => {
    const result = filterValidUnitSymbols(['kg', '] #', "'] #", 'bad entry', 'N']);
    assert.deepEqual(result, ['kg', 'N']);
});

test('filterValidUnitSymbols: drops empty strings', () => {
    const result = filterValidUnitSymbols(['kg', '', 'N']);
    assert.deepEqual(result, ['kg', 'N']);
});

test('parseUnitListJson: parses and filters a valid JSON array', () => {
    const result = parseUnitListJson('["kg", "] #", "N"]');
    assert.deepEqual(result, ['kg', 'N']);
});

test('parseUnitListJson: throws on non-array JSON', () => {
    assert.throws(() => parseUnitListJson('{"not": "an array"}'));
});

test('parseUnitListJson: throws on an array containing non-strings', () => {
    assert.throws(() => parseUnitListJson('["kg", 5, "N"]'));
});

test('parseUnitListJson: throws on invalid JSON', () => {
    assert.throws(() => parseUnitListJson('not json'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `tsc` reports `filterValidUnitSymbols` and `parseUnitListJson` are not exported members of `'../tokenizer'`.

- [ ] **Step 3: Add the two pure functions to `src/tokenizer.ts`**

Add this below the existing `STANDARD_UNITS` export (keep everything else in the file unchanged):

```typescript
// Matches unit-symbol strings containing whitespace or the stray bracket/quote/hash
// characters that leak through from config-parsing artifacts in the live registry query.
const INVALID_UNIT_SYMBOL_RE = /[\s#[\]'"]/;

/**
 * Filters a raw list of unit symbol strings (e.g. from querying a live
 * measurekit installation) down to plausible unit symbols, dropping empty
 * strings and config-parsing artifacts. Pure function.
 */
export function filterValidUnitSymbols(raw: string[]): string[] {
    return raw.filter((s) => s.length > 0 && !INVALID_UNIT_SYMBOL_RE.test(s));
}

/**
 * Parses the JSON array of unit symbol strings printed by the Python unit
 * query script, filtering it through filterValidUnitSymbols. Throws if the
 * input isn't valid JSON or isn't an array of strings. Pure function.
 */
export function parseUnitListJson(stdout: string): string[] {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
        throw new Error('Expected a JSON array of strings');
    }
    return filterValidUnitSymbols(parsed);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 20 tests green (13 existing + 7 new), 0 failures.

- [ ] **Step 5: Create `src/units.ts`**

```typescript
import { execFile } from 'child_process';
import { parseUnitListJson } from './tokenizer';

const UNIT_QUERY_SCRIPT =
    'import json,measurekit; print(json.dumps(sorted(measurekit.get_active_system().UNIT_SYMBOL_REGISTRY.keys())))';
const FETCH_TIMEOUT_MS = 5000;

/**
 * Runs the unit query script against `pythonPath` and returns the live,
 * filtered unit symbol list. Rejects if the interpreter is missing,
 * measurekit isn't installed, the query times out, or the output isn't
 * parseable — callers should catch and fall back to a static list.
 */
export function fetchUnitsFromInterpreter(pythonPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        execFile(pythonPath, ['-c', UNIT_QUERY_SCRIPT], { timeout: FETCH_TIMEOUT_MS }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            try {
                resolve(parseUnitListJson(stdout));
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

const unitsCache = new Map<string, Promise<string[]>>();

/**
 * Returns the live unit list for `pythonPath`, caching per interpreter for
 * the session (repeated calls with the same path reuse the same in-flight
 * or resolved promise — no repeated subprocess spawns). Falls back to
 * `fallback` if the interpreter can't be queried.
 */
export function getUnitsForPath(pythonPath: string, fallback: string[]): Promise<string[]> {
    let cached = unitsCache.get(pythonPath);
    if (!cached) {
        cached = fetchUnitsFromInterpreter(pythonPath).catch(() => fallback);
        unitsCache.set(pythonPath, cached);
    }
    return cached;
}
```

No dedicated test file for `src/units.ts`: `fetchUnitsFromInterpreter` and `getUnitsForPath` both do real subprocess I/O (spawning a Python interpreter), which would make unit tests either require a real `measurekit`-installed Python on the test machine (flaky, slow, environment-dependent) or introduce a mocking layer disproportionate to this file's size. This mirrors the existing precedent for `findPythonPath` in `extension.ts`, which is also untested for the same reason. The parsing/filtering logic that actually has interesting edge cases (`parseUnitListJson`, `filterValidUnitSymbols`) is pure and fully covered by the tests in Step 1 above. `src/units.ts` gets exercised by the manual smoke test in Task 8.

- [ ] **Step 6: Compile to confirm `src/units.ts` type-checks**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tokenizer.ts src/test/tokenizer.test.ts src/units.ts
git commit -m "feat: fetch live unit list from the configured measurekit interpreter"
```

---

### Task 4: Wire extension.ts to the tokenizer module and dynamic unit provider

**Files:**
- Modify: `src/extension.ts` (full replacement)

- [ ] **Step 1: Replace `src/extension.ts`**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { STANDARD_UNITS, computeDiagnostics, findVariableDefinition, findAssignmentSymbols } from './tokenizer';
import { getUnitsForPath } from './units';

/**
 * Searches for the Python interpreter containing the measurekit package.
 * Traverses user configuration settings, workspace environments, and parent folders.
 *
 * @param activeFilePath The path of the currently active document.
 * @returns Resolved path to the Python interpreter.
 */
function findPythonPath(activeFilePath: string | undefined): string {
    const config = vscode.workspace.getConfiguration('vsc-measurekit');
    const configuredPath = config.get<string>('pythonPath');

    // 1. Check user-configured path
    if (configuredPath && configuredPath.includes('${workspaceFolder}')) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            const rootPath = folders[0].uri.fsPath;
            const resolved = configuredPath.replace(/\$\{workspaceFolder\}/g, rootPath);
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        }
    } else if (configuredPath) {
        if (fs.existsSync(configuredPath)) {
            return configuredPath;
        }
    }

    // 2. Search workspace folders for virtualenv environments
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const folder of folders) {
            const workspaceRoot = folder.uri.fsPath;
            const possiblePaths = [
                path.join(workspaceRoot, '.venv', 'bin', 'python3'),
                path.join(workspaceRoot, '.venv', 'bin', 'python'),
                path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe'), // Windows Support
                path.join(workspaceRoot, 'venv', 'bin', 'python3'),
                path.join(workspaceRoot, 'venv', 'bin', 'python'),
            ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    return p;
                }
            }
        }
    }

    // 3. Traverse upwards from the active file folder
    if (activeFilePath) {
        let dir = path.dirname(activeFilePath);
        const root = path.parse(dir).root;
        while (dir && dir !== root) {
            const possiblePaths = [
                path.join(dir, '.venv', 'bin', 'python3'),
                path.join(dir, '.venv', 'bin', 'python'),
                path.join(dir, '.venv', 'Scripts', 'python.exe'),
                path.join(dir, 'venv', 'bin', 'python3'),
                path.join(dir, 'venv', 'bin', 'python'),
            ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    return p;
                }
            }
            const parent = path.dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    }

    // 4. Fallback to system python3/python
    return 'python3';
}

/**
 * Performs real-time syntax checking (linting) on an MKML document.
 * Delegates token/diagnostic computation to the pure `computeDiagnostics`
 * function and translates the results into `vscode.Diagnostic` objects.
 */
function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
    if (document.languageId !== 'mkml') {
        return;
    }

    const results = computeDiagnostics(document.getText());
    const diagnostics: vscode.Diagnostic[] = results.map((d) => {
        const range = new vscode.Range(
            new vscode.Position(d.line, d.startChar),
            new vscode.Position(d.line, d.endChar)
        );
        return new vscode.Diagnostic(range, d.message, vscode.DiagnosticSeverity.Error);
    });

    collection.set(document.uri, diagnostics);
}

/**
 * Sends `text` to `terminal` once its shell integration reports the shell is
 * ready, falling back to a fixed delay if shell integration never fires.
 *
 * ponytail: shell integration isn't guaranteed on every shell/platform; the
 * timeout fallback covers that case so the REPL still receives input either way.
 */
function sendTextWhenReady(terminal: vscode.Terminal, text: string): void {
    let sent = false;
    const disposable = vscode.window.onDidChangeTerminalShellIntegration((event) => {
        if (!sent && event.terminal === terminal) {
            sent = true;
            disposable.dispose();
            terminal.sendText(text);
        }
    });

    setTimeout(() => {
        if (!sent) {
            sent = true;
            disposable.dispose();
            terminal.sendText(text);
        }
    }, 1000);
}

/**
 * Builds a plain string array of every line in `document`.
 */
function documentLines(document: vscode.TextDocument): string[] {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
    }
    return lines;
}

/**
 * Activates the VS Code extension and registers all language services.
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('MeasureKit extension is now active!');

    // Initialize Diagnostics Collection (Linter)
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('mkml');
    context.subscriptions.push(diagnosticCollection);

    // Diagnostics Event Listeners
    if (vscode.window.activeTextEditor) {
        updateDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((doc) => updateDiagnostics(doc, diagnosticCollection))
    );
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => updateDiagnostics(event.document, diagnosticCollection))
    );
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((doc) => diagnosticCollection.delete(doc.uri))
    );

    // Command: Run Current MKML File
    const runFileDisposable = vscode.commands.registerCommand('vsc-measurekit.runFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor found.');
            return;
        }

        const document = editor.document;
        if (document.isDirty) {
            await document.save();
        }

        const filePath = document.uri.fsPath;
        const pythonPath = findPythonPath(filePath);

        let terminal = vscode.window.terminals.find(t => t.name === 'MeasureKit Runner');
        if (!terminal) {
            terminal = vscode.window.createTerminal({ name: 'MeasureKit Runner' });
        }

        terminal.show();

        const quotedPython = pythonPath.includes(' ') ? `"${pythonPath}"` : pythonPath;
        const quotedFile = filePath.includes(' ') ? `"${filePath}"` : filePath;

        terminal.sendText(`${quotedPython} -m measurekit < ${quotedFile}`);
    });

    // Command: Open Interactive REPL
    const openReplDisposable = vscode.commands.registerCommand('vsc-measurekit.openRepl', () => {
        const editor = vscode.window.activeTextEditor;
        const filePath = editor ? editor.document.uri.fsPath : undefined;
        const pythonPath = findPythonPath(filePath);

        let terminal = vscode.window.terminals.find(t => t.name === 'MeasureKit REPL');
        if (!terminal) {
            terminal = vscode.window.createTerminal({ name: 'MeasureKit REPL' });
            terminal.show();
            const quotedPython = pythonPath.includes(' ') ? `"${pythonPath}"` : pythonPath;
            terminal.sendText(`${quotedPython} -m measurekit`);
        } else {
            terminal.show();
        }
    });

    // Command: Send Selection/Line to REPL
    const sendToReplDisposable = vscode.commands.registerCommand('vsc-measurekit.sendToRepl', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        let textToSend = '';

        if (selection.isEmpty) {
            const line = document.lineAt(selection.active.line);
            textToSend = line.text;

            const nextLine = selection.active.line + 1;
            if (nextLine < document.lineCount) {
                const nextPosition = new vscode.Position(nextLine, selection.active.character);
                editor.selection = new vscode.Selection(nextPosition, nextPosition);
            }
        } else {
            textToSend = document.getText(selection);
        }

        if (!textToSend.trim()) {
            return;
        }

        const filePath = document.uri.fsPath;
        const pythonPath = findPythonPath(filePath);

        let terminal = vscode.window.terminals.find(t => t.name === 'MeasureKit REPL');
        if (!terminal) {
            terminal = vscode.window.createTerminal({ name: 'MeasureKit REPL' });
            terminal.show();
            const quotedPython = pythonPath.includes(' ') ? `"${pythonPath}"` : pythonPath;
            terminal.sendText(`${quotedPython} -m measurekit`);
            sendTextWhenReady(terminal, textToSend);
        } else {
            terminal.show();
            terminal.sendText(textToSend);
        }
    });

    // Provider: Autocomplete for Units
    const autocompleteDisposable = vscode.languages.registerCompletionItemProvider(
        'mkml',
        {
            async provideCompletionItems(
                document: vscode.TextDocument,
                position: vscode.Position,
                token: vscode.CancellationToken,
                context: vscode.CompletionContext
            ) {
                const pythonPath = findPythonPath(document.uri.fsPath);
                const units = await getUnitsForPath(pythonPath, STANDARD_UNITS);

                return units.map(unit => {
                    const item = new vscode.CompletionItem(unit, vscode.CompletionItemKind.Unit);
                    item.detail = `MeasureKit Physical Unit`;
                    item.documentation = new vscode.MarkdownString(`Dimension and value conversion component for \`${unit}\`.`);
                    return item;
                });
            }
        }
    );

    // Provider: Document Outline Symbols
    const outlineDisposable = vscode.languages.registerDocumentSymbolProvider(
        'mkml',
        {
            provideDocumentSymbols(
                document: vscode.TextDocument,
                token: vscode.CancellationToken
            ): vscode.DocumentSymbol[] {
                const lines = documentLines(document);

                return findAssignmentSymbols(lines).map((s) => {
                    const range = new vscode.Range(
                        new vscode.Position(s.line, 0),
                        new vscode.Position(s.line, lines[s.line].length)
                    );
                    const selectionRange = new vscode.Range(
                        new vscode.Position(s.line, s.startChar),
                        new vscode.Position(s.line, s.endChar)
                    );
                    return new vscode.DocumentSymbol(
                        s.name,
                        'Variable Assignment',
                        vscode.SymbolKind.Variable,
                        range,
                        selectionRange
                    );
                });
            }
        }
    );

    // Provider: Hover Documentation for Variables
    const hoverDisposable = vscode.languages.registerHoverProvider(
        'mkml',
        {
            async provideHover(
                document: vscode.TextDocument,
                position: vscode.Position,
                token: vscode.CancellationToken
            ): Promise<vscode.Hover | undefined> {
                const range = document.getWordRangeAtPosition(position, /\b[a-zA-Z_][a-zA-Z0-9_]*\b/);
                if (!range) {
                    return undefined;
                }

                const word = document.getText(range);
                const pythonPath = findPythonPath(document.uri.fsPath);
                const units = await getUnitsForPath(pythonPath, STANDARD_UNITS);

                // If it is a known unit, let's avoid overriding standard documentation unless needed
                if (units.includes(word)) {
                    return new vscode.Hover(new vscode.MarkdownString(`**Unit**: \`${word}\` (MeasureKit standard physical unit)`));
                }

                const lines = documentLines(document);

                const definition = findVariableDefinition(lines, word, position.line);
                if (definition) {
                    const markdown = new vscode.MarkdownString();
                    markdown.appendMarkdown(`**Variable Definition**:\n`);
                    markdown.appendCodeblock(definition.text, 'mkml');
                    return new vscode.Hover(markdown, range);
                }
                return undefined;
            }
        }
    );

    context.subscriptions.push(runFileDisposable);
    context.subscriptions.push(openReplDisposable);
    context.subscriptions.push(sendToReplDisposable);
    context.subscriptions.push(autocompleteDisposable);
    context.subscriptions.push(outlineDisposable);
    context.subscriptions.push(hoverDisposable);
}

/**
 * Deactivates the VS Code extension.
 */
export function deactivate(): void {}
```

Note the new `documentLines()` helper: the previous version of this file had the same "loop over `document.lineCount` and push each line's text" snippet duplicated in both the outline and hover providers. Since both providers are being touched anyway in this task, this factors it out — a small, in-scope cleanup, not a new abstraction for a hypothetical future need.

- [ ] **Step 2: Compile and run the test suite (regression check)**

Run: `npm test`
Expected: `tsc` compiles with no errors, all 20 tokenizer tests still PASS (extension.ts changes don't touch tested logic, but this confirms nothing broke the build).

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "refactor: wire extension.ts to tokenizer + live unit provider, fix REPL send race"
```

---

### Task 5: Manually verify diagnostics performance (no speculative debounce)

**Files:**
- None modified unless the manual check finds a real problem.

- [ ] **Step 1: Generate a large synthetic .mkml file**

Run:
```bash
node -e "
const lines = [];
for (let i = 0; i < 5000; i++) {
    lines.push(\`var\${i} = \${i} m + \${i} kg * 2 - (\${i} / 3)\`);
}
require('fs').writeFileSync('/tmp/claude-1000/-mnt-d-Projects-vsc-measurekit/dde267d9-8846-4a76-b3f1-3eb2ca4c12b0/scratchpad/large.mkml', lines.join('\n'));
"
```
Expected: a 5000-line `.mkml` file is created in the scratchpad directory.

- [ ] **Step 2: Load the extension in the Extension Development Host and type in the large file**

Run: `code --extensionDevelopmentPath=/mnt/d/Projects/vsc_measurekit /tmp/claude-1000/-mnt-d-Projects-vsc-measurekit/dde267d9-8846-4a76-b3f1-3eb2ca4c12b0/scratchpad/large.mkml`

(If `code` isn't on PATH, open VS Code normally, run "Debug: Start Debugging" (F5) from this project, and open the generated file in the new window.)

In the Extension Development Host window, place the cursor at the end of the file and type a few characters rapidly. Observe whether the editor feels laggy or diagnostics visibly stall.

- [ ] **Step 3: Record the finding**

If typing feels instant (no perceptible lag): no code change needed — `computeDiagnostics` re-scanning the full document per keystroke is cheap enough at this size. Note this in the commit message below and move on.

If typing is noticeably laggy: add a debounce around the `onDidChangeTextDocument` listener in `src/extension.ts` (e.g. clear/reset a `setTimeout` per document URI before calling `updateDiagnostics`) — this is the only condition under which this task changes code.

- [ ] **Step 4: Commit the finding**

```bash
git commit --allow-empty -m "perf: verify diagnostics stay responsive at 5000 lines (no debounce needed)"
```

(Adjust the message if Step 3 required an actual code change, and `git add` the modified file instead of using `--allow-empty`.)

---

### Task 6: .vscodeignore and CHANGELOG.md

**Files:**
- Create: `.vscodeignore`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `.vscodeignore`**

```
.vscode/**
.vscode-test/**
.github/**
.claude/**
docs/**
src/**
out/test/**
node_modules/**
*.vsix
*.map
.gitignore
.vscodeignore
tsconfig.json
```

- [ ] **Step 2: Create `CHANGELOG.md`**

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add .vscodeignore CHANGELOG.md
git commit -m "docs: add CHANGELOG and .vscodeignore for packaging"
```

---

### Task 7: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run compile
      - run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add build and test workflow"
```

---

### Task 8: Packaging dry run

**Files:**
- None modified (verification task).

Note: `icon.jpg` was already verified during planning as a 512×512 baseline
JPEG — well above the Marketplace's 128×128 minimum for a square icon. No
conversion needed; skip straight to packaging.

- [ ] **Step 1: Package the extension**

Run: `npx vsce package`
Expected: succeeds, producing `vsc-measurekit-0.1.0.vsix` in the project root. `vsce` may print warnings (e.g. missing a `README.md` badge or Q&A field) — read them; none should be errors. If `vsce` errors on missing `repository`/`license`/`icon`, re-check Task 1's `package.json`.

- [ ] **Step 2: Inspect the package contents**

Run: `npx vsce ls`
Expected output includes exactly: `package.json`, `out/extension.js`, `out/tokenizer.js`, `out/units.js`, `out/extension.js.map` (etc. for the other two, if not excluded — check against Step 1 output and remove from `.vscodeignore` if you want maps excluded), `syntaxes/mkml.tmLanguage.json`, `language-configuration.json`, `icons/file-icon.png`, `icons/file-icon.svg`, `icon.jpg`, `README.md`, `LICENSE`, `CHANGELOG.md`.
Expected NOT present: anything under `src/`, `docs/`, `.claude/`, `.github/`, `node_modules/`, `out/test/`.

If the `.map` files appear and you want a smaller package, add `out/*.map` to `.vscodeignore`; otherwise leave them (source maps help debugging installed extensions).

- [ ] **Step 3: Install and manually smoke-test the packaged .vsix**

Run: `code --install-extension vsc-measurekit-0.1.0.vsix`

In a VS Code window, open or create a `.mkml` file and verify:
- Syntax highlighting renders (comments, numbers, units, operators, superscripts).
- Typing `force = 500 N $` shows a red squiggle under `$` ("Unexpected character").
- Typing `stress = (force / area` shows an "Unbalanced parentheses" diagnostic.
- **With a valid `measurekit`-installed Python interpreter configured** (`vsc-measurekit.pythonPath` pointing at a `.venv` with `measurekit` installed): autocomplete suggests unit names beyond the old static list (e.g. type a unit prefix and confirm you see units that are NOT in the hardcoded `STANDARD_UNITS` array in `tokenizer.ts`, proving the live query is actually being used, not the fallback).
- **With no valid interpreter configured** (e.g. set `vsc-measurekit.pythonPath` to a bogus path): autocomplete still works, falling back to the static `STANDARD_UNITS` list — confirms the fallback path doesn't break the feature.
- Hovering a defined variable shows its definition; hovering a known unit shows "MeasureKit standard physical unit".
- The Outline view (Ctrl+Shift+O) lists variable assignments.
- "MeasureKit: Run Current MKML File" and "MeasureKit: Open Interactive REPL" commands run without error (with `measurekit` installed in the configured Python environment).
- `Shift+Enter` sends the current line to the REPL terminal.

- [ ] **Step 4: Remove the generated .vsix from git tracking (it's build output)**

Run: `git status --short`
Expected: `vsc-measurekit-0.1.0.vsix` does NOT appear (already covered by `.gitignore`'s `*.vsix` pattern from Task 1). If it does appear, `.gitignore` wasn't applied correctly — fix before proceeding.

- [ ] **Step 5: Commit is not needed for this task** — it's verification only, nothing to commit unless Step 3 surfaced a bug, in which case fix it, add a test if the fix is in `src/tokenizer.ts`, and commit normally.

---

## What's intentionally left for you (not automated here)

- Creating the `github.com/Alexisrx96/vsc-measurekit` remote repository and pushing.
- Registering (or confirming) the `irvintorres` publisher on the VS Code Marketplace (via Azure DevOps Personal Access Token) and running `vsce publish` or `vsce login irvintorres`.
