# Marketing Department — README

## Agent: post-writer
- **Brain:** opencode (claude-sonnet-4-5) → fallback: claude (haiku)
- **Sandbox:** `company/marketing/` (ล็อคในโฟลเดอร์นี้เท่านั้น)

## Inputs (อ่านจาก)
- `shared/leads.md` — leads จาก Sales
- `company/marketing/posts.md` — posts ที่มีอยู่ (ถ้ามี)
- `company/sales/leads.md` — leads ล่าสุด

## Outputs (เขียนไป)
- `company/marketing/posts.md` — posts พร้อม publish
- `shared/posts.md` — shared copy สำหรับแผนกอื่น

## Rules
1. ห้าม post จริง — แค่เขียน draft ลงไฟล์
2. ทุก post ต้องมี hook, body, CTA
3. ห้ามแตะไฟล์นอก `company/marketing/` และ `shared/`
4. สรุปสั้น ๆ ไม่เกิน 5 บรรทัด
