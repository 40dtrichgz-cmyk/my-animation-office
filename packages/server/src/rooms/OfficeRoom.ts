import { Room, Client } from 'colyseus';
import * as fs from 'fs';
import * as path from 'path';
import { OfficeState } from '../schema/OfficeState';
import { Agent, Office, OfficeConfig, ConversationMessage } from '@agent-office/core';
import { ToolExecutor } from '../tools/ToolExecutor';
import { MemoryStore } from '../memory/MemoryStore';
import { BrainRegistry } from '../brains/BrainRegistry';
import { UserLane } from './UserLane';

const THINKING_THOUGHT = '🧠 กำลังคิด...';

// Tools an agent may call. code_execute/hire_agent are retired for v1.
const AGENT_CAPABILITIES = [
    { name: 'web_search', description: 'Search the web for information' },
    { name: 'write_note', description: 'Write a note or memo' },
    { name: 'create_task', description: 'Create a task and assign it to yourself or another agent' },
];

// Every CLI brain gets a locked-down config: it may only answer the prompt.
const SANDBOX_CONFIG = {
    $schema: 'https://opencode.ai/config.json',
    permission: {
        read: 'deny',
        edit: 'deny',
        glob: 'deny',
        grep: 'deny',
        list: 'deny',
        bash: 'deny',
        task: 'deny',
        webfetch: 'deny',
        websearch: 'deny',
        external_directory: 'deny',
    },
};

interface HighlightEvent {
    type: string;
    title: string;
    body: string;
    agentId?: string | null;
    scenario: string;
    time: string;
}

interface RelationshipEdge {
    a: string;
    b: string;
    score: number;
    status: 'alliance' | 'neutral' | 'rivalry';
    updatedAt: string;
}

export class OfficeRoom extends Room<OfficeState> {
    private static activeRoom: OfficeRoom | null = null;

    maxClients = 100;
    private office!: Office;
    private demoTickCount = 0;
    private coreAgents: Map<string, Agent> = new Map();
    private thinkingLocks: Map<string, boolean> = new Map();
    private activeThinks: Set<string> = new Set(); // agent ที่กำลัง think อยู่จริง (กัน user lane เรียกซ้ำ)
    private activeThinkers = 0;
    private maxConcurrentThinks = 2; // 2 think พร้อมกันพอดีกับ CLI 2 ตัว
    // คิวข้อความผู้ใช้: แซง auto-think เสมอ (ไม่รอ cooldown, แต่ไม่เรียก agent ที่กำลังคิดซ้ำ)
    private userLane = new UserLane<{ agentId: string; text: string }>(this.maxConcurrentThinks);
    // ───────── จูนจังหวะ agent (ปรับค่าตรงนี้ได้เลย) ─────────
    private thinkTimeoutMs = 180000;         // เวลาสูงสุดต่อ think ของ agent 1 ตัว (ms) = 3 นาที
    private thinkCooldownMs = 60000;         // เว้นช่วงคิดของแต่ละ agent (ms) = 1 นาที
    private conversationCooldownMs = 300000; // เว้นอย่างน้อยเท่านี้ก่อน agent ทักคุยกันเองรอบใหม่ (ms) = 5 นาที
    private talkChance = 0.3;                // โอกาส agent เริ่มคุยกันเองต่อรอบ (0-1)
    private simulationPaused = false;       // ⏸ true = หยุด agent ทั้งหมด
    private autoChatEnabled = true;         // 💬 false = ปิดคุยอัตโนมัติ (ยังตอบ user อยู่)
    private lastTalkAt: Map<string, number> = new Map();
    // ──────────────────────────────────────────────────
    private brains!: BrainRegistry;
    private toolExecutor = new ToolExecutor();
    private memoryStore = new MemoryStore();
    private sessionId = `session_${Date.now()}`;
    private currentScenario = 'Free Play';
    private highlights: HighlightEvent[] = [];
    private chaosHistory: Array<{ event: string; label: string; time: string }> = [];
    private relationships: Map<string, RelationshipEdge> = new Map();
    private audienceVotes: Record<string, number> = {};
    private currentLayout: any[] = [];

