import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { findPythonPath } from '../interpreter';

interface LineResult {
    line: number;
    output: string;
}

const documentResultsMap = new Map<string, LineResult[]>();
const onCodeLensChangeEvent = new vscode.EventEmitter<void>();

export class PhsCodeLensProvider implements vscode.CodeLensProvider {
    public readonly onDidChangeCodeLenses: vscode.Event<void> = onCodeLensChangeEvent.event;

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (document.languageId !== 'phs') {
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

        // 2. Calculated line-by-line CodeLens results
        const cachedResults = documentResultsMap.get(document.uri.toString()) ?? [];
        for (const res of cachedResults) {
            if (res.line < document.lineCount) {
                const lineRange = new vscode.Range(res.line, 0, res.line, 0);
                lenses.push(
                    new vscode.CodeLens(lineRange, {
                        title: `▶ Result: ${res.output}`,
                        command: '',
                    })
                );
            }
        }

        return lenses;
    }
}

export function registerCodeLensProvider(context: vscode.ExtensionContext): void {
    const provider = new PhsCodeLensProvider();
    context.subscriptions.push(vscode.languages.registerCodeLensProvider('phs', provider));

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

            const pythonPath = findPythonPath(document.uri.fsPath);
            const filePath = document.uri.fsPath;

            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: 'Physure: Evaluating expression lens...',
                },
                () =>
                    new Promise<void>((resolve) => {
                        const child = execFile(pythonPath, ['-m', 'physure'], (error, stdout, stderr) => {
                            const results: LineResult[] = [];
                            if (stdout) {
                                const lines = stdout.split(/\r\n|\r|\n/);
                                lines.forEach((line, idx) => {
                                    const trimmed = line.trim();
                                    if (trimmed) {
                                        results.push({ line: idx, output: trimmed });
                                    }
                                });
                            }

                            if (error && results.length === 0 && stderr) {
                                results.push({ line: 0, output: `Error: ${stderr.trim().split('\n')[0]}` });
                            }

                            documentResultsMap.set(document.uri.toString(), results);
                            onCodeLensChangeEvent.fire();
                            resolve();
                        });

                        child.stdin?.write(document.getText());
                        child.stdin?.end();
                    })
            );
        })
    );

    // Register Clear command
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.clearLens', (uri?: vscode.Uri) => {
            const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (targetUri) {
                documentResultsMap.delete(targetUri.toString());
                onCodeLensChangeEvent.fire();
            }
        })
    );
}
