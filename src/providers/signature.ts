import * as vscode from 'vscode';
import { BUILTIN_SIGNATURES, findVariableDefinition } from '../tokenizer';
import { documentLines } from '../utils';

/**
 * Shows parameter hints when the user types `(` or `,` inside a function call.
 *
 * For built-in functions the full signature with per-parameter documentation
 * is surfaced. For user-defined functions the definition line is shown as the
 * signature label with a generic documentation string.
 */
export function registerSignatureHelpProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerSignatureHelpProvider(
            'phs',
            {
                provideSignatureHelp(
                    document: vscode.TextDocument,
                    position: vscode.Position,
                    _token: vscode.CancellationToken,
                    _ctx: vscode.SignatureHelpContext
                ): vscode.SignatureHelp | undefined {
                    // Walk back from the cursor to find an unclosed `funcName(` pattern
                    const linePrefix = document.lineAt(position.line).text.substring(0, position.character);
                    const callMatch = linePrefix.match(/(\w+)\s*\([^)]*$/);
                    if (!callMatch) {
                        return undefined;
                    }

                    const funcName = callMatch[1];
                    const help = new vscode.SignatureHelp();
                    help.activeSignature = 0;

                    // Built-in function: rich signature with typed parameters
                    const builtinSig = BUILTIN_SIGNATURES[funcName];
                    if (builtinSig) {
                        const sig = new vscode.SignatureInformation(
                            builtinSig.label,
                            new vscode.MarkdownString(builtinSig.documentation)
                        );
                        sig.parameters = builtinSig.parameters.map(
                            (p) => new vscode.ParameterInformation(
                                p.label,
                                new vscode.MarkdownString(p.documentation)
                            )
                        );

                        // Determine active parameter by counting commas inside the open call
                        const argsText = linePrefix.substring(linePrefix.lastIndexOf('(') + 1);
                        help.activeParameter = Math.min(
                            (argsText.match(/,/g) ?? []).length,
                            builtinSig.parameters.length - 1
                        );
                        help.signatures = [sig];
                        return help;
                    }

                    // User-defined function: show definition line as signature label
                    const lines = documentLines(document);
                    const def = findVariableDefinition(lines, funcName, position.line);
                    if (def && def.isFunction) {
                        const sig = new vscode.SignatureInformation(def.headerText ?? def.text);
                        sig.documentation = new vscode.MarkdownString('User-defined function');
                        help.signatures = [sig];
                        help.activeParameter = 0;
                        return help;
                    }


                    return undefined;
                }
            },
            '(',
            ','
        )
    );
}