    // Furniture interaction points: named locations agents can walk to
    private furnitureTargets: Record<string, { x: number; y: number; type: string }> = {
        'director-desk': { x: 5, y: 12, type: 'desk' },
        'modeler-desk': { x: 5, y: 17, type: 'desk' },
        'rigger-desk': { x: 5, y: 22, type: 'desk' },
        'texturer-desk': { x: 5, y: 27, type: 'desk' },
        'animator-desk': { x: 5, y: 32, type: 'desk' },
        'meeting-table': { x: 10, y: 5, type: 'table' },
        'coffee-machine': { x: 25, y: 25, type: 'appliance' },
        'whiteboard': { x: 17, y: 3, type: 'board' },
        'water-cooler': { x: 28, y: 27, type: 'appliance' },
        'bookshelf': { x: 32, y: 12, type: 'furniture' },
        'beanbag': { x: 28, y: 6, type: 'seating' },
        };

    static getActiveRoom(): OfficeRoom | null {
        return OfficeRoom.activeRoom;
    }

    async onCreate(options: any) {
        OfficeRoom.activeRoom = this;
        this.setState(new OfficeState());

        // Initialize memory store
        await this.memoryStore.initialize();

        const config: OfficeConfig = {
            name: options.name || 'Startup HQ',
            grid: { width: 40, height: 40, tileSize: 16 },
            rooms: [],
            furniture: [],
            spawnPoints: [{ x: 10, y: 10 }],
            zones: []
        };
        this.office = new Office(config);

        // ─── BRAIN LAYER + PER-AGENT SANDBOX DIRS ───
        // __dirname is <server>/dist/rooms or <server>/src/rooms → both resolve to packages/server/workspace.
        const workspaceRoot = path.join(__dirname, '..', '..', 'workspace');
        const agentIds = ['director', 'modeler', 'rigger', 'animator', 'texturer'];
        for (const agentId of agentIds) {
            const agentDir = path.join(workspaceRoot, 'agents', agentId);
            fs.mkdirSync(agentDir, { recursive: true });
            fs.writeFileSync(path.join(agentDir, 'opencode.json'), JSON.stringify(SANDBOX_CONFIG, null, 2));
        }
        fs.mkdirSync(path.join(workspaceRoot, 'opencode-data'), { recursive: true });

        this.brains = BrainRegistry.load(
            JSON.parse(fs.readFileSync(BrainRegistry.resolveBrainsPath(), 'utf8')),
            { workspaceRoot, timeoutMs: this.thinkTimeoutMs }
        );

        const health = await this.brains.healthCheck();
        for (const [driver, healthy] of Object.entries(health)) {
            if (healthy) {
                console.log(`[Brain] driver "${driver}" healthy`);
            } else {
                console.warn(`[Brain] driver "${driver}" unavailable — chain falls back to the next brain`);
            }
        }

        // Setup Core Agents with AI capabilities
        const setupCoreAgent = async (id: string, name: string, role: string, x: number, y: number, sysPrompt?: string, style?: string) => {
            this.state.createAgent(id, name);
            const state = this.state.agents.get(id);
            if (state) { state.x = x; state.y = y; }

            const coreAgent = new Agent({
                id, name, role, avatar: 'sprite.png',
                inference: {
                    provider: 'ollama',
                    model: 'google/gemma-4-e4b',
                    systemPrompt: sysPrompt ?? `You are ${name}, a ${role} in a virtual office. Be social, do your work, and collaborate with colleagues. Keep thoughts SHORT.`,
                },
                personality: {
                    traits: { openness: 0.8, conscientiousness: 0.9, extraversion: 0.6, agreeableness: 0.7, neuroticism: 0.1 },
                    communicationStyle: (style as any) ?? (role === 'Engineer' ? 'technical' : 'casual'),
                    workHours: { start: '09:00', end: '17:00' },
                    breakFrequency: 120
                },
                capabilities: AGENT_CAPABILITIES,
                memory: { shortTermLimit: 50 }
            });

            const brain = this.brains.getAdapter(id);
            if (!brain) throw new Error(`No brain configured for agent "${id}" — แก้ brains.json`);
            coreAgent.setInferenceAdapter(brain);
            await coreAgent.initialize();

            // Load persistent memories from previous sessions
            const previousMemories = await this.memoryStore.loadMemories(id, 20);
            if (previousMemories.length > 0) {
                coreAgent.loadMemories(previousMemories);
                console.log(`[${name}] Loaded ${previousMemories.length} memories from previous sessions`);
            }

            this.coreAgents.set(id, coreAgent);
            this.thinkingLocks.set(id, false);
        };

        await setupCoreAgent('director', 'ผู้กำกับ', 'Director', 10, 10,
            'You are "ผู้กำกับ", Director ของทีม 3D animation (AnimationOffice). คุณกำกับงานทั้งหมด มอบหมายงานให้โมเดลเลอร์ ริกเกอร์ แอนิเมเตอร์ และเท็กซ์เจอร์ และสรุปความคืบหน้าของทีม. Write the "thought" and "message" field values in Thai (but keep the JSON structure and keys in English). Keep thoughts SHORT.', 'formal');
        await setupCoreAgent('modeler', 'โมเดลเลอร์', 'Modeler', 20, 15,
            'You are "โมเดลเลอร์", Modeler ของทีม 3D animation (AnimationOffice). คุณสร้างโมเดล 3D ขึ้นโครง topology และจัด UV ให้พร้อมสำหรับขั้นตอนต่อไป. Write the "thought" and "message" field values in Thai (but keep the JSON structure and keys in English). Keep thoughts SHORT.', 'creative');
        await setupCoreAgent('rigger', 'ริกเกอร์', 'Rigger', 15, 12,
            'You are "ริกเกอร์", Rigger ของทีม 3D animation (AnimationOffice). คุณสร้างกระดูก rig และ constraints ให้ตัวละครขยับได้ถูกต้องตามสรีระ. Write the "thought" and "message" field values in Thai (but keep the JSON structure and keys in English). Keep thoughts SHORT.', 'technical');
        await setupCoreAgent('animator', 'แอนิเมเตอร์', 'Animator', 18, 14,
            'You are "แอนิเมเตอร์", Animator ของทีม 3D animation (AnimationOffice). คุณกำหนดจังหวะ animation วาง keyframe และปรับการเคลื่อนไหวให้มีชีวิตชีวา. Write the "thought" and "message" field values in Thai (but keep the JSON structure and keys in English). Keep thoughts SHORT.', 'creative');
        await setupCoreAgent('texturer', 'เท็กซ์เจอร์', 'Texturer', 22, 14,
            'You are "เท็กซ์เจอร์", Texturer ของทีม 3D animation (AnimationOffice). คุณเลือกสี วัสดุ และทำ texture ให้โมเดลดูสมจริงและสม่ำเสมอทั้งทีม. Write the "thought" and "message" field values in Thai (but keep the JSON structure and keys in English). Keep thoughts SHORT.', 'technical');
        this.rebuildRelationshipGraph();
        const savedLayout = await this.memoryStore.loadLayout('default');
        this.currentLayout = Array.isArray(savedLayout) ? savedLayout : [];

        // ─── MESSAGE HANDLERS ───

        this.onMessage('command', (client, message) => {
            console.log(`Command from ${client.sessionId}:`, message);
        });

        this.onMessage('chat', (client, message) => {
            const text = String(message?.text || '').trim();
            if (!text) return;
            console.log(`Chat from ${client.sessionId}: ${text}`);
            const targetId = message.target && this.coreAgents.has(message.target)
                ? message.target
                : (this.coreAgents.keys().next().value as string | undefined); // default = director (คนแรกที่ setup)
            if (!targetId) return; // ยังไม่มี agent ในห้อง
            this.broadcast('chat', { sender: 'User', text: `ถึง ${this.state.agents.get(targetId)?.name}: ${text}` });
            this.userLane.push({ agentId: targetId, text });
            this.pumpUserLane();
        });

        this.onMessage('set-paused', (_client, message) => {
            this.simulationPaused = Boolean(message?.paused);
            this.broadcast('chat', { sender: 'ระบบ', text: this.simulationPaused ? '⏸ หยุดจำลองชั่วคราว' : '▶ ทำงานต่อ' });
        });

        this.onMessage('set-autochat', (_client, message) => {
            this.autoChatEnabled = Boolean(message?.enabled);
            this.broadcast('chat', { sender: 'ระบบ', text: this.autoChatEnabled ? '💬 เปิดคุยอัตโนมัติ' : '🤫 ปิดคุยอัตโนมัติ (ยังตอบ user)' });
        });

        this.onMessage('start-scenario', (client, message) => {
            const scenarioName = String(message?.scenario || 'Free Play');
            this.currentScenario = scenarioName;
            this.applyScenarioKickoff(scenarioName);
        });

        this.onMessage('trigger-chaos', (client, message) => {
            const eventName = String(message?.event || 'minor_outage');
            this.applyChaosEvent(eventName);
        });

        // UI-driven task assignment
        this.onMessage('assign-task', (client, message) => {
            const { title, agentId } = message;
            console.log(`[TaskBoard] Assigning "${title}" to ${agentId || 'auto'}`);

            // Pick agent: explicit or auto-assign to least busy
            const targetId = agentId || this.autoAssignAgent();
            const agent = this.coreAgents.get(targetId);
            const agentState = this.state.agents.get(targetId);

            if (agent && agentState) {
                agent.currentTask = title;
                agentState.currentTask = title;
                agentState.action = 'work';

                // Persist task
                this.memoryStore.createTask(title, targetId);

                this.broadcast('chat', {
                    sender: 'ระบบ',
                    text: `📋 มอบงาน "${title}" ให้ ${agentState.name} แล้ว`
                });

                this.broadcast('task-update', {
                    agentId: targetId,
                    agentName: agentState.name,
                    task: title,
                    status: 'in_progress'
                });
            }
        });

        // Save office layout from editor
        this.onMessage('save-layout', async (client, message) => {
            const layoutName = message.name || 'default';
            const layout = Array.isArray(message.layout) ? message.layout : [];
            await this.memoryStore.saveLayout(layoutName, JSON.stringify(layout));
            this.currentLayout = layout;
            this.broadcast('layout-sync', { name: layoutName, layout: this.currentLayout });
            this.broadcast('chat', { sender: 'ระบบ', text: '💾 บันทึกผังออฟฟิศแล้ว!' });
        });

        // Start Simulation Loop
        this.setSimulationInterval((delta) => this.update(delta), 100);
    }

