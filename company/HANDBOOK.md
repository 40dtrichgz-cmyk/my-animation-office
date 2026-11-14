# HANDBOOK.md — AnimationOffice Company Rules

## Hard Rules (ทุก agent ต้องปฏิบัติตาม)

1. **ห้ามติดต่อลูกค้าโดยตรง** — agent ทำงานในโฟลเดอร์ของตัวเองเท่านั้น ผลลัพธ์เขียนเป็นไฟล์
2. **ทุก output ต้องเป็นไฟล์** — ไม่มีการส่งข้อความโดยตรง ผลลัพธ์เขียนใน output folder
3. **อ่าน handbook ก่อนทำงาน** — ทุก agent ต้องอ่าน HANDBOOK.md ก่อนเริ่มทำงาน
4. **อ่าน README ของแผนก** — แต่ละ agent ต้องอ่าน README.md ของแผนกตัวเองเพื่อรู้ inputs/outputs
5. **ไม่แตะไฟล์นอกโฟลเดอร์** — agent ถูกล็อคในโฟลเดอร์ของตัวเอง (sandbox)
6. **สรุปสั้น ๆ** — ทุก output ต้องมี summary ไม่เกิน 5 บรรทัด
7. **ภาษาไทย** — ทุกข้อความที่สื่อสารกับผู้ใช้ต้องเป็นภาษาไทย
8. **ไม่แตะไฟล์จริง** — ห้าม write/delete/modify ไฟล์นอก sandbox

## Company Overview

AnimationOffice เป็นบริษัท 3D animation ที่ขับด้วย AI จริง
- 6 แผนก: Sales, Marketing, Support, Finance, Ops, Research
- ทุกแผนกมี README ระบุ inputs และ outputs ชัดเจน
- ทุก agent ถูกล็อคในโฟลเดอร์ของตัวเอง
- ผลลัพธ์ส่งกลับเป็น "short summary" เท่านั้น

## Departments

| แผนก | Agent | Input | Output | Brain |
|------|-------|-------|--------|-------|
| Sales | lead-finder | niche, ICP | leads.md | claude (haiku) |
| Marketing | post-writer | topic brief | posts.md | opencode (claude-sonnet-4-5) |
| Support | inbox | emails | drafts/ | opencode (gemini-2.5-flash) |
| Finance | analyst | sales data | report.md | opencode (nemotron-3.5-lightning) |
| Ops | planner | tasks, report | daily-plan.md | claude (haiku) |
| Research | researcher | topics | findings.md | claude (haiku) |

## Workflow

### เช้า 8:00 (Cron Trigger)
1. inbox: อ่านอีเมลใหม่ → ร่าง reply → เขียน drafts/
2. analyst: อ่านข้อมูลเมื่อวาน → สร้าง report → เขียน finance/report.md
3. planner: อ่าน tasks ค้าง + report → สร้าง daily plan → เขียน ops/daily-plan.md
4. Claude Code: รวบรวม summary → ส่ง Telegram 1 ข้อความ

### การเชื่อมข้อมูล (Data Flow)
```
lead-finder (Sales) → writes leads.md → shared/leads.md
                                          ↓
post-writer (Marketing) ← reads leads.md → writes posts.md
                                          ↓
inbox (Support) ← reads posts.md → drafts replies
                                          ↓
analyst (Finance) ← reads all → writes report.md
                                          ↓
planner (Ops) ← reads report.md → writes daily-plan.md
                                          ↓
researcher (Research) ← reads findings → writes findings.md
                                          ↓
Claude Code: รวบรวม summary → Telegram 1 ข้อความ
```

## MCP Integration
- **Gmail**: อ่านอีเมล, ส่ง follow-up
- **Google Sheets**: บันทึก leads, รายงาน
- **Telegram**: ส่งสรุปเช้า 8:00
- **Make.com**: trigger scenarios (เชื่อม Gmail + Sheets)

## Max Lines: 150
