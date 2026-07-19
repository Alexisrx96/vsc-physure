import * as vscode from 'vscode';
import { findPythonPath } from '../interpreter';
import { physureDaemon } from '../daemon';
import { setEngineDiagnostics } from './diagnostics';

export interface LineResult {
    line: number;
    output: string;
}

export type LiveEvalMode = 'off' | 'onSave' | 'onType';
export type DisplayMode = 'codeLens' | 'inlayHint' | 'both';

const documentResultsMap = new Map<string, LineResult[]>();
const onCodeLensChangeEvent = new vscode.EventEmitter<void>();

export const onInlayHintsChangeEvent = new vscode.EventEmitter<void>();

export function getCachedLineResults(uriString: string): LineResult[] {
    return documentResultsMap.get(uriString) ?? [];
}

export function getDisplayMode(document?: vscode.TextDocument): DisplayMode {
    const config = vscode.workspace.getConfiguration('vsc-physure', document?.uri);
    return config.get<DisplayMode>('displayMode', 'both');
}

export class PhsCodeLensProvider implements vscode.CodeLensProvider {
    public readonly onDidChangeCodeLenses: vscode.Event<void> = onCodeLensChangeEvent.event;

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (document.languageId !== 'phs') {
            return [];
        }

        const displayMode = getDisplayMode(document);
        if (displayMode === 'inlayHint') {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];

        // 1. Top of file header actions
        const topRange = new vscode.Range(0, 0, 0, 0);
        lenses.push(
            new vscode.CodeLens(topRange, {
                title: '$(play) Evaluate Live Results',
                command: 'vsc-physure.evaluateLens',
                arguments: [document.uri],
            })
        );

        if (documentResultsMap.has(document.uri.toString())) {
            lenses.push(
                new vscode.CodeLens(topRange, {
                    title: '$(clear-all) Clear Live Results',
                    command: 'vsc-physure.clearLens',
                    arguments: [document.uri],
                })
            );
        }

        // 2. Calculated line-by-line CodeLens results (if enabled in displayMode)
        if (displayMode === 'codeLens' || displayMode === 'both') {
            const cachedResults = documentResultsMap.get(document.uri.toString()) ?? [];
            for (const res of cachedResults) {
                if (res.line < document.lineCount) {
                    const lineRange = new vscode.Range(res.line, 0, res.line, 0);
                    const formattedOutput = res.output.replace(/\r?\n/g, ' ↵ ');
                    lenses.push(
                        new vscode.CodeLens(lineRange, {
                            title: `▶ Result: ${formattedOutput}`,
                            command: '',
                        })
                    );
                }
            }
        }

        return lenses;
    }
}

let liveEvalStatusBar: vscode.StatusBarItem | undefined;
let evalDebounceTimer: NodeJS.Timeout | undefined;
let activeEvalCounter = 0;

export function getLiveEvalMode(document?: vscode.TextDocument): LiveEvalMode {
    const config = vscode.workspace.getConfiguration('vsc-physure', document?.uri);
    return config.get<LiveEvalMode>('liveEvalMode', 'onType');
}

export function updateLiveEvalStatusBar(document?: vscode.TextDocument, isCalculating = false): void {
    if (!liveEvalStatusBar) {
        return;
    }

    const activeDoc = document ?? vscode.window.activeTextEditor?.document;
    if (!activeDoc || activeDoc.languageId !== 'phs') {
        liveEvalStatusBar.hide();
        return;
    }

    if (isCalculating) {
        liveEvalStatusBar.text = '$(sync~spin) Live: Recalculating...';
        liveEvalStatusBar.tooltip = 'Physure: Recalculating live expression results…';
        liveEvalStatusBar.show();
        return;
    }

    const mode = getLiveEvalMode(activeDoc);
    switch (mode) {
        case 'onType':
            liveEvalStatusBar.text = '$(zap) Live: On Type';
            liveEvalStatusBar.tooltip = 'Physure Live Evaluation: On Type (Recalculates as you type)\nClick to change mode';
            break;
        case 'onSave':
            liveEvalStatusBar.text = '$(save) Live: On Save';
            liveEvalStatusBar.tooltip = 'Physure Live Evaluation: On Save (Recalculates on save)\nClick to change mode';
            break;
        case 'off':
        default:
            liveEvalStatusBar.text = '$(dash) Live: Manual';
            liveEvalStatusBar.tooltip = 'Physure Live Evaluation: Manual (Click CodeLens button)\nClick to change mode';
            break;
    }
    liveEvalStatusBar.show();
}

const resultDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
        margin: '0 0 0 2em',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
    },
});

export function updateDecorations(editor?: vscode.TextEditor): void {
    if (!editor || editor.document.languageId !== 'phs') {
        return;
    }

    const displayMode = getDisplayMode(editor.document);
    if (displayMode !== 'inlayHint' && displayMode !== 'both') {
        editor.setDecorations(resultDecorationType, []);
        return;
    }

    const cachedResults = documentResultsMap.get(editor.document.uri.toString()) ?? [];
    const options: vscode.DecorationOptions[] = [];

    for (const res of cachedResults) {
        if (res.line < editor.document.lineCount) {
            const lineText = editor.document.lineAt(res.line).text;
            const range = new vscode.Range(res.line, lineText.length, res.line, lineText.length);
            let formatted = res.output;
            if (formatted.includes('[PLOT_IMAGE:') || formatted.includes('📊')) {
                formatted = '📊 Live Figure';
            } else {
                formatted = formatted.replace(/\r?\n/g, ' ↵ ');
            }

            options.push({
                range,
                renderOptions: {
                    after: {
                        contentText: `= ${formatted}`,
                    },
                },
                hoverMessage: new vscode.MarkdownString(
                    res.output.includes('[PLOT_IMAGE:')
                        ? '📊 **Live Figure Generated**'
                        : `**Evaluated Result:** ${res.output}`
                ),
            });
        }
    }

    editor.setDecorations(resultDecorationType, options);
}

export async function evaluateDocument(document: vscode.TextDocument, isSilent = false): Promise<void> {
    const currentCounter = ++activeEvalCounter;
    const pythonPath = findPythonPath(document.uri.fsPath);

    updateLiveEvalStatusBar(document, true);

    try {
        const evalRes = await physureDaemon.evaluate(document.getText(), pythonPath);
        if (currentCounter !== activeEvalCounter) {
            return;
        }

        documentResultsMap.set(document.uri.toString(), evalRes.results);
        setEngineDiagnostics(document.uri, evalRes.diagnostics);

        onCodeLensChangeEvent.fire();
        onInlayHintsChangeEvent.fire();

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.toString() === document.uri.toString()) {
            updateDecorations(activeEditor);
        }
    } finally {
        if (currentCounter === activeEvalCounter) {
            updateLiveEvalStatusBar(document, false);
        }
    }
}

