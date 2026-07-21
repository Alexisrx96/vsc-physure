import * as vscode from 'vscode';
import { findPhsBinary, findPythonPath } from '../interpreter';

/**
 * Sends `text` to `terminal` once shell integration fires, with a 1-second
 * timeout fallback so the REPL still receives input on shells that don't
 * support shell integration.
 */
function sendTextWhenReady(terminal: vscode.Terminal, text: string): void {
    let sent = false;
    const disposable = vscode.window.onDidChangeTerminalShellIntegration((event) => {
        if (!sent && event.terminal === terminal) {
            sent = true;
            disposable.dispose();
            terminal.sendText(text);
        }
    });

    setTimeout(() => {
        if (!sent) {
            sent = true;
            disposable.dispose();
            terminal.sendText(text);
        }
    }, 1000);
}

/** Returns an existing REPL terminal or `undefined` if none is open. */
function findReplTerminal(): vscode.Terminal | undefined {
    return vscode.window.terminals.find(t => t.name === 'Physure REPL');
}

/** Opens a new REPL terminal and starts the physure session. */
function openNewRepl(activeFilePath: string | undefined): vscode.Terminal {
    const terminal = vscode.window.createTerminal({ name: 'Physure REPL' });
    terminal.show();
    const q = (p: string) => (p.includes(' ') ? `"${p}"` : p);
    const phsPath = findPhsBinary(activeFilePath);
    if (phsPath) {
        terminal.sendText(`${q(phsPath)}`);
    } else {
        const pythonPath = findPythonPath(activeFilePath);
        terminal.sendText(`${q(pythonPath)} -m physure`);
    }
    return terminal;
}

/**
 * Registers all three REPL-related commands:
 *
 * - `openRepl`    — opens (or focuses) the interactive REPL session.
 * - `sendToRepl`  — sends the current line or selection; advances the cursor.
 * - `restartRepl` — disposes the existing REPL and starts a fresh one.
 */
export function registerReplCommands(context: vscode.ExtensionContext): void {
    // ── openRepl ─────────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.openRepl', () => {
            const editor = vscode.window.activeTextEditor;
            const filePath = editor?.document.uri.fsPath;

            const existing = findReplTerminal();
            if (existing) {
                existing.show();
            } else {
                openNewRepl(filePath);
            }
        })
    );

    // ── sendToRepl ───────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.sendToRepl', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const { document, selection } = editor;
            let textToSend: string;

            if (selection.isEmpty) {
                textToSend = document.lineAt(selection.active.line).text;
                // Advance cursor to the next line
                const nextLine = selection.active.line + 1;
                if (nextLine < document.lineCount) {
                    const next = new vscode.Position(nextLine, selection.active.character);
                    editor.selection = new vscode.Selection(next, next);
                }
            } else {
                textToSend = document.getText(selection);
            }

            if (!textToSend.trim()) {
                return;
            }

            const filePath = document.uri.fsPath;
            const existing = findReplTerminal();

            if (existing) {
                existing.show();
                existing.sendText(textToSend);
            } else {
                const terminal = openNewRepl(filePath);
                sendTextWhenReady(terminal, textToSend);
            }
        })
    );

    // ── restartRepl ──────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.restartRepl', () => {
            findReplTerminal()?.dispose();

            const editor = vscode.window.activeTextEditor;
            const filePath = editor?.document.uri.fsPath;
            openNewRepl(filePath);
        })
    );
}
