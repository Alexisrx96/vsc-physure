# vsc_measurekit Marketplace Publish Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the vsc_measurekit VS Code extension (currently unpublished v0.1.0, no tests, no CI, placeholder publisher) to a state where the only remaining steps are creating the GitHub remote and running `vsce publish`.

**Architecture:** Extract the VS-Code-API-free logic (tokenizer/diagnostics, hover variable lookup, outline symbol extraction) out of `src/extension.ts` into a plain `src/tokenizer.ts` module with zero `vscode` imports, so it's testable with Node's built-in test runner. `extension.ts` keeps only VS Code glue: activation, commands, providers that call into the pure functions and translate results into `vscode.*` types. Packaging metadata, `.vscodeignore`, `CHANGELOG.md`, and a CI workflow round out Marketplace readiness.

**Tech Stack:** TypeScript 5.9 (strict mode, already configured), `node:test` + `node:assert/strict` (Node stdlib, zero new runtime deps), `@vscode/vsce` (new devDependency, for packaging), GitHub Actions.

Spec: `docs/superpowers/specs/2026-07-11-marketplace-publish-readiness-design.md`

---

### Task 1: package.json metadata + .gitignore

**Files:**
- Modify: `package.json` (full replacement)
- Create: `.gitignore`

- [ ] **Step 1: Replace `package.json`**

```json
{
  "name": "vsc-measurekit",
  "displayName": "MeasureKit (MKML) Support",
  "description": "Syntax highlighting and REPL execution for MeasureKit Meta-Lang (.mkml) files",
  "version": "0.1.0",
  "publisher": "irvintorres",
  "license": "MIT",
  "icon": "icon.jpg",
  "engines": {
    "vscode": "^1.93.0"
  },
  "categories": [
    "Programming Languages"
  ],
  "keywords": [
    "mkml",
    "measurekit",
    "physics",
    "units",
    "uncertainty",
    "dsl"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/Alexisrx96/vsc-measurekit.git"
  },
  "bugs": {
    "url": "https://github.com/Alexisrx96/vsc-measurekit/issues"
  },
  "homepage": "https://github.com/Alexisrx96/vsc-measurekit#readme",
  "main": "./out/extension.js",
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "postinstall": "npm run compile",
    "test": "tsc -p ./ && node --test out/test",
    "package": "vsce package"
  },
  "devDependencies": {
    "typescript": "^5.1.3",
    "@types/vscode": "^1.93.0",
    "@types/node": "^16.18.34",
    "@vscode/vsce": "^3.9.2"
  },
  "contributes": {
    "languages": [
      {
        "id": "mkml",
        "aliases": ["MKML", "mkml"],
        "extensions": [".mkml"],
        "configuration": "./language-configuration.json",
        "icon": {
          "light": "./icons/file-icon.png",
          "dark": "./icons/file-icon.png"
        }
      }
    ],
    "grammars": [
      {
        "language": "mkml",
        "scopeName": "source.mkml",
        "path": "./syntaxes/mkml.tmLanguage.json"
      }
    ],
    "commands": [
      {
        "command": "vsc-measurekit.runFile",
        "title": "MeasureKit: Run Current MKML File",
        "category": "MeasureKit",
        "icon": "$(play)"
      },
      {
        "command": "vsc-measurekit.openRepl",
        "title": "MeasureKit: Open Interactive REPL",
        "category": "MeasureKit"
      },
      {
        "command": "vsc-measurekit.sendToRepl",
        "title": "MeasureKit: Send Selection/Line to REPL",
        "category": "MeasureKit"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "vsc-measurekit.runFile",
          "group": "navigation",
          "when": "editorLangId == mkml"
        }
      ],
      "editor/context": [
        {
          "command": "vsc-measurekit.runFile",
          "group": "1_run",
          "when": "editorLangId == mkml"
        },
        {
          "command": "vsc-measurekit.sendToRepl",
          "group": "1_run",
          "when": "editorLangId == mkml"
        }
      ]
    },
    "keybindings": [
      {
        "command": "vsc-measurekit.runFile",
        "key": "ctrl+alt+n",
        "mac": "cmd+alt+n",
        "when": "editorTextFocus && editorLangId == mkml"
      },
      {
        "command": "vsc-measurekit.sendToRepl",
        "key": "shift+enter",
        "when": "editorTextFocus && editorLangId == mkml"
      }
    ],
    "configuration": {
      "title": "MeasureKit Meta-Lang Support",
      "properties": {
        "vsc-measurekit.pythonPath": {
          "type": "string",
          "default": "${workspaceFolder}/.venv/bin/python3",
          "description": "Path to the Python interpreter where the measurekit library is installed. Supports the '${workspaceFolder}' environment variable.",
          "scope": "resource"
        }
      }
    }
  },
  "activationEvents": [
    "onLanguage:mkml"
  ]
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
out/
*.vsix
.vscode-test/
```

