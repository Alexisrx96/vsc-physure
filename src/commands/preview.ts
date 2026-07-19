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
            const interpolatedText = resultsMap.get(idx) ?? innerText;
            rowsHtml += `
                <div class="note-card">
                    <span class="card-line-badge">Line ${idx + 1} &bull; Text Note</span>
                    <div class="note-body-text">📝 <strong>Note:</strong> ${escapeHtml(interpolatedText)}</div>
                </div>
            `;
            idx++;
            continue;
        }

        // Multiline text block boundary: ```
        if (trimmed.startsWith('```')) {
            const blockStartLine = idx;
            idx++;
            const textBlockLines: string[] = [];
            while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
                textBlockLines.push(lines[idx]);
                idx++;
            }
            const blockEndLine = idx;
            if (idx < lines.length && lines[idx].trim().startsWith('```')) {
                idx++; // consume closing ```
            }
            const fullText = textBlockLines.join('\n').trim();
            const interpolatedText = resultsMap.get(blockStartLine) ?? fullText;
            if (interpolatedText) {
                rowsHtml += `
                    <div class="note-card">
                        <span class="card-line-badge">Lines ${blockStartLine + 1}-${blockEndLine + 1} &bull; Text Block</span>
                        <div class="note-body-text">📝 ${escapeHtml(interpolatedText).replace(/\n/g, '<br/>')}</div>
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
                    <span class="card-line-badge">Function Definition &bull; Lines ${funcStartLine + 1}-${idx}</span>
                    <div class="card-expr-box"><pre><code>${escapeHtml(fullFuncText)}</code></pre></div>
                    ${latexFunc ? `<div class="card-latex">\\[ ${latexFunc} \\]</div>` : ''}
                    <div class="card-result-pill badge-purple">⚡ Function Registered</div>
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
                resultHtml = `<div class="plot-container"><img src="${b64Uri}" class="plot-img" alt="Physure Live Plot" /></div>`;
            } else if (output.includes('Error') || output.includes('Mismatch')) {
                resultHtml = `<div class="card-result-pill badge-error">❌ ${escapeHtml(output)}</div>`;
            } else {
                resultHtml = `<div class="card-result-pill badge-success">▶ Result: <strong>${escapeHtml(output)}</strong></div>`;
            }
        }

        rowsHtml += `
            <div class="calc-card">
                <span class="card-line-badge">Line ${idx + 1}</span>
                <div class="card-expr-box"><code>${escapeHtml(trimmed)}</code></div>
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
                <td><code class="sym-code">${escapeHtml(sym.name)}</code></td>
                <td><span class="line-tag">Line ${sym.line + 1}</span></td>
                <td><strong class="val-text">${escapeHtml(val)}</strong></td>
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"
        onload="renderMathInElement(document.body);"></script>
    <style>
        :root {
            --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
            --font-mono: 'Fira Code', monospace;
            
            --bg-main: var(--vscode-editor-background, #0f1117);
            --fg-main: var(--vscode-editor-foreground, #e2e8f0);
            
            --card-bg: var(--vscode-sideBar-background, #171a23);
            --card-border: var(--vscode-widget-border, rgba(255, 255, 255, 0.08));
            
            --accent-cyan: #00f2fe;
            --accent-blue: #4facfe;
            --accent-emerald: #10b981;
            --accent-amber: #f59e0b;
            --accent-purple: #a855f7;
            --accent-rose: #f43f5e;
            
            --text-muted: #94a3b8;
            --code-bg: rgba(15, 23, 42, 0.7);
        }

        body {
            font-family: var(--font-sans);
            background-color: var(--bg-main);
            color: var(--fg-main);
            padding: 24px;
            margin: 0;
            line-height: 1.6;
        }

        h2, h3 {
            font-weight: 600;
            letter-spacing: -0.3px;
        }

        h3 {
            color: var(--accent-blue);
            margin-top: 28px;
            margin-bottom: 12px;
            font-size: 1.15rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header-banner {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(135deg, rgba(79, 172, 254, 0.12), rgba(0, 242, 254, 0.04));
            border: 1px solid rgba(79, 172, 254, 0.25);
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }

        .header-title {
            margin: 0;
            font-size: 1.25rem;
            color: #ffffff;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .calc-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-left: 4px solid var(--accent-blue);
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
        }

        .func-card {
            border-left-color: var(--accent-purple);
        }

        .note-card {
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.02));
            border: 1px solid rgba(245, 158, 11, 0.25);
            border-left: 4px solid var(--accent-amber);
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 14px;
        }

        .card-line-badge {
            display: inline-block;
            font-size: 0.72rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 2px 8px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.06);
            color: var(--text-muted);
            margin-bottom: 8px;
        }

        .card-expr-box {
            font-family: var(--font-mono);
            font-size: 0.92rem;
            background: var(--code-bg);
            border: 1px solid rgba(255, 255, 255, 0.06);
            padding: 10px 14px;
            border-radius: 6px;
            color: #f8fafc;
            overflow-x: auto;
            margin-top: 4px;
        }

        .card-expr-box code {
            font-family: inherit;
        }

        .card-latex {
            margin: 12px 0;
            padding: 8px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 6px;
            font-size: 1.15rem;
            text-align: center;
        }

        .card-result-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-top: 10px;
            padding: 6px 14px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .badge-success {
            background: rgba(16, 185, 129, 0.12);
            border: 1px solid rgba(16, 185, 129, 0.35);
            color: #34d399;
        }

        .badge-purple {
            background: rgba(168, 85, 247, 0.12);
            border: 1px solid rgba(168, 85, 247, 0.35);
            color: #c084fc;
        }

        .badge-error {
            background: rgba(244, 63, 94, 0.12);
            border: 1px solid rgba(244, 63, 94, 0.35);
            color: #fb7185;
        }

        .note-body-text {
            font-size: 0.98rem;
            color: #f1f5f9;
            margin-top: 6px;
        }

        .plot-container {
            margin-top: 12px;
            text-align: center;
        }

        .plot-img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
        }

        .table-glass {
            width: 100%;
            border-collapse: collapse;
            background: var(--card-bg);
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid var(--card-border);
            margin-bottom: 20px;
        }

        .table-glass th {
            background: rgba(255, 255, 255, 0.04);
            color: var(--text-muted);
            text-align: left;
            padding: 10px 16px;
            font-size: 0.82rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid var(--card-border);
        }

        .table-glass td {
            padding: 10px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            font-size: 0.92rem;
        }

        .sym-code {
            font-family: var(--font-mono);
            color: var(--accent-cyan);
        }

        .line-tag {
            color: var(--text-muted);
            font-size: 0.85rem;
        }

        .val-text {
            color: #34d399;
        }

        .btn-export {
            background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
            color: #0f172a;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.88rem;
            font-weight: 700;
            transition: opacity 0.2s;
        }

        .btn-export:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="header-banner">
        <h2 class="header-title">⚡ Physure Live Report: ${escapeHtml(filename)}</h2>
        <button class="btn-export" onclick="exportReport()">📥 Export HTML Report</button>
    </div>
    
    <h3>📋 Variables & Quantities</h3>
    <table class="table-glass">
        <thead>
            <tr><th>Symbol</th><th>Location</th><th>Evaluated Value</th></tr>
        </thead>
        <tbody>
            ${varsHtml || '<tr><td colspan="3" style="color: var(--text-muted);">No variable assignments detected.</td></tr>'}
        </tbody>
    </table>

    <h3>🧮 Calculation Notebook</h3>
    ${rowsHtml || '<p style="color: var(--text-muted);">No expressions evaluated yet.</p>'}

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
