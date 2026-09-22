@echo off
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0AMRTF-Desk.bat"
exit /b 0