- [ ] **Step 3: Reinstall to pick up the new devDependency**

Run: `npm install`
Expected: `@vscode/vsce` and the bumped `@types/vscode` appear in `node_modules` and `package-lock.json` updates. No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: set publisher, repo metadata, and packaging devDependency"
```

---

### Task 2: Extract pure tokenizer/diagnostics logic with tests

**Files:**
- Create: `src/tokenizer.ts`
- Test: `src/test/tokenizer.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/test/tokenizer.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDiagnostics, findVariableDefinition, findAssignmentSymbols } from '../tokenizer';

test('computeDiagnostics: valid expression has no diagnostics', () => {
    const diagnostics = computeDiagnostics('force = 500 N');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: comment-only line has no diagnostics', () => {
    const diagnostics = computeDiagnostics('# just a comment $$$');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: flags an unexpected character', () => {
    const diagnostics = computeDiagnostics('force = 500 N $');
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Unexpected character '\$'/);
    assert.equal(diagnostics[0].line, 0);
});

test('computeDiagnostics: flags unbalanced open parenthesis', () => {
    const diagnostics = computeDiagnostics('stress = (force / area');
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Unbalanced parentheses/);
});

test('computeDiagnostics: flags mismatched closing parenthesis', () => {
    const diagnostics = computeDiagnostics('stress = force / area)');
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Mismatched closing parenthesis/);
});

test('computeDiagnostics: balanced parentheses produce no diagnostics', () => {
    const diagnostics = computeDiagnostics('stress = (force / area) * 2');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: superscript sequence is not flagged as unexpected', () => {
    const diagnostics = computeDiagnostics('area = 2 m²');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: reports one diagnostic per offending line, independently', () => {
    const diagnostics = computeDiagnostics('a = 1 m\nb = 2 $\nc = (3');
    assert.equal(diagnostics.length, 2);
    assert.equal(diagnostics[0].line, 1);
    assert.equal(diagnostics[1].line, 2);
});

test('findVariableDefinition: finds the most recent definition at or above the given line', () => {
    const lines = ['force = 500 N', 'area = 2 m^2', 'stress = force / area'];
    const result = findVariableDefinition(lines, 'force', 2);
    assert.deepEqual(result, { line: 0, text: 'force = 500 N' });
});

test('findVariableDefinition: returns undefined when there is no definition', () => {
    const lines = ['stress = force / area'];
    const result = findVariableDefinition(lines, 'force', 0);
    assert.equal(result, undefined);
});

test('findVariableDefinition: does not match an equality assertion as a definition', () => {
    const lines = ['stress == 250 Pa'];
    const result = findVariableDefinition(lines, 'stress', 0);
    assert.equal(result, undefined);
});

test('findAssignmentSymbols: extracts every assignment in document order', () => {
    const lines = ['force = 500 N', '# a comment', 'area = 2 m^2', 'stress = force / area'];
    const symbols = findAssignmentSymbols(lines);
    assert.deepEqual(symbols.map((s) => s.name), ['force', 'area', 'stress']);
});

