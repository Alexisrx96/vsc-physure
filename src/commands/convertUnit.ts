import * as vscode from 'vscode';

/**
 * Common unit conversion categories for quick-pick selection.
 */
const COMMON_CONVERSIONS: Record<string, string[]> = {
    'm/s': ['km/h', 'mph', 'ft/s', 'knot'],
    'km/h': ['m/s', 'mph', 'ft/s'],
    'N': ['kN', 'MN', 'lbf', 'dyn'],
    'Pa': ['kPa', 'MPa', 'GPa', 'bar', 'psi', 'atm', 'torr'],
    'J': ['kJ', 'MJ', 'cal', 'kcal', 'eV', 'kWh', 'Btu'],
    'W': ['kW', 'MW', 'hp'],
    'm': ['cm', 'mm', 'km', 'in', 'ft', 'yd', 'mi'],
    'kg': ['g', 'mg', 'lb', 'oz', 'ton'],
    's': ['min', 'h', 'ms', 'μs'],
    'C': ['mC', 'μC', 'nC', 'pC', 'A*s'],
};

/**
 * Interactive QuickPick unit converter and clipboard helper commands.
 */
export function registerConvertUnitCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.convertUnitAtCursor', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'phs') {
                return;
            }

            const position = editor.selection.active;
            const lineText = editor.document.lineAt(position.line).text;

            let defaultOptions = ['kN', 'MPa', 'km/h', 'lbf', 'psi', 'cal', 'kWh', 'base', 'frac'];

            const wordRange = editor.document.getWordRangeAtPosition(position, /[A-Za-z0-9_/*^]+/);
            if (wordRange) {
                const currentUnit = editor.document.getText(wordRange);
                if (COMMON_CONVERSIONS[currentUnit]) {
                    defaultOptions = COMMON_CONVERSIONS[currentUnit];
                }
            }

            const selectedUnit = await vscode.window.showQuickPick(defaultOptions, {
                placeHolder: 'Select target unit for conversion (e.g. km/h, kN, lbf, base)',
            });

            if (selectedUnit) {
                const endPos = new vscode.Position(position.line, lineText.length);
                const conversionText = selectedUnit === 'base' || selectedUnit === 'frac' ? `: ${selectedUnit}` : ` => ${selectedUnit}`;

                await editor.edit((editBuilder) => {
                    editBuilder.insert(endPos, conversionText);
                });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.copyText', (text: string) => {
            if (text) {
                vscode.env.clipboard.writeText(text);
                vscode.window.showInformationMessage(`Copied to clipboard: "${text}"`);
            }
        })
    );
}
