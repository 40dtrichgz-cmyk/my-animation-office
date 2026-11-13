# Deploy - AnimationOffice (this machine + Cloudflare Tunnel)

## Start (with auto-restart watchdog - recommended)
```powershell
# terminal 1: start server
npm run start --workspace=@agent-office/server

# terminal 2: start tunnel watchdog (auto-restarts if tunnel drops)
scripts\deploy\tunnel-watchdog.bat
```

## Start (simple, one-shot)
```powershell
# terminal 1: start server
npm run start --workspace=@agent-office/server

# terminal 2: start tunnel
scripts\deploy\run-tunnel.bat
```

## Stop
```powershell
taskkill /f /im cloudflared.exe
```

## Notes
- cloudflared must be installed: winget install Cloudflare.cloudflared
- Agent brains (claude/opencode) must be logged in on this machine
- URL changes every time tunnel restarts (trycloudflare.com quick tunnel)
- Current URL is logged to %TEMP%\tunnel-watchdog.log
- Watchdog checks tunnel every 5s and restarts if dead
- For a fixed URL: use ngrok (scripts\deploy\run-ngrok.bat) - URL: https://esophagus-reenact-dainty.ngrok-free.dev
- For no interstitial page + fixed URL: need Cloudflare account + domain + API token (no IP restriction)
