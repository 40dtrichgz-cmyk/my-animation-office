import { BrainRegistry } from '../BrainRegistry';

const valid = {
    director: [{ driver: 'claude', model: 'haiku' }, { driver: 'opencode', model: 'llmapi/claude-sonnet-4-5' }],
    modeler: [{ driver: 'opencode', model: 'llmapi/claude-sonnet-4-5' }, { driver: 'claude', model: 'haiku' }],
};

describe('BrainRegistry', () => {
    const opts = { workspaceRoot: 'C:/ws', timeoutMs: 1000 };

    it('builds cross-provider chains per agent', () => {
        const r = BrainRegistry.load(valid, opts);
        expect(r.agentIds().sort()).toEqual(['director', 'modeler']);
        expect(r.getAdapter('director')!.provider).toBe('claude>opencode');
        expect(r.getAdapter('modeler')!.provider).toBe('opencode>claude');
        expect(r.getAdapter('nobody')).toBeUndefined();
    });

    it('rejects unknown driver and empty chain', () => {
        expect(() => BrainRegistry.load({ a: [{ driver: 'gpt5' }] }, opts)).toThrow(/gpt5/);
        expect(() => BrainRegistry.load({ a: [] }, opts)).toThrow(/empty|ว่าง/i);
    });

    it('chains never repeat the same driver consecutively (design 6.2)', () => {
        const r = BrainRegistry.load(valid, opts);
        for (const id of r.agentIds()) {
            const names = (r as any).chains.get(id).map((d: any) => d.name);
            for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
        }
    });

    it('filters unhealthy drivers after healthCheck, falls back to full chain when all unhealthy', async () => {
        const factory = {
            claude: () => ({ name: 'claude', buildInvocation: () => ({ command: 'x', args: [], stdin: '', env: {} }), parseOutput: () => ({ ok: true, content: '' }), healthCheck: async () => false }),
            opencode: () => ({ name: 'opencode', buildInvocation: () => ({ command: 'x', args: [], stdin: '', env: {} }), parseOutput: () => ({ ok: true, content: '' }), healthCheck: async () => true }),
        };
        const r = BrainRegistry.load(valid, opts, factory as any);
        const results = await r.healthCheck();
        expect(results).toEqual({ claude: false, opencode: true });
        expect(r.getAdapter('director')!.provider).toBe('opencode');   // เหลือตัวเดียว = ข้าม claude
        expect(r.getAdapter('modeler')!.provider).toBe('opencode');     // claude โดนกรองออก เหลือ opencode (ไม่ตกร่าง เพราะ fallback สุดท้าย)
    });
});
