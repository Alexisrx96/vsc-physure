import * as vscode from 'vscode';
import { findAssignmentSymbols } from '../tokenizer';
import { documentLines } from '../utils';

/**
 * Exposes every variable assignment and function definition in the Outline
 * panel (`Ctrl+Shift+O`) so the user can navigate the document structure at a
 * glance.
 */
export function registerOutlineProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider('phs', {
            provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
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
                        s.signature || s.name,
                        s.kind === 'function' ? 'User-defined Function' : 'Variable Assignment',
                        s.kind === 'function' ? vscode.SymbolKind.Function : vscode.SymbolKind.Variable,
                        range,
                        selectionRange
                    );
                });
            }
        })
    );
}
