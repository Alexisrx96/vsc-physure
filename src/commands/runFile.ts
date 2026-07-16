import * as vscode from 'vscode';
import { findPythonPath } from '../interpreter';

/**
 * Registers the `vsc-physure.runFile` command.
 *
 * Saves the active document if dirty, then pipes it to the Physure
 * interpreter via stdin (`python -m physure < file.mkml`).
 * Reuses an existing "Physure Runner" terminal if one is already open.
 */
export function registerRunFileCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.runFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('Physure: No active text editor found.');
                return;
            }

            const document = editor.document;
            if (document.isDirty) {
                await document.save();
            }

            const filePath = document.uri.fsPath;
            const pythonPath = findPythonPath(filePath);

            let terminal = vscode.window.terminals.find(t => t.name === 'Physure Runner');
            if (!terminal) {
                terminal = vscode.window.createTerminal({ name: 'Physure Runner' });
            }

            terminal.show();

            const q = (p: string) => (p.includes(' ') ? `"${p}"` : p);
            terminal.sendText(`${q(pythonPath)} -m physure < ${q(filePath)}`);
        })
    );
}
