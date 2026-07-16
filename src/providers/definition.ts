import * as vscode from 'vscode';
import { BUILTIN_FUNCTIONS, KEYWORDS, findVariableDefinition, isFormatSpecifierPosition } from '../tokenizer';

import { documentLines } from '../utils';

/**
 * Resolves `F12` (Go to Definition) for user-defined variables and functions.
 *
 * Built-in functions, keywords, and format specifiers are intentionally excluded.
 */
export function registerDefinitionProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('phs', {
            provideDefinition(
                document: vscode.TextDocument,
                position: vscode.Position
            ): vscode.Location | undefined {
                const lineText = document.lineAt(position.line).text;
                if (isFormatSpecifierPosition(lineText, position.character)) {
                    return undefined;
                }

                const range = document.getWordRangeAtPosition(
                    position,
                    /[\p{L}_][\p{L}\p{N}_]*/u
                );
                if (!range) {
                    return undefined;
                }

                const word = document.getText(range);

                if (BUILTIN_FUNCTIONS[word] || KEYWORDS[word]) {
                    return undefined;
                }


                const lines = documentLines(document);
                const definition = findVariableDefinition(lines, word, position.line);
                if (!definition) {
                    return undefined;
                }

                return new vscode.Location(
                    document.uri,
                    new vscode.Range(
                        new vscode.Position(definition.line, 0),
                        new vscode.Position(definition.line, lines[definition.line].length)
                    )
                );
            }
        })
    );
}
