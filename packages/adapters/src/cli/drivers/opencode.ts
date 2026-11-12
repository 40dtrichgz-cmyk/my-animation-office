import { CliDriver, CliInvocation, CliParseResult } from '../types';
import { runCli } from '../spawn';

interface OpencodeLine {
    type?: string;
    part?: { type?: string; text?: unknown };
}

/**
 * opencode emits newline-delimited JSON. Only `text` parts carry model output;
 * step start/finish and tool events are ignored.
 */
function collectText(stdout: string): string {
    let text = '';

    for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }

        let parsed: OpencodeLine;
        try {
            parsed = JSON.parse(trimmed) as OpencodeLine;
        } catch {
            continue;
        }

        if (
            parsed !== null &&
            typeof parsed === 'object' &&
            parsed.type === 'text' &&
            parsed.part?.type === 'text' &&
            typeof parsed.part.text === 'string'
        ) {
            text += parsed.part.text;
        }
    }

    return text;
}

export function opencodeDriver(dataDir: string): CliDriver {
    return {
        name: 'opencode',

        buildInvocation(prompt: string, model: string | undefined, cwd: string): CliInvocation {
            return {
                command: 'opencode',
                args: ['run', '--format', 'json', ...(model ? ['-m', model] : [])],
                stdin: prompt,
                env: { XDG_DATA_HOME: dataDir },
            };
        },

        parseOutput(stdout: string, stderr: string, exitCode: number): CliParseResult {
            if (exitCode !== 0) {
                return { ok: false, error: stderr || stdout };
            }

            const content = collectText(stdout);
            if (content.length === 0) {
                return { ok: false, error: 'no text output' };
            }

            return { ok: true, content };
        },

        async healthCheck(): Promise<boolean> {
            const result = await runCli(
                { command: 'opencode', args: ['--version'], stdin: '', env: {} },
                process.cwd(),
                15000
            );
            return result.code === 0 && !result.spawnError;
        },
    };
}
