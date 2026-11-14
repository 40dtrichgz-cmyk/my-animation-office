# Support Department — README

## Agent: inbox
- **Brain:** opencode (gemini-2.5-flash) → fallback: claude (haiku)
- **Sandbox:** `company/support/` (ล็อคในโฟลเดอร์นี้เท่านั้น)

## Inputs (อ่านจาก)
- Gmail (via MCP) — อีเมลใหม่
- `company/support/drafts/` — drafts ที่มีอยู่ (ถ้ามี)

## Outputs (เขียนไป)
- `company/support/drafts/` — draft replies สำหรับแต่ละอีเมล
- `shared/support-summary.md` — สรุปสถานะ support

## Rules
1. ห้ามส่งอีเมลจริง — แค่ร่าง reply ลงไฟล์
2. ทุก draft ต้องมี subject, body, tone
3. ห้ามแตะไฟล์นอก `company/support/` และ `shared/`
4. สรุปสั้น ๆ ไม่เกิน 5 บรรทัด
