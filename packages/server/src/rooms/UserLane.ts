/**
 * คิวข้อความผู้ใช้แบบ priority lane
 *
 * - FIFO ตามลำดับที่ push
 * - `claim()` ไม่แซง capacity (`maxConcurrent`) และไม่หยิบ agent ที่กำลัง busy
 *   (busy = มี item ของ agent นั้นถูก claim ไปแล้วแต่ยังไม่ `release()`)
 * - `claim()` ไม่ทิ้ง item: ถ้า claim ไม่ได้ คิวคงเดิม
 */
export interface UserLaneItem {
    agentId: string;
    text: string;
}

export class UserLane<T extends { agentId: string } = UserLaneItem> {
    private queue: T[] = [];
    private busyAgents: Set<string> = new Set();

    constructor(private maxConcurrent: number) {}

    push(item: T): void {
        this.queue.push(item);
    }

    /**
     * @param activeCount จำนวน think ที่กำลังทำงานอยู่ (ร่วมกับ auto-think)
     * @param isBlocked   ตัวเลือกเสริม: คืน true เมื่อ agent ยังทำงานอื่นค้างอยู่
     *                    (ใช้กันไม่ให้ user message ไปเรียก agent ที่กำลังคิดซ้ำ)
     */
    claim(activeCount: number, isBlocked?: (agentId: string) => boolean): T | null {
        if (this.queue.length === 0) return null;
        if (activeCount >= this.maxConcurrent) return null;

        const index = this.queue.findIndex(item =>
            !this.busyAgents.has(item.agentId) && !(isBlocked && isBlocked(item.agentId))
        );
        if (index === -1) return null;

        const [item] = this.queue.splice(index, 1);
        this.busyAgents.add(item.agentId);
        return item;
    }

    release(agentId: string): void {
        this.busyAgents.delete(agentId);
    }

    get size(): number {
        return this.queue.length;
    }

    isBusy(agentId: string): boolean {
        return this.busyAgents.has(agentId);
    }
}
