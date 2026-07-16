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
 * Provides on-hover documentation for every token class in MKML.
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
        vscode.languages.registerHoverProvider('mkml', {
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
                    md.appendMarkdown(`**MKML Format Specifier**: \`${rawSpec}\`\n\n`);
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
                        md.appendCodeblock(sig.label, 'mkml');
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
                    md.appendMarkdown(`**MKML Keyword**: \`${word}\`\n\n`);
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
                    md.appendMarkdown(
                        `${definition.isFunction ? '**Function Definition**' : '**Variable Definition**'}: ` +
                        `*(line ${definition.line + 1})*\n`
                    );
                    md.appendCodeblock(definition.text, 'mkml');
                    return new vscode.Hover(md, range);
                }

                return undefined;
            }
        })
    );
}
