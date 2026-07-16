import * as vscode from 'vscode';

/**
 * Builds a plain string array of every line in `document`.
 * Shared utility used across all language providers.
 */
export function documentLines(document: vscode.TextDocument): string[] {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
    }
    return lines;
}
