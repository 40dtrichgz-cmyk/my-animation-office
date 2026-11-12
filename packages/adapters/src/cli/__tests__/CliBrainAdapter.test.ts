import { CliBrainAdapter } from '../CliBrainAdapter';
import { CliDriver, CliInvocation, CliParseResult } from '../types';

function fakeDriver(name: string, script: string, fail = false): CliDriver {
    return {
        name,
        buildInvocation: (prompt): CliInvocation => ({ command: process.execPath, args: ['-e', script], stdin: prompt, env: {} }),
        parseOutput: (stdout, _stderr, code): CliParseResult =>
            fail || code !== 0 ? { ok: false, error: `${name} failed` } : { ok: true, content: stdout.trim() },
        healthCheck: async () => !fail,
    };
}

describe('CliBrainAdapter', () => {
    const cwd = process.cwd();

    it('uses first driver when it succeeds', async () => {
        const a = new CliBrainAdapter([fakeDriver('ok', 'process.stdout.write("FIRST")'), fakeDriver('second', 'process.stdout.write("SECOND")')], { cwd, timeoutMs: 10000 });
        const res = await a.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
        expect(res.content).toBe('FIRST');
        expect(a.provider).toBe('ok>second');
    });

    it('falls back to next driver when first fails', async () => {
        const a = new CliBrainAdapter([fakeDriver('bad', 'process.exit(1)', true), fakeDriver('good', 'process.stdout.write("RECOVERED")')], { cwd, timeoutMs: 10000 });
        const res = await a.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
        expect(res.content).toBe('RECOVERED');
    });

    it('returns error text as content when whole chain fails (never throws)', async () => {
        const a = new CliBrainAdapter([fakeDriver('b1', 'process.exit(1)', true), fakeDriver('b2', 'process.exit(2)', true)], { cwd, timeoutMs: 10000 });
        const res = await a.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
        expect(res.content).toContain('⚠️');
        expect(res.content).toContain('b1');
        expect(res.content).toContain('b2');
    });

    it('times out a hung driver and moves on', async () => {
        const a = new CliBrainAdapter([fakeDriver('hung', 'setTimeout(() => {}, 30000)'), fakeDriver('fast', 'process.stdout.write("AFTER_TIMEOUT")')], { cwd, timeoutMs: 500 });
        const res = await a.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
        expect(res.content).toBe('AFTER_TIMEOUT');
    }, 15000);

    it('uses last user message as prompt and reports latency', async () => {
        const a = new CliBrainAdapter([fakeDriver('echo', 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(s))')], { cwd, timeoutMs: 10000 });
        const res = await a.complete({ model: 'm', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'PROMPT_HERE' }] });
        expect(res.content).toBe('PROMPT_HERE');
        expect(res.latency).toBeGreaterThanOrEqual(0);
    });
});
