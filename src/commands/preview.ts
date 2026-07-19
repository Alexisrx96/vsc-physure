import * as vscode from 'vscode';
import { getCachedLineResults, onInlayHintsChangeEvent } from '../providers/evalCodeLens';
import { findAssignmentSymbols } from '../tokenizer';
import { expressionToLatex } from '../providers/hover';

let currentPanel: vscode.WebviewPanel | undefined;

export function registerPreviewCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.openPreview', () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.languageId !== 'phs') {
                vscode.window.showInformationMessage('Open a Physure (.phs) file to view live calculation preview.');
                return;
            }

            if (currentPanel) {
                currentPanel.reveal(vscode.ViewColumn.Beside);
            } else {
                currentPanel = vscode.window.createWebviewPanel(
                    'physurePreview',
                    `Physure Live Preview: ${activeEditor.document.fileName.split('/').pop()}`,
                    vscode.ViewColumn.Beside,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                    }
                );

                currentPanel.webview.onDidReceiveMessage(async (message) => {
                    if (message.command === 'exportHtml' && activeEditor) {
                        const defaultUri = vscode.Uri.file(activeEditor.document.fileName.replace(/\.phs$/, '.report.html'));
                        const uri = await vscode.window.showSaveDialog({
                            defaultUri,
                            filters: { 'HTML Report': ['html'] },
                        });

                        if (uri && currentPanel) {
                            await vscode.workspace.fs.writeFile(uri, Buffer.from(currentPanel.webview.html, 'utf8'));
                            vscode.window.showInformationMessage(`Physure report exported successfully to ${uri.fsPath}`);
                        }
                    }
                });

                currentPanel.onDidDispose(() => {
                    currentPanel = undefined;
                });
            }

            updateWebviewContent(activeEditor.document);
        })
    );

    context.subscriptions.push(
        onInlayHintsChangeEvent.event(() => {
            if (currentPanel && vscode.window.activeTextEditor) {
                updateWebviewContent(vscode.window.activeTextEditor.document);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (currentPanel && editor && editor.document.languageId === 'phs') {
                currentPanel.title = `Physure Live Preview: ${editor.document.fileName.split('/').pop()}`;
                updateWebviewContent(editor.document);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (currentPanel && e.document.languageId === 'phs') {
                updateWebviewContent(e.document);
            }
        })
    );
}

function updateWebviewContent(document: vscode.TextDocument): void {
    if (!currentPanel) {
        return;
    }

    const filename = document.fileName.split('/').pop() ?? 'Document';
    const text = document.getText();
    const lines = text.split('\n');
    const symbols = findAssignmentSymbols(lines);
    const resultsMap = new Map<number, string>();

    for (const item of getCachedLineResults(document.uri.toString())) {
        resultsMap.set(item.line, item.output);
    }

    let rowsHtml = '';
    let idx = 0;

    while (idx < lines.length) {
        const lineText = lines[idx];
        const trimmed = lineText.trim();

        // Single-line text block: ```text```
        if (trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.length > 6) {
            const innerText = trimmed.substring(3, trimmed.length - 3).trim();
            rowsHtml += `
                <div class="note-card">
                    <div class="card-line">Line ${idx + 1}</div>
                    <div class="note-body">📝 <strong>Note:</strong> ${escapeHtml(innerText)}</div>
                </div>
            `;
            idx++;
            continue;
        }

        // Multiline text block boundary: ```
        if (trimmed.startsWith('```')) {
            const blockStartLine = idx + 1;
            idx++;
            const textBlockLines: string[] = [];
            while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
                textBlockLines.push(lines[idx]);
                idx++;
            }
            if (idx < lines.length && lines[idx].trim().startsWith('```')) {
                idx++; // consume closing ```
            }
            const fullText = textBlockLines.join('\n').trim();
            const interpolatedText = resultsMap.get(blockStartLine) ?? fullText;
            if (interpolatedText) {
                rowsHtml += `
                    <div class="note-card">
                        <div class="card-line">Text Block (Lines ${blockStartLine}-${idx})</div>
                        <div class="note-body">📝 <strong>Note:</strong> ${escapeHtml(interpolatedText).replace(/\n/g, '<br/>')}</div>
                    </div>
                `;
            }
            continue;
        }

        // Skip blank or pure comment lines
        if (!trimmed || trimmed.startsWith('#')) {
            idx++;
            continue;
        }

        // Multiline Function Definition Header (Indent-aware grouping)
        if (trimmed.endsWith('=') || /^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)\s*=$/.test(trimmed)) {
            const funcStartLine = idx;
            const funcLines: string[] = [lineText];
            idx++;

            while (idx < lines.length) {
                const nextLine = lines[idx];
                const nextTrimmed = nextLine.trim();
                const hasIndent = nextLine.search(/\S/) > 0;
                if (!nextTrimmed || nextTrimmed.startsWith('#') || hasIndent) {
                    funcLines.push(nextLine);
                    idx++;
                } else {
                    break;
                }
            }

            const fullFuncText = funcLines.join('\n').trim();
            const latexFunc = functionToLatex(funcLines);

            rowsHtml += `
                <div class="calc-card func-card">
                    <div class="card-line">Function Definition (Lines ${funcStartLine + 1}-${idx})</div>
                    <div class="card-expr"><pre><code>${escapeHtml(fullFuncText)}</code></pre></div>
                    ${latexFunc ? `<div class="card-latex">\\[ ${latexFunc} \\]</div>` : ''}
                    <div class="card-result">▶ Function Registered</div>
                </div>
            `;
            continue;
        }

        // Normal single calculation line
        const output = resultsMap.get(idx);
        const latex = expressionToLatex(trimmed);

        let resultHtml = '';
        if (output) {
            if (output.startsWith('[PLOT_IMAGE:')) {
                const b64Uri = output.substring(12, output.length - 1);
                resultHtml = `<div class="plot-container"><img src="${b64Uri}" class="plot-img" /></div>`;
            } else {
                resultHtml = `<div class="card-result">▶ Result: <strong>${escapeHtml(output)}</strong></div>`;
            }
        }

        rowsHtml += `
            <div class="calc-card">
                <div class="card-line">Line ${idx + 1}</div>
                <div class="card-expr"><code>${escapeHtml(trimmed)}</code></div>
                ${latex ? `<div class="card-latex">\\[ ${escapeHtml(latex)} \\]</div>` : ''}
                ${resultHtml}
            </div>
        `;
        idx++;
    }

    let varsHtml = '';
    symbols.forEach((sym) => {
        const val = resultsMap.get(sym.line) ?? '-';
        varsHtml += `
            <tr>
                <td><code>${escapeHtml(sym.name)}</code></td>
                <td>Line ${sym.line + 1}</td>
                <td><strong style="color: #4ec9b0;">${escapeHtml(val)}</strong></td>
            </tr>
        `;
    });

    currentPanel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Physure Live Preview</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"
        onload="renderMathInElement(document.body);"></script>
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.5;
        }
        h2, h3 { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); }
        .calc-card, .note-card {
            border: 1px solid var(--vscode-widget-border, #333);
            background: var(--vscode-editor-inactiveSelectionBackground, #1e1e1e);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .calc-card {
            border-left: 4px solid var(--vscode-symbolIcon-fieldForeground, #4ec9b0);
        }
        .note-card {
            border-left: 4px solid var(--vscode-textBlockQuote-border, #ce9178);
            background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08));
        }
        .card-line { font-size: 0.8em; color: var(--vscode-descriptionForeground, #888); }
        .card-expr { margin-top: 4px; font-family: monospace; }
        .card-latex { margin: 8px 0; font-size: 1.1em; text-align: center; }
        .card-result { margin-top: 6px; font-size: 0.95em; color: var(--vscode-textPreformat-foreground, #ce9178); }
        .note-body { margin-top: 6px; font-size: 0.95em; }
        .plot-container { margin-top: 10px; text-align: center; }
        .plot-img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--vscode-widget-border, #444); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--vscode-widget-border, #333); }
        th { background-color: var(--vscode-sideBar-background, #252526); }
        .top-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-widget-border, #333); padding-bottom: 10px; margin-bottom: 15px; }
        .btn-export { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 0.9em; font-weight: 500; }
        .btn-export:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    </style>
</head>
<body>
    <div class="top-bar">
        <h2 style="margin: 0;">⚡ Physure Live Preview: ${escapeHtml(filename)}</h2>
        <button class="btn-export" onclick="exportReport()">📥 Export HTML Report</button>
    </div>
    
    <h3>📋 Variables & Quantities</h3>
    <table>
        <thead>
            <tr><th>Symbol</th><th>Source</th><th>Evaluated Value</th></tr>
        </thead>
        <tbody>
            ${varsHtml || '<tr><td colspan="3">No variable assignments detected.</td></tr>'}
        </tbody>
    </table>

    <h3>🧮 Calculation Notebook</h3>
    ${rowsHtml || '<p>No expressions evaluated yet.</p>'}

    <script>
        const vscode = acquireVsCodeApi();
        function exportReport() {
            vscode.postMessage({ command: 'exportHtml' });
        }
    </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function functionToLatex(funcLines: string[]): string | undefined {
    if (funcLines.length === 0) {
        return undefined;
    }

    let headerLatex = expressionToLatex(funcLines[0]) ?? funcLines[0].trim();
    if (headerLatex.endsWith('=')) {
        headerLatex += ' &';
    }

    const bodyParts: string[] = [];
    for (let i = 1; i < funcLines.length; i++) {
        const lineTrimmed = funcLines[i].trim();
        if (!lineTrimmed || lineTrimmed.startsWith('#')) {
            continue;
        }
        const lineLatex = expressionToLatex(lineTrimmed) ?? lineTrimmed;
        bodyParts.push(`& ${lineLatex}`);
    }

    if (bodyParts.length === 0) {
        return headerLatex;
    }

    return `\\begin{aligned}\n${headerLatex} \\\\\n${bodyParts.join(' \\\\\n')}\n\\end{aligned}`;
}
