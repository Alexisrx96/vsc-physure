import * as vscode from 'vscode';
import { findAssignmentSymbols } from '../tokenizer';

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Parses variable dependencies in a .phs document and renders an interactive
 * Mermaid DAG diagram showing data flow between calculations.
 */
export function registerDependencyGraphCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.showDependencyGraph', () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.languageId !== 'phs') {
                vscode.window.showInformationMessage('Open a Physure (.phs) file to view calculation dependency graph.');
                return;
            }

            if (currentPanel) {
                currentPanel.reveal(vscode.ViewColumn.Beside);
            } else {
                currentPanel = vscode.window.createWebviewPanel(
                    'physureDependencyGraph',
                    `Physure Dependency Graph: ${activeEditor.document.fileName.split('/').pop()}`,
                    vscode.ViewColumn.Beside,
                    { enableScripts: true }
                );

                currentPanel.onDidDispose(() => {
                    currentPanel = undefined;
                });
            }

            updateGraphWebview(activeEditor.document);
        })
    );
}

function updateGraphWebview(document: vscode.TextDocument): void {
    if (!currentPanel) {
        return;
    }

    const lines = document.getText().split(/\r?\n/);
    const symbols = findAssignmentSymbols(lines);
    const definedNames = new Set(symbols.map((s) => s.name));

    const edges: { from: string; to: string }[] = [];

    symbols.forEach((sym) => {
        const lineText = lines[sym.line];
        const rhs = lineText.split('=', 2)[1] ?? '';

        // Find identifiers on RHS that are defined earlier
        definedNames.forEach((name) => {
            if (name !== sym.name) {
                const nameRegex = new RegExp(`\\b${name}\\b`);
                if (nameRegex.test(rhs)) {
                    edges.push({ from: name, to: sym.name });
                }
            }
        });
    });

    let mermaidGraph = 'graph LR\n';
    definedNames.forEach((name) => {
        mermaidGraph += `    ${name}["${name}"]\n`;
    });
    edges.forEach((e) => {
        mermaidGraph += `    ${e.from} --> ${e.to}\n`;
    });

    const filename = document.fileName.split('/').pop() ?? 'file.phs';

    currentPanel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Physure Dependency Graph</title>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    </script>
    <style>
        body { font-family: var(--vscode-font-family); background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px; }
        h2 { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); }
        .mermaid { display: flex; justify-content: center; margin-top: 20px; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 8px; border: 1px solid var(--vscode-widget-border, #333); }
    </style>
</head>
<body>
    <h2>🕸️ Calculation Dependency Graph: ${filename}</h2>
    <div class="mermaid">
        ${mermaidGraph}
    </div>
</body>
</html>`;
}
