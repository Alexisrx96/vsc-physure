import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

export interface DaemonLineResult {
    line: number;
    output: string;
}

export interface DaemonDiagnostic {
    line: number;
    column: number;
    message: string;
}

export interface DaemonEvalResult {
    id: number;
    results: DaemonLineResult[];
    diagnostics: DaemonDiagnostic[];
}

const PYTHON_DAEMON_SCRIPT = `
import sys, json, re

try:
    from physure.ext.grammar import GrammarInterpreter, _TEXT_BLOCK_RE, _tokenize, _FUNCTIONS
    from physure.domain.exceptions import PhysureError
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import io, base64

    def _plot_func(*args):
        try:
            fig, ax = plt.subplots(figsize=(6, 3.5))
            if len(args) >= 2:
                x_val, y_val = args[0], args[1]
                x_mag = getattr(x_val, 'magnitude', x_val)
                y_mag = getattr(y_val, 'magnitude', y_val)
                x_unit = getattr(x_val, 'unit', '')
                y_unit = getattr(y_val, 'unit', '')

                ax.plot(x_mag, y_mag, color='#4ec9b0', linewidth=2.5)
                if x_unit: ax.set_xlabel(f'x ({x_unit})', color='#cccccc')
                if y_unit: ax.set_ylabel(f'y ({y_unit})', color='#cccccc')
            elif len(args) == 1:
                y_val = args[0]
                y_mag = getattr(y_val, 'magnitude', y_val)
                y_unit = getattr(y_val, 'unit', '')
                ax.plot(y_mag, color='#4ec9b0', linewidth=2.5)
                if y_unit: ax.set_ylabel(f'y ({y_unit})', color='#cccccc')

            ax.set_title('Physure Live Plot', color='#569cd6', fontsize=11, fontweight='bold')
            ax.grid(True, linestyle='--', alpha=0.25)
            ax.tick_params(colors='#cccccc')
            fig.patch.set_facecolor('#1e1e1e')
            ax.set_facecolor('#252526')

            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight', dpi=120)
            buf.seek(0)
            b64 = base64.b64encode(buf.read()).decode('utf-8')
            plt.close('all')
            import gc
            gc.collect()
            return f'[PLOT_IMAGE:data:image/png;base64,{b64}]'
        except Exception as e:
            plt.close('all')
            return f'Plot error: {e}'

    def _linspace_func(start, stop, num=50):
        return np.linspace(float(start), float(stop), int(num))

    _FUNCTIONS['plot'] = (1, 3, _plot_func)
    _FUNCTIONS['linspace'] = (2, 3, _linspace_func)

    HAS_PHYSURE = True
except Exception:
    HAS_PHYSURE = False

def process_request(req):
    req_id = req.get("id")
    source = req.get("source", "")
    results = []
    diagnostics = []

    if not HAS_PHYSURE:
        return {"id": req_id, "results": [], "diagnostics": [{"line": 0, "column": 0, "message": "Physure package not available in python interpreter"}]}

    class LineTrackingInterpreter(GrammarInterpreter):
        def run_with_lines(self, source: str):
            line_results = []
            pos = 0
            current_line = 1

            for match in _TEXT_BLOCK_RE.finditer(source):
                prefix = source[pos:match.start()]
                line_results.extend(self._run_segment_with_lines(prefix, start_line_num=current_line))
                current_line += prefix.count("\\n")

                match_start_line = source[:match.start()].count("\\n")
                text = match.group(1)
                if text.startswith("\\n"):
                    text = text[1:]
                if text.endswith("\\n"):
                    text = text[:-1]

                line_results.append({"line": match_start_line, "output": self._interpolate_text(text)})
                current_line += match.group(0).count("\\n")
                pos = match.end()

            tail = source[pos:]
            line_results.extend(self._run_segment_with_lines(tail, start_line_num=current_line))
            return line_results

        def _interpolate_text(self, text: str) -> str:
            def replacer(m):
                expr = m.group(1).strip()
                try:
                    res_list = self._run_segment_with_lines(expr, 1)
                    if res_list:
                        val = res_list[-1].get("output")
                        if val is not None:
                            return str(val)
                except Exception as e:
                    return f"{{ERR: {e}}}"
                return m.group(0)

            return re.sub(r"\{([^}]+)\}", replacer, text)

        def _run_segment_with_lines(self, segment: str, start_line_num: int):
            res_list = []
            raw_lines = segment.split("\\n")
            i = 0
            while i < len(raw_lines):
                line = raw_lines[i]
                current_line = start_line_num + i
                stmt = line.split("#", 1)[0].rstrip()
                stripped_stmt = stmt.strip()
                if not stripped_stmt:
                    i += 1
                    continue

                try:
                    sub_stmts = [s.strip() for s in stripped_stmt.split(";") if s.strip()]
                    first_tokens = _tokenize(sub_stmts[0]) if sub_stmts else []

                    if len(sub_stmts) == 1 and self._is_multiline_func_header(first_tokens):
                        i += 1
                        body_lines = []
                        while i < len(raw_lines):
                            sub_line = raw_lines[i]
                            sub_comment_stripped = sub_line.split("#", 1)[0].rstrip()
                            if not sub_comment_stripped.strip():
                                i += 1
                                continue
                            indent = len(sub_line) - len(sub_line.lstrip())
                            if indent > 0:
                                body_lines.append(sub_comment_stripped.strip())
                                i += 1
                            else:
                                break
                        self._define_multiline_function(first_tokens, body_lines, stripped_stmt)
                        continue

                    for part_stmt in sub_stmts:
                        res = self._eval_statement(part_stmt)
                        if res is None and "=" in part_stmt:
                            var_name = part_stmt.split("=", 1)[0].strip()
                            if var_name in self.env:
                                res = self.env[var_name]
                        if res is not None:
                            res_list.append({"line": current_line - 1, "output": str(res)})
                except Exception as e:
                    msg = str(e)
                    if "DimensionError" in type(e).__name__ or "dimension" in msg.lower() or "incompatible" in msg.lower():
                        msg = f"Dimensional Mismatch: {msg}"
                    diagnostics.append({"line": current_line - 1, "column": 0, "message": msg})
                    break
                i += 1
            return res_list

    try:
        interp = LineTrackingInterpreter()
        results = interp.run_with_lines(source)
    except Exception as e:
        err_l = getattr(e, "line", None) or 1
        err_c = getattr(e, "column", None) or 1
        diagnostics.append({"line": err_l - 1, "column": err_c - 1, "message": str(e)})

    return {"id": req_id, "results": results, "diagnostics": diagnostics}

def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            resp = process_request(req)
            sys.stdout.write(json.dumps(resp) + "\\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"error": str(e)}) + "\\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
`;