export function registerCodeLensProvider(context: vscode.ExtensionContext): void {
    const provider = new PhsCodeLensProvider();
    context.subscriptions.push(vscode.languages.registerCodeLensProvider('phs', provider));

    liveEvalStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    liveEvalStatusBar.command = 'vsc-physure.toggleLiveEvalMode';
    context.subscriptions.push(liveEvalStatusBar);

    updateLiveEvalStatusBar(vscode.window.activeTextEditor?.document);
    updateDecorations(vscode.window.activeTextEditor);

    const triggerEvalIfEnabled = (doc?: vscode.TextDocument) => {
        if (doc && doc.languageId === 'phs') {
            const mode = getLiveEvalMode(doc);
            if (mode === 'onType' || mode === 'onSave') {
                evaluateDocument(doc, true);
            }
        }
    };

    if (vscode.window.activeTextEditor?.document) {
        triggerEvalIfEnabled(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            updateLiveEvalStatusBar(editor?.document);
            updateDecorations(editor);
            if (editor?.document) {
                triggerEvalIfEnabled(editor.document);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((doc) => {
            triggerEvalIfEnabled(doc);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.languageId === 'phs') {
                const mode = getLiveEvalMode(doc);
                if (mode === 'onSave' || mode === 'onType') {
                    evaluateDocument(doc, true);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const doc = event.document;
            if (doc.languageId === 'phs' && getLiveEvalMode(doc) === 'onType') {
                if (evalDebounceTimer) {
                    clearTimeout(evalDebounceTimer);
                }
                const config = vscode.workspace.getConfiguration('vsc-physure', doc.uri);
                const debounceMs = config.get<number>('evalDebounceMs', 600);
                evalDebounceTimer = setTimeout(() => {
                    evaluateDocument(doc, true);
                }, debounceMs);
            }
        })
    );

    // Register Evaluate command
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.evaluateLens', async (uri?: vscode.Uri) => {
            const document = uri
                ? await vscode.workspace.openTextDocument(uri)
                : vscode.window.activeTextEditor?.document;

            if (!document) {
                return;
            }

            if (document.isDirty) {
                await document.save();
            }

            await evaluateDocument(document, false);
        })
    );

    // Register Clear command
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.clearLens', (uri?: vscode.Uri) => {
            const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (targetUri) {
                documentResultsMap.delete(targetUri.toString());
                setEngineDiagnostics(targetUri, []);
                onCodeLensChangeEvent.fire();
                onInlayHintsChangeEvent.fire();
                updateDecorations(vscode.window.activeTextEditor);
            }
        })
    );

    // Register Toggle Live Eval Mode command
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.toggleLiveEvalMode', async () => {
            const activeDoc = vscode.window.activeTextEditor?.document;
            const currentMode = getLiveEvalMode(activeDoc);

            const options: (vscode.QuickPickItem & { mode: LiveEvalMode })[] = [
                {
                    label: '$(zap) On Type',
                    description: 'Recalculate automatically while typing',
                    picked: currentMode === 'onType',
                    mode: 'onType',
                },
                {
                    label: '$(save) On Save',
                    description: 'Recalculate automatically when saving the file',
                    picked: currentMode === 'onSave',
                    mode: 'onSave',
                },
                {
                    label: '$(dash) Off (Manual)',
                    description: 'Manual evaluation only (via CodeLens button)',
                    picked: currentMode === 'off',
                    mode: 'off',
                },
            ];

            const picked = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select Physure Live Evaluation Trigger Mode',
            });

            if (picked) {
                const config = vscode.workspace.getConfiguration('vsc-physure', activeDoc?.uri);
                await config.update('liveEvalMode', picked.mode, vscode.ConfigurationTarget.Global);
                updateLiveEvalStatusBar(activeDoc);
                if ((picked.mode === 'onType' || picked.mode === 'onSave') && activeDoc && activeDoc.languageId === 'phs') {
                    evaluateDocument(activeDoc, true);
                }
            }
        })
    );

    // Register Toggle Display Mode command
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.toggleDisplayMode', async () => {
            const activeDoc = vscode.window.activeTextEditor?.document;
            const currentMode = getDisplayMode(activeDoc);

            const options: (vscode.QuickPickItem & { displayMode: DisplayMode })[] = [
                {
                    label: '$(inline-inside) Inline (End of Line Ghost Text)',
                    description: 'Results appear at end of lines without extra line spacing',
                    picked: currentMode === 'inlayHint',
                    displayMode: 'inlayHint',
                },
                {
                    label: '$(code) CodeLens (Headers Above Lines)',
                    description: 'Results appear as CodeLens headers above lines',
                    picked: currentMode === 'codeLens',
                    displayMode: 'codeLens',
                },
                {
                    label: '$(layers) Both (Headers & Inline)',
                    description: 'Display both CodeLens headers and end-of-line ghost text',
                    picked: currentMode === 'both',
                    displayMode: 'both',
                },
            ];

            const picked = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select Physure Result Visual Presentation Style',
            });

            if (picked) {
                const config = vscode.workspace.getConfiguration('vsc-physure', activeDoc?.uri);
                await config.update('displayMode', picked.displayMode, vscode.ConfigurationTarget.Global);
                onCodeLensChangeEvent.fire();
                onInlayHintsChangeEvent.fire();
                updateDecorations(vscode.window.activeTextEditor);
            }
        })
    );
}

