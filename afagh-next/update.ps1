#Requires -Version 5.1
# میانبر: اجرای update.ps1 اصلی که در ریشهٔ مخزن است (از هر جا که صدا زده شود)
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'update.ps1') @args
