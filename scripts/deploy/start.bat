@echo off
cd /d "%~dp0..\.."
echo [deploy] building server if needed...
if not exist "packages\server\dist\index.js" npm run build --workspace=@agent-office/server
echo [deploy] building ui if needed...
if not exist "packages\ui\dist\index.html" npm run build --workspace=@agent-office/ui
echo [deploy] starting server on :3000 ...
start /b "" cmd /c "npm run start --workspace=@agent-office/server"
timeout /t 6 /nobreak >nul
echo [deploy] starting Cloudflare Tunnel ...
start /b "" cmd /c "scripts\deploy\run-tunnel.bat"
echo [deploy] waiting for tunnel URL...
for /l %%i in (1,1,30) do (
    timeout /t 1 /nobreak >nul
    findstr /i "trycloudflare" "%TEMP%\cf-tunnel.log" >nul 2>&1
    if not errorlevel 1 (
        echo.
        echo ==========================================
        echo   AnimationOffice is live!
        for /f "tokens=*" %%a in ('findstr /i "trycloudflare" "%TEMP%\cf-tunnel.log"') do echo   %%a
        echo   Local: http://localhost:3000
        echo ==========================================
        goto :done
    )
)
echo [deploy] tunnel URL not found - check %TEMP%\cf-tunnel.log
:done
pause