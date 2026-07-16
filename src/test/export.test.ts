import test from 'node:test';
import assert from 'node:assert/strict';
import { transpiledPhsToPython, phsToMarkdownReport } from '../exporter';

test('transpiledPhsToPython: converts quantity assignments to Q_() and expressions to print()', () => {
    const input = [
        '# masa proton',
        'm_p = 1.673e-27 kg',
        '',
        '# átomo de neutro de litio (Li)',
        'm_p * 3',
    ].join('\n');

    const py = transpiledPhsToPython(input);
    assert.match(py, /from physure import Q_, Quantity/);
    assert.match(py, /# masa proton/);
    assert.match(py, /m_p = Q_\(1\.673e-27, "kg"\)/);
    assert.match(py, /# átomo de neutro de litio \(Li\)/);
    assert.match(py, /print\(m_p \* 3\)/);
});

test('transpiledPhsToPython: handles single line and multiline text blocks (``` ... ```)', () => {
    const input = [
        '```this is a text```',
        '```',
        'This is a text too',
        'With multiple lines',
        '```',
    ].join('\n');

    const py = transpiledPhsToPython(input);
    assert.match(py, /"""this is a text"""/);
    assert.match(py, /"""\nThis is a text too\nWith multiple lines\n"""/);
});

test('transpiledPhsToPython: transpiles multiline function definitions to native Python def blocks', () => {
    const input = [
        '# Definición de función',
        'f(v: m / s) =',
        '    resta = 1 m / s',
        '    v * 2 - resta',
        '',
        'f(10 m / s)  # ➔ 20.0 m/s',
    ].join('\n');

    const py = transpiledPhsToPython(input);
    assert.match(py, /def f\(v\):/);
    assert.match(py, /    v = v\.to\("m \/ s"\)/);
    assert.match(py, /    resta = Q_\(1, "m \/ s"\)/);
    assert.match(py, /    return v \* 2 - resta/);
    assert.match(py, /print\(f\(Q_\(10, "m \/ s"\)\)\)  # ➔ 20\.0 m\/s/);
});

test('transpiledPhsToPython: replaces split exponent operators (* *) with valid Python exponentiation (**)', () => {
    const input = 'F_e = k * q * * 2 / (0.1 m) * * 2';
    const py = transpiledPhsToPython(input);
    assert.match(py, /F_e = k \* q \*\* 2 \/ \(Q_\(0\.1, "m"\)\) \*\* 2/);
    assert.doesNotMatch(py, /\* \*/);
});

test('phsToMarkdownReport: generates markdown document with source and summary table', () => {
    const input = 'a = 5 N\nb = 2 m';
    const md = phsToMarkdownReport('exp.phs', input);
    assert.match(md, /# Physure Calculation Report: exp\.phs/);
    assert.match(md, /```phs\na = 5 N\nb = 2 m\n```/);
    assert.match(md, /\| 1 \| `a = 5 N` \|/);
    assert.match(md, /\| 2 \| `b = 2 m` \|/);
});
