import * as vscode from 'vscode';
import { getCachedLineResults, onInlayHintsChangeEvent } from '../providers/evalCodeLens';
import { findAssignmentSymbols, extractMetadata } from '../tokenizer';
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
                    const cleanPill = formatResultDisplay(output);
                    evalResultHtml = `<div class="native-res-pill res-success">&rArr; ${escapeHtml(cleanPill)}</div>`;
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
 * STANDALONE ACADEMIC MANUSCRIPT REPORT HTML (Exported File)
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
                <div class="latex-prose">
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
                    <div class="latex-prose">
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
                <div class="latex-eq-container">
                    <div class="latex-eq-main">
                        ${latexFunc ? `\\[ ${latexFunc} \\]` : ''}
                    </div>
                    <div class="latex-eq-num">(${eqNum})</div>
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
                <figure class="latex-figure">
                    <div class="fig-frame">
                        <img src="${b64Uri}" class="fig-img" alt="Figure ${figNum}" />
                    </div>
                    <figcaption class="fig-caption">
                        <strong>${t.figure} ${figNum}.</strong> ${t.figCaptionPrefix} <code>${escapeHtml(trimmed)}</code> (${t.line} ${lineNum}).
                    </figcaption>
                </figure>
            `;
        } else {
            // Skip lines with no math and no evaluation output
            if (!latex && !output) {
                idx++;
                continue;
            }

            const eqNum = eqCounter++;
            let fullMathExpr = '';

            if (output && (output.includes('Error') || output.includes('Mismatch'))) {
                const errText = output.replace(/[{}]/g, '');
                fullMathExpr = latex ? `${latex} \\quad \\text{\\textcolor{red}{[${errText}]}}` : `\\text{\\textcolor{red}{[${errText}]}}`;
            } else if (latex && output) {
                const evalLatex = formatResultLatex(output);
                const cleanResult = evalLatex.replace(/^\\quad\s*/, '');
                const combinedLength = latex.length + cleanResult.length;

                // For long equations or complex expressions, break into 2 aligned lines at '=' and '\implies'
                if (combinedLength > 45 || latex.includes('\\frac') || latex.includes('\\sqrt') || latex.includes('linspace')) {
                    let lhsRhs = latex;
                    if (lhsRhs.includes('=')) {
                        lhsRhs = lhsRhs.replace('=', '&amp;=');
                    } else {
                        lhsRhs = `&amp; ${lhsRhs}`;
                    }
                    fullMathExpr = `\\begin{aligned} ${lhsRhs} \\\\ &amp;${cleanResult} \\end{aligned}`;
                } else {
                    fullMathExpr = `${latex} ${evalLatex}`;
                }
            } else if (latex) {
                fullMathExpr = latex;
            } else if (output) {
                const evalLatex = formatResultLatex(output);
                fullMathExpr = evalLatex.replace(/^\\quad\s*/, '');
            }

            rowsHtml += `
                <div class="latex-eq-container">
                    ${fullMathExpr ? `<div class="latex-eq-main">\\[ ${fullMathExpr} \\]</div>` : ''}
                    <div class="latex-eq-num">(${eqNum})</div>
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
                <td><code>${escapeHtml(sym.name)}</code></td>
                <td>${t.line} ${sym.line + 1}</td>
                <td><strong>${escapeHtml(val)}</strong></td>
            </tr>
        `;
    });

    const meta = extractMetadata(lines);
    const paperTitle = meta.title ? escapeHtml(meta.title) : escapeHtml(filename);
    const paperInst = meta.institution ? escapeHtml(meta.institution) : t.subTitle;
    const currentDateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const paperDate = meta.date ? escapeHtml(meta.date) : currentDateStr;
    const paperAuthor = meta.author ? escapeHtml(meta.author) : '';
    const paperMetaText = [paperAuthor, paperDate, 'Physure Computation Engine'].filter(Boolean).join(' &bull; ');

    let abstractBlockHtml = '';
    if (meta.abstract) {
        const abstractLabel = getLanguage() === 'es' ? 'Resumen' : 'Abstract';
        abstractBlockHtml = `
            <div class="latex-abstract">
                <div class="abstract-title">${abstractLabel}</div>
                <p>${escapeHtml(meta.abstract)}</p>
            </div>
        `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${paperTitle} &mdash; ${t.reportTitle}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"
        onload="renderMathInElement(document.body);"></script>
    <style>
        @page {
            size: A4;
            margin: 25mm 20mm;
        }

        body {
            font-family: 'Crimson Pro', 'Georgia', 'Times New Roman', serif;
            font-size: 11pt;
            color: #111111;
            background-color: #ffffff;
            line-height: 1.6;
            margin: 0;
            padding: 40px 20px;
        }

        .paper-manuscript {
            max-width: 820px;
            margin: 0 auto;
            background: #ffffff;
            padding: 0;
        }

        /* Top Actions Bar (Print Only UI) */
        .no-print-bar {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 24px;
        }

        .btn-print {
            font-family: sans-serif;
            background: #ffffff;
            color: #333333;
            border: 1px solid #999999;
            padding: 6px 14px;
            font-size: 0.85rem;
            cursor: pointer;
            border-radius: 3px;
        }

        .btn-print:hover {
            background: #f0f0f0;
            border-color: #000000;
        }

        /* Formal Article Header */
        .paper-header {
            text-align: center;
            border-top: 1.5pt solid #000000;
            border-bottom: 1.5pt solid #000000;
            padding: 20px 0 16px 0;
            margin-bottom: 32px;
        }

        .paper-institution {
            font-family: sans-serif;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #555555;
            margin-bottom: 8px;
        }

        .paper-title {
            font-size: 2rem;
            font-weight: 700;
            margin: 0 0 10px 0;
            line-height: 1.2;
            color: #000000;
        }

        .paper-author-meta {
            font-style: italic;
            font-size: 0.95rem;
            color: #333333;
        }

        /* Abstract Section */
        .latex-abstract {
            width: 86%;
            margin: 0 auto 36px auto;
            font-size: 0.95rem;
            font-style: italic;
            line-height: 1.6;
            text-align: justify;
            border-left: 2pt solid #000000;
            padding-left: 16px;
        }

        .abstract-title {
            font-family: sans-serif;
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            margin-bottom: 6px;
            font-style: normal;
            color: #000000;
        }

        /* Formal Section Headings */
        h2.paper-sec-title {
            font-size: 1.3rem;
            font-weight: 700;
            border-bottom: 0.75pt solid #000000;
            padding-bottom: 4px;
            margin-top: 36px;
            margin-bottom: 16px;
            color: #000000;
        }

        /* Formal LaTeX Booktabs Table */
        .booktabs {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.95rem;
            margin: 20px 0 32px 0;
        }

        .booktabs th {
            border-top: 1.5pt solid #000000;
            border-bottom: 0.75pt solid #000000;
            padding: 6px 10px;
            text-align: left;
            font-weight: bold;
            color: #000000;
        }

        .booktabs td {
            padding: 7px 10px;
            border-bottom: none;
            color: #111111;
        }

        .booktabs tr:last-child td {
            border-bottom: 1.5pt solid #000000;
        }

        .booktabs code {
            font-family: 'Fira Code', 'Courier New', monospace;
            font-size: 0.88rem;
        }

        /* Prose Paragraphs */
        .latex-prose {
            font-size: 1.05rem;
            line-height: 1.7;
            margin-bottom: 18px;
            text-align: justify;
        }

        .latex-prose p {
            margin: 0 0 10px 0;
            text-indent: 1.5em;
        }

        .latex-prose p:first-child {
            text-indent: 0;
        }

        /* Equations */
        .latex-eq-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin: 16px 0;
            page-break-inside: avoid;
        }

        .latex-eq-main {
            flex: 1;
            min-width: 0;
            font-size: 1.15rem;
            text-align: center;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 4px 0;
            scrollbar-width: none;
        }

        .latex-eq-main::-webkit-scrollbar {
            display: none;
        }

        .latex-eq-num {
            flex-shrink: 0;
            font-family: 'Crimson Pro', serif;
            font-size: 1rem;
            color: #000000;
            white-space: nowrap;
        }

        /* Figures */
        .latex-figure {
            margin: 32px 0;
            text-align: center;
            page-break-inside: avoid;
        }

        .fig-frame {
            display: inline-block;
            border: 0.5pt solid #cccccc;
            padding: 8px;
            background: #ffffff;
        }

        .fig-img {
            max-width: 92%;
            height: auto;
            display: block;
            margin: 0 auto;
        }

        .fig-caption {
            font-size: 0.88rem;
            color: #333333;
            margin-top: 10px;
            font-style: italic;
        }

        @media print {
            .no-print-bar {
                display: none !important;
            }
            body {
                padding: 0;
            }
            .paper-manuscript {
                max-width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="paper-manuscript">
        <div class="no-print-bar">
            <button class="btn-print" onclick="window.print()">${t.printPdf}</button>
        </div>

        <header class="paper-header">
            <div class="paper-institution">${paperInst}</div>
            <h1 class="paper-title">${paperTitle}</h1>
            <div class="paper-author-meta">
                <span>${paperMetaText}</span>
            </div>
        </header>

        ${abstractBlockHtml}

        <h2 class="paper-sec-title">${t.secVariables}</h2>
        <table class="booktabs">
            <thead>
                <tr>
                    <th>${t.symbol}</th>
                    <th>${t.location}</th>
                    <th>${t.evaluatedValue}</th>
                </tr>
            </thead>
            <tbody>
                ${varsHtml || `<tr><td colspan="3" style="text-align: center; color: #666666;">${t.noVariables}</td></tr>`}
            </tbody>
        </table>

        <h2 class="paper-sec-title">${t.secSequence}</h2>
        ${rowsHtml || `<p style="color: #666666;">${t.noExpressions}</p>`}
    </div>
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

function formatUnitLatex(unitStr: string): string {
    let u = unitStr.trim();
    if (!u) {
        return '';
    }

    // Replace middle dots with \cdot
    u = u.replace(/·/g, ' \\cdot ');

    // Replace exponents ² and ³
    u = u.replace(/²/g, '^{2}').replace(/³/g, '^{3}');

    // Wrap unit letters (like kg, m, s, A, N, C, etc.) in \text{...} without affecting LaTeX macros
    u = u.replace(/(?<!\\)\b([a-zA-Z°]+)\b/g, '\\text{$1}');
    u = u.replace(/_/g, '\\_');
    return u;
}

function formatResultDisplay(raw: string): string {
    let s = raw.trim();
    if (!s) {
        return '';
    }
    // Format SymPy exponents: t**3 -> t³ or t^3
    s = s.replace(/(\b[A-Za-z0-9_]+\b|\([^)]+\))\*\*\s*([0-9]+)/g, (m, b, exp) => {
        const sups: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
        const supStr = String(exp).split('').map((c) => sups[c] || c).join('');
        return `${b}${supStr}`;
    });
    s = s.replace(/\*\*/g, '^');
    // Format multiplication: 1.0*a*t -> 1.0 · a · t
    s = s.replace(/(\w|\))(?:\s*\*\s*)(\w|\()/g, '$1 · $2');
    s = s.replace(/\*/g, ' · ');
    return s;
}

function formatResultLatex(outStr: string): string {
    let raw = outStr.replace(/[{}]/g, '').trim();
    if (!raw) {
        return '';
    }

    if (raw === 'True' || raw === 'False') {
        return `\\quad \\implies \\mathbf{\\text{${raw}}}`;
    }

    // Convert scientific notation like 1.602e-19 to 1.602 \times 10^{-19}
    raw = raw.replace(/(\d+(?:\.\d+)?)[eE]\s*([+-]?\d+)/g, '$1 \\times 10^{$2}');

    // Round long floats in uncertainties e.g. (625.0 ± 40.01952648395531) -> (625.0 ± 40.0195)
    raw = raw.replace(/\b(\d+\.\d{4})\d+\b/g, '$1');

    // Handle array / linspace results: [0.01 0.02 0.03 ... 0.50]
    if (raw.startsWith('[') && raw.endsWith(']')) {
        const elements = raw.substring(1, raw.length - 1).trim().split(/\s+/);
        if (elements.length > 8) {
            const head = elements.slice(0, 4).join(', ');
            const tail = elements.slice(-2).join(', ');
            return `\\quad \\implies \\mathbf{[${head}, \\dots, ${tail}]}`;
        }
        return `\\quad \\implies \\mathbf{[${elements.join(', ')}]}`;
    }

    // Format magnitude + unit (including rational fractions e.g. 500/1 N or 1/2 m)
    const match = raw.match(/^([+-]?\d+(?:\/\d+|\.\d+)?(?:\s*\\times\s*10\^\{[+-]?\d+\})?|\(.*?\))\s*(.*)$/);
    if (match) {
        let val = match[1];
        if (val.includes('/')) {
            const [num, den] = val.split('/');
            val = `\\frac{${num}}{${den}}`;
        }
        const rawUnit = match[2].trim();
        if (rawUnit) {
            const formattedUnit = formatUnitLatex(rawUnit);
            return `\\quad \\implies \\mathbf{${val}\\; ${formattedUnit}}`;
        }
        return `\\quad \\implies \\mathbf{${val}}`;
    }

    // Check if output is a mathematical expression (e.g. "1.0*a*t + v0" or "t**3")
    const mathLatex = expressionToLatex(raw);
    if (mathLatex) {
        return `\\quad \\implies \\mathbf{${mathLatex}}`;
    }

    return `\\quad \\implies \\mathbf{\\text{${raw.replace(/_/g, '\\_')}}}`;
}
