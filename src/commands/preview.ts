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
                            let cleanHtml = currentPanel.webview.html;
                            // Transform VS Code webview specific UI into standalone report HTML
                            cleanHtml = cleanHtml.replace(
                                /<button class="btn-action" onclick="exportReport\(\)">.*?<\/button>/g,
                                '<button class="btn-action" onclick="window.print()">🖨️ Imprimir / PDF</button>'
                            );
                            cleanHtml = cleanHtml.replace(
                                /let vscode;[\s\S]*?function exportReport\(\) \{[\s\S]*?\}/g,
                                ''
                            );

                            await vscode.workspace.fs.writeFile(uri, Buffer.from(cleanHtml, 'utf8'));
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
    let eqCounter = 1;
    let figCounter = 1;

    while (idx < lines.length) {
        const lineText = lines[idx];
        const trimmed = lineText.trim();

        // Single-line text block: ```text```
        if (trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.length > 6) {
            const innerText = trimmed.substring(3, trimmed.length - 3).trim();
            const interpolatedText = resultsMap.get(idx) ?? innerText;
            rowsHtml += `
                <div class="academic-prose">
                    <p>${escapeHtml(interpolatedText)}</p>
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
            if (idx < lines.length && lines[idx].trim().startsWith('```')) {
                idx++; // consume closing ```
            }
            const fullText = textBlockLines.join('\n').trim();
            const interpolatedText = resultsMap.get(blockStartLine) ?? fullText;
            if (interpolatedText) {
                const formattedParagraphs = escapeHtml(interpolatedText)
                    .split('\n\n')
                    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
                    .join('');

                rowsHtml += `
                    <div class="academic-prose">
                        ${formattedParagraphs}
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
            const eqNum = eqCounter++;

            rowsHtml += `
                <div class="academic-eq-block">
                    <div class="eq-header">
                        <span class="eq-label">Definition &bull; Lines ${funcStartLine + 1}&ndash;${idx}</span>
                        <span class="eq-num">(${eqNum})</span>
                    </div>
                    ${latexFunc ? `<div class="eq-math">\\[ ${latexFunc} \\]</div>` : ''}
                    <div class="eq-code-ref"><code>${escapeHtml(fullFuncText)}</code></div>
                </div>
            `;
            continue;
        }

        // Normal single calculation line
        const output = resultsMap.get(idx);
        const latex = expressionToLatex(trimmed);
        const lineNum = idx + 1;

        if (output && output.startsWith('[PLOT_IMAGE:')) {
            const b64Uri = output.substring(12, output.length - 1);
            const figNum = figCounter++;
            rowsHtml += `
                <figure class="academic-figure">
                    <div class="fig-img-wrapper">
                        <img src="${b64Uri}" class="academic-fig-img" alt="Physure Figure ${figNum}" />
                    </div>
                    <figcaption class="fig-caption">
                        <strong>Figura ${figNum}.</strong> Representación gráfica generada a partir de <code>${escapeHtml(trimmed)}</code> (Línea ${lineNum}).
                    </figcaption>
                </figure>
            `;
        } else {
            const eqNum = eqCounter++;
            let evalBadgeHtml = '';

            if (output) {
                if (output.includes('Error') || output.includes('Mismatch')) {
                    evalBadgeHtml = `<div class="eval-result eval-error">❌ ${escapeHtml(output)}</div>`;
                } else {
                    evalBadgeHtml = `<div class="eval-result eval-success">&rArr; ${escapeHtml(output)}</div>`;
                }
            }

            rowsHtml += `
                <div class="academic-eq-block">
                    <div class="eq-header">
                        <span class="eq-label">Línea ${lineNum}</span>
                        <span class="eq-num">(${eqNum})</span>
                    </div>
                    ${latex ? `<div class="eq-math">\\[ ${escapeHtml(latex)} \\]</div>` : ''}
                    <div class="eq-body">
                        <div class="eq-code-ref"><code>${escapeHtml(trimmed)}</code></div>
                        ${evalBadgeHtml}
                    </div>
                </div>
            `;
        }
        idx++;
    }

    let varsHtml = '';
    symbols.forEach((sym) => {
        const val = resultsMap.get(sym.line) ?? '&mdash;';
        varsHtml += `
            <tr>
                <td><code class="sym-name">${escapeHtml(sym.name)}</code></td>
                <td>Línea ${sym.line + 1}</td>
                <td class="sym-val"><strong>${escapeHtml(val)}</strong></td>
            </tr>
        `;
    });

    currentPanel.webview.html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Informe Técnico Physure: ${escapeHtml(filename)}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=Fira+Code:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"
        onload="renderMathInElement(document.body);"></script>
    <style>
        :root {
            --font-paper: 'Crimson Pro', 'Georgia', 'Times New Roman', serif;
            --font-sans: 'Inter', -apple-system, sans-serif;
            --font-mono: 'Fira Code', monospace;

            /* Light Academic Palette (Default) */
            --bg-canvas: #f4f6f9;
            --bg-paper: #ffffff;
            --text-primary: #1e293b;
            --text-secondary: #475569;
            --text-muted: #64748b;
            
            --border-color: #e2e8f0;
            --border-rule: #0f172a;

            --accent-primary: #0284c7;
            --accent-success: #059669;
            --accent-error: #dc2626;

            --code-bg: #f8fafc;
            --code-border: #e2e8f0;
            --shadow-paper: 0 10px 30px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04);
        }

        body.dark-mode {
            /* Dark Academic Palette */
            --bg-canvas: #0f1117;
            --bg-paper: #181b24;
            --text-primary: #f1f5f9;
            --text-secondary: #cbd5e1;
            --text-muted: #94a3b8;
            
            --border-color: #2e3545;
            --border-rule: #e2e8f0;

            --accent-primary: #38bdf8;
            --accent-success: #34d399;
            --accent-error: #f87171;

            --code-bg: rgba(15, 23, 42, 0.7);
            --code-border: rgba(255, 255, 255, 0.08);
            --shadow-paper: 0 12px 36px rgba(0, 0, 0, 0.4);
        }

        body {
            font-family: var(--font-sans);
            background-color: var(--bg-canvas);
            color: var(--text-primary);
            margin: 0;
            padding: 40px 20px;
            line-height: 1.7;
        }

        .paper-container {
            max-width: 880px;
            margin: 0 auto;
            background-color: var(--bg-paper);
            padding: 56px 64px;
            border-radius: 12px;
            box-shadow: var(--shadow-paper);
            border: 1px solid var(--border-color);
        }

        /* Academic Article Header */
        .academic-header {
            border-bottom: 2px solid var(--border-rule);
            padding-bottom: 20px;
            margin-bottom: 32px;
        }

        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.82rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-muted);
            font-weight: 600;
            margin-bottom: 12px;
        }

        .paper-title {
            font-family: var(--font-paper);
            font-size: 2.3rem;
            font-weight: 700;
            color: var(--text-primary);
            margin: 0 0 10px 0;
            line-height: 1.25;
        }

        .paper-meta {
            font-size: 0.92rem;
            color: var(--text-secondary);
            display: flex;
            gap: 20px;
            align-items: center;
        }

        .meta-tag {
            background: rgba(2, 132, 199, 0.08);
            color: var(--accent-primary);
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        .actions-toolbar {
            display: flex;
            gap: 10px;
        }

        .btn-action {
            background: var(--bg-canvas);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 600;
            transition: all 0.2s ease;
        }

        .btn-action:hover {
            border-color: var(--accent-primary);
            color: var(--accent-primary);
        }

        /* Section Headings */
        h2.sec-title {
            font-family: var(--font-paper);
            font-size: 1.45rem;
            font-weight: 700;
            color: var(--text-primary);
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 6px;
            margin-top: 36px;
            margin-bottom: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Academic Booktabs Table */
        .booktabs-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.95rem;
            margin-bottom: 28px;
        }

        .booktabs-table th {
            border-top: 2px solid var(--border-rule);
            border-bottom: 1px solid var(--text-primary);
            padding: 8px 12px;
            text-align: left;
            font-weight: 600;
            color: var(--text-primary);
        }

        .booktabs-table td {
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-color);
            color: var(--text-secondary);
        }

        .booktabs-table tr:last-child td {
            border-bottom: 2px solid var(--border-rule);
        }

        .sym-name {
            font-family: var(--font-mono);
            color: var(--accent-primary);
            font-weight: 600;
        }

        .sym-val {
            color: var(--accent-success);
        }

        /* Academic Prose / Paragraphs */
        .academic-prose {
            font-family: var(--font-paper);
            font-size: 1.15rem;
            color: var(--text-primary);
            line-height: 1.8;
            margin-bottom: 20px;
        }

        .academic-prose p {
            margin: 0 0 12px 0;
            text-align: justify;
        }

        /* Equation Block */
        .academic-eq-block {
            background-color: var(--code-bg);
            border: 1px solid var(--code-border);
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 18px;
        }

        .eq-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.78rem;
            color: var(--text-muted);
            margin-bottom: 6px;
        }

        .eq-num {
            font-weight: 600;
            font-family: var(--font-mono);
        }

        .eq-math {
            font-size: 1.25rem;
            margin: 12px 0;
            text-align: center;
        }

        .eq-body {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 10px;
        }

        .eq-code-ref {
            font-family: var(--font-mono);
            font-size: 0.88rem;
            color: var(--text-secondary);
            overflow-x: auto;
        }

        .eval-result {
            font-family: var(--font-mono);
            font-size: 0.88rem;
            font-weight: 600;
            word-break: break-word;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
            padding: 8px 12px;
            border-radius: 6px;
            max-height: 180px;
            overflow-y: auto;
        }

        .eval-success {
            color: var(--accent-success);
            background: rgba(5, 150, 105, 0.08);
            border: 1px solid rgba(5, 150, 105, 0.25);
        }

        .eval-error {
            color: var(--accent-error);
            background: rgba(220, 38, 38, 0.08);
            border: 1px solid rgba(220, 38, 38, 0.25);
        }

        /* Formal Academic Figures */
        .academic-figure {
            margin: 28px 0;
            text-align: center;
        }

        .fig-img-wrapper {
            background-color: #ffffff;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 12px;
            display: inline-block;
            box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }

        .academic-fig-img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            display: block;
        }

        .fig-caption {
            font-size: 0.88rem;
            color: var(--text-secondary);
            margin-top: 10px;
            font-style: italic;
        }

        @media print {
            body {
                background: #ffffff;
                padding: 0;
            }
            .paper-container {
                box-shadow: none;
                border: none;
                padding: 0;
                max-width: 100%;
            }
            .actions-toolbar {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="paper-container">
        <header class="academic-header">
            <div class="header-top">
                <span>Physure Computational Report</span>
                <div class="actions-toolbar">
                    <button class="btn-action" onclick="toggleTheme()">🌓 Tema</button>
                    <button class="btn-action" onclick="exportReport()">📥 Exportar Reporte</button>
                </div>
            </div>
            <h1 class="paper-title">${escapeHtml(filename)}</h1>
            <div class="paper-meta">
                <span class="meta-tag">Reporte Académico</span>
                <span>Generado automáticamente por Physure Engine</span>
            </div>
        </header>

        <h2 class="sec-title">1. Resumen de Variables y Magnitudes</h2>
        <table class="booktabs-table">
            <thead>
                <tr>
                    <th>Símbolo</th>
                    <th>Ubicación</th>
                    <th>Valor Evaluado</th>
                </tr>
            </thead>
            <tbody>
                ${varsHtml || '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No se registraron asignaciones de variables.</td></tr>'}
            </tbody>
        </table>

        <h2 class="sec-title">2. Secuencia de Cálculos y Expresiones</h2>
        ${rowsHtml || '<p style="color: var(--text-muted);">No se detectaron expresiones evaluadas.</p>'}
    </div>

    <script>
        let vscode;
        if (typeof acquireVsCodeApi !== 'undefined') {
            vscode = acquireVsCodeApi();
        }
        function exportReport() {
            if (vscode) {
                vscode.postMessage({ command: 'exportHtml' });
            } else {
                window.print();
            }
        }
        function toggleTheme() {
            document.body.classList.toggle('dark-mode');
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
