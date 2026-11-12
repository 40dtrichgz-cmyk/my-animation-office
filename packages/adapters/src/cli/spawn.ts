import { spawn } from 'child_process';
import { CliInvocation } from './types';

export interface RunResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    spawnError?: string;
}

const IS_WINDOWS = process.platform === 'win32';
const KILL_GRACE_MS = 2000;

/**
 * Quote one argument for cmd.exe.
 *
 * With `shell: true` on Windows, Node joins the command and its args with spaces
 * and lets cmd.exe re-split them, so anything containing a space (for example
 * `C:\Program Files\nodejs\node.exe`) would otherwise be torn apart.
 */
function quoteForCmd(value: string): string {
    if (value.length > 0 && !/[\s"]/.test(value)) {
        return value;
    }

    let quoted = '"';
    let backslashes = 0;

    for (const char of value) {
        if (char === '\\') {
            backslashes += 1;
        } else if (char === '"') {
            quoted += '\\'.repeat(backslashes * 2 + 1) + '"';
            backslashes = 0;
        } else {
            quoted += '\\'.repeat(backslashes) + char;
            backslashes = 0;
        }
    }

    return quoted + '\\'.repeat(backslashes * 2) + '"';
}

export function runCli(inv: CliInvocation, cwd: string, timeoutMs: number): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let settled = false;
        let timeoutHandle: NodeJS.Timeout | undefined;
        let graceHandle: NodeJS.Timeout | undefined;

        const finish = (result: RunResult) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            if (graceHandle) {
                clearTimeout(graceHandle);
            }
            resolve(result);
        };

        const command = IS_WINDOWS
            ? [inv.command, ...inv.args].map(quoteForCmd).join(' ')
            : inv.command;
        // Node's shell mode concatenates args without escaping them on Windows,
        // so the command line above already carries the quoted arguments.
        const args = IS_WINDOWS ? [] : inv.args;

        const child = spawn(command, args, {
            cwd,
            env: { ...process.env, ...inv.env },
            shell: IS_WINDOWS,
        });

        const terminate = () => {
            if (child.pid === undefined) {
                return;
            }
            if (!IS_WINDOWS) {
                child.kill();
                return;
            }
            // On Windows the direct child is cmd.exe; killing only it leaves the
            // real process running with the inherited stdio pipes still open.
            const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                stdio: 'ignore',
                windowsHide: true,
            });
            killer.on('error', () => child.kill());
        };

        timeoutHandle = setTimeout(() => {
            timedOut = true;
            terminate();
            // Safety net in case the killed process tree never reports 'close'.
            graceHandle = setTimeout(() => {
                finish({ code: null, stdout, stderr, timedOut });
            }, KILL_GRACE_MS);
        }, timeoutMs);

        child.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on('error', (error: Error) => {
            finish({ code: null, stdout, stderr, timedOut, spawnError: error.message });
        });

        child.on('close', (code: number | null) => {
            finish({ code, stdout, stderr, timedOut });
        });

        child.stdin?.on('error', () => {
            // The child may exit before consuming stdin; ignore EPIPE.
        });
        child.stdin?.end(inv.stdin);
    });
}
