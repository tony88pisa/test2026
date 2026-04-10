@echo off
echo.
echo Avvio della procedura di riparazione...
echo Utilizzo il Powershell di sistema dal percorso assoluto.
echo.

C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File "%~dp0fix_env.ps1"

echo.
pause
