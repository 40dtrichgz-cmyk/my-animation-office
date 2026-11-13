# Deploy — AnimationOffice (เครื่องนี้ + Cloudflare Tunnel)

## เริ่มใช้งาน
```powershell
powershell -File scripts/deploy/start.ps1
```
สคริปต์จะ build (ถ้ายังไม่ build), รัน server บน :3000, เปิด Cloudflare Tunnel, แล้วแสดง URL สาธารณะ (trycloudflare.com)

## หยุด
กด Ctrl+C ในหน้าต่างที่รัน start.ps1 — server + tunnel จะถูกปิดพร้อมกัน

## หมายเหตุ
- ต้องติดตั้ง cloudflared แล้ว (`winget install Cloudflare.cloudflared`)
- สมองของ agent (claude / opencode) ต้อง login อยู่บนเครื่องนี้
- URL ของ trycloudflare เปลี่ยนทุกครั้งที่รันใหม่ (ไม่คงที่)
