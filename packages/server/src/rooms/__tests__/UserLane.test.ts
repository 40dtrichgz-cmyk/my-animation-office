import { UserLane } from '../UserLane';

describe('UserLane', () => {
    it('claims in FIFO order while under capacity', () => {
        const lane = new UserLane(2);
        lane.push({ agentId: 'director', text: 'a' });
        lane.push({ agentId: 'modeler', text: 'b' });
        expect(lane.claim(0)).toEqual({ agentId: 'director', text: 'a' });
        expect(lane.claim(1)).toEqual({ agentId: 'modeler', text: 'b' });
        expect(lane.claim(2)).toBeNull();
    });

    it('returns null at capacity and re-queues nothing (claim does not drop)', () => {
        const lane = new UserLane(1);
        lane.push({ agentId: 'director', text: 'a' });
        expect(lane.claim(1)).toBeNull();      // activeCount >= max → ยังไม่ claim
        expect(lane.size).toBe(1);
        expect(lane.claim(0)).toEqual({ agentId: 'director', text: 'a' });
    });

    it('skips busy agent and keeps it queued', () => {
        const lane = new UserLane(2);
        lane.push({ agentId: 'director', text: 'first' });
        expect(lane.claim(0)).toEqual({ agentId: 'director', text: 'first' });  // marks busy
        lane.push({ agentId: 'director', text: 'second' });
        expect(lane.claim(1)).toBeNull();      // busy → ข้าม ไม่ claim
        expect(lane.size).toBe(1);
        lane.release('director');
        expect(lane.claim(1)).toEqual({ agentId: 'director', text: 'second' });
    });

    it('releases capacity after release()', () => {
        const lane = new UserLane(1);
        lane.push({ agentId: 'a', text: 'x' });
        expect(lane.claim(0)).not.toBeNull();
        expect(lane.claim(1)).toBeNull();
        lane.release('a');
        expect(lane.isBusy('a')).toBe(false);
    });
});
