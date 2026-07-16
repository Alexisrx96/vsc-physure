import * as vscode from 'vscode';
import * as path from 'path';
import { transpiledPhsToPython, phsToMarkdownReport } from '../exporter';

/**
 * Registers commands to export PHS files to Python scripts and Markdown reports.
 */
export function registerExportCommands(context: vscode.ExtensionContext): void {
    // Export to Python
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.exportToPython', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('Physure: No active text editor found.');
                return;
            }

            const doc = editor.document;
            const pythonContent = transpiledPhsToPython(doc.getText());
            const pyDoc = await vscode.workspace.openTextDocument({
                language: 'python',
                content: pythonContent,
            });

            await vscode.window.showTextDocument(pyDoc, { preview: false });
            vscode.window.showInformationMessage('Physure: Successfully exported to Python script!');
        })
    );

    // Export to Markdown Report
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.exportToMarkdown', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('Physure: No active text editor found.');
                return;
            }

            const doc = editor.document;
            const fileName = path.basename(doc.fileName);
            const mdContent = phsToMarkdownReport(fileName, doc.getText());
            const mdDoc = await vscode.workspace.openTextDocument({
                language: 'markdown',
                content: mdContent,
            });

            await vscode.window.showTextDocument(mdDoc, { preview: false });
            vscode.window.showInformationMessage('Physure: Successfully exported to Markdown report!');
        })
    );
}
