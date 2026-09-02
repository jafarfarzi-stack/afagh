@echo off
rem میانبر: اجرای update.ps1 ریشه با دور زدن Execution Policy
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\update.ps1" %*
