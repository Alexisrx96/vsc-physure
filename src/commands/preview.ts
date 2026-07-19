import * as vscode from 'vscode';
import { getCachedLineResults, onInlayHintsChangeEvent } from '../providers/evalCodeLens';
import { findAssignmentSymbols } from '../tokenizer';
import { expressionToLatex } from '../providers/hover';
import { getI18n, getLanguage } from '../i18n';

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

                        if (uri) {
                            const standaloneAcademicHtml = buildAcademicReportHtml(activeEditor.document);
                            await vscode.workspace.fs.writeFile(uri, Buffer.from(standaloneAcademicHtml, 'utf8'));
                            vscode.window.showInformationMessage(`Physure academic report exported successfully to ${uri.fsPath}`);
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
    currentPanel.webview.html = buildNativeLivePreviewHtml(document);
}

/**
 * 1. NATIVE LIVE PREVIEW HTML (VS Code Webview Panel)
 * Seamlessly integrates into VS Code UI using workbench theme variables,
 * compact layout, responsive cards, and native editor styling.
 */
function buildNativeLivePreviewHtml(document: vscode.TextDocument): string {
    const t = getI18n(document.uri);
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
    let figCounter = 1;

    while (idx < lines.length) {
        const lineText = lines[idx];
        const trimmed = lineText.trim();

        // Single-line text block: ```text```
        if (trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.length > 6) {
            const innerText = trimmed.substring(3, trimmed.length - 3).trim();
            const interpolatedText = resultsMap.get(idx) ?? innerText;
            rowsHtml += `
                <div class="native-note-card">
                    <span class="native-badge-line">${t.line} ${idx + 1}</span>
                    <div class="native-note-text">${escapeHtml(interpolatedText)}</div>
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
                idx++;
            }
            const fullText = textBlockLines.join('\n').trim();
            const interpolatedText = resultsMap.get(blockStartLine) ?? fullText;
            if (interpolatedText) {
                const formattedParagraphs = escapeHtml(interpolatedText)
                    .split('\n\n')
                    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
                    .join('');

                rowsHtml += `
                    <div class="native-note-card">
                        <span class="native-badge-line">${t.lines} ${blockStartLine + 1}&ndash;${idx}</span>
                        <div class="native-note-text">${formattedParagraphs}</div>
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

        // Multiline Function Definition Header
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
                <div class="native-card native-func-card">
                    <span class="native-badge-line">${t.definition} &bull; ${t.lines} ${funcStartLine + 1}&ndash;${idx}</span>
                    <div class="native-code-box"><code>${escapeHtml(fullFuncText)}</code></div>
                    ${latexFunc ? `<div class="native-math">\\[ ${latexFunc} \\]</div>` : ''}
                </div>
            `;
            continue;
        }

        // Normal calculation line
        const output = resultsMap.get(idx);
        const latex = expressionToLatex(trimmed);
        const lineNum = idx + 1;

        if (output && output.startsWith('[PLOT_IMAGE:')) {
            const b64Uri = output.substring(12, output.length - 1);
            const figNum = figCounter++;
            rowsHtml += `
                <div class="native-plot-card">
                    <span class="native-badge-line">${t.figure} ${figNum} &bull; ${t.line} ${lineNum}</span>
                    <div class="native-img-wrapper">
                        <img src="${b64Uri}" class="native-img" alt="Physure Plot" />
                    </div>
                </div>
            `;
        } else {
            let evalResultHtml = '';
            if (output) {
                if (output.includes('Error') || output.includes('Mismatch')) {
                    evalResultHtml = `<div class="native-res-pill res-error">❌ ${escapeHtml(output)}</div>`;
                } else {
                    evalResultHtml = `<div class="native-res-pill res-success">&rArr; ${escapeHtml(output)}</div>`;
                }
            }

            rowsHtml += `
                <div class="native-card">
                    <span class="native-badge-line">${t.line} ${lineNum}</span>
                    <div class="native-code-box"><code>${escapeHtml(trimmed)}</code></div>
                    ${latex ? `<div class="native-math">\\[ ${escapeHtml(latex)} \\]</div>` : ''}
                    ${evalResultHtml}
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
                <td><code class="native-sym-name">${escapeHtml(sym.name)}</code></td>
                <td><span class="native-dim">${t.line} ${sym.line + 1}</span></td>
                <td><strong class="native-val">${escapeHtml(val)}</strong></td>
            </tr>
        `;
    });

    return `<!DOCTYPE html>
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
            font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 16px 20px;
            margin: 0;
            line-height: 1.5;
        }

        .native-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--vscode-sideBar-background, rgba(127,127,127,0.06));
            border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.15));
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 18px;
        }

        .native-toolbar-title {
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .native-btn {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #ffffff);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 500;
            transition: background 0.15s ease;
        }

        .native-btn:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }

        .native-sec-title {
            font-size: 1rem;
            font-weight: 600;
            color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-textLink-foreground, #3794ff));
            margin-top: 22px;
            margin-bottom: 10px;
        }

        .native-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--vscode-sideBar-background, rgba(127,127,127,0.05));
            border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.15));
            border-radius: 6px;
            overflow: hidden;
            margin-bottom: 18px;
            font-size: 0.9rem;
        }

        .native-table th {
            background: rgba(127,127,127,0.08);
            color: var(--vscode-descriptionForeground, #888888);
            text-align: left;
            padding: 8px 12px;
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.15));
        }

        .native-table td {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.08));
        }

        .native-sym-name {
            font-family: var(--vscode-editor-font-family, monospace);
            color: var(--vscode-symbolIcon-variableForeground, #75beff);
        }

        .native-dim {
            color: var(--vscode-descriptionForeground, #888888);
            font-size: 0.85rem;
        }

        .native-val {
            color: var(--vscode-testing-iconPassed, #73c991);
        }

        .native-card {
            background: var(--vscode-sideBar-background, rgba(127,127,127,0.06));
            border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.15));
            border-left: 3px solid var(--vscode-symbolIcon-fieldForeground, #4ec9b0);
            border-radius: 6px;
            padding: 12px 14px;
            margin-bottom: 10px;
        }

        .native-func-card {
            border-left-color: var(--vscode-symbolIcon-functionForeground, #b180ff);
        }

        .native-note-card {
            background: rgba(127,127,127,0.04);
            border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.15));
            border-left: 3px solid var(--vscode-symbolIcon-eventForeground, #e2c08d);
            border-radius: 6px;
            padding: 12px 14px;
            margin-bottom: 10px;
        }

        .native-badge-line {
            font-size: 0.72rem;
            font-weight: 600;
            color: var(--vscode-descriptionForeground, #888888);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-block;
            margin-bottom: 4px;
        }

        .native-code-box {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 0.9rem;
            color: var(--vscode-editor-foreground);
            background: rgba(0, 0, 0, 0.15);
            padding: 6px 10px;
            border-radius: 4px;
            overflow-x: auto;
        }

        .native-math {
            text-align: center;
            margin: 8px 0;
            font-size: 1.1rem;
        }

        .native-res-pill {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 0.88rem;
            font-weight: 600;
            margin-top: 8px;
            padding: 6px 10px;
            border-radius: 4px;
            word-break: break-word;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
            max-height: 160px;
            overflow-y: auto;
        }

        .res-success {
            background: rgba(115, 201, 145, 0.15);
            color: var(--vscode-testing-iconPassed, #73c991);
            border: 1px solid rgba(115, 201, 145, 0.3);
        }

        .res-error {
            background: rgba(241, 76, 76, 0.15);
            color: var(--vscode-testing-iconFailed, #f14c4c);
            border: 1px solid rgba(241, 76, 76, 0.3);
        }

        .native-plot-card {
            background: var(--vscode-sideBar-background, rgba(127,127,127,0.06));
            border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.15));
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
            text-align: center;
        }

        .native-img-wrapper {
            margin-top: 8px;
            display: inline-block;
        }

        .native-img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.2));
        }
    </style>
