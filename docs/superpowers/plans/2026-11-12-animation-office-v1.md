# AnimationOffice v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างออฟฟิศใหม่ `my-animation-office` ทีม 5 บทบาท 3D animation ซึ่งสมองของแต่ละ agent คือ coding CLI จริง (`claude -p`, `opencode run`) ผ่าน adapter ใหม่ที่ spawn เป็น subprocess — สั่งงานจากแชตได้จริงใน ≤3 นาที โดยไม่แตะไฟล์จริง

**Architecture:** Approach B จาก design doc — `CliBrainAdapter` ตัวเดียว (spawn / timeout / fallback chain) + `CliDriver` ต่อผู้ให้บริการ (claude/opencode/gemini) ต่อที่ seam `InferenceAdapter` เดิมของ core โดยไม่แตะ `Agent.think()` ส่วน parsing; `BrainRegistry` ใน server โหลด `brains.json` สร้าง adapter ต่อ agent; OfficeRoom เลือก adapter ต่อ agent + lane ข้อความผู้ใช้มีความสำคัญก่อน auto-think

**Tech Stack:** Node 24 / TypeScript monorepo (npm workspaces: core, adapters, server, ui), Colyseus 0.15, Jest + ts-jest, React + Phaser UI

**Spec:** `C:\Users\Windows10\Agent-office-thai\docs\superpowers\specs\2026-11-12-animation-office-design.md` (อ่านคู่กัน — แผนนี้โต้แย้งจากสเปก)

## Global Constraints

- ที่อยู่โปรเจกต์ใหม่: `C:\Users\Windows10\my-animation-office` (ชื่อแสดง **AnimationOffice**) — clone จาก `https://github.com/Devpatipan/Agent-office-thai.git`
- Sandbox v1: subprocess cwd = `packages/server/workspace/agents/<agentId>/` (ว่าง); **ห้าม**มีการแก้ไฟล์นอกโฟลเดอร์ `packages/server/workspace/` — เพิ่ม `workspace/` เข้า `.gitignore`
- ปิดเครื่องมือ: `code_execute`, `read_file` ถูกบล็อกทั้งฝั่ง `ToolExecutor` และ dispatch ของ OfficeRoom; `hire_agent` ถูกถอดจาก capabilities และลบ branch การจ้างใน v1 (ไม่มีปุ่มจ้างใน UI อยู่แล้ว — ตรวจสอบแล้ว)
- Pacing (ค่าคงที่ใน OfficeRoom): `thinkTimeoutMs=180000`, `maxConcurrentThinks=2`, `thinkCooldownMs=60000`, `conversationCooldownMs=300000`, `talkChance=0.3`
- ข้อความผู้ใช้ = priority lane: รันทันทีไม่ต้องรอ cooldown, นับรวม `maxConcurrentThinks`, auto-think ไม่แซง lane ผู้ใช้
- opencode: `XDG_DATA_HOME` ชี้ `packages/server/workspace/opencode-data` (แชร์คงที่, ต่อ subprocess เสมอ)
- ทั้งสอง CLI รับ prompt ทาง **stdin เท่านั้น** — ห้ามส่ง prompt ทาง argv (ทดสอบแล้วว่า stdin ทำงานทั้งคู่)
- ทีม 5 ตัว (id → ชื่อไทย → บทบาท): `director`/ผู้กำกับ/Director, `modeler`/โมเดลเลอร์/Modeler, `rigger`/ริกเกอร์/Rigger, `animator`/แอนิเมเตอร์/Animator, `texturer`/เท็กซ์เจอร์/Texturer — เปลี่ยนสมองได้ผ่าน `brains.json` เท่านั้น
- Fallback = cross-provider chain ใน `brains.json` (สาย claude ↔ opencode สลับกันเสมอ กัน fallback หาตัวเอง); ท้ายสายสุด = ข้อความ error ปรากฏในแชต (ไม่ throw, ไม่เงียบ)
- claude args คงที่: `-p --output-format json --model <model จาก brains.json (ค่าเริ่ม haiku)> --disallowedTools Read Write Edit MultiEdit NotebookEdit Bash WebFetch WebSearch Grep Glob Task Agent Skill TodoWrite`
- opencode args คงที่: `run --format json [-m <provider/model>]`
- UI ภาษาไทยทั้งหมด; scenario/chaos เก็บไว้ตามเดิม; แสดงสถานะ "🧠 กำลังคิด..." ผ่าน `agentState.thought` (thought bubble เดิมแสดงอยู่แล้ว)
- ทุก task ต้อง `npm run build` ผ่านและ test ของ workspace นั้น ๆ ก่อน commit

## Review Focus

5 จุดที่สเปกไม่ได้บอกแต่จะทำให้ของพัง — แต่ละบรรทัดมี test ผูกกับ task ที่เป็นเจ้าของ:

1. **Windows spawn ของ npm shim (.cmd/.ps1) + stdin pipe** — spawn ต้องใช้ `shell:true` เฉพาะ win32 และ prompt ต้องลง stdin ครบ (ไม่หลุดไป argv) → ทดสอบใน Task 4 (fake driver) และ e2e Task 11
2. **รูป JSON output ต่างกัน: claude = JSON เดียว, opencode = NDJSON หลายบรรทัด** — parse ผิดฝั่ง = ได้ผลว่าง/พัง → fixture test จริงจาก output ที่ capture ไว้ใน Task 2 และ Task 3
3. **opencode 2 process ชน DB lock บน data dir แชร์** → test spawn คู่ขนานใน Task 4 (ถ้าชน ให้ถอยเป็นแยก data dir ต่อ agent ตาม design 6.8)
4. **Lane ผู้ใช้ + capacity ร่วมกับ auto-think** — deadlock/คิวไม่ไหล = แชตค้าง → unit test ของ `UserLane` ใน Task 7
5. **Error จาก chain ทั้งหมดต้องโผล่เป็นข้อความในแชต** — ห้ามหายเงียบ/ห้าม crash server → test ใน Task 4 (adapter คืน error text เป็น content) + e2e Task 11

