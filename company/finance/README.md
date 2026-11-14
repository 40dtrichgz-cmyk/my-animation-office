# Finance Department — README

## Agent: analyst
- **Brain:** opencode (nemotron-3.5-lightning) → fallback: claude (haiku)
- **Sandbox:** `company/finance/` (ล็อคในโฟลเดอร์นี้เท่านั้น)

## Inputs (อ่านจาก)
- `shared/leads.md` — leads จาก Sales
- `company/sales/leads.md` — leads ล่าสุด
- `shared/posts.md` — posts จาก Marketing
- `company/support/drafts/` — support status

## Outputs (เขียนไป)
- `company/finance/report.md` — รายงานสรุป
- `shared/report.md` — shared copy สำหรับแผนกอื่น

## Rules
1. ห้ามเข้าถึงข้อมูลการเงินจริง — แค่วิเคราะห์ข้อมูลที่มี
2. ทุกรายงานต้องมีตัวเลข + สรุป
3. ห้ามแตะไฟล์นอก `company/finance/` และ `shared/`
4. สรุปสั้น ๆ ไม่เกิน 5 บรรทัด
