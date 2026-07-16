export interface PureDiagnostic {
    line: number;
    startChar: number;
    endChar: number;
    message: string;
}

export interface VariableDefinition {
    line: number;
    text: string;
    headerText?: string;
    isFunction?: boolean;
}


export interface SymbolMatch {
    name: string;
    line: number;
    startChar: number;
    endChar: number;
    kind: 'variable' | 'function';
    signature?: string;
}

// Built-in functions added in MKML Phase 2
export const BUILTIN_FUNCTIONS: Record<string, string> = {
    abs: 'Absolute value: `abs(x)`',
    round: 'Round quantity: `round(x[, ndigits])`',
    floor: 'Floor quantity: `floor(x)`',
    ceil: 'Ceil quantity: `ceil(x)`',
    min: 'Minimum of quantities: `min(a, b, ...)`',
    max: 'Maximum of quantities: `max(a, b, ...)`',
    sqrt: 'Square root: `sqrt(x)`',
    sin: 'Sine of angle/dimensionless: `sin(x)`',
    cos: 'Cosine of angle/dimensionless: `cos(x)`',
    tan: 'Tangent of angle/dimensionless: `tan(x)`',
    exp: 'Exponential: `exp(x)`',
    log: 'Natural logarithm: `log(x)`',
    ln: 'Natural logarithm (alias): `ln(x)`',
};

// Signature metadata for built-in functions (used by SignatureHelp and hover)
export interface SignatureInfo {
    label: string;
    documentation: string;
    parameters: { label: string; documentation: string }[];
}

export const BUILTIN_SIGNATURES: Record<string, SignatureInfo> = {
    abs: {
        label: 'abs(x)',
        documentation: 'Returns the absolute value of a physical quantity.',
        parameters: [{ label: 'x', documentation: 'A numeric or physical quantity.' }],
    },
    round: {
        label: 'round(x, ndigits?)',
        documentation: 'Rounds a quantity to the given number of decimal places.',
        parameters: [
            { label: 'x', documentation: 'The quantity to round.' },
            { label: 'ndigits?', documentation: 'Number of decimal places (optional, default 0).' },
        ],
    },
    floor: {
        label: 'floor(x)',
        documentation: 'Returns the floor (greatest integer ≤ x) of a quantity.',
        parameters: [{ label: 'x', documentation: 'A numeric or physical quantity.' }],
    },
    ceil: {
        label: 'ceil(x)',
        documentation: 'Returns the ceiling (smallest integer ≥ x) of a quantity.',
        parameters: [{ label: 'x', documentation: 'A numeric or physical quantity.' }],
    },
    min: {
        label: 'min(a, b, …)',
        documentation: 'Returns the minimum of two or more quantities. All must share the same physical dimension.',
        parameters: [
            { label: 'a', documentation: 'First quantity.' },
            { label: 'b', documentation: 'Second quantity (additional values allowed).' },
        ],
    },
    max: {
        label: 'max(a, b, …)',
        documentation: 'Returns the maximum of two or more quantities. All must share the same physical dimension.',
        parameters: [
            { label: 'a', documentation: 'First quantity.' },
            { label: 'b', documentation: 'Second quantity (additional values allowed).' },
        ],
    },
    sqrt: {
        label: 'sqrt(x)',
        documentation: 'Returns the square root of a non-negative quantity.',
        parameters: [{ label: 'x', documentation: 'A non-negative numeric or physical quantity.' }],
    },
    sin: {
        label: 'sin(x)',
        documentation: 'Sine of an angle or dimensionless quantity.',
        parameters: [{ label: 'x', documentation: 'An angle (rad or deg) or dimensionless value.' }],
    },
    cos: {
        label: 'cos(x)',
        documentation: 'Cosine of an angle or dimensionless quantity.',
        parameters: [{ label: 'x', documentation: 'An angle (rad or deg) or dimensionless value.' }],
    },
    tan: {
        label: 'tan(x)',
        documentation: 'Tangent of an angle or dimensionless quantity.',
        parameters: [{ label: 'x', documentation: 'An angle (rad or deg) or dimensionless value.' }],
    },
    exp: {
        label: 'exp(x)',
        documentation: 'Returns *e* raised to the power of *x* (eˣ).',
        parameters: [{ label: 'x', documentation: 'A dimensionless exponent.' }],
    },
    log: {
        label: 'log(x)',
        documentation: 'Natural logarithm (base *e*) of a dimensionless quantity.',
        parameters: [{ label: 'x', documentation: 'A positive dimensionless quantity.' }],
    },
    ln: {
        label: 'ln(x)',
        documentation: 'Natural logarithm — alias for `log(x)`.',
        parameters: [{ label: 'x', documentation: 'A positive dimensionless quantity.' }],
    },
};