---

### Task 1: Foundation — ติดตั้ง git, clone repo ใหม่, baseline

**Files:**
- Create: `C:\Users\Windows10\my-animation-office\` (clone ทั้ง repo)
- Copy: `docs/superpowers/` (design + plan นี้) เข้า repo ใหม่

**Interfaces:**
- Produces: repo ใหม่ที่ `npm install` / `npm run build` / `npm test` ผ่าน — task อื่นทั้งหมดทำงานใน `C:\Users\Windows10\my-animation-office`

- [ ] **Step 1: ติดตั้ง git (ยังขาดอยู่บนเครื่อง)**

Run: `winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements` แล้ว refresh PATH ใน shell ปัจจุบัน:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
git --version
```

Expected: `git version 2.x.x` (ถ้ามี git อยู่แล้วข้าม step นี้)

- [ ] **Step 2: Clone repo ใหม่**

Run: `git clone https://github.com/Devpatipan/Agent-office-thai.git C:\Users\Windows10\my-animation-office`
Expected: clone สำเร็จ

- [ ] **Step 3: คัดลอก design doc + plan เข้า repo ใหม่**

Run: `Copy-Item -Recurse C:\Users\Windows10\Agent-office-thai\docs C:\Users\Windows10\my-animation-office\`

- [ ] **Step 4: ติดตั้ง dependency + build + test baseline**

Run (ใน `C:\Users\Windows10\my-animation-office`): `npm install` (ตอบอนุมัติ prompt เรื่อง install scripts: esbuild, sqlite3, msgpackr-extract) แล้ว `npm run build` แล้ว `npm test`
Expected: build ผ่านทุก workspace; test ผ่าน 2 ไฟล์ (TaskManager, PromptBuilder)

- [ ] **Step 5: Commit docs**

```bash
git add docs
git commit -m "docs: add AnimationOffice v1 design and implementation plan"
```

---

### Task 2: Driver types + claude driver

**Files:**
- Create: `packages/adapters/src/cli/types.ts`
- Create: `packages/adapters/src/cli/spawn.ts`
- Create: `packages/adapters/src/cli/drivers/claude.ts`
- Test: `packages/adapters/src/cli/__tests__/claudeDriver.test.ts`
- Modify: `packages/adapters/src/index.ts` (export โมดูล cli)

**Interfaces:**
- Consumes: —
- Produces (task อื่นใช้ต่อ — ห้ามเปลี่ยนชื่อ):

```ts
// types.ts
export interface CliInvocation { command: string; args: string[]; stdin: string; env: Record<string, string>; }
export type CliParseResult = { ok: true; content: string } | { ok: false; error: string };
export interface CliDriver {
    readonly name: string;                                  // 'claude' | 'opencode' | 'gemini'
    buildInvocation(prompt: string, model: string | undefined, cwd: string): CliInvocation;
    parseOutput(stdout: string, stderr: string, exitCode: number): CliParseResult;
    healthCheck(): Promise<boolean>;
}

// spawn.ts
export interface RunResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; spawnError?: string; }
export function runCli(inv: CliInvocation, cwd: string, timeoutMs: number): Promise<RunResult>;
// runCli: spawn(command, args, { cwd, env: {...process.env, ...inv.env}, shell: process.platform === 'win32' }),
// เขียน inv.stdin ทาง stdin แล้วปิด, kill เมื่อเกิน timeoutMs (timedOut=true), spawn error = spawnError

// drivers/claude.ts
export function claudeDriver(): CliDriver;
```

- [ ] **Step 1: เขียน failing test สำหรับ claude driver**

`packages/adapters/src/cli/__tests__/claudeDriver.test.ts`:

```ts
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
        expect(d.buildInvocation('x', undefined, 'cwd').args[3]).toBe('haiku');
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
```

- [ ] **Step 2: Run test ให้ fail**

Run: `npx jest src/cli/__tests__/claudeDriver.test.ts` (workdir `packages\adapters`)
Expected: FAIL — module `../drivers/claude` ไม่พบ

- [ ] **Step 3: Implement `types.ts`, `spawn.ts`, `drivers/claude.ts`**

- `types.ts` / `spawn.ts` ตามสัญญาใน Interfaces ข้างต้น (runCli ใช้ `child_process.spawn`, win32 → `shell:true`, timeout → `child.kill()`)
- `claudeDriver()`:
  - `args = ['-p','--output-format','json','--model', model ?? 'haiku','--disallowedTools','Read','Write','Edit','MultiEdit','NotebookEdit','Bash','WebFetch','WebSearch','Grep','Glob','Task','Agent','Skill','TodoWrite']`, `stdin = prompt`, `env = {}`
  - `parseOutput`: exitCode ≠ 0 → `{ok:false, error: stderr || stdout}`; `JSON.parse(stdout)` ล้ม → `{ok:false, error:'non-JSON: ' + stdout.slice(0,200)}`; `is_error` → `{ok:false, error: obj.result || obj.subtype}`; ที่เหลือ → `{ok:true, content: String(obj.result)}`
  - `healthCheck()`: `runCli({command:'claude',args:['--version'],stdin:'',env:{}}, cwd of process.cwd(), 15000)` → `code === 0 && !spawnError`
- เพิ่ม export ใน `packages/adapters/src/index.ts`: `export * from './cli/types'; export * from './cli/spawn'; export * from './cli/drivers/claude';`

- [ ] **Step 4: Run test ให้ผ่าน + build**

Run: `npx jest src/cli/__tests__/claudeDriver.test.ts` แล้ว `npm run build`
Expected: PASS 5 tests, build ผ่าน

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): claude CLI driver with fixed sandbox args"
```

