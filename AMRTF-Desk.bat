@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AMRTF-Desk 播控艙核心

if exist "%~dp0bin\node.exe" (
    set "NODE_BIN=%~dp0bin\node.exe"
) else (
    set "NODE_BIN=node"
)

:: 使用微軟官方標準 Start-Process 取代已被 Win11 棄用封鎖之 VBScript
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%NODE_BIN%' -ArgumentList 'server.mjs' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
exit /b 0
