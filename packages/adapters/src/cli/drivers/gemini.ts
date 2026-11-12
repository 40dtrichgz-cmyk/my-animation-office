import { CliDriver, CliInvocation, CliParseResult } from '../types';

/**
 * Stub for the Gemini CLI. The binary is not installed in this environment, so
 * healthCheck always reports false and the adapter stays inactive until it is.
 */
export function geminiDriver(): CliDriver {
    return {
        name: 'gemini',

        buildInvocation(prompt: string, model: string | undefined, cwd: string): CliInvocation {
            return {
                command: 'gemini',
                args: ['-p'],
                stdin: prompt,
                env: {},
            };
        },

        parseOutput(stdout: string, stderr: string, exitCode: number): CliParseResult {
            if (exitCode !== 0) {
                return { ok: false, error: stderr || stdout };
            }
            return { ok: true, content: stdout.trim() };
        },

        async healthCheck(): Promise<boolean> {
            return false;
        },
    };
}
