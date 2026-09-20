@echo off
cd /d "%~dp0"
start "" "bin\node.exe" server.mjs
exit /b 0
