import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
