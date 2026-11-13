@echo off
REM tunnel-watchdog.bat - auto-restart ngrok if it dies
REM Usage: scripts\deploy\tunnel-watchdog.bat
REM Runs in background, checks ngrok every 30s, restarts if dead.
REM Stop: kill the cmd process or run: taskkill /f /im cmd.exe (careful!)

set LOG=%TEMP%\tunnel-watchdog.log
set NGROK="C:\Users\Windows10\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
set URL=https://esophagus-reenact-dainty.ngrok-free.dev

echo [%date% %time%] Watchdog started >> %LOG%

:loop
tasklist /FI "IMAGENAME eq ngrok.exe" 2>NUL | find /I "ngrok.exe" >NUL
if errorlevel 1 (
    echo [%date% %time%] ngrok not running, restarting... >> %LOG%
    start /b "" %NGROK% http 3000 --url %URL% >> %LOG% 2>&1
    timeout /t 10 /nobreak >nul
)
timeout /t 30 /nobreak >nul
goto loop