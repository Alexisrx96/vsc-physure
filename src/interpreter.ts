import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Searches for the Python interpreter containing the physure package.
 * Traverses user configuration settings, workspace environments, and parent
 * folders in order to locate the most specific available interpreter.
 *
 * Resolution order:
 *  1. User-configured `vsc-physure.pythonPath` (resolves `${workspaceFolder}`
 *     to the workspace folder that owns the active file, not always the first one).
 *  2. `.venv` / `venv` directories inside any open workspace folder.
 *  3. `.venv` / `venv` directories traversed upward from the active file's folder.
 *  4. System `python3` as final fallback.
 *
 * @param activeFilePath The fsPath of the currently active document (may be undefined).
 * @returns Resolved path to the Python interpreter.
 */
export function findPythonPath(activeFilePath: string | undefined): string {
    const config = vscode.workspace.getConfiguration('vsc-physure');
    const configuredPath = config.get<string>('pythonPath');

    // 1. Check user-configured path
    if (configuredPath && configuredPath.includes('${workspaceFolder}')) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            const activeUri = activeFilePath ? vscode.Uri.file(activeFilePath) : undefined;
            const targetFolder =
                (activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined) ?? folders[0];
            const rootPath = targetFolder.uri.fsPath;
            const resolved = configuredPath.replace(/\$\{workspaceFolder\}/g, rootPath);
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        }
    } else if (configuredPath) {
        if (fs.existsSync(configuredPath)) {
            return configuredPath;
        }
    }

    // 2. Search workspace folders for virtualenv environments
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const folder of folders) {
            const workspaceRoot = folder.uri.fsPath;
            const possiblePaths = [
                path.join(workspaceRoot, '.venv', 'bin', 'python3'),
                path.join(workspaceRoot, '.venv', 'bin', 'python'),
                path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe'), // Windows
                path.join(workspaceRoot, 'venv', 'bin', 'python3'),
                path.join(workspaceRoot, 'venv', 'bin', 'python'),
            ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    return p;
                }
            }
        }
    }

    // 3. Traverse upwards from the active file folder
    if (activeFilePath) {
        let dir = path.dirname(activeFilePath);
        const root = path.parse(dir).root;
        while (dir && dir !== root) {
            const possiblePaths = [
                path.join(dir, '.venv', 'bin', 'python3'),
                path.join(dir, '.venv', 'bin', 'python'),
                path.join(dir, '.venv', 'Scripts', 'python.exe'),
                path.join(dir, 'venv', 'bin', 'python3'),
                path.join(dir, 'venv', 'bin', 'python'),
            ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    return p;
                }
            }
            const parent = path.dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    }

    // 4. Fallback to system python3
    return 'python3';
}

/**
 * Checks whether the `physure` Python package is importable in the specified Python interpreter.
 */
export function checkPhysureInstalled(pythonPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const { exec } = require('child_process');
        const cmd = `"${pythonPath}" -c "import physure"`;
        exec(cmd, (error: any) => {
            resolve(!error);
        });
    });
}

/**
 * Prompts the user to install the `physure` Python package if missing from the active interpreter environment.
 */
export async function promptInstallPhysureIfNeeded(pythonPath: string): Promise<void> {
    const isInstalled = await checkPhysureInstalled(pythonPath);
    if (isInstalled) {
        return;
    }

    const action = await vscode.window.showWarningMessage(
        `The 'physure' Python package is not installed in '${pythonPath}'. Would you like to install it now via pip?`,
        'Install via Pip',
        'Install to PATH (--user)',
        'Select Another Interpreter'
    );

    if (action === 'Install via Pip') {
        installPhysurePackage(pythonPath, false);
    } else if (action === 'Install to PATH (--user)') {
        installPhysurePackage(pythonPath, true);
    } else if (action === 'Select Another Interpreter') {
        vscode.commands.executeCommand('vsc-physure.selectInterpreter');
    }
}

/**
 * Executes pip install physure inside an integrated VS Code terminal.
 */
export function installPhysurePackage(pythonPath: string, userPath: boolean = false): void {
    const terminal = vscode.window.createTerminal('Physure Pip Setup');
    terminal.show();
    const flag = userPath ? ' --user' : '';
    terminal.sendText(`"${pythonPath}" -m pip install${flag} physure`);
}

/**
 * Searches for the native standalone `phs` Rust binary executable.
 */
export function findPhsBinary(activeFilePath: string | undefined): string | undefined {
    const isWin = process.platform === 'win32';
    const exe = isWin ? '.exe' : '';

    const config = vscode.workspace.getConfiguration('vsc-physure');
    const configuredPath = config.get<string>('phsBinaryPath');
    if (configuredPath) {
        let rootPath = '';
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            const activeUri = activeFilePath ? vscode.Uri.file(activeFilePath) : undefined;
            const targetFolder = (activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined) ?? folders[0];
            rootPath = targetFolder.uri.fsPath;
        }
        const resolved = configuredPath.replace(/\$\{workspaceFolder\}/g, rootPath);
        if (fs.existsSync(resolved)) {
            return resolved;
        }
    }

    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const folder of folders) {
            const root = folder.uri.fsPath;
            const candidates = [
                path.join(root, 'target', 'release', `phs${exe}`),
                path.join(root, 'target', 'debug', `phs${exe}`),
                path.join(root, 'physure-core', 'target', 'release', `phs${exe}`),
                path.join(root, 'physure-core', 'target', 'debug', `phs${exe}`),
                path.join(root, '.venv', isWin ? 'Scripts' : 'bin', `phs${exe}`),
            ];
            for (const c of candidates) {
                if (fs.existsSync(c)) {
                    return c;
                }
            }
        }
    }

    const cargoBinPath = path.join(os.homedir(), '.cargo', 'bin', `phs${exe}`);
    if (fs.existsSync(cargoBinPath)) {
        return cargoBinPath;
    }

    const { spawnSync } = require('child_process');
    const lookupCmd = isWin ? 'where' : 'which';
    const stdout = spawnSync(lookupCmd, ['phs']).stdout?.toString().trim();
    const which = stdout?.split(/\r?\n/)[0];
    if (which && fs.existsSync(which)) {
        return which;
    }

    return undefined;
}

