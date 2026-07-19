import * as vscode from 'vscode';

// Infrastructure
import { findPythonPath } from './interpreter';
import { refreshStatusBar } from './statusBar';
import { getUnitsForPath } from './units';
import { STANDARD_UNITS } from './tokenizer';

// Language providers
import { registerDiagnostics } from './providers/diagnostics';
import { registerCompletionProvider } from './providers/completion';
import { registerHoverProvider } from './providers/hover';
import { registerDefinitionProvider } from './providers/definition';
import { registerReferencesProvider, registerRenameProvider } from './providers/references';
import { registerSignatureHelpProvider } from './providers/signature';
import { registerOutlineProvider } from './providers/outline';
import { registerFormattingProvider } from './providers/formatting';
import { registerInlayHintsProvider } from './providers/inlayHints';
import { registerCodeActionProvider } from './providers/codeActions';
import { registerCodeLensProvider } from './providers/evalCodeLens';

import { registerVariableExplorer } from './providers/variableExplorer';
import { PhysureUnitPaletteProvider } from './providers/unitPalette';

// Commands
import { registerRunFileCommand } from './commands/runFile';
import { registerReplCommands } from './commands/repl';
import { registerInterpreterCommand } from './commands/interpreter';
import { registerExportCommands } from './commands/export';
import { registerPreviewCommand } from './commands/preview';
import { registerDependencyGraphCommand } from './commands/dependencyGraph';
import { registerConvertUnitCommands } from './commands/convertUnit';

import { logger } from './logger';

/**
 * Extension entry point. Wires together the status bar, all language providers,
 * and all commands. Each concern lives in its own module; this file only
 * orchestrates their registration.
 */
export function activate(context: vscode.ExtensionContext): void {
    logger.init(context);
    logger.info('Physure extension is now active!');

    // ── Status Bar ────────────────────────────────────────────────────────────
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'vsc-physure.selectInterpreter';
    context.subscriptions.push(statusBar);

    // ── Bootstrap interpreter cache and status bar ────────────────────────────
    const initialPythonPath = findPythonPath(vscode.window.activeTextEditor?.document.uri.fsPath);
    getUnitsForPath(initialPythonPath, STANDARD_UNITS); // warm cache eagerly

    if (vscode.window.activeTextEditor?.document.languageId === 'phs') {
        refreshStatusBar(statusBar, initialPythonPath);
    }

    // Refresh on every editor switch; hide when a non-PHS file is focused
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document.languageId === 'phs') {
                refreshStatusBar(statusBar, findPythonPath(editor.document.uri.fsPath));
            } else {
                statusBar.hide();
            }
        })
    );

    // ── Language Providers ────────────────────────────────────────────────────
    registerDiagnostics(context);
    registerCompletionProvider(context);
    registerHoverProvider(context);
    registerDefinitionProvider(context);
    registerReferencesProvider(context);
    registerRenameProvider(context);
    registerSignatureHelpProvider(context);
    registerOutlineProvider(context);
    registerFormattingProvider(context);
    registerInlayHintsProvider(context);
    registerCodeActionProvider(context);
    registerCodeLensProvider(context);
    registerVariableExplorer(context);

    const unitPaletteProvider = new PhysureUnitPaletteProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PhysureUnitPaletteProvider.viewType, unitPaletteProvider)
    );

    // ── Commands ──────────────────────────────────────────────────────────────
    registerRunFileCommand(context);
    registerReplCommands(context);
    registerInterpreterCommand(context, statusBar);
    registerExportCommands(context);
    registerPreviewCommand(context);
    registerDependencyGraphCommand(context);
    registerConvertUnitCommands(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.showLogs', () => {
            logger.show();
        })
    );
}

import { physureDaemon } from './daemon';

/**
 * Called when the extension is deactivated (editor closes or extension
 * is disabled). Subscriptions registered on `context` are disposed automatically.
 */
export function deactivate(): void {
    physureDaemon.stop();
}
