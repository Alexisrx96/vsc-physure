import * as vscode from 'vscode';
import {
    STANDARD_UNITS,
    BUILTIN_FUNCTIONS,
    BUILTIN_SIGNATURES,
    KEYWORDS,
    DIMENSION_DESCRIPTIONS,
    findAssignmentSymbols,
    isFormatSpecifierPosition,
} from '../tokenizer';
import { getUnitsForPath } from '../units';
import { findPythonPath } from '../interpreter';
import { documentLines } from '../utils';

export const FORMAT_SPECIFIERS: { label: string; detail: string; doc: string; insertText?: string }[] = [
    { label: '.2f', detail: '2 Decimal Places', doc: 'Formats quantity magnitude to 2 fixed decimal places (e.g. `2000.12 N`).' },
    { label: '.3f', detail: '3 Decimal Places', doc: 'Formats quantity magnitude to 3 fixed decimal places (e.g. `2000.123 N`).' },
    { label: '.3e', detail: 'Scientific Notation', doc: 'Formats quantity magnitude in scientific exponential notation (e.g. `2.000e+03 N`).' },
    { label: 'base', detail: 'SI Base Units', doc: 'Decomposes derived unit to expanded SI base units (e.g. `kg·m/s²`).' },
    { label: 'alias', detail: 'Derived Alias Symbol', doc: 'Uses clean derived unit symbol alias (e.g. `N`, `Pa`, `J`).' },
    { label: 'frac', detail: 'Rational Fraction', doc: 'Formats magnitude as exact fractional ratio (e.g. `40002469/20000 kg·m/s²`).' },
    { label: '.2f|base', detail: '2 Decimals + Base Units', doc: 'Combines 2 decimal place formatting with expanded SI base units (e.g. `2000.12 kg·m/s²`).' },
    { label: '.3e|base', detail: 'Scientific + Base Units', doc: 'Combines scientific exponential notation with expanded SI base units (e.g. `2.000e+03 kg·m/s²`).' },
    { label: 'frac|base', detail: 'Fraction + Base Units', doc: 'Combines rational fraction magnitude with expanded SI base units.' },
    { label: 'raw', detail: 'Raw Units', doc: 'Displays unaliased raw base components.' },
    { label: 'noalias', detail: 'Disable Aliases', doc: 'Disables unit aliases and displays base SI units.' }
];

export const GREEK_SYMBOLS: { shortcut: string; symbol: string; name: string }[] = [
    { shortcut: '\\alpha', symbol: 'α', name: 'Alpha' },
    { shortcut: '\\beta', symbol: 'β', name: 'Beta' },
    { shortcut: '\\gamma', symbol: 'γ', name: 'Gamma' },
    { shortcut: '\\delta', symbol: 'δ', name: 'Delta' },
    { shortcut: '\\epsilon', symbol: 'ε', name: 'Epsilon' },
    { shortcut: '\\theta', symbol: 'θ', name: 'Theta' },
    { shortcut: '\\lambda', symbol: 'λ', name: 'Lambda' },
    { shortcut: '\\mu', symbol: 'μ', name: 'Mu' },
    { shortcut: '\\micro', symbol: 'μ', name: 'Micro Symbol' },
    { shortcut: '\\pi', symbol: 'π', name: 'Pi' },
    { shortcut: '\\rho', symbol: 'ρ', name: 'Rho' },
    { shortcut: '\\sigma', symbol: 'σ', name: 'Sigma' },
    { shortcut: '\\tau', symbol: 'τ', name: 'Tau' },
    { shortcut: '\\phi', symbol: 'φ', name: 'Phi' },
    { shortcut: '\\omega', symbol: 'ω', name: 'Omega' },
    { shortcut: '\\Delta', symbol: 'Δ', name: 'Capital Delta' },
    { shortcut: '\\Omega', symbol: 'Ω', name: 'Capital Omega (Ohm)' },
    { shortcut: '\\pm', symbol: '±', name: 'Plus-Minus' },
    { shortcut: '\\sqrt', symbol: '√', name: 'Square Root' },
    { shortcut: '\\approx', symbol: '≈', name: 'Approximately Equal' },
    { shortcut: '\\infty', symbol: '∞', name: 'Infinity' },
];

/**
 * Provides IntelliSense completion items for the PHS language.
 *
 * The list is composed of format specifiers (when after `:` or `|`) or four standard layers:
 *  1. User variables / functions — sort prefix `a_`
 *  2. Built-in functions        — sort prefix `m_builtin_`
 *  3. Keywords                  — sort prefix `m_keyword_`
 *  4. Physical units            — sort prefix `z_unit_` (pushed to the bottom)
 */