---

### Task 3: opencode driver + gemini stub

**Files:**
- Create: `packages/adapters/src/cli/drivers/opencode.ts`
- Create: `packages/adapters/src/cli/drivers/gemini.ts`
- Test: `packages/adapters/src/cli/__tests__/opencodeDriver.test.ts`
- Modify: `packages/adapters/src/index.ts`

**Interfaces:**
- Consumes: `CliDriver`, `CliInvocation`, `runCli` จาก Task 2
- Produces:

```ts
// drivers/opencode.ts — dataDir = ที่อยู่ที่ชี้ XDG_DATA_HOME (workspace/opencode-data)
export function opencodeDriver(dataDir: string): CliDriver;
// drivers/gemini.ts — stub: healthCheck เป็น false เสมอจนกว่าจะติดตั้ง CLI
export function geminiDriver(): CliDriver;
```

- [ ] **Step 1: เขียน failing test opencode driver**

`packages/adapters/src/cli/__tests__/opencodeDriver.test.ts`:

```ts
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
```

- [ ] **Step 2: Run ให้ fail** — `npx jest src/cli/__tests__/opencodeDriver.test.ts` → FAIL (module ไม่พบ)

- [ ] **Step 3: Implement opencode + gemini drivers**

- `opencodeDriver(dataDir)`:
  - `args = ['run','--format','json', ...(model ? ['-m', model] : [])]`, `env = { XDG_DATA_HOME: dataDir }`, `stdin = prompt`
  - `parseOutput`: exitCode ≠ 0 → error(stderr || stdout); แยก stdout เป็นบรรทัด, JSON.parse แต่ละบรรทัด (ข้ามบรรทัดที่พัง), เก็บทุก `line.type === 'text' && line.part?.type === 'text'` → `join('')`; ได้ string ว่าง → `{ok:false, error:'no text output'}`; ที่เหลือ ok
  - `healthCheck()`: `runCli({command:'opencode',args:['--version'],stdin:'',env:{}}, process.cwd(), 15000)` → `code === 0 && !spawnError`
- `geminiDriver()`: `command:'gemini'`, `args:['-p']`, `stdin: prompt`, `parseOutput` = exitCode≠0 → error else `stdout.trim()`; `healthCheck()` → `false` เสมอ (stub — ยังไม่ติดตั้ง CLI)
- Export ทั้งคู่ใน `index.ts`

- [ ] **Step 4: Run test + build ให้ผ่าน**

