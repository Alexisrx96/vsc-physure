import { execFile } from 'child_process';
import { parseUnitListJson } from './tokenizer';

const UNIT_QUERY_SCRIPT =
    'import json,measurekit; print(json.dumps(sorted(measurekit.get_active_system().UNIT_SYMBOL_REGISTRY.keys())))';
const FETCH_TIMEOUT_MS = 5000;

/**
 * Runs the unit query script against `pythonPath` and returns the live,
 * filtered unit symbol list. Rejects if the interpreter is missing,
 * measurekit isn't installed, the query times out, or the output isn't
 * parseable — callers should catch and fall back to a static list.
 */
export function fetchUnitsFromInterpreter(pythonPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        execFile(pythonPath, ['-c', UNIT_QUERY_SCRIPT], { timeout: FETCH_TIMEOUT_MS }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            try {
                resolve(parseUnitListJson(stdout));
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

const unitsCache = new Map<string, Promise<string[]>>();

/**
 * Returns the live unit list for `pythonPath`, caching per interpreter for
 * the session (repeated calls with the same path reuse the same in-flight
 * or resolved promise — no repeated subprocess spawns). Falls back to
 * `fallback` if the interpreter can't be queried.
 */
export function getUnitsForPath(pythonPath: string, fallback: string[]): Promise<string[]> {
    let cached = unitsCache.get(pythonPath);
    if (!cached) {
        cached = fetchUnitsFromInterpreter(pythonPath).catch(() => fallback);
        unitsCache.set(pythonPath, cached);
    }
    return cached;
}
