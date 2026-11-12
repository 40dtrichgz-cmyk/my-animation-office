# Design: AnimationOffice — ออฟฟิศทีม 3D Animation ขับด้วย AI จริง (v1)

วันที่: 2026-11-12
สถานะ: ผ่าน builder check + ตอบคำถามครบแล้ว — รอ human partner อนุมัติ

## 1. Intent / Why

ผู้ใช้ต้องการ "ออฟฟิศของตัวเอง" ที่ agent แต่ละตัวเป็น **AI จริง** ไม่ใช่โมเดล local ตัวเดียว — ผูก Claude Code / OpenCode / Gemini เข้าเป็นสมองของแต่ละ agent เพื่อสั่งงานได้จริง และจัดทีมเป็น **ทีม 3D animation** ตามที่ตั้งใจไว้

แผนนี้ครอบคลุม **v1 เท่านั้น**: ให้ทำงาน/สั่งงานได้ก่อน (สมองจริง + ทีมจริง) — ส่วน v2 (ผูก repo จริงให้เขียนโค้ดจริง) และไมล์ 3 (ภาพ 3D) จะแยก plan ใหม่ตามที่ตกลงไว้

## 2. Goals (v1)

1. สร้าง repo ใหม่ของผู้ใช้เอง (clone จาก Agent-office-thai) ไว้คนละโฟลเดอร์
2. สมองจริงต่อ agent — แต่ละ agent เรียก CLI ของ AI เป็น subprocess (`claude -p`, `opencode run`, และ gemini เมื่อติดตั้ง)
3. สั่งงานจาก UI ได้จริง: พิมพ์งานในแชต → agent ที่รับผิดชอบตอบด้วยสมองจริง (ภายในไม่กี่นาที)
4. Agent คุยกันเองอัตโนมัติด้วยสมองจริง (ใช้กลไก auto-chat เดิม เปลี่ยนแหล่งคิด)
5. Retheme เป็นทีม 5 บทบาท 3D animation (ชื่อ บทบาท system prompt ป้าย UI ภาษาไทย)
6. v1 ไม่แตะไฟล์จริง — แชต/วางแผนล้วน ภายใต้ sandbox
7. Brain ตัวใดล่มไม่เอาทั้งระบบ — มี fallback และข้อความ error แสดงในแชต
8. UI ภาษาไทยเดิม + แสดงสถานะ "กำลังคิด" ชัดเจนระหว่างสมองทำงานนาน

## 3. Non-goals / Anti-goals (v1)

- ไม่ให้ agent แก้ไขไฟล์/เขียนโค้ดจริง (ของ v2)
- ไม่ทำภาพ/ฉาก 3D (ของไมล์ 3)
- ไม่ย้าย UI ออกจากภาษาไทย
- ไม่มีระบบ login/ผู้ใช้หลายคน
- ไม่ optimize ค่าใช้จ่ายขั้นสูง — ใช้จังหวะ (pacing) คุมพอ

## 4. Constraints (ผลสำรวจบนเครื่องนี้ 2026-11-12)

- Windows, Node v24.22.0, npm 11.19.1
- **`claude` 2.1.314** ติดตั้งและ login แล้ว — ทดสอบ `claude -p` ตอบ `OK` จริง
- **`opencode` 1.19.4** ติดตั้ง — ทดสอบผ่านเมื่อชี้ `XDG_DATA_HOME` ไป data dir แยก เพราะชน DB กับ session ที่กำลังรันอยู่ (ข้อผิดพลาด `Database is not empty and no session table`) — โมเดลจาก llmapi proxy (`127.0.0.1:31415`) ทำงานอยู่
- **`gemini` CLI ยังไม่ติดตั้ง** — ใช้โมเดล `gemini-2.5-flash` ผ่าน opencode แทนได้ก่อน; ติดตั้งภายหลังได้ (ต้องให้ผู้ใช้ login Google เอง)
- LM Studio (สมองเดิมของ Agent-office-thai) ไม่ได้รัน — เก็บเป็น fallback เฉพาะกรณีเปิดอยู่
- spawn บน Windows: npm global ติดตั้งเป็น `.cmd`/`.ps1` — ต้อง resolve path เองหรือใช้ shell spawn; ส่ง prompt ทาง **stdin** เพื่อเลี่ยงปัญหา quoting/ความยาว argv
- จังหวะเดิม (`thinkCooldownMs=25000`, `maxConcurrentThinks=1`) เหมาะกับ local model เร็ว — กับ coding CLI ที่ใช้เวลาเป็นนาทีต้อง redesign ใหม่

