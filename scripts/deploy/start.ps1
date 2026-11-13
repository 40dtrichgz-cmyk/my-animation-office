# start.ps1 - run AnimationOffice (backend + Cloudflare Tunnel) on this machine
# usage: powershell -File scripts/deploy/start.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

# 1) build if needed
if (-not (Test-Path "packages/server/dist/index.js")) {
    Write-Host "[deploy] building server..."
    npm run build --workspace=@agent-office/server
}
if (-not (Test-Path "packages/ui/dist/index.html")) {
    Write-Host "[deploy] building ui..."
    npm run build --workspace=@agent-office/ui
}

# 2) stop stale processes
Get-Process node -ErrorAction SilentlyContinue |
    Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -like "*dist/index.js*" } |
    ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# 3) start server
Write-Host "[deploy] starting server on :3000 ..."
$npm = "npm.cmd"
$npmPath = "C:\Program Files\nodejs\npm.cmd"
if (Test-Path $npmPath) { $npm = $npmPath }
$serverProc = Start-Process -FilePath $npm -ArgumentList "run","start","--workspace=@agent-office/server" -WorkingDirectory $root -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 6

# 4) start cloudflared tunnel
Write-Host "[deploy] starting Cloudflare Tunnel ..."
$tunnelLog = Join-Path $env:TEMP "animation-office-tunnel.log"
$tunnelErr = Join-Path $env:TEMP "animation-office-tunnel.err"
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }
if (Test-Path $tunnelErr) { Remove-Item $tunnelErr -Force }
# resolve cloudflared binary (winget installs to Program Files (x86) by default)
$cf = "cloudflared"
$cfPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (Test-Path $cfPath) { $cf = $cfPath }
$tunnelProc = Start-Process -FilePath $cf -ArgumentList "tunnel","--url","http://localhost:3000" -PassThru -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr -WindowStyle Hidden

# 5) wait for URL
$url = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $content = ""
    if (Test-Path $tunnelLog) { $content += (Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path $tunnelErr) { $content += (Get-Content $tunnelErr -Raw -ErrorAction SilentlyContinue) }
    if ($content -match "https://[a-z0-9-]+\.trycloudflare\.com") {
        $url = $Matches[0]
        break
    }
}

if ($null -ne $url) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  AnimationOffice is live!" -ForegroundColor Green
    Write-Host "  Public URL: $url" -ForegroundColor Green
    Write-Host "  Local:      http://localhost:3000" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press Ctrl+C to stop (server + tunnel will be closed together)"
} else {
    Write-Host "[deploy] tunnel URL not found - check $tunnelLog" -ForegroundColor Red
}

# 6) wait until Ctrl+C
try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    Write-Host "[deploy] shutting down..."
    if ($tunnelProc -and -not $tunnelProc.HasExited) { Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue }
    if ($serverProc -and -not $serverProc.HasExited) { Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue }
}