test('findAssignmentSymbols: ignores equality assertions', () => {
    const lines = ['stress == 250 Pa'];
    const symbols = findAssignmentSymbols(lines);
    assert.deepEqual(symbols, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsc -p . && node --test out/test`
Expected: FAIL — `tsc` reports `Cannot find module '../tokenizer'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `src/tokenizer.ts`**

```typescript
export interface PureDiagnostic {
    line: number;
    startChar: number;
    endChar: number;
    message: string;
}

export interface VariableDefinition {
    line: number;
    text: string;
}

export interface SymbolMatch {
    name: string;
    line: number;
    startChar: number;
    endChar: number;
}

// List of common physical units for autocomplete suggestions and hover lookup
export const STANDARD_UNITS = [
    // Base SI units
    'm', 'kg', 's', 'A', 'K', 'mol', 'cd',
    // Derived SI units
    'rad', 'deg', 'sr', 'Hz', 'N', 'Pa', 'J', 'W', 'C', 'V', 'F', 'Ohm', 'S', 'Wb', 'T', 'H', 'lm', 'lx', 'Bq', 'Gy', 'Sv', 'kat',
    // Prefixes
    'mm', 'cm', 'dm', 'km', 'mg', 'g', 'kPa', 'MPa', 'GPa', 'mV', 'kV', 'mA', 'kW', 'MW',
    // Imperial and other common units
    'in', 'ft', 'yd', 'mi', 'mil', 'inch', 'feet', 'yard', 'mile',
    'lb', 'oz', 'pound', 'ounce', 'ton',
    'min', 'h', 'hr', 'minute', 'hour', 'day', 'year',
    'cal', 'kcal', 'calorie', 'calories', 'Btu',
    'degC', 'degF', 'kelvin', 'celsius', 'fahrenheit',
    'psi', 'bar', 'atm', 'torr', 'mmHg',
    'L', 'mL', 'liter', 'litre', 'gal', 'gallon'
];

// Regex mapping token groups from the grammar
const TOKEN_RE = /(?<NUMBER>\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(?<IDENT>[a-zA-Z_][a-zA-Z0-9_]*)|(?<SUP>[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)|(?<OP>\+|-|\*|\/|\^|\(|\)|=|\?|\+\/-|±|==|=>|->|\*\*)|(?<WS>[ \t]+)|(?<BAD>.)/g;

/**
 * Computes syntax diagnostics for MKML source text: unexpected characters
 * and unbalanced parentheses. Pure function, no VS Code dependency.
 */
export function computeDiagnostics(text: string): PureDiagnostic[] {
    const diagnostics: PureDiagnostic[] = [];
    const lines = text.split(/\r\n|\r|\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        let line = lines[lineIndex];

        const commentIdx = line.indexOf('#');
        if (commentIdx !== -1) {
            line = line.substring(0, commentIdx);
        }

        if (!line.trim()) {
            continue;
        }

        TOKEN_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        let parenDepth = 0;

        while ((match = TOKEN_RE.exec(line)) !== null) {
            const groups = match.groups;
            if (!groups) {
                continue;
            }

            if (groups.BAD) {
                diagnostics.push({
                    line: lineIndex,
                    startChar: match.index,
                    endChar: match.index + match[0].length,
                    message: `Syntax Error: Unexpected character '${match[0]}' in expression.`,
                });
            }

            if (match[0] === '(') {
                parenDepth++;
            } else if (match[0] === ')') {
                parenDepth--;
                if (parenDepth < 0) {
                    diagnostics.push({
                        line: lineIndex,
                        startChar: match.index,
                        endChar: match.index + 1,
                        message: `Syntax Error: Mismatched closing parenthesis.`,
                    });
                    parenDepth = 0;
                }
            }
        }

        if (parenDepth > 0) {
            diagnostics.push({
                line: lineIndex,
                startChar: 0,
                endChar: lines[lineIndex].length,
                message: `Syntax Error: Unbalanced parentheses. Expected closing ')'.`,
            });
        }
    }

    return diagnostics;
}

/**
 * Searches backward from fromLine (inclusive) for a line assigning `word`.
 * Pure function operating on plain line strings.
 */
export function findVariableDefinition(lines: string[], word: string, fromLine: number): VariableDefinition | undefined {
    for (let i = fromLine; i >= 0; i--) {
        const line = lines[i];
        const assignRe = new RegExp(`^\\s*(${word})\\s*=(?!=)`);
        const match = assignRe.exec(line);
        if (match) {
            return { line: i, text: line.trim() };
        }
    }
    return undefined;
}

/**
 * Extracts every top-level variable assignment in document order.
 */
export function findAssignmentSymbols(lines: string[]): SymbolMatch[] {
    const assignRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)/;
    const symbols: SymbolMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = assignRe.exec(line);
        if (match) {
            const name = match[1];
            const startChar = line.indexOf(name);
            symbols.push({ name, line: i, startChar, endChar: startChar + name.length });
        }
    }

    return symbols;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsc -p . && node --test out/test`
Expected: PASS — all 13 tests green, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/tokenizer.ts src/test/tokenizer.test.ts
git commit -m "test: extract tokenizer/diagnostics logic into pure, tested module"
```

---

### Task 3: Wire extension.ts to use the extracted tokenizer module

**Files:**
- Modify: `src/extension.ts` (full replacement)

- [ ] **Step 1: Replace `src/extension.ts`**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { STANDARD_UNITS, computeDiagnostics, findVariableDefinition, findAssignmentSymbols } from './tokenizer';

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
            provideCompletionItems(
                document: vscode.TextDocument,
                position: vscode.Position,
                token: vscode.CancellationToken,
                context: vscode.CompletionContext
            ) {
                return STANDARD_UNITS.map(unit => {
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
                const lines: string[] = [];
                for (let i = 0; i < document.lineCount; i++) {
                    lines.push(document.lineAt(i).text);
                }

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
            provideHover(
                document: vscode.TextDocument,
                position: vscode.Position,
                token: vscode.CancellationToken
            ): vscode.Hover | undefined {
                const range = document.getWordRangeAtPosition(position, /\b[a-zA-Z_][a-zA-Z0-9_]*\b/);
                if (!range) {
                    return undefined;
                }

                const word = document.getText(range);

                // If it is a known unit, let's avoid overriding standard documentation unless needed
                if (STANDARD_UNITS.includes(word)) {
                    return new vscode.Hover(new vscode.MarkdownString(`**Unit**: \`${word}\` (MeasureKit standard physical unit)`));
                }

                const lines: string[] = [];
                for (let i = 0; i < document.lineCount; i++) {
                    lines.push(document.lineAt(i).text);
                }

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