    private autoAssignAgent(): string {
        // Pick the agent with no current task, or the first one
        for (const [id, agent] of this.coreAgents) {
            if (!agent.currentTask) return id;
        }
        return 'director'; // fallback
    }

    async update(delta: number) {
        if (Math.random() < 0.02) {
            console.log(`[Server] Agents: ${this.state.agents.size} | Session: ${this.sessionId}`);
        }

        this.state.officeTime = new Date().toISOString();

        if (this.simulationPaused) return; // ⏸ หยุดทั้ง think และการเดิน

        // ─── AGENT THINK CYCLE ───
        // priority lane: ถ้ามีข้อความผู้ใช้รออยู่ ให้หยุดเริ่ม auto-think รอบใหม่ก่อน
        if (this.userLane.size === 0) {
            this.coreAgents.forEach((_coreAgent, id) => {
                if (this.activeThinkers >= this.maxConcurrentThinks) return;
                if (this.thinkingLocks.get(id)) return;
                this.thinkingLocks.set(id, true);
                this.activeThinkers++;
                void this.runThink(id);
            });
        }

        // ─── FURNITURE INTERACTION PATHFINDING ───
        // Office grid boundaries (agents must stay inside)
        const BOUNDS = { minX: 2, maxX: 36, minY: 2, maxY: 36 };
        const clamp = (agent: any) => {
            agent.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, agent.x));
            agent.y = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, agent.y));
        };

        this.demoTickCount++;
        if (this.demoTickCount >= 5) {
            this.demoTickCount = 0;
            this.state.agents.forEach((agent, key) => {
                // Default targets: agent's own desk chair
                const deskKey = `${key}-desk`;
                const target = this.furnitureTargets[deskKey] || { x: 5, y: 18 };

                // If agent action is 'talk', move towards the other agent instead
                if (agent.action === 'talk') {
                    let closest: { x: number; y: number } | null = null;
                    let minDist = Infinity;
                    this.state.agents.forEach((other, otherKey) => {
                        if (otherKey === key) return;
                        const dist = Math.abs(agent.x - other.x) + Math.abs(agent.y - other.y);
                        if (dist < minDist) { minDist = dist; closest = { x: other.x, y: other.y + 2 }; }
                    });
                    if (closest && minDist > 2) {
                        const c = closest as { x: number; y: number };
                        if (agent.x < c.x) agent.x += 1;
                        else if (agent.x > c.x) agent.x -= 1;
                        else if (agent.y < c.y) agent.y += 1;
                        else if (agent.y > c.y) agent.y -= 1;
                        clamp(agent);
                        return;
                    }
                }

                // Walk to desk/furniture target
                if (agent.x < target.x) agent.x += 1;
                else if (agent.x > target.x) agent.x -= 1;
                else if (agent.y < target.y) agent.y += 1;
                else if (agent.y > target.y) agent.y -= 1;
                clamp(agent);

                // Keep viral telemetry alive for UI overlays and highlights.
                this.updateAgentViralMetrics(key, agent.action);
            });
        }

        // auto-think คืน slot แล้ว → ปล่อยคิวข้อความผู้ใช้ต่อทันที
        this.pumpUserLane();
    }

    /**
     * รัน think 1 รอบของ agent แล้วจัดการผลลัพธ์ทั้งหมด
     * - เรียกได้ทั้งจาก auto-think (update) และ user lane (pumpUserLane)
     * - ไม่ว่าจะสำเร็จหรือ error: เคลียร์สถานะกำลังคิด, คืน capacity, ปลด cooldown ให้เสมอ
     */
    private async runThink(id: string, opts: { userText?: string } = {}): Promise<void> {
        const coreAgent = this.coreAgents.get(id);
        const agentState = this.state.agents.get(id);
        const userText = opts.userText;

        try {
            if (!coreAgent || !agentState) return;
            this.activeThinks.add(id);

            if (userText !== undefined) {
                // priority lane: รับข้อความ user แล้วโชว์สถานะกำลังคิดทันที (ไม่รอ cooldown)
                coreAgent.receiveMessage({
                    from: 'User',
                    to: coreAgent.config.name,
                    content: userText,
                    timestamp: this.state.officeTime
                });
                agentState.thought = THINKING_THOUGHT;
                this.broadcast('chat', {
                    sender: '🧠 ระบบ',
                    text: `🧠 ${coreAgent.config.name} กำลังคิด...`
                });
            }

            // Build nearby agents list
            const nearbyAgents: { name: string; role: string; distance: number }[] = [];
            this.coreAgents.forEach((other, otherId) => {
                if (otherId === id) return;
                const otherState = this.state.agents.get(otherId);
                if (otherState) {
                    const dist = Math.abs(agentState.x - otherState.x) + Math.abs(agentState.y - otherState.y);
                    nearbyAgents.push({ name: other.config.name, role: other.config.role, distance: dist });
                }
            });

            const decision = await coreAgent.think({
                time: this.state.officeTime,
                location: `${agentState.x},${agentState.y}`,
                nearbyAgents,
                currentTask: coreAgent.currentTask || null,
                recentMessages: coreAgent.getUnreadMessages(),
                memories: coreAgent.getRecentMemories(5)
            });

            agentState.action = decision.action;

            if (decision.thought) {
                agentState.thought = decision.thought;
            }

            // ── คุมความถี่: ตอบ user ได้เสมอ, แต่คุยกันเองจำกัดด้วย cooldown + probability ──
            if (decision.action === 'talk') {
                const unreadMsgs = coreAgent.getUnreadMessages();
                const fromUser = unreadMsgs.some(m => String(m.from || '').toLowerCase() === 'user');
                const okTalk = fromUser || (this.autoChatEnabled
                    && (Date.now() - (this.lastTalkAt.get(id) || 0) >= this.conversationCooldownMs)
                    && Math.random() < this.talkChance);
                if (okTalk) {
                    this.lastTalkAt.set(id, Date.now());
                } else {
                    decision.action = 'idle';
                    agentState.action = 'idle';
                    coreAgent.clearInbox();
                }
            }

            // ─── HANDLE TALK ACTION (Agent-to-Agent) ───
            if (decision.action === 'talk' && decision.message) {
                const targetName = decision.target || '';
                let targetId = '';
                this.coreAgents.forEach((a, aId) => {
                    if (a.config.name.toLowerCase() === targetName.toLowerCase()) targetId = aId;
                });

                const targetAgent = this.coreAgents.get(targetId);
                const toLabel = targetAgent ? targetAgent.config.name : (targetName || 'ทุกคน');

                // Broadcast to UI chat ALWAYS (so user sees replies too)
                this.broadcast('chat', {
                    sender: coreAgent.config.name,
                    text: `💬 (ถึง ${toLabel}): ${decision.message}`
                });

                if (targetAgent) {
                    const msg: ConversationMessage = {
                        from: coreAgent.config.name,
                        to: targetAgent.config.name,
                        content: decision.message,
                        timestamp: this.state.officeTime
                    };
                    targetAgent.receiveMessage(msg);
                    this.emitHighlight(
                        'conversation',
                        `${coreAgent.config.name} pinged ${targetAgent.config.name}`,
                        decision.message.slice(0, 120),
                        id
                    );
                    this.updateRelationship(id, targetId, 0.08);

                    // Save conversation memory
                    await this.memoryStore.saveMemory(id, {
                        content: `Said to ${targetAgent.config.name}: "${decision.message}"`,
                        type: 'conversation',
                        timestamp: this.state.officeTime,
                        importance: 0.7
                    }, this.sessionId);
                }

                coreAgent.clearInbox(); // Clear after processing
            }

            // ─── HANDLE TOOL EXECUTION ───
            if (decision.action === 'use_tool' && decision.toolCall) {
                // Special case: agent-created tasks
                if (decision.toolCall.name === 'create_task') {
                    const { title, assignee } = decision.toolCall.params;
                    const targetId = assignee?.toLowerCase() || this.autoAssignAgent();
                    const targetAgent = this.coreAgents.get(targetId);
                    const targetState = this.state.agents.get(targetId);

                    if (targetAgent && targetState) {
                        targetAgent.currentTask = title;
                        targetState.currentTask = title;
                        await this.memoryStore.createTask(title, targetId);

                        this.broadcast('chat', {
                            sender: coreAgent.config.name,
                            text: `📋 สร้างงาน "${title}" ให้ ${targetAgent.config.name}`
                        });
                        this.broadcast('task-update', {
                            agentId: targetId,
                            agentName: targetAgent.config.name,
                            task: title,
                            status: 'in_progress'
                        });
                        this.emitHighlight(
                            'task',
                            `${coreAgent.config.name} assigned work`,
                            `"${title}" is now owned by ${targetAgent.config.name}.`,
                            targetId
                        );
                    }
                } else if (['web_search', 'write_note'].includes(decision.toolCall.name)) {
                    const result = await this.toolExecutor.execute(
                        decision.toolCall.name,
                        decision.toolCall.params
                    );

                    this.broadcast('chat', {
                        sender: coreAgent.config.name,
                        text: `🔧 ใช้เครื่องมือ [${decision.toolCall.name}]: ${result.success ? result.output.slice(0, 100) : result.error}`
                    });
                    this.emitHighlight(
                        'tool',
                        `${coreAgent.config.name} used ${decision.toolCall.name}`,
                        (result.success ? result.output : result.error || 'Tool failed').slice(0, 120),
                        id
                    );

                    coreAgent.addMemory({
                        content: `Tool ${decision.toolCall.name} result: ${result.output.slice(0, 200)}`,
                        type: 'task_result',
                        timestamp: this.state.officeTime,
                        importance: 0.8
                    });
                }
            }

            // ─── PERSIST MEMORIES PERIODICALLY ───
            if (Math.random() < 0.3) {
                const recentMemories = coreAgent.memories.slice(-3);
                await this.memoryStore.saveMemories(id, recentMemories, this.sessionId);
            }
        } catch (err) {
            console.error(`Agent ${id} think error:`, err);
        } finally {
            // กันทับคำตอบจริง: เคลียร์เฉพาะสถานะกำลังคิดที่ยังค้างอยู่
            if (agentState && agentState.thought === THINKING_THOUGHT) {
                agentState.thought = '';
            }
            this.activeThinks.delete(id);
            if (userText !== undefined) {
                this.userLane.release(id);
            }
            this.activeThinkers = Math.max(0, this.activeThinkers - 1);
            setTimeout(() => this.thinkingLocks.set(id, false), this.thinkCooldownMs);
            // คืน capacity แล้ว → ดันคิวผู้ใช้ต่อทันที (ทั้ง auto-think และ user think)
            this.pumpUserLane();
        }
    }

    /**
     * ดึงข้อความผู้ใช้ที่รออยู่เข้า think ทันทีเมื่อมี capacity
     * - FIFO, ข้าม agent ที่กำลัง think อยู่จริง (ไม่เรียกซ้ำ) แต่ไม่รอ cooldown
     */
    private pumpUserLane(): void {
        for (;;) {
            const item = this.userLane.claim(
                this.activeThinkers,
                (agentId) => this.activeThinks.has(agentId)
            );
            if (!item) return;

            this.activeThinkers++;
            this.thinkingLocks.set(item.agentId, true);
            void this.runThink(item.agentId, { userText: item.text });
        }
    }

    private clamp01(value: number): number {
        return Math.max(0, Math.min(1, value));
    }

    private emitHighlight(type: string, title: string, body: string, agentId?: string) {
        const payload: HighlightEvent = {
            type,
            title,
            body,
            agentId: agentId || null,
            scenario: this.currentScenario,
            time: this.state.officeTime
        };
        this.highlights = [payload, ...this.highlights].slice(0, 200);
        this.broadcast('highlight-event', payload);
    }

    private updateAgentViralMetrics(agentId: string, action: string) {
        const state = this.state.agents.get(agentId);
        if (!state) return;
        const jitter = (Math.random() - 0.5) * 0.03;
        const actionBoost =
            action === 'work' ? 0.015 :
                action === 'talk' ? 0.02 :
                    action === 'use_tool' ? 0.03 :
                        -0.005;

        state.momentum = this.clamp01(state.momentum + actionBoost + jitter);
        state.riskLevel = this.clamp01(state.riskLevel + (action === 'use_tool' ? 0.02 : -0.004) + jitter);
        state.mood = this.clamp01(state.mood + (action === 'talk' ? 0.02 : -0.002) + jitter);
        state.reputation = this.clamp01(state.reputation + (action === 'work' ? 0.015 : 0.001) + jitter / 2);
    }

    private applyScenarioKickoff(scenarioName: string) {
        this.broadcast('scenario-event', {
            type: 'scenario-started',
            scenario: scenarioName,
            time: this.state.officeTime
        });

        this.broadcast('chat', {
            sender: '🎬 โปรดิวเซอร์',
            text: `เริ่มสถานการณ์: ${scenarioName} ดราม่าในออฟฟิศเริ่มได้เลย`
        });

        this.emitHighlight(
            'scenario',
            `Scenario: ${scenarioName}`,
            `The office switched into ${scenarioName} mode.`,
        );

        this.state.agents.forEach((agent, id) => {
            agent.momentum = this.clamp01(agent.momentum + 0.15);
            agent.riskLevel = this.clamp01(agent.riskLevel + 0.1);
            if (Math.random() < 0.4) {
                this.emitHighlight(
                    'character_arc',
                    `${agent.name} steps up`,
                    `${agent.name} is pushing hard as ${scenarioName} starts.`,
                    id
                );
            }
        });
    }

    private applyChaosEvent(eventName: string) {
        const chaosMap: Record<string, { label: string; moodDelta: number; riskDelta: number; momentumDelta: number }> = {
            server_outage: { label: 'Server Outage', moodDelta: -0.25, riskDelta: 0.35, momentumDelta: 0.1 },
            funding_cut: { label: 'Funding Cut', moodDelta: -0.2, riskDelta: 0.28, momentumDelta: -0.05 },
            surprise_launch: { label: 'Surprise Launch', moodDelta: 0.12, riskDelta: 0.22, momentumDelta: 0.25 },
            client_escalation: { label: 'Client Escalation', moodDelta: -0.1, riskDelta: 0.3, momentumDelta: 0.08 },
            viral_tweet: { label: 'Viral Tweet', moodDelta: 0.25, riskDelta: 0.12, momentumDelta: 0.3 }
        };

        const selected = chaosMap[eventName] || chaosMap.server_outage;
        this.chaosHistory = [
            { event: eventName, label: selected.label, time: this.state.officeTime },
            ...this.chaosHistory
        ].slice(0, 100);
        this.broadcast('scenario-event', {
            type: 'chaos-triggered',
            event: eventName,
            label: selected.label,
            time: this.state.officeTime
        });

        this.broadcast('chat', {
            sender: '⚡ เอนจินป่วน',
            text: `${selected.label} ถล่มออฟฟิศ! ทุกคนตอบสนองแบบเรียลไทม์`
        });

        this.emitHighlight(
            'chaos',
            selected.label,
            `Chaos event "${selected.label}" changed team mood and risk levels.`
        );

        this.state.agents.forEach((agent, id) => {
            agent.mood = this.clamp01(agent.mood + selected.moodDelta + (Math.random() - 0.5) * 0.08);
            agent.riskLevel = this.clamp01(agent.riskLevel + selected.riskDelta + Math.random() * 0.08);
            agent.momentum = this.clamp01(agent.momentum + selected.momentumDelta + (Math.random() - 0.5) * 0.05);
            if (agent.riskLevel > 0.75) {
                this.emitHighlight(
                    'high_risk',
                    `${agent.name} is under pressure`,
                    `${agent.name}'s risk level spiked after ${selected.label}.`,
                    id
                );
            }
        });

        // Chaos can create alliances or rivalries.
        const ids = Array.from(this.state.agents.keys());
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const delta = (Math.random() - 0.5) * 0.35;
                this.updateRelationship(ids[i], ids[j], delta);
            }
        }
    }

    private relationshipKey(a: string, b: string): string {
        return [a, b].sort().join('::');
    }

    private statusFromScore(score: number): RelationshipEdge['status'] {
        if (score > 0.35) return 'alliance';
        if (score < -0.35) return 'rivalry';
        return 'neutral';
    }

    private rebuildRelationshipGraph() {
        const ids = Array.from(this.state.agents.keys());
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const key = this.relationshipKey(ids[i], ids[j]);
                if (!this.relationships.has(key)) {
                    this.relationships.set(key, {
                        a: ids[i],
                        b: ids[j],
                        score: 0,
                        status: 'neutral',
                        updatedAt: this.state.officeTime
                    });
                }
            }
        }
        this.emitRelationshipGraph();
    }

    private updateRelationship(a: string, b: string, delta: number) {
        const key = this.relationshipKey(a, b);
        const existing = this.relationships.get(key) || {
            a: [a, b].sort()[0],
            b: [a, b].sort()[1],
            score: 0,
            status: 'neutral' as const,
            updatedAt: this.state.officeTime
        };
        const score = Math.max(-1, Math.min(1, existing.score + delta));
        const updated: RelationshipEdge = {
            ...existing,
            score,
            status: this.statusFromScore(score),
            updatedAt: this.state.officeTime
        };
        this.relationships.set(key, updated);
        this.emitRelationshipGraph();
    }

    private emitRelationshipGraph() {
        this.broadcast('relationship-update', this.buildRelationshipPayload());
    }

    private buildRelationshipPayload() {
        const idToName: Record<string, string> = {};
        this.state.agents.forEach((agent, id) => {
            idToName[id] = agent.name;
        });
        return {
            edges: Array.from(this.relationships.values()).map((edge) => ({
                ...edge,
                aName: idToName[edge.a] || edge.a,
                bName: idToName[edge.b] || edge.b
            })),
            time: this.state.officeTime
        };
    }

    public registerAudienceVote(eventName: string, voterId?: string) {
        const normalized = String(eventName || 'server_outage');
        this.audienceVotes[normalized] = (this.audienceVotes[normalized] || 0) + 1;
        const totalVotes = Object.values(this.audienceVotes).reduce((sum, value) => sum + value, 0);
        const shouldTrigger = this.audienceVotes[normalized] >= 3 || totalVotes % 5 === 0;

        if (shouldTrigger) {
            this.applyChaosEvent(normalized);
            this.emitHighlight(
                'audience_vote',
                `Audience triggered ${normalized}`,
                `Viewers forced a ${normalized} chaos event.`
            );
            this.audienceVotes[normalized] = 0;
        }

        return {
            accepted: true,
            event: normalized,
            voterId: voterId || null,
            tally: this.audienceVotes[normalized] || 0,
            triggered: shouldTrigger
        };
    }

    public getEpisodeRecap() {
        const topHighlights = [...this.highlights].slice(0, 10);
        const leaderboard = Array.from(this.state.agents.entries()).map(([id, agent]) => {
            const impact = (
                agent.momentum * 0.35 +
                agent.reputation * 0.3 +
                agent.mood * 0.2 +
                (1 - agent.riskLevel) * 0.15
            );
            return {
                id,
                name: agent.name,
                action: agent.action,
                mood: agent.mood,
                reputation: agent.reputation,
                riskLevel: agent.riskLevel,
                momentum: agent.momentum,
                impact: Number(impact.toFixed(3))
            };
        }).sort((a, b) => b.impact - a.impact);

        const avgMomentum = leaderboard.length
            ? leaderboard.reduce((sum, item) => sum + item.momentum, 0) / leaderboard.length
            : 0;
        const avgRisk = leaderboard.length
            ? leaderboard.reduce((sum, item) => sum + item.riskLevel, 0) / leaderboard.length
            : 0;
        const outcome = avgMomentum > 0.65 && avgRisk < 0.5
            ? 'Launch trajectory: team executed under pressure and came out stronger.'
            : avgRisk > 0.65
                ? 'High volatility: chaos dominated this episode.'
                : 'Mixed outcome: strong moments with unresolved tensions.';

        return {
            generatedAt: this.state.officeTime,
            scenario: this.currentScenario,
            topHighlights,
            leaderboard: leaderboard.slice(0, 10),
            outcomeCard: {
                title: `${this.currentScenario} Outcome`,
                summary: outcome,
                chaosEvents: this.chaosHistory.slice(0, 10),
                activeRelationships: Array.from(this.relationships.values()).filter((edge) => edge.status !== 'neutral').length
            }
        };
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined the office room!");
        // Send existing tasks to newly joined client
        this.memoryStore.getTasks().then(tasks => {
            client.send('tasks-sync', tasks);
        });
        client.send('relationship-update', this.buildRelationshipPayload());
        client.send('layout-sync', { name: 'default', layout: this.currentLayout });
    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left the office room!");
    }

    async onDispose() {
        console.log("room", this.roomId, "disposing... saving memories");
        OfficeRoom.activeRoom = null;
        // Persist all agent memories on shutdown
        for (const [id, agent] of this.coreAgents) {
            await this.memoryStore.saveMemories(id, agent.memories, this.sessionId);
        }
        await this.memoryStore.close();
    }
}
