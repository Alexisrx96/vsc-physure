import * as vscode from 'vscode';

/**
 * Provides Quick Fixes for syntax diagnostics (e.g. mismatched parentheses,
 * deprecated conversion operators) and refactoring utilities (e.g. wrapping
 * mathematical expressions in built-in functions).
 */
export class PhsCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.RefactorExtract,
    ];

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        // 1. Diagnostics Quick Fixes
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.message.includes("Mismatched closing parenthesis")) {
                const fix = new vscode.CodeAction('Remove mismatched parenthesis', vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.delete(document.uri, diagnostic.range);
                fix.diagnostics = [diagnostic];
                fix.isPreferred = true;
                actions.push(fix);
            }

            if (diagnostic.message.includes("Unexpected character")) {
                const fix = new vscode.CodeAction('Remove unexpected character', vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.delete(document.uri, diagnostic.range);
                fix.diagnostics = [diagnostic];
                fix.isPreferred = true;
                actions.push(fix);
            }
        }

        // 2. Conversion Arrow Quick Fix (-> to =>)
        const lineText = document.lineAt(range.start.line).text;
        const arrowIndex = lineText.indexOf('->');
        if (arrowIndex !== -1) {
            const arrowRange = new vscode.Range(
                new vscode.Position(range.start.line, arrowIndex),
                new vscode.Position(range.start.line, arrowIndex + 2)
            );
            const fix = new vscode.CodeAction('Use standard unit conversion operator `=>`', vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.replace(document.uri, arrowRange, '=>');
            fix.isPreferred = true;
            actions.push(fix);
        }

        // 3. Selection Refactorings (Wrap in function)
        if (!range.isEmpty) {
            const selectedText = document.getText(range);

            const funcs = ['abs', 'sqrt', 'round', 'floor', 'ceil'];
            for (const fn of funcs) {
                const action = new vscode.CodeAction(
                    `Wrap selection with ${fn}(...)`,
                    vscode.CodeActionKind.RefactorExtract
                );
                action.edit = new vscode.WorkspaceEdit();
                action.edit.replace(document.uri, range, `${fn}(${selectedText})`);
                actions.push(action);
            }
        }

        return actions;
    }
}

export function registerCodeActionProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('phs', new PhsCodeActionProvider(), {
            providedCodeActionKinds: PhsCodeActionProvider.providedCodeActionKinds,
        })
    );
}