// Reserved structural keywords
export const KEYWORDS: Record<string, string> = {
    let: 'Local binding construct: `let var = expr1 in expr2` (valid inside function bodies)',
    in: 'Local scoping keyword: `let var = expr1 in expr2` (also resolves as inches outside let expressions)',
};

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
 * physure installation) down to plausible unit symbols, dropping empty
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

// Regex mapping token groups from the grammar, supporting Unicode letters, Greek symbols,
// subscripts, square roots, operators, and reaction arrows.
const TOKEN_RE = /(?<NUMBER>\d+\.?\d*(?:[eE]\s*[+-]?\s*\d+)?|\.\d+(?:[eE]\s*[+-]?\s*\d+)?)|(?<IDENT>[\p{L}_][\p{L}\p{N}_]*)|(?<SUP>[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)|(?<SUB>[₀₁₂₃₄₅₆₇₈₉₋]+)|(?<OP>\+|-|\*|\/|\^|\(|\)|=|\?|\+\/-|±|<=|>=|!=|==|=>|->|\*\s*\*|\*\*|<|>|⇌|×|÷|√|,|:|\|)|(?<WS>[ \t]+)|(?<BAD>.)/gu;


/**
 * Computes syntax diagnostics for MKML source text: unexpected characters
 * and unbalanced parentheses, ignoring display-text blocks (```...```).
 * Pure function, no VS Code dependency.
 */
export function computeDiagnostics(text: string): PureDiagnostic[] {
    const diagnostics: PureDiagnostic[] = [];
    // Mask out display-text blocks (```...```) by replacing all non-newline
    // characters with spaces so line indices and positions remain exact.
    const sanitizedText = text.replace(/```[\s\S]*?(?:```|$)/g, (match) => match.replace(/[^\r\n]/g, ' '));
    const lines = sanitizedText.split(/\r\n|\r|\n/);

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
 * Helper to determine if a given character position on a line is located

 * within a format specifier block (e.g., after `:` in `force_: .2f|base`).
 */
export function isFormatSpecifierPosition(lineText: string, charIndex: number): boolean {
    const commentIdx = lineText.indexOf('#');
    if (commentIdx !== -1 && charIndex >= commentIdx) {
        return false;
    }
    const codeText = commentIdx !== -1 ? lineText.substring(0, commentIdx) : lineText;

    const colonIdx = codeText.indexOf(':');
    if (colonIdx === -1 || charIndex <= colonIdx) {
        return false;
    }

    // Check if colon is inside parentheses e.g. f(x: m)
    const parenBefore = (codeText.substring(0, colonIdx).match(/\(/g) ?? []).length;
    const parenAfter = (codeText.substring(0, colonIdx).match(/\)/g) ?? []).length;
    if (parenBefore > parenAfter) {
        return false;
    }

    // Check if colon is part of ternary: cond ? trueVal : falseVal
    const questionIdx = codeText.indexOf('?');
    if (questionIdx !== -1 && questionIdx < colonIdx) {
        return false;
    }

    return true;
}



/**
 * Searches backward from fromLine (inclusive) for a line assigning or defining `word`.
 * For multiline functions, collects the indented function body lines as well.
 * Pure function operating on plain line strings.
 */
export function findVariableDefinition(lines: string[], word: string, fromLine: number): VariableDefinition | undefined {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assignRe = new RegExp(`^\\s*(${escapedWord})\\s*(\\([^\\)]*\\))?\\s*=(?!=)`, 'u');
    for (let i = fromLine; i >= 0; i--) {
        const line = lines[i];
        const match = assignRe.exec(line);
        if (match) {
            const isFunction = Boolean(match[2]);
            const headerText = line.trim();
            let fullText = headerText;

            if (isFunction) {
                const bodyLines: string[] = [headerText];
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j];
                    const trimmed = nextLine.trim();
                    if (!trimmed) {
                        continue;
                    }
                    const indent = nextLine.length - nextLine.trimStart().length;
                    if (indent > 0) {
                        bodyLines.push(`    ${trimmed}`);
                    } else {
                        break;
                    }
                }
                fullText = bodyLines.join('\n');
            }

            return {
                line: i,
                text: fullText,
                headerText,
                isFunction,
            };
        }
    }
    return undefined;
}


