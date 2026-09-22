@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AMRTF-Desk 現場啟動診斷儀
echo ========================================================
echo  AMRTF-Desk 現場啟動深度診斷 (Diagnostic Runner)
echo ========================================================
echo.

if exist "%~dp0bin\node.exe" (
    echo [OK] 使用內置官方認證 node.exe 執行診斷...
    "%~dp0bin\node.exe" "%~dp0scripts\diagnose-runner.mjs"
) else (
    echo [WARN] 未找到 bin\node.exe，嘗試呼叫系統 Node.js...
    node "%~dp0scripts\diagnose-runner.mjs"
)

echo.
echo ========================================================
echo  診斷結束。請查看上方訊息或查看 logs\diagnose.log
echo ========================================================
pause
