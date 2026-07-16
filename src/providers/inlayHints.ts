import * as vscode from 'vscode';
import { documentLines } from '../utils';

/**
 * Decorates conversion expressions (`=>`), queries (`?`), and assertions (`==`)
 * with a `⚡` marker at the end of the line as a visual cue that the expression
 * produces an output when evaluated.
 *
 * ponytail: the hint is purely decorative for now — real evaluated values would
 * require running the interpreter on every change, which is a future feature.
 */
export function registerInlayHintsProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerInlayHintsProvider('phs', {
            provideInlayHints(
                document: vscode.TextDocument,
                range: vscode.Range
            ): vscode.InlayHint[] {
                const hints: vscode.InlayHint[] = [];
                const lines = documentLines(document);

                for (let i = range.start.line; i <= range.end.line && i < lines.length; i++) {
                    const lineText = lines[i].trim();
                    if (!lineText || lineText.startsWith('#') || lineText.startsWith('```')) {
                        continue;
                    }
                    if (lineText.endsWith('=')) {
                        continue;
                    }

                    if (lineText.includes('=>') || lineText.endsWith('?') || lineText.includes('==')) {
                        const position = new vscode.Position(i, lines[i].length);
                        const hint = new vscode.InlayHint(position, '  ⚡', vscode.InlayHintKind.Type);
                        hint.tooltip = new vscode.MarkdownString('Live PHS expression evaluation result');
                        hints.push(hint);
                    }
                }

                return hints;
            }
        })
    );
}
