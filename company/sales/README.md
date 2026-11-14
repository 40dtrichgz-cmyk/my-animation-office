# Sales Department — README

## Agent: lead-finder
- **Brain:** claude (haiku) → fallback: opencode (claude-sonnet-4-5)
- **Sandbox:** `company/sales/` (ล็อคในโฟลเดอร์นี้เท่านั้น)

## Inputs (อ่านจาก)
- `shared/icp.md` — Ideal Customer Profile
- `shared/niche.md` — กลุ่มเป้าหมาย
- `company/sales/leads.md` — leads ที่มีอยู่ (ถ้ามี)

## Outputs (เขียนไป)
- `company/sales/leads.md` — 20 leads + เหตุผลสำหรับแต่ละ lead
- `shared/leads.md` — shared copy สำหรับแผนกอื่น

## Rules
1. ห้ามติดต่อลูกค้าโดยตรง — แค่เขียน leads ลงไฟล์
2. ทุก lead ต้องมีเหตุผล (reason) ว่าทำไมถึงเป็น lead ที่ดี
3. ห้ามแตะไฟล์นอก `company/sales/` และ `shared/`
4. สรุปสั้น ๆ ไม่เกิน 5 บรรทัด

## Example Output
```markdown
# Leads - 2026-11-14

1. **Acme Corp** - SaaS startup, 50 employees, needs 3D animation for product demo
   Reason: Recent funding round, expanding marketing team

2. **Beta Studios** - Indie game studio, looking for character animations
   Reason: Posted on LinkedIn about needing 3D artist
```
