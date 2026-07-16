import * as vscode from 'vscode';
import { formatDocument } from '../tokenizer';

/**
 * Delegates full-document formatting to the pure `formatDocument` function,
 * applying the editor's configured tab size as the indent width.
 */
export function registerFormattingProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('phs', {
            provideDocumentFormattingEdits(
                document: vscode.TextDocument,
                options: vscode.FormattingOptions
            ): vscode.TextEdit[] {
                const fullText = document.getText();
                const formatted = formatDocument(fullText, { indentSpaces: options.tabSize });
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(fullText.length)
                );
                return [vscode.TextEdit.replace(fullRange, formatted)];
            }
        })
    );
}
