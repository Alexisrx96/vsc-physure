import * as vscode from 'vscode';
import * as path from 'path';
import { transpiledPhsToPython, phsToMarkdownReport } from '../exporter';
import { getCachedLineResults } from '../providers/evalCodeLens';
import { getLanguage } from '../i18n';

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
            const defaultUri = vscode.Uri.file(doc.fileName.replace(/\.phs$/, '.py'));
            const uri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: { 'Python Script': ['py'] },
                title: 'Export Physure to Python Script',
            });

            if (!uri) {
                return;
            }

            const pythonContent = transpiledPhsToPython(doc.getText());
            await vscode.workspace.fs.writeFile(uri, Buffer.from(pythonContent, 'utf8'));

            const pyDoc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(pyDoc, { preview: false });
            vscode.window.showInformationMessage(
                `Physure: Successfully exported to Python script (${path.basename(uri.fsPath)})!`
            );
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
            const defaultUri = vscode.Uri.file(doc.fileName.replace(/\.phs$/, '.md'));
            const uri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: { 'Markdown Report': ['md'] },
                title: 'Export Physure to Markdown Report',
            });

            if (!uri) {
                return;
            }

            const resultsMap = new Map<number, string>();
            for (const item of getCachedLineResults(doc.uri.toString())) {
                resultsMap.set(item.line, item.output);
            }

            const lang = getLanguage(doc.uri);
            const mdContent = phsToMarkdownReport(path.basename(doc.fileName), doc.getText(), lang, resultsMap);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(mdContent, 'utf8'));

            const mdDoc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(mdDoc, { preview: false });
            vscode.window.showInformationMessage(
                `Physure: Successfully exported to Markdown report (${path.basename(uri.fsPath)})!`
            );
        })
    );
}

