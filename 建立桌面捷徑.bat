@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "setup-shortcut.ps1"
exit /b 0