## 5. Approaches (พิจารณา 3 ทาง)

### A: Adapter แยกตัวต่อ CLI (ClaudeAdapter, OpenCodeAdapter, GeminiAdapter แยกกัน)
- ข้อดี: แยกชัดเจน อ่านง่าย เพิ่มทีละตัวไม่กระทบกัน
- ข้อเสีย: logic spawn/timeout/parse/fallback ซ้ำกันทุกตัว

### B: `CliBrainAdapter` ตัวเดียว + `CliDriver` ต่อผู้ให้บริการ — **เลือกทางนี้**
- Adapter กลางจัดการ spawn / timeout / concurrency / fallback ทั้งหมด; Driver แต่ละตัวมีหน้าที่แค่ build args และ parse output (ประมาณ 50 บรรทัด/ตัว)
- ข้อดี: ไม่ซ้ำ, เพิ่ม CLI ใหม่ถูก, ตรง seam เดิมของ core (`InferenceAdapter` ที่ `Agent.think()` เรียกอยู่แล้ว) ไม่ต้องแตะ core
- ข้อเสีย: ต้องออกแบบ interface ให้ดีตั้งแต่แรก (ยอมรับได้ — ขอบเขตเล็ก)

### C: ไม่ใช้ adapter — orchestrate CLIs ใน OfficeRoom โดยตรง
- ข้อดี: ไวสุดในการทำครั้งแรก
- ข้อเสีย: ขัดกับสถาปัตยกรรม core ที่ออกแบบ seam ไว้ แก้ยากและทดสอบยากภายหลัง

**สรุป: เลือก B** เพราะ core มี seam อยู่แล้ว และ v2 (เปิดให้แก้ไฟล์จริง) คือการเพิ่ม driver mode/cwd เท่านั้น

## 6. Design

### 6.1 ที่อยู่และชื่อโปรเจกต์ (ข้อเสนอของผู้เขียน — แก้ได้)

- Clone ไปที่ `C:\Users\Windows10\my-animation-office` ชื่อแสดง **AnimationOffice**

### 6.2 ทีม 5 บทบาทและสมอง (ข้อเสนอ — เปลี่ยนได้ตลอดผ่าน config)

| Agent | บทบาท (ไทย) | สมอง (driver) |
|---|---|---|
| ผู้กำกับ | กำกับงาน มอบหมาย สรุป | claude (`claude -p`) |
| โมเดลเลอร์ | สร้างโมเดล 3D | opencode (`llmapi/claude-sonnet-4-5`) |
| ริกเกอร์ | โครงกระดูก ระบบrig | opencode (`llmapi/nemotron-3.5-lightning`) |
| แอนิเมเตอร์ | เคลื่อนไหว จังหวะ | claude (`claude -p`) |
| เท็กซ์เจอร์ | สี วัสดุ UV | opencode (`llmapi/gemini-2.5-flash`) — "gemini" ผ่าน opencode |

