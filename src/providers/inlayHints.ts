import * as vscode from 'vscode';
import { getCachedLineResults, getDisplayMode, onInlayHintsChangeEvent } from './evalCodeLens';

/**
 * Decorates expressions with real evaluated values as end-of-line ghost text Inlay Hints.
 */
export function registerInlayHintsProvider(context: vscode.ExtensionContext): void {
    const provider: vscode.InlayHintsProvider = {
        onDidChangeInlayHints: onInlayHintsChangeEvent.event,
        provideInlayHints(
            document: vscode.TextDocument,
            range: vscode.Range
        ): vscode.InlayHint[] {
            if (document.languageId !== 'phs') {
                return [];
            }

            const displayMode = getDisplayMode(document);
            if (displayMode !== 'inlayHint' && displayMode !== 'both') {
                return [];
            }

            const hints: vscode.InlayHint[] = [];
            const lineResultsMap = new Map<number, string>();
            for (const item of getCachedLineResults(document.uri.toString())) {
                lineResultsMap.set(item.line, item.output);
            }

            for (let i = range.start.line; i <= range.end.line && i < document.lineCount; i++) {
                const output = lineResultsMap.get(i);
                if (output !== undefined) {
                    const lineText = document.lineAt(i).text;
                    const position = new vscode.Position(i, lineText.length);
                    let formatted = output;
                    if (formatted.includes('[PLOT_IMAGE:') || formatted.includes('📊')) {
                        formatted = '📊 Live Figure';
                    } else {
                        formatted = formatted.replace(/\r?\n/g, ' ↵ ');
                    }
                    const hint = new vscode.InlayHint(position, `  = ${formatted}`, vscode.InlayHintKind.Parameter);
                    hint.paddingLeft = true;
                    hint.tooltip = new vscode.MarkdownString(
                        output.includes('[PLOT_IMAGE:')
                            ? '📊 **Live Figure Generated**'
                            : `**Evaluated Result:** ${output}`
                    );
                    hints.push(hint);
                }
            }

            return hints;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerInlayHintsProvider('phs', provider)
    );
}