import { logger } from './logger';

export class PhysureDaemon {
    private process: ChildProcess | undefined;
    private currentPythonPath: string | undefined;
    private requestIdCounter = 0;
    private pendingRequests = new Map<number, (res: DaemonEvalResult) => void>();
    private buffer = '';

    public start(pythonPath: string): void {
        if (this.process && this.currentPythonPath === pythonPath) {
            return;
        }

        this.stop();

        this.currentPythonPath = pythonPath;
        logger.info(`Starting Physure daemon worker with python: ${pythonPath}`);

        try {
            this.process = spawn(pythonPath, ['-c', PYTHON_DAEMON_SCRIPT], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            this.process.stdout?.on('data', (data: Buffer) => {
                this.buffer += data.toString('utf8');
                const lines = this.buffer.split('\n');
                this.buffer = lines.pop() ?? '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        continue;
                    }
                    try {
                        const resp = JSON.parse(trimmed) as DaemonEvalResult;
                        if (typeof resp.id === 'number' && this.pendingRequests.has(resp.id)) {
                            const resolve = this.pendingRequests.get(resp.id);
                            this.pendingRequests.delete(resp.id);
                            resolve?.(resp);
                        }
                    } catch (err) {
                        logger.error(`Daemon emitted malformed JSON line: ${trimmed}`, err);
                    }
                }
            });

            this.process.stderr?.on('data', (data: Buffer) => {
                logger.warn(`Daemon stderr: ${data.toString('utf8').trim()}`);
            });

            this.process.on('exit', (code, signal) => {
                logger.info(`Daemon process exited with code ${code}, signal ${signal}`);
                this.process = undefined;
            });

            this.process.on('error', (err) => {
                logger.error('Failed to spawn daemon process', err);
                this.process = undefined;
            });
        } catch (err) {
            logger.error('Exception starting daemon process', err);
            this.process = undefined;
        }
    }

    public evaluate(source: string, pythonPath: string): Promise<DaemonEvalResult> {
        this.start(pythonPath);

        if (!this.process || !this.process.stdin) {
            logger.warn('Daemon process is unavailable for evaluation request.');
            return Promise.resolve({ id: 0, results: [], diagnostics: [] });
        }

        const id = ++this.requestIdCounter;
        return new Promise<DaemonEvalResult>((resolve) => {
            this.pendingRequests.set(id, resolve);
            const payload = JSON.stringify({ id, source }) + '\n';
            this.process?.stdin?.write(payload, 'utf8');
        });
    }

    public stop(): void {
        if (this.process) {
            logger.info('Stopping Physure daemon worker');
            this.process.kill();
            this.process = undefined;
        }
        this.pendingRequests.forEach((resolve) => resolve({ id: 0, results: [], diagnostics: [] }));
        this.pendingRequests.clear();
        this.buffer = '';
    }
}

export const physureDaemon = new PhysureDaemon();