export function registerCompletionProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'phs',
            {
                async provideCompletionItems(
                    document: vscode.TextDocument,
                    position: vscode.Position
                ): Promise<vscode.CompletionItem[]> {
                    const lineText = document.lineAt(position.line).text;

                    if (isFormatSpecifierPosition(lineText, position.character)) {
                        return FORMAT_SPECIFIERS.map((fs, idx) => {
                            const item = new vscode.CompletionItem(fs.label, vscode.CompletionItemKind.Value);
                            item.detail = fs.detail;
                            item.documentation = new vscode.MarkdownString(fs.doc);
                            item.insertText = fs.insertText ?? fs.label;
                            item.sortText = `a_${String(idx).padStart(2, '0')}_${fs.label}`;
                            return item;
                        });
                    }

                    const pythonPath = findPythonPath(document.uri.fsPath);
                    const units = await getUnitsForPath(pythonPath, STANDARD_UNITS);
                    const lines = documentLines(document);
                    const currentLine = position.line;
                    const items: vscode.CompletionItem[] = [];

                    // ── 0. Greek Letters & Math Symbols ──────────────────────────
                    for (const sym of GREEK_SYMBOLS) {
                        const item = new vscode.CompletionItem(sym.shortcut, vscode.CompletionItemKind.Text);
                        item.detail = `Unicode Symbol: ${sym.symbol} (${sym.name})`;
                        item.documentation = new vscode.MarkdownString(`Inserts Unicode symbol \`${sym.symbol}\`.`);
                        item.insertText = sym.symbol;
                        item.sortText = `a_0_greek_${sym.shortcut}`;
                        items.push(item);
                    }

                // ── 1. User-defined variables and functions ──────────────────
                for (const sym of findAssignmentSymbols(lines)) {
                    if (sym.line === currentLine) {
                        continue; // skip the symbol currently being typed
                    }
                    const isFunc = sym.kind === 'function';
                    const item = new vscode.CompletionItem(
                        sym.signature ?? sym.name,
                        isFunc ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Variable
                    );
                    item.detail = isFunc
                        ? `User Function (line ${sym.line + 1})`
                        : `Variable (line ${sym.line + 1})`;
                    item.filterText = sym.name;
                    item.insertText = isFunc
                        ? new vscode.SnippetString(`${sym.name}(\${1})`)
                        : sym.name;
                    const md = new vscode.MarkdownString();
                    md.appendCodeblock(lines[sym.line].trim(), 'phs');
                    item.documentation = md;
                    item.sortText = `a_user_${sym.name}`;
                    items.push(item);
                }

                // ── 2. Built-in functions ────────────────────────────────────
                for (const [name, doc] of Object.entries(BUILTIN_FUNCTIONS)) {
                    const sig = BUILTIN_SIGNATURES[name];
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
                    item.detail = sig ? sig.label : `${name}(…)`;
                    item.documentation = new vscode.MarkdownString(sig ? sig.documentation : doc);
                    item.insertText = new vscode.SnippetString(`${name}(\${1})`);
                    item.sortText = `m_builtin_${name}`;
                    items.push(item);
                }

                // ── 3. Keywords ──────────────────────────────────────────────
                for (const [kw, doc] of Object.entries(KEYWORDS)) {
                    const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
                    item.detail = 'PHS Keyword';
                    item.documentation = new vscode.MarkdownString(doc);
                    item.sortText = `m_keyword_${kw}`;
                    items.push(item);
                }

                // ── 4. Physical units (with dimension info when available) ───
                for (const unit of units) {
                    const item = new vscode.CompletionItem(unit, vscode.CompletionItemKind.Unit);
                    item.detail = 'Physical Unit';
                    const dimInfo = DIMENSION_DESCRIPTIONS[unit];
                    item.documentation = dimInfo
                        ? new vscode.MarkdownString(
                            `**${dimInfo.name}**` +
                            (dimInfo.siBase ? `\n\nSI Base: \`${dimInfo.siBase}\`` : '') +
                            `\n\nDimension: \`${dimInfo.dimension}\``
                          )
                        : new vscode.MarkdownString(`Physure physical unit \`${unit}\`.`);
                    item.sortText = `z_unit_${unit}`;
                    items.push(item);
                }

                return items;
            }
        },
        ':',
        '|',
        '.',
        '\\'
    )
);
}

