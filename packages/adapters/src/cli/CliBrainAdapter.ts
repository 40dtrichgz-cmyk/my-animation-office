import { InferenceAdapter, CompletionRequest, CompletionResponse } from '@agent-office/core';
import { CliDriver } from './types';
import { runCli } from './spawn';

export interface CliBrainOptions {
    cwd: string;
    timeoutMs?: number; // default 180000
}

const DEFAULT_TIMEOUT_MS = 180_000;

type DriverOutcome = { ok: true; content: string } | { ok: false; error: string };

/**
 * Runs an agent's brain through one or more CLI drivers.
 *
 * The whole chain is tried in order. Any failure (spawn error, timeout,
 * non-zero exit, unparsable output) moves on to the next driver. When every
 * driver fails the error is returned as content — never thrown — so
 * `Agent.think()` speaks it as a raw reply instead of crashing the loop.
 */
export class CliBrainAdapter implements InferenceAdapter {
    public readonly provider: string;
    public readonly isLocal = false;

    private readonly timeoutMs: number;
    private readonly cwd: string;

    constructor(private readonly chain: CliDriver[], opts: CliBrainOptions) {
        this.provider = chain.map((driver) => driver.name).join('>');
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.cwd = opts.cwd;
    }

    async complete(request: CompletionRequest): Promise<CompletionResponse> {
        const start = Date.now();
        const prompt = this.extractPrompt(request);
        const errors: string[] = [];

        for (const driver of this.chain) {
            const outcome = await this.runDriver(driver, prompt, request.model);
            if (outcome.ok) {
                return {
                    content: outcome.content,
                    usage: { prompt: 0, completion: 0 },
                    latency: Date.now() - start,
                };
            }
            errors.push(outcome.error);
        }

        return {
            content: '⚠️ สมองทุกตัวล้มเหลว: ' + errors.join(' | '),
            usage: { prompt: 0, completion: 0 },
            latency: Date.now() - start,
        };
    }

    private async runDriver(driver: CliDriver, prompt: string, model: string | undefined): Promise<DriverOutcome> {
        const invocation = driver.buildInvocation(prompt, model, this.cwd);
        const result = await runCli(invocation, this.cwd, this.timeoutMs);

        if (result.spawnError) {
            return { ok: false, error: `${driver.name}: ${result.spawnError}` };
        }

        if (result.timedOut) {
            return { ok: false, error: `${driver.name}: หมดเวลา ${this.timeoutMs}ms` };
        }

        const parsed = driver.parseOutput(result.stdout, result.stderr, result.code ?? 1);
        if (result.code === 0 && parsed.ok) {
            return { ok: true, content: parsed.content };
        }

        return { ok: false, error: `${driver.name}: ${parsed.ok ? `exit ${result.code}` : parsed.error}` };
    }

    private extractPrompt(request: CompletionRequest): string {
        const messages = request.messages;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                return messages[i].content;
            }
        }

        return messages.length > 0 ? messages[messages.length - 1].content : '';
    }
}
