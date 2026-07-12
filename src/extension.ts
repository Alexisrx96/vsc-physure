import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// List of common physical units for autocomplete suggestions
const STANDARD_UNITS = [
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
 * Underlines unexpected characters or unbalanced parentheses.
 */
function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
    if (document.languageId !== 'mkml') {
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    
    // Regex mapping token groups from the grammar
    const tokenRe = /(?<NUMBER>\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(?<IDENT>[a-zA-Z_][a-zA-Z0-9_]*)|(?<SUP>[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)|(?<OP>\+|-|\*|\/|\^|\(|\)|=|\?|\+\/-|±|==|=>|->|\*\*)|(?<WS>[ \t]+)|(?<BAD>.)/g;

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
        const line = document.lineAt(lineIndex);
        let text = line.text;
        
        // Strip comment portion
        const commentIdx = text.indexOf('#');
        if (commentIdx !== -1) {
            text = text.substring(0, commentIdx);
        }

        if (!text.trim()) {
            continue;
        }

        // 1. Token Validation
        tokenRe.lastIndex = 0;
        let match: RegExpExecArray | null;
        let parenDepth = 0;

        while ((match = tokenRe.exec(text)) !== null) {
            const groups = match.groups;
            if (!groups) {
                continue;
            }

            if (groups.BAD) {
                const range = new vscode.Range(
                    new vscode.Position(lineIndex, match.index),
                    new vscode.Position(lineIndex, match.index + match[0].length)
                );
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Syntax Error: Unexpected character '${match[0]}' in expression.`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostics.push(diagnostic);
            }

            if (match[0] === '(') {
                parenDepth++;
            } else if (match[0] === ')') {
                parenDepth--;
                if (parenDepth < 0) {
                    const range = new vscode.Range(
                        new vscode.Position(lineIndex, match.index),
                        new vscode.Position(lineIndex, match.index + 1)
                    );
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Syntax Error: Mismatched closing parenthesis.`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostics.push(diagnostic);
                    parenDepth = 0; // reset to avoid cascaded errors
                }
            }
        }

        // 2. Unbalanced Parentheses check at end of line
        if (parenDepth > 0) {
            const range = new vscode.Range(
                new vscode.Position(lineIndex, 0),
                new vscode.Position(lineIndex, line.text.length)
            );
            const diagnostic = new vscode.Diagnostic(
                range,
                `Syntax Error: Unbalanced parentheses. Expected closing ')'.`,
                vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(diagnostic);
        }
    }

    collection.set(document.uri, diagnostics);
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
            setTimeout(() => {
                terminal!.sendText(textToSend);
            }, 1000);
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
                const symbols: vscode.DocumentSymbol[] = [];
                // Identifies assignment statements like `variable = ...`
                const assignRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)/;

                for (let i = 0; i < document.lineCount; i++) {
                    const line = document.lineAt(i);
                    const match = assignRe.exec(line.text);
                    if (match) {
                        const name = match[1];
                        const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, line.text.length));
                        const selectionRange = new vscode.Range(
                            new vscode.Position(i, line.text.indexOf(name)),
                            new vscode.Position(i, line.text.indexOf(name) + name.length)
                        );
                        symbols.push(new vscode.DocumentSymbol(
                            name,
                            'Variable Assignment',
                            vscode.SymbolKind.Variable,
                            range,
                            selectionRange
                        ));
                    }
                }
                return symbols;
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

                // Search document backwards for variable definition
                for (let i = position.line; i >= 0; i--) {
                    const line = document.lineAt(i);
                    const assignRe = new RegExp(`^\\s*(${word})\\s*=(?!=)`);
                    const match = assignRe.exec(line.text);
                    if (match) {
                        const markdown = new vscode.MarkdownString();
                        markdown.appendMarkdown(`**Variable Definition**:\n`);
                        markdown.appendCodeblock(line.text.trim(), 'mkml');
                        return new vscode.Hover(markdown, range);
                    }
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
