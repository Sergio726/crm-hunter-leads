@echo off
REM Doble clic aqui para iniciar el servidor de la app CRM Lite.
REM Abre una ventana con Metro (el servidor). Dejala abierta mientras probas la app.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-app.ps1"
echo.
echo El servidor se detuvo. Podes cerrar esta ventana.
pause
