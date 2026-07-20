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
    assert.match(py, /from physure import \(/);
    assert.match(py, /Q_,/);
    assert.match(py, /Quantity,/);
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
    assert.match(py, /print\("this is a text"\)/);
    assert.match(py, /print\("""This is a text too\nWith multiple lines"""\)/);
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

test('transpiledPhsToPython: transpiles single-line function definitions correctly', () => {
    const input = 'double_speed(v: m / s) = v * 2';
    const py = transpiledPhsToPython(input);
    assert.match(py, /def double_speed\(v\):/);
    assert.match(py, /    v = v\.to\("m \/ s"\)/);
    assert.match(py, /    return v \* 2/);
});

test('transpiledPhsToPython: transpiles unit conversions on assignments without syntax errors', () => {
    const input = 'a = 10 m => cm';
    const py = transpiledPhsToPython(input);
    assert.match(py, /a = \(Q_\(10, "m"\)\)\.to\("cm"\)/);
    assert.doesNotMatch(py, /\(a = /);
});

test('transpiledPhsToPython: transpiles ternary operators to Python conditional expressions', () => {
    const input = 'fact(n) = n <= 1 ? 1 : n * fact(n - 1)';
    const py = transpiledPhsToPython(input);
    assert.match(py, /def fact\(n\):/);
    assert.match(py, /return \(1 if n <= 1 else n \* fact\(n - 1\)\)/);
});

test('transpiledPhsToPython: transpiles approx_eq (≈) operator into approx_eq() helper call', () => {
    const input = '3.79 ≈ 3.4 ? 22 m : 4 s';
    const py = transpiledPhsToPython(input);
    assert.match(py, /approx_eq,/);
    assert.match(py, /\(Q_\(22, "m"\) if approx_eq\(3\.79, 3\.4\) else Q_\(4, "s"\)\)/);
    assert.doesNotMatch(py, /≈/);
});



test('transpiledPhsToPython: replaces split exponent operators (* *) with valid Python exponentiation (**)', () => {
    const input = 'F_e = k * q * * 2 / (0.1 m) * * 2';
    const py = transpiledPhsToPython(input);
    assert.match(py, /F_e = k \* q \*\* 2 \/ \(Q_\(0\.1, "m"\)\) \*\* 2/);
    assert.doesNotMatch(py, /\* \*/);
});

test('phsToMarkdownReport: generates rich markdown document with variables summary and results', () => {
    const input = [
        'a = 5 N',
        'b = 2 m',
        'work = a * b',
        '```Calculated mechanical work```',
    ].join('\n');

    const resultsMap = new Map<number, string>([
        [0, '5.0 N'],
        [1, '2.0 m'],
        [2, '10.0 N·m'],
        [3, 'Calculated mechanical work'],
    ]);

    const mdEn = phsToMarkdownReport('exp.phs', input, 'en', resultsMap);
    assert.match(mdEn, /# Physure Technical Report: exp\.phs/);
    assert.match(mdEn, /## 1\. Summary of Variables & Quantities/);
    assert.match(mdEn, /\| `a` \| Line 1 \| `5\.0 N` \|/);
    assert.match(mdEn, /\| `b` \| Line 2 \| `2\.0 m` \|/);
    assert.match(mdEn, /\| `work` \| Line 3 \| `10\.0 N·m` \|/);
    assert.match(mdEn, /## 2\. Calculation Sequence & Expressions/);
    assert.match(mdEn, /\| 1 \| `a = 5 N` \| `5\.0 N` \|/);
    assert.match(mdEn, /> \*\*Line 4:\*\* Calculated mechanical work/);
    assert.match(mdEn, /```phs\na = 5 N\nb = 2 m\nwork = a \* b\n```/);

    const mdEs = phsToMarkdownReport('exp.phs', input, 'es', resultsMap);
    assert.match(mdEs, /# Informe Técnico Physure: exp\.phs/);
    assert.match(mdEs, /## 1\. Resumen de Variables y Magnitudes/);
    assert.match(mdEs, /\| `a` \| Línea 1 \| `5\.0 N` \|/);
});

test('phsToMarkdownReport: handles plot image outputs in Markdown export', () => {
    const input = 'plot(x, y)';
    const resultsMap = new Map<number, string>([
        [0, '[PLOT_IMAGE:data:image/png;base64,iVBORw0KGgo=]'],
    ]);

    const md = phsToMarkdownReport('graph.phs', input, 'en', resultsMap);
    assert.match(md, /!\[Figure 1\]\(data:image\/png;base64,iVBORw0KGgo=\)/);
});

