import { ToolExecutor } from '../ToolExecutor';

describe('ToolExecutor v1 sandbox', () => {
    const exec = new ToolExecutor();

    it('blocks code_execute and read_file outright', async () => {
        for (const name of ['code_execute', 'read_file']) {
            const r = await exec.execute(name, name === 'code_execute' ? { code: 'process.exit(0)' } : { path: 'package.json' });
            expect(r.success).toBe(false);
            expect(r.error).toMatch(/v1|blocked|ปิด/i);
        }
    });

    it('still allows write_note (in-memory)', async () => {
        const r = await exec.execute('write_note', { content: 'hi' });
        expect(r.success).toBe(true);
    });

    it('rejects unknown tools', async () => {
        const r = await exec.execute('hire_agent', {});
        expect(r.success).toBe(false);
    });
});