Expected: PASS 4 tests, build ผ่าน

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): opencode driver (NDJSON, shared data dir) + gemini stub"
```

---

### Task 4: CliBrainAdapter — spawn, timeout, fallback chain

**Files:**
- Create: `packages/adapters/src/cli/CliBrainAdapter.ts`
- Test: `packages/adapters/src/cli/__tests__/CliBrainAdapter.test.ts`
- Modify: `packages/adapters/src/index.ts`

**Interfaces:**
- Consumes: `CliDriver`, `runCli` จาก Task 2-3
- Produces (Task 5/6 ใช้ต่อ):

```ts
export interface CliBrainOptions { cwd: string; timeoutMs?: number; }   // timeoutMs default 180000
export class CliBrainAdapter implements InferenceAdapter {
    readonly provider: string;   // ชื่อ driver คั่นด้วย '>' เช่น 'claude>opencode'
    readonly isLocal: boolean;   // false
    constructor(chain: CliDriver[], opts: CliBrainOptions);
    complete(request: CompletionRequest): Promise<CompletionResponse>;
}
```

- [ ] **Step 1: เขียน failing test**

`packages/adapters/src/cli/__tests__/CliBrainAdapter.test.ts` — ใช้ fake driver 2 ตัว + fake CLI จริงผ่าน `process.execPath`:

```ts
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
```

- [ ] **Step 2: Run ให้ fail** — `npx jest src/cli/__tests__/CliBrainAdapter.test.ts` → FAIL (module ไม่พบ)

- [ ] **Step 3: Implement `CliBrainAdapter`**

- ดึง prompt = เนื้อหาของ message ตัวสุดท้ายที่ `role === 'user'` (ถ้าไม่มีใช้ตัวสุดท้าย)
- วน `chain`: `driver.buildInvocation(prompt, request.model, opts.cwd)` → `runCli(inv, cwd, timeoutMs)` → ล้ม (spawnError / timedOut / code≠0 / `parseOutput` ok:false) → เก็บ error แล้วไปตัวถัดไป
- สำเร็จ → `return { content, usage: { prompt: 0, completion: 0 }, latency: Date.now() - start }`
- ทั้งสายล่ม → **คืน** `{ content: '⚠️ สมองทุกตัวล้มเหลว: ' + errors.join(' | '), usage: {prompt:0,completion:0}, latency }` (ไม่ throw — ทำให้ `Agent.think()` เห็นข้อความไม่ใช่ JSON แล้วส่ง raw เป็น talk ขึ้นแชตเองตามกลไกเดิม)
- `provider` = chain ชื่อ driver คั่น `>`; `isLocal = false`

- [ ] **Step 4: Run test + build ให้ผ่าน**

Expected: PASS 5 tests (ตัว timeout ใช้เวลา ~0.5s), build ผ่าน

- [ ] **Step 5: Commit**

```bash
git add packages/adapters
git commit -m "feat(adapters): CliBrainAdapter with chain fallback, timeout, error-as-content"
```

---

### Task 5: brains.json + BrainRegistry

**Files:**
- Create: `packages/server/src/brains/brains.json`
- Create: `packages/server/src/brains/BrainRegistry.ts`
- Test: `packages/server/src/brains/__tests__/BrainRegistry.test.ts`
- Modify: `packages/server/jest.config.js` (สร้างใหม่ — server ยังไม่มี; copy จาก `packages/adapters/jest.config.js`)

**Interfaces:**
- Consumes: `CliBrainAdapter`, `claudeDriver`, `opencodeDriver`, `geminiDriver` จาก Task 2-4
- Produces (Task 6 ใช้ต่อ):

```ts
export interface BrainEntry { driver: 'claude' | 'opencode' | 'gemini'; model?: string; }
export interface BrainRegistryOptions { workspaceRoot: string; timeoutMs?: number; }
export class BrainRegistry {
    static load(json: unknown, opts: BrainRegistryOptions, driverFactory?: Record<string, () => any>): BrainRegistry;
    getAdapter(agentId: string): CliBrainAdapter | undefined;
    agentIds(): string[];
    healthCheck(): Promise<Record<string, boolean>>;   // ตรวจ driver แต่ละตัวครั้งเดียว (cache) แล้วกรอง chain ใน getAdapter
    resolveBrainsPath(): string;                        // static — หา brains.json จาก candidates
}
```

- [ ] **Step 1: สร้าง jest config ของ server + เขียน failing test**

`packages/server/jest.config.js`:

```js
module.exports = { preset: 'ts-jest', testEnvironment: 'node' };
```

`packages/server/src/brains/__tests__/BrainRegistry.test.ts`:

```ts
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
```

หมายเหตุ: ตัวสุดท้าย — เมื่อกรองแล้วว่างทั้งสาย ให้คืน adapter จาก chain เดิมทั้งสาย (เพื่อให้ error โผล่แชต ไม่ใช่ไม่มีสมอง)

- [ ] **Step 2: Run ให้ fail** — `npx jest src/brains` (workdir `packages\server`) → FAIL (module ไม่พบ / config ยังไม่มี)

- [ ] **Step 3: Implement `brains.json` + `BrainRegistry`**

`packages/server/src/brains/brains.json` (cross-provider ทุกสาย — ตาม Global Constraints):

```json
{
    "director":  [{ "driver": "claude", "model": "haiku" }, { "driver": "opencode", "model": "llmapi/claude-sonnet-4-5" }],
    "modeler":   [{ "driver": "opencode", "model": "llmapi/claude-sonnet-4-5" }, { "driver": "claude", "model": "haiku" }],
    "rigger":    [{ "driver": "opencode", "model": "llmapi/nemotron-3.5-lightning" }, { "driver": "claude", "model": "haiku" }],
    "animator":  [{ "driver": "claude", "model": "haiku" }, { "driver": "opencode", "model": "llmapi/nemotron-3.5-lightning" }],
    "texturer":  [{ "driver": "opencode", "model": "llmapi/gemini-2.5-flash" }, { "driver": "claude", "model": "haiku" }]
}
```

- `load`: validate — key เป็น string, value เป็น array ที่ไม่ว่าง, `driver` อยู่ใน 3 ค่าที่รู้จัก (ผิด → throw พร้อมชื่อ driver), ห้าม driver ซ้ำกันติดกันในสาย (โยนข้อความบอกให้แก้ brains.json); สร้าง driver ผ่าน `driverFactory` (default: `{claude: () => claudeDriver(), opencode: () => opencodeDriver(path.join(workspaceRoot,'opencode-data')), gemini: () => geminiDriver()}`) เก็บเป็น `chains: Map<string, CliDriver[]>`
- `getAdapter(agentId)`: ถ้า `healthChecked` → กรองสายเอาเฉพาะ driver ที่ healthy; ว่างหลังกรอง → ใช้สายเดิมทั้งสาย; คืน `new CliBrainAdapter(chain, { cwd: path.join(workspaceRoot, 'agents', agentId), timeoutMs })`
- `healthCheck()`: ตรวจ driver ทุกตัวที่ปรากฏใน config (unique, parallel, ผ่าน `driver.healthCheck()` ของแต่ละตัว), cache ผล, คืน `{driverName: boolean}`
- `resolveBrainsPath()`: candidates `[path.join(__dirname,'brains.json'), path.join(__dirname,'..','..','src','brains','brains.json')]` → คืนอันแรกที่ `fs.existsSync` (ปกคลุมทั้ง src layout ตอน test และ dist layout ตอน start) — throw ถ้าไม่เจอ

- [ ] **Step 4: Run test + build ให้ผ่าน**

Run: `npx jest src/brains` แล้ว `npm run build`
Expected: PASS 4 tests, build ผ่าน

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): brains.json + BrainRegistry with validation and health check"
```

---

### Task 6: OfficeRoom — ทีม 5 บทบาท + ผูกสมองต่อ agent + sandbox

**Files:**
- Modify: `packages/server/src/rooms/OfficeRoom.ts` (setupCoreAgent, 5 รายการเรียก, furnitureTargets, autoAssignAgent, ลบ field `adapter`)
- Modify: `.gitignore` (เพิ่ม `workspace/`)

**Interfaces:**
- Consumes: `BrainRegistry.load`, `brains.json` จาก Task 5
- Produces: ทีม 5 agent id (`director/modeler/rigger/animator/texturer`) ที่ task UI (Task 10) และ chat lane (Task 7) อ้างถึง; `this.brains` เป็น BrainRegistry instance

