@echo off
REM Doble clic aqui para iniciar el PANEL WEB de administracion.
REM Abre http://localhost:3000. Dejala abierta mientras lo usas.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-web.ps1"
echo.
echo El panel se detuvo. Podes cerrar esta ventana.
pause