</head>
<body>
    <div class="native-toolbar">
        <div class="native-toolbar-title">
            <span>⚡ Physure Live: ${escapeHtml(filename)}</span>
        </div>
        <button class="native-btn" onclick="exportReport()">${t.exportReport}</button>
    </div>

    <div class="native-sec-title">${t.secVariables}</div>
    <table class="native-table">
        <thead>
            <tr>
                <th>${t.symbol}</th>
                <th>${t.location}</th>
                <th>${t.evaluatedValue}</th>
            </tr>
        </thead>
        <tbody>
            ${varsHtml || `<tr><td colspan="3" style="text-align: center; color: var(--vscode-descriptionForeground);">${t.noVariables}</td></tr>`}
        </tbody>
    </table>

    <div class="native-sec-title">${t.secSequence}</div>
    ${rowsHtml || `<p style="color: var(--vscode-descriptionForeground);">${t.noExpressions}</p>`}

    <script>
        const vscode = acquireVsCodeApi();
        function exportReport() {
            vscode.postMessage({ command: 'exportHtml' });
        }
    </script>
</body>
</html>`;
}

/**
 * 2. STANDALONE ACADEMIC MANUSCRIPT REPORT HTML (Exported File)
 * Professional LaTeX publication paper style with Crimson Pro serif typography,
 * centered A4 paper container with paper box shadow, Booktabs tables,
 * numbered equations (1), (2), formal figure captions, and theme toggle.
 */
function buildAcademicReportHtml(document: vscode.TextDocument): string {
    const t = getI18n(document.uri);
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
                idx++;
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

        // Multiline Function Definition Header
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
                        <span class="eq-label">${t.definition} &bull; ${t.lines} ${funcStartLine + 1}&ndash;${idx}</span>
                        <span class="eq-num">(${eqNum})</span>
                    </div>
                    ${latexFunc ? `<div class="eq-math">\\[ ${latexFunc} \\]</div>` : ''}
                    <div class="eq-code-ref"><code>${escapeHtml(fullFuncText)}</code></div>
                </div>
            `;
            continue;
        }

        // Normal calculation line
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
                        <strong>${t.figure} ${figNum}.</strong> ${t.figCaptionPrefix} <code>${escapeHtml(trimmed)}</code> (${t.line} ${lineNum}).
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
                        <span class="eq-label">${t.line} ${lineNum}</span>
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
                <td>${t.line} ${sym.line + 1}</td>
                <td class="sym-val"><strong>${escapeHtml(val)}</strong></td>
            </tr>
        `;
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.reportTitle}: ${escapeHtml(filename)}</title>
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

            /* Light Academic Palette (Default Paper) */
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
                <span>${t.subTitle}</span>
                <div class="actions-toolbar">
                    <button class="btn-action" onclick="toggleTheme()">${t.themeToggle}</button>
                    <button class="btn-action" onclick="window.print()">${t.printPdf}</button>
                </div>
            </div>
            <h1 class="paper-title">${escapeHtml(filename)}</h1>
            <div class="paper-meta">
                <span class="meta-tag">${t.academicTag}</span>
                <span>${t.autoGenerated}</span>
            </div>
        </header>

        <h2 class="sec-title">${t.secVariables}</h2>
        <table class="booktabs-table">
            <thead>
                <tr>
                    <th>${t.symbol}</th>
                    <th>${t.location}</th>
                    <th>${t.evaluatedValue}</th>
                </tr>
            </thead>
            <tbody>
                ${varsHtml || `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">${t.noVariables}</td></tr>`}
            </tbody>
        </table>

        <h2 class="sec-title">${t.secSequence}</h2>
        ${rowsHtml || `<p style="color: var(--text-muted);">${t.noExpressions}</p>`}
    </div>

    <script>
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
