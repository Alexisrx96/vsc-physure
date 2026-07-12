export interface PureDiagnostic {
    line: number;
    startChar: number;
    endChar: number;
    message: string;
}

export interface VariableDefinition {
    line: number;
    text: string;
}

export interface SymbolMatch {
    name: string;
    line: number;
    startChar: number;
    endChar: number;
}

// List of common physical units for autocomplete suggestions and hover lookup
export const STANDARD_UNITS = [
    // Base SI units
    'm', 'kg', 's', 'A', 'K', 'mol', 'cd',
    // Derived SI units
    'rad', 'deg', 'sr', 'Hz', 'N', 'Pa', 'J', 'W', 'C', 'V', 'F', 'Ohm', 'S', 'Wb', 'T', 'H', 'lm', 'lx', 'Bq', 'Gy', 'Sv', 'kat',
    // Prefixes
    'mm', 'cm', 'dm', 'km', 'mg', 'g', 'kPa', 'MPa', 'GPa', 'mV', 'kV', 'mA', 'kW', 'MW',
    // Imperial and other common units
    'in', 'ft', 'yd', 'mi', 'mil', 'inch', 'feet', 'yard', 'mile',
    'lb', 'oz', 'pound', 'ounce', 'ton',
    'min', 'h', 'hr', 'minute', 'hour', 'day', 'year',
    'cal', 'kcal', 'calorie', 'calories', 'Btu',
    'degC', 'degF', 'kelvin', 'celsius', 'fahrenheit',
    'psi', 'bar', 'atm', 'torr', 'mmHg',
    'L', 'mL', 'liter', 'litre', 'gal', 'gallon'
];

// Matches unit-symbol strings containing whitespace or the stray bracket/quote/hash
// characters that leak through from config-parsing artifacts in the live registry query.
const INVALID_UNIT_SYMBOL_RE = /[\s#[\]'"]/;

/**
 * Filters a raw list of unit symbol strings (e.g. from querying a live
 * measurekit installation) down to plausible unit symbols, dropping empty
 * strings and config-parsing artifacts. Pure function.
 */
export function filterValidUnitSymbols(raw: string[]): string[] {
    return raw.filter((s) => s.length > 0 && !INVALID_UNIT_SYMBOL_RE.test(s));
}

/**
 * Parses the JSON array of unit symbol strings printed by the Python unit
 * query script, filtering it through filterValidUnitSymbols. Throws if the
 * input isn't valid JSON or isn't an array of strings. Pure function.
 */
export function parseUnitListJson(stdout: string): string[] {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
        throw new Error('Expected a JSON array of strings');
    }
    return filterValidUnitSymbols(parsed);
}

// Regex mapping token groups from the grammar
const TOKEN_RE = /(?<NUMBER>\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(?<IDENT>[a-zA-Z_][a-zA-Z0-9_]*)|(?<SUP>[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)|(?<OP>\+|-|\*|\/|\^|\(|\)|=|\?|\+\/-|±|==|=>|->|\*\*)|(?<WS>[ \t]+)|(?<BAD>.)/g;

/**
 * Computes syntax diagnostics for MKML source text: unexpected characters
 * and unbalanced parentheses. Pure function, no VS Code dependency.
 */
export function computeDiagnostics(text: string): PureDiagnostic[] {
    const diagnostics: PureDiagnostic[] = [];
    const lines = text.split(/\r\n|\r|\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        let line = lines[lineIndex];

        const commentIdx = line.indexOf('#');
        if (commentIdx !== -1) {
            line = line.substring(0, commentIdx);
        }

        if (!line.trim()) {
            continue;
        }

        TOKEN_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        let parenDepth = 0;

        while ((match = TOKEN_RE.exec(line)) !== null) {
            const groups = match.groups;
            if (!groups) {
                continue;
            }

            if (groups.BAD) {
                diagnostics.push({
                    line: lineIndex,
                    startChar: match.index,
                    endChar: match.index + match[0].length,
                    message: `Syntax Error: Unexpected character '${match[0]}' in expression.`,
                });
            }

            if (match[0] === '(') {
                parenDepth++;
            } else if (match[0] === ')') {
                parenDepth--;
                if (parenDepth < 0) {
                    diagnostics.push({
                        line: lineIndex,
                        startChar: match.index,
                        endChar: match.index + 1,
                        message: `Syntax Error: Mismatched closing parenthesis.`,
                    });
                    parenDepth = 0;
                }
            }
        }

        if (parenDepth > 0) {
            diagnostics.push({
                line: lineIndex,
                startChar: 0,
                endChar: lines[lineIndex].length,
                message: `Syntax Error: Unbalanced parentheses. Expected closing ')'.`,
            });
        }
    }

    return diagnostics;
}

/**
 * Searches backward from fromLine (inclusive) for a line assigning `word`.
 * Pure function operating on plain line strings.
 */
export function findVariableDefinition(lines: string[], word: string, fromLine: number): VariableDefinition | undefined {
    for (let i = fromLine; i >= 0; i--) {
        const line = lines[i];
        const assignRe = new RegExp(`^\\s*(${word})\\s*=(?!=)`);
        const match = assignRe.exec(line);
        if (match) {
            return { line: i, text: line.trim() };
        }
    }
    return undefined;
}

/**
 * Extracts every top-level variable assignment in document order.
 */
export function findAssignmentSymbols(lines: string[]): SymbolMatch[] {
    const assignRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)/;
    const symbols: SymbolMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = assignRe.exec(line);
        if (match) {
            const name = match[1];
            const startChar = line.indexOf(name);
            symbols.push({ name, line: i, startChar, endChar: startChar + name.length });
        }
    }

    return symbols;
}
