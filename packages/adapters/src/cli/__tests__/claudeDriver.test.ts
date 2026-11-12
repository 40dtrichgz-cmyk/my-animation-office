import { claudeDriver } from '../drivers/claude';

const SUCCESS = '{"duration_api_ms":7121,"is_error":false,"subtype":"success","result":"OK","type":"result"}';
const RATE_LIMITED = '{"is_error":true,"subtype":"error_during_execution","result":"Rate limited","type":"result"}';

describe('claudeDriver', () => {
    const d = claudeDriver();

    it('builds fixed args and sends prompt via stdin', () => {
        const inv = d.buildInvocation('สวัสดี', 'haiku', 'C:/ws');
        expect(inv.command).toBe('claude');
        expect(inv.args.slice(0, 4)).toEqual(['-p', '--output-format', 'json', '--model']);
        expect(inv.args).toContain('haiku');
        expect(inv.args).toContain('--disallowedTools');
        expect(inv.args).toContain('Bash');
        expect(inv.stdin).toBe('สวัสดี');
        expect(inv.args.join(' ')).not.toContain('สวัสดี');
    });

    it('defaults model to haiku', () => {
        expect(d.buildInvocation('x', undefined, 'cwd').args[4]).toBe('haiku');
    });

    it('parses success JSON into content', () => {
        expect(d.parseOutput(SUCCESS, '', 0)).toEqual({ ok: true, content: 'OK' });
    });

    it('surfaces is_error result as error', () => {
        const r = d.parseOutput(RATE_LIMITED, '', 0);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('Rate limited');
    });

    it('fails on non-zero exit or non-JSON stdout', () => {
        expect(d.parseOutput('', 'boom', 1).ok).toBe(false);
        expect(d.parseOutput('not json', '', 0).ok).toBe(false);
    });
});
