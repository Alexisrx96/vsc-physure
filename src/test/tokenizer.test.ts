import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDiagnostics, findVariableDefinition, findAssignmentSymbols, filterValidUnitSymbols, parseUnitListJson } from '../tokenizer';

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
    assert.deepEqual(result, { line: 0, text: 'force = 500 N' });
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
    assert.deepEqual(symbols.map((s) => s.name), ['force', 'area', 'stress']);
});

test('findAssignmentSymbols: ignores equality assertions', () => {
    const lines = ['stress == 250 Pa'];
    const symbols = findAssignmentSymbols(lines);
    assert.deepEqual(symbols, []);
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

test('parseUnitListJson: throws on invalid JSON', () => {
    assert.throws(() => parseUnitListJson('not json'));
});
