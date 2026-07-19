import * as vscode from 'vscode';
import { computeDiagnostics } from '../tokenizer';

import { DaemonDiagnostic } from '../daemon';

let physureCollection: vscode.DiagnosticCollection | undefined;
const engineDiagnosticsMap = new Map<string, DaemonDiagnostic[]>();

export function setEngineDiagnostics(uri: vscode.Uri, items: DaemonDiagnostic[]): void {
    if (items.length > 0) {
        engineDiagnosticsMap.set(uri.toString(), items);
    } else {
        engineDiagnosticsMap.delete(uri.toString());
    }
    if (physureCollection) {
        const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
        if (doc) {
            updateDiagnostics(doc, physureCollection);
        }
    }
}

/**
 * Translates pure `computeDiagnostics` results and Physure daemon engine diagnostics
 * into `vscode.Diagnostic` objects and pushes them to `collection`.
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

    const engineItems = engineDiagnosticsMap.get(document.uri.toString()) ?? [];
    for (const e of engineItems) {
        if (e.line < document.lineCount) {
            const lineText = document.lineAt(e.line).text;
            const startCol = Math.min(e.column, lineText.length);
            const endCol = lineText.length > startCol ? lineText.length : startCol + 1;
            const range = new vscode.Range(new vscode.Position(e.line, startCol), new vscode.Position(e.line, endCol));
            diagnostics.push(new vscode.Diagnostic(range, e.message, vscode.DiagnosticSeverity.Error));
        }
    }

    collection.set(document.uri, diagnostics);
}

/**
 * Creates the PHS diagnostic collection, runs an initial pass on the active
 * editor (if any), and subscribes to all document lifecycle events that should
 * trigger a re-lint. Returns the collection so the caller may query or clear it.
 */
export function registerDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
    const collection = vscode.languages.createDiagnosticCollection('phs');
    physureCollection = collection;
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
        vscode.workspace.onDidCloseTextDocument((doc) => {
            engineDiagnosticsMap.delete(doc.uri.toString());
            collection.delete(doc.uri);
        })
    );

    return collection;
}
