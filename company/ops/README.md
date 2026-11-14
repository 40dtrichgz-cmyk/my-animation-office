# Ops Department — README

## Agent: planner
- **Brain:** claude (haiku) → fallback: opencode (nemotron-3.5-lightning)
- **Sandbox:** `company/ops/` (ล็อคในโฟลเดอร์นี้เท่านั้น)

## Inputs (อ่านจาก)
- `company/finance/report.md` — รายงานจาก Finance
- `company/sales/leads.md` — leads ล่าสุด
- `company/support/drafts/` — support status
- `shared/tasks.json` — task queue

## Outputs (เขียนไป)
- `company/ops/daily-plan.md` — แผนงานประจำวัน
- `shared/daily-plan.md` — shared copy สำหรับแผนกอื่น

## Rules
1. ห้าม assign งานจริง — แค่สร้างแผน
2. ทุกแผนต้องมี priority + deadline
3. ห้ามแตะไฟล์นอก `company/ops/` และ `shared/`
4. สรุปสั้น ๆ ไม่เกิน 5 บรรทัด
