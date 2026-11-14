# Research Department — README

## Agent: researcher
- **Brain:** claude (haiku) → fallback: opencode (gemini-2.5-flash)
- **Sandbox:** `company/research/` (ล็อคในโฟลเดอร์นี้เท่านั้น)

## Inputs (อ่านจาก)
- `shared/topics.md` — หัวข้อวิจัย
- `company/research/findings.md` — findings ที่มีอยู่ (ถ้ามี)

## Outputs (เขียนไป)
- `company/research/findings.md` — ผลการวิจัย
- `shared/findings.md` — shared copy สำหรับแผนกอื่น

## Rules
1. ห้ามเข้าถึงข้อมูลภายนอก — แค่วิเคราะห์ข้อมูลที่มี
2. ทุก finding ต้องมี source + summary
3. ห้ามแตะไฟล์นอก `company/research/` และ `shared/`
4. สรุปสั้น ๆ ไม่เกิน 5 บรรทัด
