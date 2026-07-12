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
