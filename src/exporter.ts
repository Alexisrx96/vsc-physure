import * as path from 'path';
import { STANDARD_UNITS, findAssignmentSymbols } from './tokenizer';
import { getI18n, Language, Translations } from './i18n';

const UNIT_SET = new Set(STANDARD_UNITS);

/**
 * Checks whether a line of PHS code contains a variable assignment operator (`=`).
 * Excludes equality comparisons (`==`), unit conversions (`=>`), and inequality operators.
 */
function isAssignmentLine(code: string): boolean {
    return /(?<![=>!<])=(?![=>=])/u.test(code);
}

/**
 * Checks whether the word following a numeric literal is a valid physical unit.
 */
function isUnitStart(word: string): boolean {
    const cleanWord = word.replace(/[^a-zA-Z\p{L}_]/gu, '');
    return UNIT_SET.has(cleanWord);
}

/**
 * Replaces quantity literals like `1.673e-27 kg` or `10 m +/- 0.5 m` in a PHS
 * expression string with native Python `Q_(val, "unit")` calls.
 */
function transformQuantityLiterals(expr: string): string {
    let result = expr;

    // 0. Convert unicode math operators: ×, ÷, √
    result = result.replace(/×/g, '*').replace(/÷/g, '/');
    result = result.replace(/√([a-zA-Z0-9_\(\)]+)/g, 'sqrt($1)');

    // 1. Transform uncertainty quantities: e.g. 10 m +/- 0.5 m OR 25.0 +/- 0.5 m / s OR 1.673e-27 ± 0.001e-27 kg
    const uncRegex = /(\b\d+\.?\d*(?:[eE][+-]?\d+)?)\s*([a-zA-Z\p{L}_⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+(?:\s*(?:[\^]|\*\*)\s*\d+)?(?:\s*[\/*\.]\s*[a-zA-Z\p{L}_⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+(?:\s*(?:[\^]|\*\*)\s*\d+)?)*)?\s*(?:\+\/-|±)\s*(\d+\.?\d*(?:[eE][+-]?\d+)?)\s*([a-zA-Z\p{L}_⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+(?:\s*(?:[\^]|\*\*)\s*\d+)?(?:\s*[\/*\.]\s*[a-zA-Z\p{L}_⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+(?:\s*(?:[\^]|\*\*)\s*\d+)?)*)?/gu;
    result = result.replace(uncRegex, (_, val, u1, unc, u2) => {
        const unitStr = (u1 || u2 || '').trim();
        if (unitStr) {
            return `Q_(${val}, "${unitStr}", uncertainty=${unc})`;
        }
        return `Q_(${val}, "", uncertainty=${unc})`;
    });

    // 2. Transform standard quantities: <number><unit_expr> (supports 5m, 5 m, and N * m ^ 2 / C ^ 2)
    const numUnitRegex = /(\b\d+\.?\d*(?:[eE][+-]?\d+)?)\s*([a-zA-Z\p{L}_⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+(?:\s*(?:[\^]|\*\*)\s*\d+)?(?:\s*[\/*\.]\s*[a-zA-Z\p{L}_⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+(?:\s*(?:[\^]|\*\*)\s*\d+)?)*)/gu;

    result = result.replace(numUnitRegex, (fullMatch, numStr, unitCandidate) => {
        const firstWord = unitCandidate.trim().split(/[\s\/*\^\.]/)[0];
        if (isUnitStart(firstWord)) {
            return `Q_(${numStr}, "${unitCandidate.trim()}")`;
        }
        return fullMatch;
    });

    // 3. Convert caret exponent ^ and split asterisks * * to Python ** outside string quotes
    result = result.replace(/\*\s+\*/g, '**');

    let inQuotes = false;
    let pyCode = '';
    for (let i = 0; i < result.length; i++) {
        const ch = result[i];
        if (ch === '"' || ch === "'") {
            inQuotes = !inQuotes;
            pyCode += ch;
        } else if (ch === '^' && !inQuotes) {
            pyCode += '**';
        } else {
            pyCode += ch;
        }
    }

    // 4. Convert approx_eq (≈)
    pyCode = replaceApproxEqInExpr(pyCode);

    return pyCode;
}

/**
 * Replaces approx_eq (≈) operators with approx_eq(lhs, rhs) calls.
 */
function replaceApproxEqInExpr(expr: string): string {
    let result = expr;
    const keywords = ['if', 'else', 'return', 'in', 'and', 'or', 'not'];

    while (result.includes('≈')) {
        const approxIdx = result.indexOf('≈');

        // Left boundary
        let leftIdx = approxIdx - 1;
        let depth = 0;
        while (leftIdx >= 0) {
            const ch = result[leftIdx];
            if (ch === ')') depth++;
            else if (ch === '(') {
                if (depth === 0) break;
                depth--;
            } else if (depth === 0 && (ch === '?' || ch === ':' || ch === '=' || ch === ',')) {
                break;
            }
            leftIdx--;
        }

        let lhsRaw = result.substring(leftIdx + 1, approxIdx);
        for (const kw of keywords) {
            const match = new RegExp(`\\b${kw}\\s+`, 'g').exec(lhsRaw);
            if (match) {
                const kwEnd = match.index + match[0].length;
                leftIdx = leftIdx + 1 + kwEnd - 1;
                lhsRaw = lhsRaw.substring(kwEnd);
            }
        }
        const lhsStr = lhsRaw.trim();

        // Right boundary
        let rightIdx = approxIdx + 1;
        depth = 0;
        while (rightIdx < result.length) {
            const ch = result[rightIdx];
            if (ch === '(') depth++;
            else if (ch === ')') {
                if (depth === 0) break;
                depth--;
            } else if (depth === 0 && (ch === '?' || ch === ':' || ch === '=' || ch === ',')) {
                break;
            }
            rightIdx++;
        }

        let rhsRaw = result.substring(approxIdx + 1, rightIdx);
        for (const kw of keywords) {
            const kwMatch = new RegExp(`\\s+\\b${kw}\\b`).exec(rhsRaw);
            if (kwMatch) {
                const kwStart = kwMatch.index;
                rightIdx = approxIdx + 1 + kwStart;
                rhsRaw = rhsRaw.substring(0, kwStart);
                break;
            }
        }
        const rhsStr = rhsRaw.trim();

        const before = result.substring(0, leftIdx + 1);
        const after = result.substring(rightIdx);
        result = `${before}approx_eq(${lhsStr}, ${rhsStr})${after}`;
    }
    return result;
}


/**
 * Transforms PHS ternary operator (`cond ? val1 : val2`) into Python `(val1 if cond else val2)`.
 */
function transformTernary(code: string): string {
    const qIdx = code.indexOf('?');
    if (qIdx !== -1) {
        const colonIdx = code.indexOf(':', qIdx);
        if (colonIdx !== -1) {
            const cond = code.substring(0, qIdx).trim();
            const val1 = code.substring(qIdx + 1, colonIdx).trim();
            const val2 = code.substring(colonIdx + 1).trim();
            return `(${val1} if ${cond} else ${val2})`;
        }
    }
    return code;
}

/**
 * Processes text blocks (```...```) to transpile inline string interpolations `{expr}`.
 */
function processTextBlockInterpolation(text: string): string {
    const trimmedText = text.trim();
    if (trimmedText.includes('{')) {
        const processed = trimmedText.replace(/\{([^}]+)\}/g, (_, innerExpr) => {
            const transpiled = transpileCodeLine(innerExpr);
            const safeTranspiled = transpiled.replace(/"/g, "'");
            return `{${safeTranspiled}}`;
        });
        const safeText = processed.replace(/"/g, '\\"');
        return `f"${safeText}"`;
    }
    if (trimmedText.includes('\n')) {
        const safeText = trimmedText.replace(/"""/g, '\\"\\"\\"');
        return `"""${safeText}"""`;
    }
    const safeText = trimmedText.replace(/"/g, '\\"');
    return `"${safeText}"`;
}


/**
 * Transpiles a single PHS code line or expression into native Python code.
 */
function transpileCodeLine(code: string): string {
    const trimmed = code.trim();
    if (!trimmed) {
        return '';
    }

    // 0. Check for ternary operator
    const ternaryTransformed = transformTernary(trimmed);
    if (ternaryTransformed !== trimmed) {
        return transformQuantityLiterals(ternaryTransformed);
    }

    // 1. Check for format specifiers e.g. force_: frac|base OR expr: .2f
    const colonIdx = trimmed.lastIndexOf(':');
    if (colonIdx !== -1 && !trimmed.includes('(') && !trimmed.includes('?')) {
        const exprPart = trimmed.substring(0, colonIdx).trim();
        const specPart = trimmed.substring(colonIdx + 1).trim();
        if (specPart && !specPart.includes('=')) {
            const transformedExpr = transformQuantityLiterals(exprPart);
            return `f"{${transformedExpr}:${specPart}}"`;
        }
    }

    // 2. Check for unit conversion operators (=> or ->)
    const convMatch = /(.*?)\s*(?:=>|->)\s*(.*)/.exec(trimmed);
    if (convMatch) {
        const lhsRaw = convMatch[1].trim();
        const targetUnit = convMatch[2].trim();

        // Check if LHS contains variable assignment e.g. "a = 10 m"
        const eqMatch = /^([\p{L}_][\p{L}\p{N}_]*\s*=\s*)(.*)/u.exec(lhsRaw);
        if (eqMatch) {
            const varAssign = eqMatch[1];
            const exprVal = transformQuantityLiterals(eqMatch[2].trim());
            return `${varAssign}(${exprVal}).to("${targetUnit}")`;
        } else {
            const lhsTransformed = transformQuantityLiterals(lhsRaw);
            return `(${lhsTransformed}).to("${targetUnit}")`;
        }
    }

    // 3. Standard expression transformation
    return transformQuantityLiterals(trimmed);
}

/**
 * Smartly transpiles PHS source code into clean, native Python code
 * using `Q_` and native Python constructs (functions, expressions, variables).
 */
export function transpiledPhsToPython(phsText: string): string {
    const lines = phsText.split(/\r\n|\r|\n/);
    const pythonLines: string[] = [
        '# Generated by Physure VS Code Extension',
        'from physure import (',
        '    Q_,',
        '    Quantity,',
        '    acos,',
        '    approx_eq,',
        '    asin,',
        '    atan,',
        '    atan2,',
        '    cos,',
        '    cosh,',
        '    e,',
        '    exp,',
        '    linspace,',
        '    log,',
        '    log10,',
        '    pi,',
        '    plot,',
        '    sin,',
        '    sinh,',
        '    sqrt,',
        '    tan,',
        '    tanh,',
        ')',
        '',
    ];


    let i = 0;
    while (i < lines.length) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        // 1. Blank lines
        if (!trimmed) {
            pythonLines.push('');
            i++;
            continue;
        }

        // 2. Full line comments
        if (trimmed.startsWith('#')) {
            pythonLines.push(rawLine);
            i++;
            continue;
        }

        // 3. Display Text Blocks (``` ... ```)
        if (trimmed.startsWith('```')) {
            if (trimmed.length > 3 && trimmed.endsWith('```')) {
                const textContent = trimmed.substring(3, trimmed.length - 3);
                const processed = processTextBlockInterpolation(textContent);
                pythonLines.push(`print(${processed})`);
                i++;
                continue;
            }

            const textLines: string[] = [];
            i++; // skip opening ```
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                textLines.push(lines[i]);
                i++;
            }
            if (i < lines.length && lines[i].trim().startsWith('```')) {
                i++; // skip closing ```
            }

            const fullText = textLines.join('\n');
            const processed = processTextBlockInterpolation(fullText);
            pythonLines.push(`print(${processed})`);
            continue;
        }

        // 4. Single-line or multiline Function Definition: f(params) = ...
        const funcHeaderMatch = /^([\p{L}_][\p{L}\p{N}_]*)\s*\(([^)]*)\)\s*=\s*(.*)/u.exec(trimmed);
        if (funcHeaderMatch) {
            const funcName = funcHeaderMatch[1];
            const rawParams = funcHeaderMatch[2];
            const inlineBody = funcHeaderMatch[3].trim();

            const paramList = rawParams
                .split(',')
                .map((p) => {
                    const parts = p.split(':');
                    return {
                        name: parts[0].trim(),
                        unit: parts[1] ? parts[1].trim() : undefined,
                    };
                })
                .filter((p) => p.name.length > 0);

            const cleanParamsStr = paramList.map((p) => p.name).join(', ');
            pythonLines.push(`def ${funcName}(${cleanParamsStr}):`);

            // Inject runtime unit conversion / safety checks for annotated parameters
            for (const param of paramList) {
                if (param.unit) {
                    pythonLines.push(`    ${param.name} = ${param.name}.to("${param.unit}")`);
                }
            }

            if (inlineBody) {
                // Single-line function definition body
                const transformedInline = transpileCodeLine(inlineBody);
                pythonLines.push(`    return ${transformedInline}`);
                i++;
                continue;
            }

            // Collect multiline function body lines
            const bodyLines: { line: string; indentStr: string }[] = [];
            i++;
            while (i < lines.length) {
                const nextLine = lines[i];
                const nextTrimmed = nextLine.trim();
                if (!nextTrimmed) {
                    i++;
                    continue;
                }
                const indent = nextLine.length - nextLine.trimStart().length;
                if (indent > 0) {
                    bodyLines.push({ line: nextTrimmed, indentStr: ' '.repeat(indent) });
                    i++;
                } else {
                    break;
                }
            }

            if (bodyLines.length === 0) {
                if (paramList.every((p) => !p.unit)) {
                    pythonLines.push('    pass');
                }
            } else {
                for (let bIdx = 0; bIdx < bodyLines.length; bIdx++) {
                    const isLast = bIdx === bodyLines.length - 1;
                    const { line: bLine, indentStr } = bodyLines[bIdx];
                    const transformedBody = transpileCodeLine(bLine);

                    if (isLast && !isAssignmentLine(bLine)) {
                        pythonLines.push(`${indentStr}return ${transformedBody}`);
                    } else {
                        pythonLines.push(`${indentStr}${transformedBody}`);
                    }
                }
            }
            continue;
        }

        // 5. Single line statements / assignments / expressions
        const commentIdx = rawLine.indexOf('#');
        const codePart = commentIdx !== -1 ? rawLine.substring(0, commentIdx).trimEnd() : rawLine;
        const commentPart = commentIdx !== -1 ? rawLine.substring(commentIdx) : '';

        const trimmedCode = codePart.trim();
        const indentStr = rawLine.substring(0, rawLine.length - rawLine.trimStart().length);

        if (!trimmedCode) {
            pythonLines.push(rawLine);
            i++;
            continue;
        }

        const transpiledCode = transpileCodeLine(trimmedCode);
        let pyStmt: string;

        if (isAssignmentLine(trimmedCode)) {
            pyStmt = `${indentStr}${transpiledCode}`;
        } else {
            pyStmt = `${indentStr}print(${transpiledCode})`;
        }

        if (commentPart) {
            pyStmt += `  ${commentPart}`;
        }

        pythonLines.push(pyStmt);
        i++;
    }

    return pythonLines.join('\n');
}

/**
 * Generates a clean Markdown report template from PHS source and evaluation results.
 */
export function phsToMarkdownReport(
    fileName: string,
    phsText: string,
    langOrI18n?: Language | Translations,
    resultsMap?: Map<number, string>
): string {
    const t: Translations =
        typeof langOrI18n === 'object' && langOrI18n !== null && 'reportTitle' in langOrI18n
            ? langOrI18n
            : getI18n((langOrI18n as Language) || 'en');

    const lines = phsText.split(/\r\n|\r|\n/);
    const symbols = findAssignmentSymbols(lines);

    const mdLines: string[] = [
        `# ${t.reportTitle}: ${path.basename(fileName)}`,
        `*${t.autoGenerated} — ${new Date().toLocaleDateString()}*`,
        '',
        `## ${t.secVariables}`,
    ];

    if (symbols.length === 0) {
        mdLines.push(`*${t.noVariables}*`);
    } else {
        mdLines.push(`| ${t.symbol} | ${t.location} | ${t.evaluatedValue} |`);
        mdLines.push('| --- | --- | --- |');
        for (const sym of symbols) {
            const rawVal = resultsMap?.get(sym.line) ?? '—';
            const safeVal = rawVal.replace(/\|/g, '\\|');
            const locStr = `${t.line} ${sym.line + 1}`;
            mdLines.push(`| \`${sym.name}\` | ${locStr} | \`${safeVal}\` |`);
        }
    }

    mdLines.push('');
    mdLines.push(`## ${t.secSequence}`);
    mdLines.push(`| ${t.line} | Expression / Statement | ${t.evaluatedValue} |`);
    mdLines.push('| --- | --- | --- |');

    let idx = 0;
    let figCounter = 1;

    while (idx < lines.length) {
        const rawLine = lines[idx];
        const trimmed = rawLine.trim();

        // Single-line text block: ```text```
        if (trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.length > 6) {
            const innerText = trimmed.substring(3, trimmed.length - 3).trim();
            const val = resultsMap?.get(idx) ?? innerText;
            mdLines.push(`\n> **${t.line} ${idx + 1}:** ${val}\n`);
            idx++;
            continue;
        }

        // Multiline text block: ``` ... ```
        if (trimmed.startsWith('```')) {
            const startLine = idx;
            idx++;
            const blockTextLines: string[] = [];
            while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
                blockTextLines.push(lines[idx]);
                idx++;
            }
            if (idx < lines.length && lines[idx].trim().startsWith('```')) {
                idx++;
            }
            const rawContent = blockTextLines.join('\n').trim();
            const val = resultsMap?.get(startLine) ?? rawContent;
            mdLines.push(`\n> **${t.lines} ${startLine + 1}–${idx}:** ${val}\n`);
            continue;
        }

        // Blank or comment lines
        if (!trimmed || trimmed.startsWith('#')) {
            idx++;
            continue;
        }

        const output = resultsMap?.get(idx);
        const safeExpr = trimmed.replace(/\|/g, '\\|');

        if (output && output.startsWith('[PLOT_IMAGE:')) {
            const b64Uri = output.substring(12, output.length - 1);
            const figNum = figCounter++;
            mdLines.push(`| ${idx + 1} | \`${safeExpr}\` | *${t.figure} ${figNum}* |`);
            mdLines.push(`\n![${t.figure} ${figNum}](${b64Uri})\n`);
        } else {
            const safeOutput = (output ?? '—').replace(/\|/g, '\\|');
            mdLines.push(`| ${idx + 1} | \`${safeExpr}\` | \`${safeOutput}\` |`);
        }

        idx++;
    }

    mdLines.push('');
    mdLines.push('## Source Code (.phs)');
    mdLines.push('```phs');
    mdLines.push(phsText);
    mdLines.push('```');
    mdLines.push('');

    return mdLines.join('\n');
}