// Physical dimension descriptions for Hover Inspector
export interface DimensionDescription {
    /** Human-readable quantity name (bilingual) */
    name: string;
    /** ISO dimension formula using standard symbols: L M T I Θ N J */
    dimension: string;
    /**
     * Concrete SI base-unit expression for derived units
     * (e.g. `kg·m·s⁻²` for Newton).  Absent for pure base units.
     */
    siBase?: string;
}

export const DIMENSION_DESCRIPTIONS: Record<string, DimensionDescription> = {
    // ── SI Base units ─────────────────────────────────────────────────────────
    m:    { name: 'Length (Longitud)',                            dimension: '[L]'            },
    km:   { name: 'Length (Longitud)',                            dimension: '[L]'            },
    cm:   { name: 'Length (Longitud)',                            dimension: '[L]'            },
    mm:   { name: 'Length (Longitud)',                            dimension: '[L]'            },
    in:   { name: 'Length (Longitud)',                            dimension: '[L]'            },
    ft:   { name: 'Length (Longitud)',                            dimension: '[L]'            },
    mi:   { name: 'Length (Longitud)',                            dimension: '[L]'            },
    kg:   { name: 'Mass (Masa)',                                  dimension: '[M]'            },
    g:    { name: 'Mass (Masa)',                                  dimension: '[M]'            },
    mg:   { name: 'Mass (Masa)',                                  dimension: '[M]'            },
    lb:   { name: 'Mass (Masa)',                                  dimension: '[M]'            },
    s:    { name: 'Time (Tiempo)',                                dimension: '[T]'            },
    min:  { name: 'Time (Tiempo)',                                dimension: '[T]'            },
    h:    { name: 'Time (Tiempo)',                                dimension: '[T]'            },
    hr:   { name: 'Time (Tiempo)',                                dimension: '[T]'            },
    A:    { name: 'Electric Current (Corriente Eléctrica)',       dimension: '[I]'            },
    mA:   { name: 'Electric Current (Corriente Eléctrica)',       dimension: '[I]'            },
    K:    { name: 'Temperature (Temperatura)',                    dimension: '[Θ]'            },
    degC: { name: 'Temperature (Temperatura)',                    dimension: '[Θ]'            },
    degF: { name: 'Temperature (Temperatura)',                    dimension: '[Θ]'            },
    mol:  { name: 'Amount of Substance (Cantidad de Sustancia)',  dimension: '[N]'            },
    cd:   { name: 'Luminous Intensity (Intensidad Luminosa)',     dimension: '[J]'            },

    // ── Derived SI units ──────────────────────────────────────────────────────
    N:    { name: 'Force (Fuerza)',                               dimension: '[M·L·T⁻²]',         siBase: 'kg·m·s⁻²'          },
    Pa:   { name: 'Pressure / Stress (Presión / Tensión)',        dimension: '[M·L⁻¹·T⁻²]',       siBase: 'kg·m⁻¹·s⁻²'        },
    kPa:  { name: 'Pressure / Stress (Presión / Tensión)',        dimension: '[M·L⁻¹·T⁻²]',       siBase: 'kg·m⁻¹·s⁻²'        },
    MPa:  { name: 'Pressure / Stress (Presión / Tensión)',        dimension: '[M·L⁻¹·T⁻²]',       siBase: 'kg·m⁻¹·s⁻²'        },
    bar:  { name: 'Pressure (Presión)',                           dimension: '[M·L⁻¹·T⁻²]',       siBase: 'kg·m⁻¹·s⁻²'        },
    psi:  { name: 'Pressure (Presión)',                           dimension: '[M·L⁻¹·T⁻²]',       siBase: 'kg·m⁻¹·s⁻²'        },
    atm:  { name: 'Pressure (Presión)',                           dimension: '[M·L⁻¹·T⁻²]',       siBase: 'kg·m⁻¹·s⁻²'        },
    J:    { name: 'Energy / Work (Energía / Trabajo)',            dimension: '[M·L²·T⁻²]',         siBase: 'kg·m²·s⁻²'         },
    kJ:   { name: 'Energy / Work (Energía / Trabajo)',            dimension: '[M·L²·T⁻²]',         siBase: 'kg·m²·s⁻²'         },
    cal:  { name: 'Energy (Energía)',                             dimension: '[M·L²·T⁻²]',         siBase: 'kg·m²·s⁻²'         },
    kcal: { name: 'Energy (Energía)',                             dimension: '[M·L²·T⁻²]',         siBase: 'kg·m²·s⁻²'         },
    W:    { name: 'Power (Potencia)',                             dimension: '[M·L²·T⁻³]',         siBase: 'kg·m²·s⁻³'         },
    kW:   { name: 'Power (Potencia)',                             dimension: '[M·L²·T⁻³]',         siBase: 'kg·m²·s⁻³'         },
    MW:   { name: 'Power (Potencia)',                             dimension: '[M·L²·T⁻³]',         siBase: 'kg·m²·s⁻³'         },
    C:    { name: 'Electric Charge (Carga Eléctrica)',            dimension: '[I·T]',               siBase: 'A·s'                },
    V:    { name: 'Electric Potential (Voltaje)',                 dimension: '[M·L²·T⁻³·I⁻¹]',    siBase: 'kg·m²·s⁻³·A⁻¹'    },
    kV:   { name: 'Electric Potential (Voltaje)',                 dimension: '[M·L²·T⁻³·I⁻¹]',    siBase: 'kg·m²·s⁻³·A⁻¹'    },
    Hz:   { name: 'Frequency (Frecuencia)',                       dimension: '[T⁻¹]',              siBase: 's⁻¹'               },
    'm/s':   { name: 'Velocity / Speed (Velocidad)',              dimension: '[L·T⁻¹]',            siBase: 'm·s⁻¹'             },
    'km/h':  { name: 'Velocity / Speed (Velocidad)',              dimension: '[L·T⁻¹]',            siBase: 'm·s⁻¹'             },
    'm/s^2': { name: 'Acceleration (Aceleración)',                dimension: '[L·T⁻²]',            siBase: 'm·s⁻²'             },
};



