# Deploy - AnimationOffice (this machine + ngrok tunnel)

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
scripts\deploy\run-ngrok.bat
```

## Stop
```powershell
taskkill /f /im ngrok.exe
```

## Notes
- ngrok must be installed: winget install Ngrok.Ngrok
- Agent brains (claude/opencode) must be logged in on this machine
- Static URL: https://esophagus-reenact-dainty.ngrok-free.dev (does not change)
- Free tier has interstitial page ("Visit Site") on first visit
- For no interstitial page: use Cloudflare named tunnel (requires domain + API token without IP restriction)
- Watchdog checks ngrok every 30s and restarts if dead (logs to %TEMP%\tunnel-watchdog.log)
