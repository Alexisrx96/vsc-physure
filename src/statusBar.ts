import * as vscode from 'vscode';
import { fetchUnitsFromInterpreter } from './units';

/**
 * Probes whether `pythonPath` can run physure and reflects the result on
 * `statusBar`. Shows a spinner while the check is in flight so the UI stays
 * responsive; the status bar item is revealed automatically.
 *
 * On success  → green check  `$(check) physure`
 * On failure  → amber warning `$(warning) physure`  (uses fallback unit list)
 */
export function refreshStatusBar(statusBar: vscode.StatusBarItem, pythonPath: string): void {
    statusBar.text = '$(sync~spin) physure';
    statusBar.tooltip = 'Physure: checking interpreter…';
    statusBar.backgroundColor = undefined;
    statusBar.show();

    fetchUnitsFromInterpreter(pythonPath)
        .then(() => {
            statusBar.text = '$(check) physure';
            statusBar.tooltip = new vscode.MarkdownString(
                `**Physure** — Ready\n\n\`${pythonPath}\`\n\n*Click to select interpreter*`
            );
            statusBar.backgroundColor = undefined;
        })
        .catch(() => {
            statusBar.text = '$(warning) physure';
            statusBar.tooltip =
                `Physure unavailable at:\n${pythonPath}\n\nUsing built-in unit list.\nClick to configure.`;
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        });
}
