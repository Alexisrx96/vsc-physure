import * as vscode from 'vscode';
import {
    STANDARD_UNITS,
    BUILTIN_FUNCTIONS,
    BUILTIN_SIGNATURES,
    KEYWORDS,
    DIMENSION_DESCRIPTIONS,
    findVariableDefinition,
    isFormatSpecifierPosition,
} from '../tokenizer';

import { getUnitsForPath } from '../units';
import { findPythonPath } from '../interpreter';
import { documentLines } from '../utils';

/**
 * Provides on-hover documentation for every token class in PHS.
 *
 * Priority (first match wins):
 *  0. Format specifier modifier — description of format flags (: .2f|base)
 *  1. Built-in function  — full signature + parameter table
 *  2. Keyword            — description from KEYWORDS map
 *  3. Unit with known dimension — DIMENSION_DESCRIPTIONS entry
 *  4. Unit from live registry  — generic "physical unit" label
 *  5. User variable / function — definition line extracted from the document
 */
export function registerHoverProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('phs', {
            async provideHover(
                document: vscode.TextDocument,
                position: vscode.Position
            ): Promise<vscode.Hover | undefined> {
                const range = document.getWordRangeAtPosition(
                    position,
                    /[\p{L}_][\p{L}\p{N}_]*/u
                );
                if (!range) {
                    return undefined;
                }

                const word = document.getText(range);
                const lineText = document.lineAt(position.line).text;

                // ── 0. Format Specifier Modifier ──────────────────────────────
                if (isFormatSpecifierPosition(lineText, position.character)) {
                    const colonIdx = lineText.indexOf(':');
                    const rawSpec = lineText.substring(colonIdx + 1).replace(/\?/g, '').trim();
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**PHS Format Specifier**: \`${rawSpec}\`\n\n`);
                    md.appendMarkdown('Controls presentation output formatting:\n\n');

                    if (rawSpec.includes('base') || rawSpec.includes('raw') || rawSpec.includes('expand')) {
                        md.appendMarkdown('* **`base`**: Displays quantity decomposed in expanded SI base units (e.g. `kg·m/s²`).\n');
                    }
                    if (rawSpec.includes('alias')) {
                        md.appendMarkdown('* **`alias`**: Formats unit using its clean derived alias (e.g. `N`, `Pa`).\n');
                    }
                    if (rawSpec.includes('frac')) {
                        md.appendMarkdown('* **`frac`**: Displays magnitude as an exact rational fraction.\n');
                    }

                    const floatMatch = rawSpec.match(/\.(\d+)f/);
                    if (floatMatch) {
                        md.appendMarkdown(`* **\`${floatMatch[0]}\`**: Fixed-point decimal notation with ${floatMatch[1]} decimal places.\n`);
                    }

                    const sciMatch = rawSpec.match(/\.(\d+)e/);
                    if (sciMatch) {
                        md.appendMarkdown(`* **\`${sciMatch[0]}\`**: Scientific exponential notation with ${sciMatch[1]} decimal places.\n`);
                    }

                    return new vscode.Hover(md, range);
                }

                // ── 1. Built-in function ──────────────────────────────────────

                if (BUILTIN_FUNCTIONS[word]) {
                    const sig = BUILTIN_SIGNATURES[word];
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**Built-in Function**: \`${word}\`\n\n`);
                    if (sig) {
                        md.appendCodeblock(sig.label, 'phs');
                        md.appendMarkdown(`\n${sig.documentation}`);
                        if (sig.parameters.length > 0) {
                            md.appendMarkdown('\n\n**Parameters:**\n');
                            for (const p of sig.parameters) {
                                md.appendMarkdown(`- \`${p.label}\` — ${p.documentation}\n`);
                            }
                        }
                    } else {
                        md.appendMarkdown(BUILTIN_FUNCTIONS[word]);
                    }
                    return new vscode.Hover(md, range);
                }

                // ── 2. Keyword ────────────────────────────────────────────────
                if (KEYWORDS[word]) {
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**PHS Keyword**: \`${word}\`\n\n`);
                    md.appendMarkdown(KEYWORDS[word]);
                    return new vscode.Hover(md, range);
                }

                // ── 3. Unit with known dimension ──────────────────────────────
                if (DIMENSION_DESCRIPTIONS[word]) {
                    const desc = DIMENSION_DESCRIPTIONS[word];
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**Physical Unit**: \`${word}\`\n\n`);
                    md.appendMarkdown(`* **Quantity**: ${desc.name}\n`);
                    if (desc.siBase) {
                        md.appendMarkdown(`* **SI Base**: \`${desc.siBase}\`\n`);
                    }
                    md.appendMarkdown(`* **Dimension**: \`${desc.dimension}\`\n`);
                    return new vscode.Hover(md, range);
                }


                // ── 4. Unit from live registry ────────────────────────────────
                const pythonPath = findPythonPath(document.uri.fsPath);
                const units = await getUnitsForPath(pythonPath, STANDARD_UNITS);
                if (units.includes(word)) {
                    return new vscode.Hover(
                        new vscode.MarkdownString(
                            `**Unit**: \`${word}\` (Physure standard physical unit)`
                        ),
                        range
                    );
                }

                // ── 5. User variable / function definition ────────────────────
                const lines = documentLines(document);
                const definition = findVariableDefinition(lines, word, position.line);
                if (definition) {
                    const md = new vscode.MarkdownString();
                    md.isTrusted = true;
                    md.appendMarkdown(
                        `${definition.isFunction ? '**Function Definition**' : '**Variable Definition**'}: ` +
                        `*(line ${definition.line + 1})*\n`
                    );
                    md.appendCodeblock(definition.text, 'phs');

                    // Uncertainty & Confidence Range Gauge
                    const uncMatch = /(\d+(?:\.\d+)?)\s*(?:[a-zA-Z_]+\s*)?(?:\+\/-|±)\s*(\d+(?:\.\d+)?)\s*([a-zA-Z_/\^]+)?/.exec(definition.text);
                    if (uncMatch) {
                        const val = parseFloat(uncMatch[1]);
                        const unc = parseFloat(uncMatch[2]);
                        const unitStr = uncMatch[3] ? ` ${uncMatch[3]}` : '';
                        const valMin = (val - unc).toFixed(4);
                        const valMax = (val + unc).toFixed(4);
                        const relPct = ((unc / Math.abs(val)) * 100).toFixed(2);
                        md.appendMarkdown(`\n🎯 **Confidence Interval:** \`[${valMin}${unitStr} ... ${valMax}${unitStr}]\` *(± ${relPct}% relative uncertainty)*\n`);
                    }

                    const latex = expressionToLatex(definition.text);
                    if (latex) {
                        md.appendMarkdown(`\n**Math Expression:**\n$$\n${latex}\n$$\n`);
                    }

                    // Interactive Action Links
                    const copyArgs = encodeURIComponent(JSON.stringify([definition.text]));
                    md.appendMarkdown(
                        `---\n` +
                        `[📋 Copy Definition](command:vsc-physure.copyText?${copyArgs}) | ` +
                        `[🔄 Convert Unit](command:vsc-physure.convertUnitAtCursor) | ` +
                        `[🕸️ View Dependency Graph](command:vsc-physure.showDependencyGraph)`
                    );

                    return new vscode.Hover(md, range);
                }

                return undefined;
            }
        })
    );
}