export interface FormatOptions {
    indentSpaces?: number;
}

/**
 * Formats MKML source code: standardizes spaces around operators, punctuation,
 * and maintains clean indentation for multi-line function bodies. Pure function.
 */
export function formatDocument(text: string, options: FormatOptions = {}): string {
    const indentSpaces = options.indentSpaces ?? 4;
    const lines = text.split(/\r\n|\r|\n/);
    const formattedLines: string[] = [];
    let inTextBlock = false;
    let inFunctionBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];

        // Preserve triple-backtick text blocks verbatim
        const fenceMatches = rawLine.match(/```/g);
        if (fenceMatches) {
            if (fenceMatches.length % 2 === 1) {
                inTextBlock = !inTextBlock;
            }
            formattedLines.push(rawLine);
            continue;
        }

        if (inTextBlock) {
            formattedLines.push(rawLine);
            continue;
        }

        const commentIdx = rawLine.indexOf('#');
        const codePart = commentIdx !== -1 ? rawLine.substring(0, commentIdx) : rawLine;
        const commentPart = commentIdx !== -1 ? rawLine.substring(commentIdx) : '';

        const trimmedCode = codePart.trim();
        if (!trimmedCode) {
            formattedLines.push(commentPart ? commentPart : '');
            continue;
        }

        // Check if this line is a multi-line function header: name(params) =
        const isHeader = /^[\p{L}_][\p{L}\p{N}_]*\s*\([^\)]*\)\s*=\s*$/u.test(trimmedCode);

        // 1. Collapse any split scientific notation numbers like 1.673 e - 27 -> 1.673e-27
        let formattedCode = trimmedCode.replace(/\b(\d+\.?\d*)\s*([eE])\s*([+-]?)\s*(\d+)\b/g, '$1$2$3$4');

        // 2. Protect scientific numbers from opRegex operator spacing
        const sciPlaceholders: string[] = [];
        formattedCode = formattedCode.replace(/\b\d+\.?\d*[eE][+-]?\d+\b/g, (match) => {
            sciPlaceholders.push(match);
            return `__SCI_NUM_${sciPlaceholders.length - 1}__`;
        });

        // 3. Standardize spacing around operators and punctuation
        const opRegex = /\s*(==|=>|->|<=>|⇌|\+\/-|±|\+|-|\*|\/|\^|×|÷|=|:|,)\s*/gu;
        formattedCode = formattedCode
            .replace(opRegex, (match, op) => {
                if (op === ',' || op === ':') {
                    return `${op} `;
                }
                return ` ${op} `;
            })
            .replace(/\s+/g, ' ');

        // 4. Restore scientific numbers
        formattedCode = formattedCode.replace(/__SCI_NUM_(\d+)__/g, (_, idx) => sciPlaceholders[Number(idx)]);


        const leadingSpaceCount = rawLine.length - rawLine.trimStart().length;

        formattedCode = formattedCode.trimEnd();

        if (isHeader) {
            inFunctionBlock = true;
            formattedLines.push(formattedCode + (commentPart ? `  ${commentPart}` : ''));
        } else if (inFunctionBlock && leadingSpaceCount > 0) {
            const indentStr = ' '.repeat(indentSpaces);
            formattedLines.push(indentStr + formattedCode + (commentPart ? `  ${commentPart}` : ''));
        } else {
            inFunctionBlock = false;
            formattedLines.push(formattedCode + (commentPart ? `  ${commentPart}` : ''));
        }
    }

    return formattedLines.join('\n');
}

/**
 * Extracts every top-level variable assignment and function definition in document order.
 */
export function findAssignmentSymbols(lines: string[]): SymbolMatch[] {
    const assignRe = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*(\([^\)]*\))?\s*=(?!=)/u;
    const symbols: SymbolMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = assignRe.exec(line);
        if (match) {
            const name = match[1];
            const hasParams = Boolean(match[2]);
            const startChar = line.indexOf(name);
            symbols.push({
                name,
                line: i,
                startChar,
                endChar: startChar + name.length,
                kind: hasParams ? 'function' : 'variable',
                signature: hasParams ? `${name}${match[2]}` : name,
            });
        }
    }

    return symbols;
}

/**
 * Finds all whole-word occurrences of `word` across all lines, ignoring
 * comment tails (text after `#`). Returns {line, startChar, endChar} for
 * each match. Used by ReferenceProvider and RenameProvider. Pure function.
 */
export function findAllOccurrences(
    lines: string[],
    word: string
): { line: number; startChar: number; endChar: number }[] {
    const results: { line: number; startChar: number; endChar: number }[] = [];
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use Unicode-aware word-boundary substitutes (\p lookbehind/lookahead)
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapedWord}(?![\\p{L}\\p{N}_])`, 'gu');

    for (let i = 0; i < lines.length; i++) {
        // Ignore everything after the comment character
        const commentIdx = lines[i].indexOf('#');
        const searchText = commentIdx !== -1 ? lines[i].substring(0, commentIdx) : lines[i];
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(searchText)) !== null) {
            results.push({ line: i, startChar: m.index, endChar: m.index + word.length });
        }
    }

    return results;
}