- [ ] **Step 1: แก้ `.gitignore`**

เพิ่มบรรทัด `workspace/` (และ `packages/server/workspace/` ถ้า gitignore ใช้ pattern ระดับ root)

- [ ] **Step 2: เขียน failing test ไม่ได้ (task นี้เป็น wiring ของ room ที่ไม่มี harness) — ใช้ build + smoke แทน**

ก่อนแก้: รัน `npm run build` baseline ให้ผ่านเพื่อยืนยันจุดเริ่ม (Expected: ผ่าน)

- [ ] **Step 3: แก้ OfficeRoom — registry + sandbox dirs**

ใน `onCreate` ก่อน `setupCoreAgent` ตัวแรก:

- สร้างโฟลเดอร์: `workspaceRoot = path.join(__dirname, '..', '..', 'workspace')` (ให้ได้ `packages/server/workspace` ทั้งจาก dist และ src), `fs.mkdirSync(path.join(workspaceRoot,'agents',id), {recursive:true})` ทั้ง 5 id + `path.join(workspaceRoot,'opencode-data')`
- เขียน `opencode.json` (permission deny) ลงใน `workspace/agents/<id>/` ทุกตัว:

```json
{ "$schema": "https://opencode.ai/config.json",
  "permission": { "read": "deny", "edit": "deny", "glob": "deny", "grep": "deny", "list": "deny",
                  "bash": "deny", "task": "deny", "webfetch": "deny", "websearch": "deny", "external_directory": "deny" } }
```

- `this.brains = BrainRegistry.load(JSON.parse(fs.readFileSync(BrainRegistry.resolveBrainsPath(),'utf8')), { workspaceRoot, timeoutMs: 180000 })`
- `await this.brains.healthCheck()` + log ผลต่อ driver (ถ้าตัวไหน false ให้ log warning)

- [ ] **Step 4: แก้ OfficeRoom — ทีม 5 ตัว + adapter ต่อ agent**

- ลบ `private adapter = new OpenAICompatibleAdapter(...)` และ import `OpenAICompatibleAdapter` ออก
- ใน `setupCoreAgent`: แทน `coreAgent.setInferenceAdapter(this.adapter)` ด้วย:

```ts
const brain = this.brains.getAdapter(id);
if (!brain) throw new Error(`No brain configured for agent "${id}" — แก้ brains.json`);
coreAgent.setInferenceAdapter(brain);
```

- แทน 5 รายการ `await setupCoreAgent(...)` เดิม (general/dev/freelance/farmconnect/devdonate) เป็น:

| id | ชื่อ | role | ตำแหน่ง (x,y) | communicationStyle |
|----|------|------|---------------|--------------------|
| director | ผู้กำกับ | Director | 10,10 | formal |
| modeler | โมเดลเลอร์ | Modeler | 20,15 | creative |
| rigger | ริกเกอร์ | Rigger | 15,12 | technical |
| animator | แอนิเมเตอร์ | Animator | 18,14 | creative |
| texturer | เท็กซ์เจอร์ | Texturer | 22,14 | technical |

- System prompt รูปแบบเดียวกันทุกตัว (ภาษาไทย, คงคำสั่ง JSON structure แบบเดิม):

```
You are "${ชื่อไทย}", ${บทบาท} ของทีม 3D animation (AnimationOffice) ...หน้าที่เฉพาะของบทบาทนี้... เขียนค่า field "thought" และ "message" เป็นภาษาไทย (แต่คงโครง JSON และ key เป็นอังกฤษ) Keep thoughts SHORT.
```

(เติมหน้าที่แต่ละบทบาท: ผู้กำกับ=กำกับงาน มอบหมาย สรุปความคืบหน้า / โมเดลเลอร์=สร้างโมเดล 3D topology UV / ริกเกอร์=กระดูก rig constraints / แอนิเมเตอร์=จังหวะ animation keyframe / เท็กซ์เจอร์=สี วัสดุ texture)

- capabilities ของทุกตัว: เหลือ `web_search`, `write_note`, `create_task` เท่านั้น (ลบ `code_execute`, `hire_agent` — เสร็จพร้อม Task 8)

- [ ] **Step 5: แก้ furnitureTargets + autoAssignAgent**

- เปลี่ยน key ใน `furnitureTargets`: `general-desk`→`director-desk`, `freelance-desk`→`modeler-desk`, `dev-desk`→`rigger-desk`, `farmconnect-desk`→`texturer-desk`, `devdonate-desk`→`animator-desk` (คงค่า x,y เดิม); เก็บ `hire_*-desk` ไว้ไม่แตะ (ไม่มีอะไรใช้แล้วใน v1)
- `autoAssignAgent()` fallback `'general'` → `'director'`

- [ ] **Step 6: Build + smoke test server**

Run: `npm run build` แล้ว `npm run start --workspace=@agent-office/server`
Expected: build ผ่าน; log แสดง health check ของ driver + agent 5 ตัวถูกสร้างโดยไม่ throw; หยุด server หลังตรวจเสร็จ (Ctrl+C / ปิด process)

- [ ] **Step 7: Commit**

```bash
git add packages/server .gitignore
git commit -m "feat(server): 3D animation team of 5 with per-agent brains and sandbox dirs"
```

---

### Task 7: Pacing + user priority lane + สถานะกำลังคิด

**Files:**
- Create: `packages/server/src/rooms/UserLane.ts`
- Test: `packages/server/src/rooms/__tests__/UserLane.test.ts`
- Modify: `packages/server/src/rooms/OfficeRoom.ts` (ค่าคงที่, แยก `runThink`, chat handler)

