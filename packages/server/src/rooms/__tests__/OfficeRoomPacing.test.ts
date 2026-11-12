import { Agent } from '@agent-office/core';
import { OfficeRoom } from '../OfficeRoom';
import { OfficeState } from '../../schema/OfficeState';

/** Fake CLI boundary: records prompts and lets the test settle thinks deterministically. */
class FakeAdapter {
    readonly provider = 'fake';
    readonly isLocal = false;
    readonly calls: string[] = [];
    private pending: Array<(value: unknown) => void> = [];

    complete(request: any): Promise<any> {
        this.calls.push(request.messages[request.messages.length - 1].content);
        return new Promise((resolve) => this.pending.push(resolve));
    }

    resolveNext(decision: any = { thought: 'ok', action: 'idle' }): void {
        const resolve = this.pending.shift();
        if (!resolve) throw new Error('FakeAdapter: no pending completion');
        resolve({ content: JSON.stringify(decision), usage: { prompt: 0, completion: 0 }, latency: 0 });
    }
}

const traits = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };

function addAgent(room: any, id: string, name: string, adapter: FakeAdapter): void {
    room.state.createAgent(id, name);
    const agent = new Agent({
        id,
        name,
        role: 'Tester',
        avatar: 'sprite.png',
        inference: { provider: 'custom', model: 'fake', systemPrompt: 'test' },
        personality: {
            traits,
            communicationStyle: 'casual',
            workHours: { start: '09:00', end: '17:00' },
            breakFrequency: 60,
        },
        capabilities: [],
        memory: { shortTermLimit: 50 },
    });
    agent.setInferenceAdapter(adapter as any);
    room.coreAgents.set(id, agent);
    room.thinkingLocks.set(id, false);
}

function makeRoom(): any {
    const room = new OfficeRoom() as any;
    room.state = new OfficeState();
    room.broadcast = jest.fn();
    room.memoryStore = {
        saveMemories: async () => undefined,
        saveMemory: async () => undefined,
        createTask: async () => undefined,
        close: async () => undefined,
    };
    room.thinkCooldownMs = 1;
    createdRooms.push(room);
    return room;
}

const createdRooms: any[] = [];

afterEach(() => {
    // Colyseus Room ตั้ง interval/timeout ไว้เอง — เคลียร์ไม่ให้ Jest ค้าง
    for (const room of createdRooms.splice(0)) {
        clearInterval(room._patchInterval);
        clearTimeout(room._autoDisposeTimeout);
    }
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('OfficeRoom pacing + user priority lane', () => {
    it('does not re-invoke a busy agent; user message runs after the in-flight think', async () => {
        const room = makeRoom();
        const director = new FakeAdapter();
        addAgent(room, 'director', 'ผู้กำกับ', director);

        room.update(100); // auto-think starts for director
        expect(director.calls).toHaveLength(1);
        expect(room.activeThinkers).toBe(1);

        room.userLane.push({ agentId: 'director', text: 'hello director' });
        room.pumpUserLane();
        expect(director.calls).toHaveLength(1); // busy → ไม่เรียกซ้ำ
        expect(room.userLane.size).toBe(1);

        director.resolveNext({ thought: 'เสร็จแล้ว', action: 'idle' });
        await flush();
        await flush();

        expect(director.calls).toHaveLength(2); // user think เริ่มหลังตัวแรกจบ
        expect(director.calls[1]).toContain('User: "hello director"');
        expect(room.userLane.size).toBe(0);
        expect(room.userLane.isBusy('director')).toBe(true); // กำลังตอบ user อยู่

        director.resolveNext();
        await flush();
        await flush();
        expect(room.userLane.isBusy('director')).toBe(false);
    });

    it('runs a user message immediately even while the agent is in cooldown, with thinking status', async () => {
        const room = makeRoom();
        const director = new FakeAdapter();
        addAgent(room, 'director', 'ผู้กำกับ', director);
        room.thinkingLocks.set('director', true); // cooldown ค้างจากรอบก่อน

        room.userLane.push({ agentId: 'director', text: 'urgent' });
        room.pumpUserLane();

        expect(director.calls).toHaveLength(1);
        expect(room.state.agents.get('director').thought).toBe('🧠 กำลังคิด...');
        expect(room.broadcast).toHaveBeenCalledWith('chat', {
            sender: '🧠 ระบบ',
            text: '🧠 ผู้กำกับ กำลังคิด...',
        });

        director.resolveNext({ thought: 'ตอบแล้ว', action: 'idle' });
        await flush();
        await flush();
        expect(room.state.agents.get('director').thought).toBe('ตอบแล้ว');
    });

    it('pauses auto-think while the user lane has queued work', () => {
        const room = makeRoom();
        const director = new FakeAdapter();
        const modeler = new FakeAdapter();
        addAgent(room, 'director', 'ผู้กำกับ', director);
        addAgent(room, 'modeler', 'โมเดลเลอร์', modeler);

        room.activeThinks.add('director'); // สมมติ director กำลังคิดค้างอยู่
        room.userLane.push({ agentId: 'director', text: 'queued' });

        room.update(100);

        expect(director.calls).toHaveLength(0);
        expect(modeler.calls).toHaveLength(0); // auto-think ไม่แซงคิวผู้ใช้
        expect(room.userLane.size).toBe(1);
    });
});
