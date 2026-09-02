@echo off
rem بروز کردن آفاق از گیت + بیلد + اجرا — بدون گیرِ Execution Policy
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*