export function expressionToLatex(expr: string): string | undefined {
    // 1. Strip inline comments (# ...)
    let s = expr.split('#')[0].trim();
    if (!s || s.startsWith('```')) {
        return undefined;
    }

    // 2. Skip standalone format specifiers or unit conversions (e.g. F_e => nN, F_e: base, fuerza: frac)
    if (/^(?:[A-Za-z0-9_]+\s*)?(?:=>|:)\s*(?:base|alias|frac|raw|expand|[a-zA-Z]+|\.\d+[fe])$/.test(s)) {
        return undefined;
    }

    // Also strip trailing : specifiers or => conversions if part of assignment
    s = s.replace(/:\s*(?:base|alias|frac|\.\d+[fe])$/, '').replace(/=>\s*[A-Za-z_]+$/, '');

    // Must contain math operators or assignments or math function calls
    const hasMathOp = /[=+\-*/^><±√≈]|sqrt|frac|\b(?:sin|cos|tan|log|exp|round|abs|min|max)\b/.test(s);
    if (!hasMathOp) {
        return undefined;
    }

    // TERNARY OPERATOR: cond ? val1 : val2 -> \begin{cases} val1 & \text{if } cond \\ val2 & \text{otherwise} \end{cases}
    if (s.includes('?') && s.includes(':') && !s.startsWith(':')) {
        const ternaryMatch = /(.*?)\s*\?\s*(.*?)\s*:\s*(.*)/.exec(s);
        if (ternaryMatch) {
            const condLatex = expressionToLatex(ternaryMatch[1]) ?? ternaryMatch[1].trim();
            const val1Latex = expressionToLatex(ternaryMatch[2]) ?? ternaryMatch[2].trim();
            const val2Latex = expressionToLatex(ternaryMatch[3]) ?? ternaryMatch[3].trim();
            return `\\begin{cases} ${val1Latex} & \\text{if } ${condLatex} \\\\ ${val2Latex} & \\text{otherwise} \\end{cases}`;
        }
    }

    // FIRST: Convert => to \rightarrow
    s = s.replace(/=>/g, ' \\rightarrow ');

    // SECOND: Exponents ** -> ^
    s = s.replace(/\*\s*\*/g, '^');

    // THIRD: Convert uncertainties +/- or ± -> \pm and ≈ -> \approx
    s = s.replace(/\+\/-\s*|\s*±\s*/g, ' \\pm ');
    s = s.replace(/≈/g, ' \\approx ');

    // FOURTH: Convert functions like sqrt(...) and round(...)
    s = s.replace(/sqrt\((.*)\)/g, '\\sqrt{$1}');
    s = s.replace(/round\(([^,]+),\s*([^)]+)\)/g, '\\text{round}($1, $2)');

    // FIFTH: Protect unit divisions like m / s, km / h, N / C^2 inside simple unit phrases
    s = s.replace(/(\b[a-zA-Z_]+\b)\s*\/\s*(\b[a-zA-Z_]+\b)/g, '$1/$2');

    // SIXTH: Exponents: (base)^exp or var^exp
    s = s.replace(/(\([^)]+\)|[A-Za-z0-9_]+)\s*\^\s*(\([^)]+\)|[A-Za-z0-9_.+-]+)/g, '$1^{$2}');
    s = s.replace(/²/g, '^{2}').replace(/³/g, '^{3}').replace(/·/g, ' \\cdot ');

    // SEVENTH: Fractions (A) / (B) or var / var
    s = s.replace(/(\([^)]+\)|[A-Za-z0-9_]+)\s*\/\s*(\([^)]+\)|[A-Za-z0-9_^{}]+)/g, '\\frac{$1}{$2}');

    // EIGHTH: Multiplication * -> \cdot
    s = s.replace(/\*/g, ' \\cdot ');

    // NINTH: Scientific notation 1.67e-27 -> 1.67 \times 10^{-27}
    s = s.replace(/(\d+(?:\.\d+)?)[eE]\s*([+-]?\d+)/g, '$1 \\times 10^{$2}');

    // TENTH: Wrap multi-letter identifiers containing underscores in \text{...}
    s = s.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (word) => {
        if (word.includes('_')) {
            const escaped = word.replace(/_/g, '\\_');
            return `\\text{${escaped}}`;
        }
        return word;
    });

    // Restore backslashes for \pi, \sqrt, \text, \frac, etc.
    s = s.replace(/\\text\{\\pi\}/g, '\\pi');
    s = s.replace(/\\text\{\\sqrt\}/g, '\\sqrt');
    s = s.replace(/\\text\{\\frac\}/g, '\\frac');
    s = s.replace(/\\text\{\\varepsilon\\_0\}/g, '\\varepsilon_0');

    return s;
}
