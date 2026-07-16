import * as vscode from 'vscode';
import { BUILTIN_FUNCTIONS, KEYWORDS, findAllOccurrences } from '../tokenizer';
import { documentLines } from '../utils';

const WORD_RE = /[\p{L}_][\p{L}\p{N}_]*/u;

/**
 * Returns all whole-word occurrences of the symbol under the cursor
 * (`Shift+F12` / `Alt+F12`). Comment text is excluded from the search.
 */
export function registerReferencesProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider('phs', {
            provideReferences(
                document: vscode.TextDocument,
                position: vscode.Position
            ): vscode.Location[] {
                const range = document.getWordRangeAtPosition(position, WORD_RE);
                if (!range) {
                    return [];
                }

                const word = document.getText(range);
                const lines = documentLines(document);

                return findAllOccurrences(lines, word).map(({ line, startChar, endChar }) =>
                    new vscode.Location(
                        document.uri,
                        new vscode.Range(
                            new vscode.Position(line, startChar),
                            new vscode.Position(line, endChar)
                        )
                    )
                );
            }
        })
    );
}

/**
 * Renames every occurrence of a user-defined symbol in a single atomic
 * `WorkspaceEdit` (`F2`). Built-in functions and keywords are protected from
 * rename to prevent breaking the language.
 */
export function registerRenameProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerRenameProvider('phs', {
            prepareRename(
                document: vscode.TextDocument,
                position: vscode.Position
            ): vscode.Range | undefined {
                const range = document.getWordRangeAtPosition(position, WORD_RE);
                if (!range) {
                    return undefined;
                }
                const word = document.getText(range);
                if (BUILTIN_FUNCTIONS[word] || KEYWORDS[word]) {
                    return undefined;
                }
                return range;
            },

            provideRenameEdits(
                document: vscode.TextDocument,
                position: vscode.Position,
                newName: string
            ): vscode.WorkspaceEdit | undefined {
                const range = document.getWordRangeAtPosition(position, WORD_RE);
                if (!range) {
                    return undefined;
                }

                const word = document.getText(range);
                if (BUILTIN_FUNCTIONS[word] || KEYWORDS[word]) {
                    return undefined;
                }

                const lines = documentLines(document);
                const edit = new vscode.WorkspaceEdit();

                for (const { line, startChar, endChar } of findAllOccurrences(lines, word)) {
                    edit.replace(
                        document.uri,
                        new vscode.Range(
                            new vscode.Position(line, startChar),
                            new vscode.Position(line, endChar)
                        ),
                        newName
                    );
                }

                return edit;
            }
        })
    );
}
