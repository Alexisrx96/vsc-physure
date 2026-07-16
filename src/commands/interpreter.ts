import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { refreshStatusBar } from '../statusBar';

/**
 * Registers the `vsc-physure.selectInterpreter` command.
 *
 * Presents a Quick-Pick list of:
 *  - Virtualenv interpreters auto-detected in all open workspace folders.
 *  - System `python3` and `python` fallbacks.
 *  - A free-text "Enter custom path…" option.
 *
 * Persists the selection to the workspace-scoped `vsc-physure.pythonPath`
 * setting and refreshes the status bar immediately.
 */
export function registerInterpreterCommand(
    context: vscode.ExtensionContext,
    statusBar: vscode.StatusBarItem
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.selectInterpreter', async () => {
            const candidates: vscode.QuickPickItem[] = [];
            const seen = new Set<string>();

            const addCandidate = (label: string, fsPath: string, detail?: string) => {
                if (!seen.has(fsPath) && fs.existsSync(fsPath)) {
                    seen.add(fsPath);
                    candidates.push({ label, description: fsPath, detail });
                }
            };

            // Auto-detect venvs across all workspace folders
            for (const folder of vscode.workspace.workspaceFolders ?? []) {
                const root = folder.uri.fsPath;
                addCandidate('$(folder) .venv/bin/python3', path.join(root, '.venv', 'bin', 'python3'), folder.name);
                addCandidate('$(folder) .venv/bin/python',  path.join(root, '.venv', 'bin', 'python'),  folder.name);
                addCandidate('$(folder) venv/bin/python3',  path.join(root, 'venv',  'bin', 'python3'), folder.name);
            }

            // Always-present system fallbacks
            candidates.push(
                { label: '$(terminal) python3', description: 'python3', detail: 'System Python 3' },
                { label: '$(terminal) python',  description: 'python',  detail: 'System Python'   },
                { label: '$(edit) Enter custom path…', description: '__custom__' }
            );

            const picked = await vscode.window.showQuickPick(candidates, {
                placeHolder: 'Select the Python interpreter with physure installed',
                matchOnDescription: true,
            });

            if (!picked) {
                return;
            }

            let chosenPath = picked.description ?? 'python3';

            if (chosenPath === '__custom__') {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter the full path to the Python interpreter',
                    placeHolder: '/home/user/project/.venv/bin/python3',
                    validateInput: (v) => (v.trim() ? undefined : 'Path cannot be empty'),
                });
                if (!input) {
                    return;
                }
                chosenPath = input.trim();
            }

            const config = vscode.workspace.getConfiguration('vsc-physure');
            await config.update('pythonPath', chosenPath, vscode.ConfigurationTarget.Workspace);
            refreshStatusBar(statusBar, chosenPath);
            vscode.window.showInformationMessage(`Physure: interpreter set to \`${chosenPath}\``);
        })
    );
}
