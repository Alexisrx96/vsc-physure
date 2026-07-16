import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDiagnostics, findVariableDefinition, findAssignmentSymbols, filterValidUnitSymbols, parseUnitListJson, formatDocument, isFormatSpecifierPosition } from '../tokenizer';



test('computeDiagnostics: valid expression has no diagnostics', () => {
    const diagnostics = computeDiagnostics('force = 500 N');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: comment-only line has no diagnostics', () => {
    const diagnostics = computeDiagnostics('# just a comment $$$');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: flags an unexpected character', () => {
    const diagnostics = computeDiagnostics('force = 500 N $');
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Unexpected character '\$'/);
    assert.equal(diagnostics[0].line, 0);
});

test('computeDiagnostics: flags unbalanced open parenthesis', () => {
    const diagnostics = computeDiagnostics('stress = (force / area');
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Unbalanced parentheses/);
});

test('computeDiagnostics: flags mismatched closing parenthesis', () => {
    const diagnostics = computeDiagnostics('stress = force / area)');
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Mismatched closing parenthesis/);
});

test('computeDiagnostics: balanced parentheses produce no diagnostics', () => {
    const diagnostics = computeDiagnostics('stress = (force / area) * 2');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: superscript sequence is not flagged as unexpected', () => {
    const diagnostics = computeDiagnostics('area = 2 m²');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: reports one diagnostic per offending line, independently', () => {
    const diagnostics = computeDiagnostics('a = 1 m\nb = 2 $\nc = (3');
    assert.equal(diagnostics.length, 2);
    assert.equal(diagnostics[0].line, 1);
    assert.equal(diagnostics[1].line, 2);
});

test('findVariableDefinition: finds the most recent definition at or above the given line', () => {
    const lines = ['force = 500 N', 'area = 2 m^2', 'stress = force / area'];
    const result = findVariableDefinition(lines, 'force', 2);
    assert.deepEqual(result, { line: 0, text: 'force = 500 N', headerText: 'force = 500 N', isFunction: false });
});

test('findVariableDefinition: collects full body of multiline functions for hover definition', () => {
    const lines = [
        'f(v: m / s) =',
        '    resta = 1 m / s',
        '    v * 2 - resta'
    ];
    const result = findVariableDefinition(lines, 'f', 2);
    assert.deepEqual(result, {
        line: 0,
        text: 'f(v: m / s) =\n    resta = 1 m / s\n    v * 2 - resta',
        headerText: 'f(v: m / s) =',
        isFunction: true
    });
});


test('findVariableDefinition: returns undefined when there is no definition', () => {
    const lines = ['stress = force / area'];
    const result = findVariableDefinition(lines, 'force', 0);
    assert.equal(result, undefined);
});

test('findVariableDefinition: does not match an equality assertion as a definition', () => {
    const lines = ['stress == 250 Pa'];
    const result = findVariableDefinition(lines, 'stress', 0);
    assert.equal(result, undefined);
});

test('findAssignmentSymbols: extracts every assignment in document order', () => {
    const lines = ['force = 500 N', '# a comment', 'area = 2 m^2', 'stress = force / area'];
    const symbols = findAssignmentSymbols(lines);
    assert.deepEqual(symbols, [
        { name: 'force', line: 0, startChar: 0, endChar: 5, kind: 'variable', signature: 'force' },
        { name: 'area', line: 2, startChar: 0, endChar: 4, kind: 'variable', signature: 'area' },
        { name: 'stress', line: 3, startChar: 0, endChar: 6, kind: 'variable', signature: 'stress' }
    ]);
});

test('findAssignmentSymbols: ignores equality assertions', () => {
    const lines = ['stress == 250 Pa'];
    const symbols = findAssignmentSymbols(lines);
    assert.deepEqual(symbols, []);
});

test('computeDiagnostics: subscript digit sequences in chemical formulas produce no diagnostics', () => {
    const diagnostics = computeDiagnostics('H₂O + O₂ ⇌ 2 H₂O');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: unicode operators (×, ÷, √, ⇌, <=>) produce no diagnostics', () => {
    const diagnostics = computeDiagnostics('r = 6 × 3 ÷ √9\n2 H₂ + O₂ <=> 2 H₂O');
    assert.deepEqual(diagnostics, []);
});

test('isFormatSpecifierPosition: identifies positions inside format specifiers', () => {
    assert.equal(isFormatSpecifierPosition('force_: .2f|base', 10), true);
    assert.equal(isFormatSpecifierPosition('force_: .2f|base', 3), false);
    assert.equal(isFormatSpecifierPosition('f(x: m)', 5), false);
    assert.equal(isFormatSpecifierPosition('x > 0 ? 10 : 20', 14), false);
});

