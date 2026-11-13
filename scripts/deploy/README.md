# Deploy - AnimationOffice (this machine + Cloudflare Tunnel)

## Start
```powershell
powershell -File scripts/deploy/start.bat
```
Or manually:
```powershell
# terminal 1
npm run start --workspace=@agent-office/server
# terminal 2
scripts/deploy/run-tunnel.bat
```
The tunnel URL is printed in the console and saved to %TEMP%\cf-tunnel.log

## Stop
Kill the node (dist/index.js) and cloudflared processes, or close the windows.

## Notes
- cloudflared must be installed: winget install Cloudflare.cloudflared
- Agent brains (claude/opencode) must be logged in on this machine
- The trycloudflare URL changes every run (not persistent) - use a named tunnel for a fixed URL
