@echo off
REM setup-cron.bat — ตั้งค่า Windows Task Scheduler สำหรับ cron trigger 8:00 ทุกเช้า
REM ใช้งาน: scripts\deploy\setup-cron.bat

set ROOT=%~dp0..\..
set SCRIPT=%ROOT%\scripts\cron-trigger.js

echo Creating scheduled task "AnimationOffice-Morning"...
schtasks /create /tn "AnimationOffice-Morning" /tr "node %SCRIPT%" /sc daily /st 08:00 /f

if %errorlevel% equ 0 (
    echo Task created successfully!
    echo Runs daily at 08:00
    echo Script: %SCRIPT%
    echo To remove: schtasks /delete /tn "AnimationOffice-Morning" /f
) else (
    echo Failed to create task. Try running as Administrator.
)
pause