**Interfaces:**
- Consumes: ทีม + adapter จาก Task 6
- Produces:

```ts
// UserLane.ts — คิวข้อความผู้ใช้ที่มี priority ต่อ capacity
export class UserLane<T = { agentId: string; text: string }> {
    constructor(maxConcurrent: number);
    push(item: T): void;
    claim(activeCount: number): T | null;   // คืน null ถ้าคิวว่าง / เต็ม capacity / ตัวนั้นกำลังยุ่ง (busy)
    release(agentId: string): void;
    get size(): number;
    isBusy(agentId: string): boolean;
}
```

- OfficeRoom: `private userLane = new UserLane(this.maxConcurrentThinks)` — แต่ maxConcurrent เปลี่ยนเป็น 2 ใน task นี้

- [ ] **Step 1: เขียน failing test ของ UserLane**

`packages/server/src/rooms/__tests__/UserLane.test.ts`:

```ts
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
```

- [ ] **Step 2: Run ให้ fail** — `npx jest src/rooms` → FAIL

- [ ] **Step 3: Implement `UserLane`**

- `push` ต่อท้าย array; `claim(activeCount)`: ถ้าคิวว่าง/`activeCount >= maxConcurrent` → null; วนหาตัวแรกที่ไม่ busy → mark busy แล้วคืน; `release(agentId)`: ลบออกจาก busy set

- [ ] **Step 4: Run test ให้ผ่าน** — PASS 4 tests

- [ ] **Step 5: แก้ OfficeRoom — ค่าคงที่ + แยก `runThink`**

- ค่าคงที่ (Global Constraints): `maxConcurrentThinks = 2`, `thinkCooldownMs = 60000`, `conversationCooldownMs = 300000`, `talkChance = 0.3`
- Refactor (behavior-preserving ก่อน): ย้ายบล็อก think cycle ทั้งก้อน (เดิม lines ~259-496 ใน `update()`) ออกเป็นเมธอดส่วนตัว:

```ts
private async runThink(id: string, opts: { userText?: string } = {}): Promise<void>
```

  - ย้าย logic ทั้งหมดตามเดิม (perception, decision handling, talk, tools, memory persist, cooldown unlock) เข้าไป; `update()` เหลือแค่เรียกเมื่อ `!thinkingLocks.get(id) && activeThinkers < max`
  - `opts.userText` มีค่า → **ก่อน** เรียก `coreAgent.think`: `agentState.thought = '🧠 กำลังคิด...'` และ `receiveMessage({from:'User',...})` + broadcast `chat {sender:'🧠 ระบบ', text: '🧠 {ชื่อ} กำลังคิด...'}` ครั้งเดียว (ข้าม step การ receive เดิมที่อยู่ใน chat handler — ย้ายมาที่นี่)
  - หลัง think settle (ทั้ง success/catch): clear `agentState.thought` ถ้าค่าเท่ากับค่ากำลังคิด (กันทับคำตอบจริง), release userLane ถ้าเป็น user think, คง cooldown unlock เดิม

- [ ] **Step 6: แก้ OfficeRoom — chat handler → user lane**

```ts
this.onMessage('chat', (client, message) => {
    const text = String(message?.text || '').trim();
    if (!text) return;
    const targetId = message.target && this.coreAgents.has(message.target)
        ? message.target
        : (this.coreAgents.keys().next().value as string);   // default = director
    this.broadcast('chat', { sender: 'User', text: `ถึง ${this.state.agents.get(targetId)?.name}: ${text}` });
    this.userLane.push({ agentId: targetId, text });
    this.pumpUserLane();
});
```

- `pumpUserLane()`: เรียกซ้ำ — `const item = this.userLane.claim(this.activeThinkers); if (!item) return;` → `this.activeThinkers++; this.thinkingLocks.set(item.agentId, true);` แล้ว `this.runThink(item.agentId, { userText: item.text }).finally(() => { this.userLane.release(item.agentId); this.activeThinkers = Math.max(0, this.activeThinkers - 1); })` → loop ต่อ
- เรียก `this.pumpUserLane()` ท้าย `update()` ด้วย เพื่อปล่อยคิวเมื่อ auto-think ปล่อย slot (auto-think ไม่แซง: auto ใช้ `userLane` ไม่ได้อยู่แล้ว แต่ capacity ร่วมกัน — ถ้า lane มีคิว auto-think ตัวถัดไปต้องหยุด: เพิ่มเงื่อนไข `if (this.userLane.size > 0) return;` ที่หัว block auto-think ใน `update()`)

- [ ] **Step 7: Build + test ทั้ง workspace server**

Run: `npx jest` (workdir packages\server) แล้ว `npm run build`
Expected: PASS ทั้งหมด, build ผ่าน

- [ ] **Step 8: Commit**

```bash
git add packages/server
git commit -m "feat(server): minute-scale pacing, user priority lane, thinking status"
```

---

### Task 8: ปิดเครื่องมองัน (code_execute/read_file) + ถอดการจ้าง

**Files:**
- Modify: `packages/server/src/tools/ToolExecutor.ts`
- Test: `packages/server/src/tools/__tests__/ToolExecutor.test.ts`
- Modify: `packages/server/src/rooms/OfficeRoom.ts` (allowlist dispatch, ลบ branch `hire_agent` + `hireCount`)

**Interfaces:**
- Consumes: —
- Produces: allowlist `['web_search', 'write_note']` สำหรับ dispatch; `ToolExecutor.execute` ปฏิเสธ `code_execute`/`read_file` เสมอ

- [ ] **Step 1: เขียน failing test**

