@echo off
REM tunnel-watchdog.bat - auto-restart trycloudflare tunnel if it drops
REM Usage: scripts\deploy\tunnel-watchdog.bat
REM Logs to %TEMP%\tunnel-watchdog.log
REM Stop: Ctrl+C or close the window

set LOG=%TEMP%\tunnel-watchdog.log
set CF="C:\Program Files (x86)\cloudflared\cloudflared.exe"
set SERVER=http://localhost:3000

echo [%date% %time%] Watchdog started >> %LOG%

:loop
echo [%date% %time%] Starting cloudflared tunnel... >> %LOG%
%CF% tunnel --url %SERVER% >> %LOG% 2>&1
echo [%date% %time%] Tunnel exited (code %errorlevel%), restarting in 5s... >> %LOG%
timeout /t 5 /nobreak >nul
goto loop