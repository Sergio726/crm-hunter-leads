# Lanzador del panel web (Next.js) de CRM Lite.
# Levanta el panel en http://localhost:3000. Deja la ventana abierta mientras lo uses.

Set-Location -Path (Join-Path $PSScriptRoot 'web')

Write-Host ""
Write-Host "  Iniciando el panel web en http://localhost:3000 ..." -ForegroundColor Green
Write-Host "  Cuando diga 'Ready', abri esa direccion en el navegador." -ForegroundColor Cyan
Write-Host "  Deja esta ventana ABIERTA mientras lo uses (Ctrl+C para apagar)." -ForegroundColor Yellow
Write-Host ""

npm run dev