- ผูกผ่านไฟล์ `brains.json` (agentId → **chain** ของ { driver, model } เรียงตามลำดับ) สลับสมอง/โมเดลได้โดยไม่แก้โค้ด
- **Fallback = cross-provider chain** (call ของผู้เขียน): แต่ละ agent ระบุสายแบบ explicitly เช่น claude-primary → opencode → error, opencode-primary → claude → error — กัน "fallback หาตัวเอง"
  - ลองถัดไปทันทีเมื่อ call ล้ม (rate limit/timeout/exit != 0) สำหรับ call นั้น ๆ
  - Health check ตอน start server: ตัวไหนไม่พร้อม ข้ามไปตัวถัดไปใน chain ทันที
  - LM Studio/ollama ใส่ใน chain ได้เฉพาะผ่าน health check ตอน start (ตอนสำรวจ LM Studio ไม่ได้รัน)
  - ท้ายสายสุด = ข้อความ error แสดงในแชต (ไม่เงียบ)
- ถ้าติดตั้ง gemini CLI ภายหลัง เปลี่ยน driver เป็น `gemini` ได้ทันที

### 6.3 Sandbox (v1 แชตเท่านั้น)

- cwd ของ subprocess = `workspace/agents/<id>/` แยกต่อ agent (โฟลเดอร์ว่าง)
- ปิดเครื่องมือเขียน/รัน: claude — ปิด tools (รายละเอียด flag ต้อง verify กับเวอร์ชัน 2.1.314 ตอน implement); opencode — permission deny สำหรับ edit/write/bash
- v2 ค่อยสลับ cwd ไป repo จริงและเปิด tools — คนละ driver mode ไม่แตะ core

### 6.4 Pacing redesign (สำคัญ — คิดเป็นนาทีแทน 20 วิ)

- think ทำงาน **async**: agent เดิน/idle ต่อไประหว่างรอผล ไม่บล็อก simulation; แสดงสถานะ "🧠 กำลังคิด..." บนหัว agent + ในแชต
- `thinkTimeoutMs = 180000` (3 นาที/รอบ)
- `maxConcurrentThinks = 2` (คนละ provider ไม่แย่งกัน)
- `thinkCooldownMs = 60000` หลังคิดเสร็จ, `conversationCooldownMs = 300000`, `talkChance = 0.3`
- server restart ระหว่างมี think ค้าง = เสียงานค้าง — ยอมรับได้ใน v1

### 6.5 กระแสสั่งงาน (user command flow)

- **ผู้รับข้อความ = dropdown เลือกข้างช่องพิมพ์** (ตกลงโดยผู้ใช้): ผู้ใช้เลือกได้ว่าส่งถึง agent ตัวไหน (รวมตัวเลือก "ทั้งทีม" ถ้าส่งพร้อมกันทุกตัว — ถ้าซับซ้อนเกินขอตัดเหลือเลือกทีละตัวตอน plan) — แทนที่ routing hardcode เดิมที่ชี้ไป `general`
- แชต UI เดิม: ข้อความผู้ใช้ถูกส่งเป็น prompt ให้สมองของ agent ที่เลือก (แนบ context: บทบาท + ประวัติสนทนาล่าสุด) → คำตอบปรากฏในแชต + bubble
- **ลำดับความสำคัญ (call ของผู้เขียน): ข้อความผู้ใช้มาก่อนเสมอ** — lane แยกจาก auto-think: ข้อความผู้ใช้เข้าคิวทันที รันขนานกับ think ค้างได้ (นับรวม maxConcurrentThinks) ไม่ต้องรอ cooldown — auto-think ไม่แซงข้อความผู้ใช้เด็ดขาด
- กระดานงาน "มอบหมายงาน": agent ที่รับผิดชอบคิดด้วยสมองจริงเช่นกัน (ผ่าน lane เดียวกับ auto-think ไม่ด่วนเท่าข้อความผู้ใช้)

### 6.6 เครื่องมือฝั่งเซิร์ฟเวอร์ใน v1 (call ของผู้เขียน)

