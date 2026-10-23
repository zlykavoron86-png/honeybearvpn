@echo off
chcp 65001 >nul
title HoneyBear VPN Launcher
cd /d "%~dp0"
echo ==========================================
echo       🍯 HoneyBear VPN & Proxy 🍯
echo ==========================================
echo Запуск HoneyBearVPN от имени администратора...
if exist "release\win-unpacked\HoneyBearVPN.exe" (
    powershell -NoProfile -Command "Start-Process -FilePath '%~dp0release\win-unpacked\HoneyBearVPN.exe' -Verb RunAs"
) else if exist "HoneyBearVPN.exe" (
    powershell -NoProfile -Command "Start-Process -FilePath '%~dp0HoneyBearVPN.exe' -Verb RunAs"
) else if exist "dist\win-unpacked\HoneyBearVPN.exe" (
    powershell -NoProfile -Command "Start-Process -FilePath '%~dp0dist\win-unpacked\HoneyBearVPN.exe' -Verb RunAs"
) else (
    npm.cmd start
)
exit
