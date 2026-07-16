import * as vscode from 'vscode';
import { computeDiagnostics } from '../tokenizer';

/**
 * Translates pure `computeDiagnostics` results into `vscode.Diagnostic` objects
 * and pushes them to `collection`. Skips non-PHS documents silently.
 */
export function updateDiagnostics(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection
): void {
    if (document.languageId !== 'phs') {
        return;
    }

    const diagnostics: vscode.Diagnostic[] = computeDiagnostics(document.getText()).map((d) => {
        const range = new vscode.Range(
            new vscode.Position(d.line, d.startChar),
            new vscode.Position(d.line, d.endChar)
        );
        return new vscode.Diagnostic(range, d.message, vscode.DiagnosticSeverity.Error);
    });

    collection.set(document.uri, diagnostics);
}

/**
 * Creates the PHS diagnostic collection, runs an initial pass on the active
 * editor (if any), and subscribes to all document lifecycle events that should
 * trigger a re-lint. Returns the collection so the caller may query or clear it.
 */
export function registerDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
    const collection = vscode.languages.createDiagnosticCollection('phs');
    context.subscriptions.push(collection);

    if (vscode.window.activeTextEditor) {
        updateDiagnostics(vscode.window.activeTextEditor.document, collection);
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((doc) => updateDiagnostics(doc, collection))
    );
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => updateDiagnostics(event.document, collection))
    );
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri))
    );

    return collection;
}