- **ปิด `code_execute` และ `read_file`** ของ `ToolExecutor` ใน v1 — สองตัวนี้รัน `node -e`/อ่านไฟล์ด้วยสิทธิ์เต็ม ขัดกับ success criterion 3 (ไม่แตะไฟล์จริง)
- เก็บ `create_task` (state ใน memory ล้วน ปลอดภัย) และ `web_search` (มี key ค่อยทำงาน ไม่มี key = ข้าม ไม่ crash)
- v2 ค่อยเปิดตัวที่ปิดไว้ พร้อมจำกัดสิทธิ์ตาม sandbox ใหม่

### 6.7 ฟีเจอร์เสริมเดิม (ตกลงโดยผู้ใช้)

- **เก็บ scenario / chaos ไว้** ตามเดิม (ปรับป้ายไทย/ธีมทีมถ้าต้อง)
- **ซ่อนปุ่ม "จ้าง" (hire) ใน v1** — ยังไม่ต่อสมองให้ agent ใหม่ เปิดอีกทีใน v2 พร้อม brains.json template

### 6.8 data dir ของ opencode (call ของผู้เขียน)

- ใช้ **data dir แชร์คงที่ใบเดียว** เช่น `workspace/opencode-data` (ชี้ด้วย `XDG_DATA_HOME` ต่อ subprocess) — dir ว่างใหม่ทำงานได้จริงในการทดสอบ
- ตอน implement ต้อง **ทดสอบ spawn พร้อมกัน 2 process** บน dir เดียวกัน ถ้าเจอ DB lock ให้ถอยไปแยก dir ต่อ agent

### 6.9 โครงสร้างโค้ดที่เพิ่ม/แก้

```
packages/adapters/src/cli/
  CliBrainAdapter.ts        # spawn, timeout, concurrency, fallback (ตาม B)
  drivers/claude.ts         # claude -p --output-format json, prompt ทาง stdin
  drivers/opencode.ts       # opencode run -m provider/model --format json
                            #   + XDG_DATA_HOME ชี้ data dir แชร์คงที่ (ตาม 6.8)
  drivers/gemini.ts         # gemini -p (stub พร้อมใช้เมื่อติดตั้ง CLI)
packages/server/src/
  brains.json               # mapping agent → brain
  rooms/OfficeRoom.ts       # เลือก adapter ต่อ agent + pacing ใหม่ + async think
  (แก้) agent config/system prompts → ทีม 3D animation ภาษาไทย
packages/ui/               # แก้ป้าย/ชื่อทีม + สถานะกำลังคิด (ถ้าของเดิมไม่พอ)
```

## 7. Risks

- **Flag/JSON schema ของ CLI ต่างกันตามเวอร์ชัน** → driver แต่ละตัวต้องมี fixture test
- **โควตา subscription** (claude -p) → pacing คุม + ข้อความ error ชัดเมื่อโดน rate limit
- **Windows quoting** → args array + stdin, shell:true เฉพาะที่จำเป็น
- **llmapi proxy (31415) ต้องรันอยู่** → health check ก่อน start; ไม่พร้อม → fallback ollama (ถ้ามี) → ข้อความ error ในแชต

## 8. Success criteria (v1)

1. พิมพ์สั่งในแชต (เลือกผู้รับจาก dropdown ข้างช่องพิมพ์) → สมองจริงตอบภายใน ≤ 3 นาที
2. Auto-chat ระหว่าง agent ใช้สมองจริง โดย UI ไม่ค้างระหว่างรอ
3. ตรวจสอบได้ว่าไม่มีไฟล์นอก sandbox ถูกแก้ไข
4. ปิด/ขัดสมองใดตัวหนึ่ง → ระบบยังรันต่อ + เห็นข้อความ error ในแชต
5. UI ไทย + ทีม 5 บทบาท 3D animation + สถานะกำลังคิดแสดงชัด

## 9. หลังอนุมัติ

- เขียน implementation plan (writing-plans) → clone repo → ลงมือ
- (ทางเลือก) ติดตั้ง gemini CLI — ต้องให้ผู้ใช้ login Google ด้วยตัวเอง
- v2 (repo จริง) และไมล์ 3 (ภาพ 3D) = plan ใหม่ แยกจากนี้