test('computeDiagnostics: format specifiers with pipe (|) produce no diagnostics', () => {
    const diagnostics = computeDiagnostics('force_ = 500.12345 N: .2e|base?');
    assert.deepEqual(diagnostics, []);
});


test('computeDiagnostics: built-in math function calls with commas produce no diagnostics', () => {
    const diagnostics = computeDiagnostics('x = min(3 m, 200 cm) + round(4.56, 1) + sin(90 deg)');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: typed user functions and let-in expressions produce no diagnostics', () => {
    const diagnostics = computeDiagnostics('f(x: m, k: N/m) = let y = x^2 in y * k');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: greek identifier names produce no diagnostics', () => {
    const diagnostics = computeDiagnostics('ΔH = 50 kJ\nμ = 0.5\nθ = 45 deg');
    assert.deepEqual(diagnostics, []);
});

test('computeDiagnostics: display text blocks ignore invalid syntax inside fences', () => {
    const diagnostics = computeDiagnostics('```text\nThis has $ invalid @ tokens # inside text block\n```\nforce = 500 N');
    assert.deepEqual(diagnostics, []);
});

test('findVariableDefinition: locates user function definitions as well as variable assignments', () => {
    const lines = ['f(x: m) = x * 2', 'y = f(5 m)'];
    const result = findVariableDefinition(lines, 'f', 1);
    assert.deepEqual(result, { line: 0, text: 'f(x: m) = x * 2', headerText: 'f(x: m) = x * 2', isFunction: true });
});


test('findAssignmentSymbols: extracts both variables and user-defined functions with signatures', () => {
    const lines = ['force = 500 N', 'f(x: m, k) = x * k', 'stress = force / area'];
    const symbols = findAssignmentSymbols(lines);
    assert.deepEqual(symbols, [
        { name: 'force', line: 0, startChar: 0, endChar: 5, kind: 'variable', signature: 'force' },
        { name: 'f', line: 1, startChar: 0, endChar: 1, kind: 'function', signature: 'f(x: m, k)' },
        { name: 'stress', line: 2, startChar: 0, endChar: 6, kind: 'variable', signature: 'stress' }
    ]);
});

test('filterValidUnitSymbols: keeps clean unit symbols', () => {
    const result = filterValidUnitSymbols(['kg', 'm/s', 'm^2', 'degC', 'µm', '°C']);
    assert.deepEqual(result, ['kg', 'm/s', 'm^2', 'degC', 'µm', '°C']);
});

test('filterValidUnitSymbols: drops entries with whitespace or bracket/quote artifacts', () => {
    const result = filterValidUnitSymbols(['kg', '] #', "'] #", 'bad entry', 'N']);
    assert.deepEqual(result, ['kg', 'N']);
});

test('filterValidUnitSymbols: drops empty strings', () => {
    const result = filterValidUnitSymbols(['kg', '', 'N']);
    assert.deepEqual(result, ['kg', 'N']);
});

test('parseUnitListJson: parses and filters a valid JSON array', () => {
    const result = parseUnitListJson('["kg", "] #", "N"]');
    assert.deepEqual(result, ['kg', 'N']);
});

test('parseUnitListJson: throws on non-array JSON', () => {
    assert.throws(() => parseUnitListJson('{"not": "an array"}'));
});

test('parseUnitListJson: throws on an array containing non-strings', () => {
    assert.throws(() => parseUnitListJson('["kg", 5, "N"]'));
});

test('computeDiagnostics: indented multiline function definition produces no diagnostics', () => {
    const diagnostics = computeDiagnostics('calcular_energia_k(m: kg, v: m/s) =\n    v_cuadrado = v^2\n    0.5 * m * v_cuadrado');
    assert.deepEqual(diagnostics, []);
});

test('parseUnitListJson: throws on invalid JSON', () => {
    assert.throws(() => parseUnitListJson('not json'));
});

test('formatDocument: formats operators and indents function bodies cleanly', () => {
    const unformatted = 'f(x:m,y:kg)=\n v_sq=x^2\n  v_sq*y';
    const expected = 'f(x: m, y: kg) =\n    v_sq = x ^ 2\n    v_sq * y';
    assert.equal(formatDocument(unformatted, { indentSpaces: 4 }), expected);
});

test('formatDocument: preserves and formats scientific notation numbers without splitting exponent signs', () => {
    const unformatted = 'm_p=1.673e-27 kg\nm_n=1.675e - 27 kg\nm_e=9.109e - 31 kg';
    const expected = 'm_p = 1.673e-27 kg\nm_n = 1.675e-27 kg\nm_e = 9.109e-31 kg';
    assert.equal(formatDocument(unformatted, { indentSpaces: 4 }), expected);
});



