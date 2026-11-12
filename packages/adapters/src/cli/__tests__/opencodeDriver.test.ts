import { opencodeDriver } from '../drivers/opencode';

const NDJSON = [
    '{"type":"step_start","timestamp":1,"sessionID":"ses_x","part":{"id":"p1","type":"step-start"}}',
    '{"type":"text","timestamp":2,"sessionID":"ses_x","part":{"id":"p2","type":"text","text":"OK","time":{"start":1,"end":2}}}',
    '{"type":"step_finish","timestamp":3,"sessionID":"ses_x","part":{"id":"p3","type":"step-finish","reason":"stop"}}',
].join('\n');

describe('opencodeDriver', () => {
    const d = opencodeDriver('C:/ws/opencode-data');

    it('builds run --format json with model and XDG_DATA_HOME', () => {
        const inv = d.buildInvocation('สวัสดี', 'llmapi/claude-sonnet-4-5', 'C:/ws/agents/director');
        expect(inv.command).toBe('opencode');
        expect(inv.args).toEqual(['run', '--format', 'json', '-m', 'llmapi/claude-sonnet-4-5']);
        expect(inv.env.XDG_DATA_HOME).toBe('C:/ws/opencode-data');
        expect(inv.stdin).toBe('สวัสดี');
        expect(inv.args.join(' ')).not.toContain('สวัสดี');
    });

    it('omits -m when model undefined', () => {
        expect(d.buildInvocation('x', undefined, 'cwd').args).toEqual(['run', '--format', 'json']);
    });

    it('concatenates text parts from NDJSON', () => {
        expect(d.parseOutput(NDJSON, '', 0)).toEqual({ ok: true, content: 'OK' });
    });

    it('fails on non-zero exit or no text output', () => {
        expect(d.parseOutput('', 'denied', 1).ok).toBe(false);
        expect(d.parseOutput('{"type":"step_start","part":{}}', '', 0).ok).toBe(false);
    });
});
