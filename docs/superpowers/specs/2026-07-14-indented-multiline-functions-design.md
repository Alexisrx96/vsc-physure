# Indented Multi-line Functions Design Spec

Date: 2026-07-14

## Context

Currently, MKML user-defined functions are restricted to single-expression bodies on a single line: `f(x) = expr`. To perform multi-step physical calculations, users had to use nested `let...in` expressions.

This design introduces **Indented Multi-line Functions** using Python-style significant indentation (*off-side rule*).

## Grammar Specification

### Syntax
```mkml
name(param1: unit1, param2) =
    step1 = expr1
    step2 = expr2
    final_result_expr
```

1. **Header**: `name(params) =` ending the line with `=`.
2. **Indented Body**: Subsequent non-empty lines with a higher indentation level (2+ spaces or tabs) relative to the header line belong to the function body.
3. **Local Scope**: Variable assignments within the body (e.g. `step1 = ...`) are stored in a local execution environment that is discarded when the function returns.
4. **Implicit Return**: The evaluation of the last line/statement of the indented block is the return value of the function.
5. **Top-level Termination**: The function body ends at the first non-empty line with an indentation level less than or equal to the function header line.

## Core Implementation (measurekit)

In `measurekit/ext/grammar.py`:
1. `_try_define_function` detects header `name(params) =` without a body on the same line.
2. It collects subsequent indented lines into `UserFunction.body_statements: list[list[Token]]`.
3. At call time, `_call_user_function` binds arguments into a local scope dict, evaluates intermediate statements sequentially in `local_scope`, and returns the result of the final statement.

## Extension Implementation (vsc_measurekit)

1. **Syntax Highlighting & Indentation Guidelines (`syntaxes/mkml.tmLanguage.json` & `language-configuration.json`)**:
   - Highlight function header `f(params) =` with `entity.name.function.mkml`.
   - Add `indentationRules` (`increaseIndentPattern`) to automatically indent the next line after typing `f(params) =`.
   - Add code folding patterns (`folding` / `markers`) for indentation blocks.
2. **Diagnostics & Symbol Provider (`src/tokenizer.ts` & `src/extension.ts`)**:
   - `computeDiagnostics`: Validates expressions across indented function lines.
   - `findAssignmentSymbols`: Recognizes multi-line function declarations and parameters for the VS Code Symbol Outline.
   - `findVariableDefinition`: Locates variable and function definitions inside and outside indented function blocks.
