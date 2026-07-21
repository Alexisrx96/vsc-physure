import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logger } from './logger';

export function registerLspClient(context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration('vsc-physure');
    const enabled = config.get<boolean>('enableRustLsp', false);
    if (!enabled) {
        return;
    }

    try {
        let LanguageClientClass: any;
        try {
            // Safe dynamic require to prevent extension load failures if module resolution differs
            const lspMod = require('vscode-languageclient/node');
            LanguageClientClass = lspMod.LanguageClient;
        } catch (modErr: unknown) {
            logger.warn(`vscode-languageclient module not available: ${modErr}`);
            return;
        }

        const rawPath = config.get<string>('lspPath', 'physure-lsp');
        const lspPath = resolveLspPath(rawPath);

        if (!lspPath) {
            logger.info('physure-lsp executable not found. Using built-in extension features.');
            return;
        }

        const serverExecutable = {
            command: lspPath,
            options: {
                env: process.env,
            },
        };

        const serverOptions = serverExecutable;

        const clientOptions = {
            documentSelector: [{ scheme: 'file', language: 'phs' }],
            synchronize: {
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.phs'),
            },
        };

        const client = new LanguageClientClass(
            'physure-lsp',
            'Physure Language Server (Rust)',
            serverOptions,
            clientOptions
        );

        client.start().then(() => {
            logger.info(`Physure Rust LSP server started successfully using: ${lspPath}`);
        }).catch((err: unknown) => {
            logger.warn(`Could not start physure-lsp (${lspPath}). Falling back to built-in features: ${err}`);
        });

        context.subscriptions.push({
            dispose: () => {
                try {
                    client.stop();
                } catch (_) {}
            },
        });
    } catch (err: unknown) {
        logger.warn(`Failed to initialize LanguageClient: ${err}`);
    }
}

function resolveLspPath(configuredPath: string): string | undefined {
    if (path.isAbsolute(configuredPath) && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    const exe = process.platform === 'win32' ? '.exe' : '';

    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            const releasePath = path.join(folder.uri.fsPath, 'target', 'release', `physure-lsp${exe}`);
            if (fs.existsSync(releasePath)) {
                return releasePath;
            }
            const debugPath = path.join(folder.uri.fsPath, 'target', 'debug', `physure-lsp${exe}`);
            if (fs.existsSync(debugPath)) {
                return debugPath;
            }
        }
    }

    const cargoBinPath = path.join(os.homedir(), '.cargo', 'bin', `physure-lsp${exe}`);
    if (fs.existsSync(cargoBinPath)) {
        return cargoBinPath;
    }

    return configuredPath;
}