`packages/server/src/tools/__tests__/ToolExecutor.test.ts`:

```ts
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
```

- [ ] **Step 2: Run ให้ fail** — `npx jest src/tools` → FAIL (code_execute ยังรันได้)

- [ ] **Step 3: Implement guard ใน `ToolExecutor.execute`**

ก่อน switch: `if (toolName === 'code_execute' || toolName === 'read_file') return { success: false, output: '', error: 'เครื่องมือนี้ถูกปิดใน v1 (sandbox — เปิดอีกทีใน v2)' };`

- [ ] **Step 4: Run test ให้ผ่าน** — PASS 3 tests

- [ ] **Step 5: แก้ OfficeRoom — allowlist + ลบการจ้าง**

- Dispatch เดิม `['code_execute', 'web_search', 'write_note', 'read_file'].includes(...)` → `['web_search', 'write_note'].includes(...)`; ถ้า decision เรียกเครื่องมือที่ไม่อยู่ใน allowlist → broadcast `⛔ เครื่องมือ [ชื่อ] ถูกปิดใน v1` (ไม่เรียก executor)
- ลบ branch `hire_agent` ทั้งก้อน (เดิม lines ~385-454) + field `hireCount` — เครื่องมือถูกถอดจาก capabilities ไปแล้วใน Task 6 เหลือแค่กันพลาด (defense in depth)
- (branch `create_task` และ allowlist `web_search/write_note` คงเดิม)

- [ ] **Step 6: Build + test**

Run: `npx jest` (packages\server) แล้ว `npm run build`
Expected: PASS ทั้งหมด, build ผ่าน

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): lock down file/exec tools in v1, remove agent hiring"
```

---

### Task 9: UI — dropdown เลือกผู้รับข้อความในแชต

**Files:**
- Modify: `packages/ui/src/components/ChatPanel.tsx`

**Interfaces:**
- Consumes: message contract `room.send('chat', { text, target })` จาก Task 7
- Produces: dropdown 5 ตัวเลือก + default `director` — Task 11 ใช้ทดสอบ

- [ ] **Step 1: แก้ ChatPanel**

- เพิ่ม `const [target, setTarget] = useState('director')`
- รายการ:

```ts
const AGENTS = [
    { id: 'director', name: '🎬 ผู้กำกับ' },
    { id: 'modeler', name: '🧊 โมเดลเลอร์' },
    { id: 'rigger', name: '🦴 ริกเกอร์' },
    { id: 'animator', name: '🎞️ แอนิเมเตอร์' },
    { id: 'texturer', name: '🎨 เท็กซ์เจอร์' },
];
```

- `send()`: `room.send('chat', { text: input, target })`
- Layout: แถวล่างสุดเป็น `<div style={{display:'flex', gap:6}}>` ประกอบด้วย `<select value={target} onChange={...}>` (options จาก AGENTS, style เดิม input: background `#333`, color white, border `1px solid #444`, radius 4, flex 0 0 130px) + input เดิม (flex 1)

- [ ] **Step 2: Build UI**

Run: `npm run build --workspace=@agent-office/ui` (หรือ `npx vite build` ใน packages/ui)
Expected: ผ่าน

- [ ] **Step 3: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): recipient dropdown next to chat input"
```

---

### Task 10: UI retheme — AnimationOffice + ป้ายทีมใหม่

**Files:**
- Modify: `packages/ui/src/App.tsx` (บรรทัด 17-18)
- Modify: `packages/ui/src/components/TaskBoard.tsx` (options บรรทัด 91-96)
- Modify: `packages/ui/src/game/Game.ts` (ป้าย workstation บรรทัด 282-286)

**Interfaces:**
- Consumes: ชื่อ/id ทีมจาก Task 6 (ต้องตรงกันเป๊ะ: `director/modeler/rigger/animator/texturer`)
- Produces: UI ไทยธีมทีม 3D animation — ตรวจด้วยตาใน Task 11

- [ ] **Step 1: แก้ App.tsx**

- `🏢 AgentOffice` → `🎬 AnimationOffice`
- `จำลอง AI หลาย agent แบบเรียลไทม์` → `ทีม 3D animation ขับด้วย AI จริง`

- [ ] **Step 2: แก้ TaskBoard options**

แทน 5 option เดิมเป็น: `director`=ผู้กำกับ, `modeler`=โมเดลเลอร์, `rigger`=ริกเกอร์, `animator`=แอนิเมเตอร์, `texturer`=เท็กซ์เจอร์ (คง `auto` option ไว้)

- [ ] **Step 3: แก้ Game.ts workstation labels**

5 บรรทัด `drawWorkstation(...)`: `'🎬 ผู้กำกับ'`, `'🧊 โมเดลเลอร์'`, `'🦴 ริกเกอร์'`, `'🎞️ แอนิเมเตอร์'`, `'🎨 เท็กซ์เจอร์'` (คงพิกัดเดิม)

- [ ] **Step 4: Build + grep ตรวจว่าไม่เหลือชื่อทีมเก่า**

Run: `npm run build --workspace=@agent-office/ui` แล้ว `grep -r "ทั่วไป\|ฟรีแลนซ์\|ฟาร์มคอนเนกต์\|เดฟโดเนต" packages/ui/src packages/server/src`
Expected: build ผ่าน; เหลือแค่ในไฟล์ที่ตั้งใจ (ถ้าเจอใน OfficeRoom ให้ตรวจว่าไม่ใช่ prompt เดิมที่หลงเหลือ)

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): retheme to AnimationOffice 3D animation team"
```

---

### Task 11: E2E ตรวจสอบตาม success criteria