- [ ] **Step 2: Compile and run the test suite (regression check)**

Run: `npm test`
Expected: `tsc` compiles with no errors, all 13 tokenizer tests still PASS (extension.ts changes don't touch tested logic, but this confirms nothing broke the build).

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "refactor: wire extension.ts to the extracted tokenizer module, fix REPL send race"
```

---

### Task 4: Manually verify diagnostics performance (no speculative debounce)

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

### Task 5: .vscodeignore and CHANGELOG.md

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
- Autocomplete for standard physical units.
- Hover documentation for units and variable definitions.
- Document outline (symbol) support for variable assignments.
```

- [ ] **Step 3: Commit**

```bash
git add .vscodeignore CHANGELOG.md
git commit -m "docs: add CHANGELOG and .vscodeignore for packaging"
```

---

### Task 6: CI workflow

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

### Task 7: Packaging dry run

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
Expected output includes exactly: `package.json`, `out/extension.js`, `out/extension.js.map` (if not excluded — check against Step 1 output and remove from `.vscodeignore` if you want maps excluded), `syntaxes/mkml.tmLanguage.json`, `language-configuration.json`, `icons/file-icon.png`, `icons/file-icon.svg`, `icon.jpg`, `README.md`, `LICENSE`, `CHANGELOG.md`.
Expected NOT present: anything under `src/`, `docs/`, `.claude/`, `.github/`, `node_modules/`, `out/test/`.

If `out/extension.js.map` appears and you want a smaller package, add `out/*.map` to `.vscodeignore`; otherwise leave it (source maps help debugging installed extensions).

- [ ] **Step 3: Install and manually smoke-test the packaged .vsix**

Run: `code --install-extension vsc-measurekit-0.1.0.vsix`

In a VS Code window, open or create a `.mkml` file and verify:
- Syntax highlighting renders (comments, numbers, units, operators, superscripts).
- Typing `force = 500 N $` shows a red squiggle under `$` ("Unexpected character").
- Typing `stress = (force / area` shows an "Unbalanced parentheses" diagnostic.
- Autocomplete suggests unit names (e.g. type `k` and see `kg`, `km`, `kW`, ...).
- Hovering a defined variable shows its definition; hovering a unit shows "MeasureKit standard physical unit".
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
