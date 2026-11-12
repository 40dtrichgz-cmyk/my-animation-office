import { CliDriver, CliInvocation, CliParseResult } from '../types';
import { runCli } from '../spawn';

const DEFAULT_MODEL = 'haiku';

// The agent may only talk: every tool that could read, write, execute or fetch
// is disallowed so a driver can never escape its prompt/response sandbox.
const DISALLOWED_TOOLS = [
    'Read',
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
    'Bash',
    'WebFetch',
    'WebSearch',
    'Grep',
    'Glob',
    'Task',
    'Agent',
    'Skill',
    'TodoWrite',
];

interface ClaudeResult {
    is_error?: boolean;
    subtype?: string;
    result?: unknown;
}

export function claudeDriver(): CliDriver {
    return {
        name: 'claude',

        buildInvocation(prompt: string, model: string | undefined, cwd: string): CliInvocation {
            return {
                command: 'claude',
                args: [
                    '-p',
                    '--output-format',
                    'json',
                    '--model',
                    model ?? DEFAULT_MODEL,
                    '--disallowedTools',
                    ...DISALLOWED_TOOLS,
                ],
                stdin: prompt,
                env: {},
            };
        },

        parseOutput(stdout: string, stderr: string, exitCode: number): CliParseResult {
            if (exitCode !== 0) {
                return { ok: false, error: stderr || stdout };
            }

            let parsed: ClaudeResult;
            try {
                const raw: unknown = JSON.parse(stdout);
                if (raw === null || typeof raw !== 'object') {
                    throw new Error('expected a JSON object');
                }
                parsed = raw as ClaudeResult;
            } catch {
                return { ok: false, error: 'non-JSON: ' + stdout.slice(0, 200) };
            }

            if (parsed.is_error) {
                return { ok: false, error: String(parsed.result || parsed.subtype) };
            }

            return { ok: true, content: String(parsed.result) };
        },

        async healthCheck(): Promise<boolean> {
            const result = await runCli(
                { command: 'claude', args: ['--version'], stdin: '', env: {} },
                process.cwd(),
                15000
            );
            return result.code === 0 && !result.spawnError;
        },
    };
}