**Files:**
- ไม่แก้โค้ด — ตรวจอย่างเดียว (ถ้าเจอ bug ให้แก้แล้ว commit แยก)

**Interfaces:**
- Consumes: ของทุก task ก่อนหน้า
- Produces: รายงานว่าผ่าน/ไม่ผ่านทั้ง 5 เกณฑ์ (Success criteria ของ design doc)

- [ ] **Step 1: รัน server + UI + เปิดเบราว์เซอร์**

```powershell
# terminal 1 (workdir my-animation-office)
npm run start --workspace=@agent-office/server
# terminal 2
npm run dev --workspace=@agent-office/ui
```

เปิด `http://localhost:5173` — Expected: header `🎬 AnimationOffice`, agent 5 ตัวเดินในแผนที่, ป้าย workstation ใหม่

- [ ] **Step 2: เกณฑ์ 1 — สั่งงานจากแชตได้จริง ≤3 นาที**

พิมพ์ถึง `🎬 ผู้กำกับ` (claude): "แนะนำตัวและสรุปหน้าที่ทีม 3D animation ของเราเป็นภาษาไทยสั้น ๆ" → รอคำตอบ ≤180 วิ
สลับ dropdown ไป `🧊 โมเดลเลอร์` (opencode) → ส่ง "โมเดลตัวละคร 1 ตัวต้องเริ่มจากอะไรบ้าง" → รอคำตอบ
Expected: ตอบทั้งคู่ด้วยสมองจริง (สังเกตจากคุณภาพ/สไตล์คำตอบต่างจาก gemma) และเห็น `🧠 กำลังคิด...` ระหว่างรอ + ข้อความ `🧠 ... กำลังคิด...` ในแชต

- [ ] **Step 3: เกณฑ์ 2 — UI ไม่ค้าง + auto-chat ใช้สมองจริง**

ระหว่างรอคำตอบ: เลื่อนเมาส์ เปิด panel อื่น ๆ — Expected: ตัวละครเดินต่อ ไม่ freeze
รอ ~3-5 นาทีสังเกตแชต: agent ทักกันเองด้วยสมองจริง (ไม่ใช่คำ gemma สั้น ๆ แบบเดิม)

- [ ] **Step 4: เกณฑ์ 3 — ไม่แตะไฟล์จริง**

Run (workdir my-animation-office): `git status --porcelain`
Expected: มีแค่ไฟล์ที่แก้ตามแผน + untracked `packages/server/workspace/` (อยู่ใน .gitignore แล้ว — ถ้า gitignore ทำงาน `workspace/` จะไม่ขึ้นในรายการเลย) — **ห้าม**มีไฟล์อื่นนอก `packages/server/workspace/` ถูกสร้าง/แก้
ตรวจเพิ่ม: ใน `packages/server/workspace/agents/director/` ต้องไม่มีไฟล์ใหม่ถูกเขียนโดย agent (นอกจาก `opencode.json` ที่เราสร้าง)

- [ ] **Step 5: เกณฑ์ 4 — สมองล่ม → error ในแชต ไม่ crash**

1. Chain ล่มทั้งสาย: แก้ `brains.json` ชั่วคราวให้ `texturer` เป็น `[{"driver":"gemini"}]` (gemini stub = healthCheck false เสมอ) → restart server → ส่งข้อความถึง เท็กซ์เจอร์ → Expected: เห็น `⚠️ ...` ในแชต (ไม่ใช่เงียบ, server ไม่ตาย)
2. คืน `brains.json` เป็นค่าเดิม + restart
3. Fallback ทำงาน: แก้ชั่วคราวให้สายของ `animator` เริ่มด้วย `{"driver":"gemini"}` → ส่งข้อความ → Expected: คำตอบจาก opencode ตัวถัดไปในสาย (ข้าม gemini)

- [ ] **Step 6: เกณฑ์ 5 — UI ไทย + ทีมครบ + ฟีเจอร์เดิม**

- ตรวจด้วยตา: header ไทย, 5 บทบาท, dropdown 5 ตัวเลือก, ป้ายสถานะกำลังคิด
- กด scenario/chaos ใน ViralControlPanel → Expected: ทำงานตามเดิม (ไม่มีปุ่มจ้างให้เห็น — ถูกถอดแล้ว)
- TaskBoard: มอบงานให้ `director` → ขึ้น "📋 มอบงาน ... แล้ว"

- [ ] **Step 7: ถ้าเจอ bug → แก้ + commit ทีละจุด**

```bash
git add -A
git commit -m "fix: <คำอธิบายสั้น ๆ>"
```

- [ ] **Step 8: สรุปผลให้ human partner**

รายงานว่าเกณฑ์ไหนผ่าน/ไม่ผ่าน + สิ่งที่เหลือ (ถ้ามี)

---

## Self-review notes (บันทึกผู้เขียน)

- Spec coverage: goals 1-8 → Task 1 (repo), 2-5 (สมอง), 7+9 (สั่งงาน/ลำดับ), 6+10 (retheme), 8 (sandbox/ไม่แตะไฟล์), 11 (fallback/สถานะ/เกณฑ์) — ครบ; non-goals ไม่มี task แตะ
- CLI fixtures มาจาก output จริงที่ capture บนเครื่องนี้ (2026-11-12): claude 2.1.314, opencode 1.19.4 — ถ้า CLI อัปเดตรูป output ให้แก้ fixture ตาม
- ข้อจำกัดที่ทราบ: ไม่มี unit test ให้ OfficeRoom โดยตรง (colyseus room) — ความเสี่ยงของ lane/refactor ถูกย้ายไป test `UserLane` (Task 7) + e2e (Task 11) แล้ว
