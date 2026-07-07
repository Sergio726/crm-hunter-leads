# Lanzador de Metro para CRM Lite Mobile
# Detecta la IP de la red WiFi, activa modo offline (evita el crash de arranque de Expo)
# y levanta el servidor para probar la app en el celular con Expo Go.

Set-Location -Path (Join-Path $PSScriptRoot 'mobile')

# Detectar la IP de la WiFi automaticamente (funciona aunque la red cambie de rango).
# 1) Preferir el adaptador Wi-Fi. 2) Si no, cualquier IP privada real (evitando adaptadores virtuales).
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.InterfaceAlias -like 'Wi-Fi*' -and ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*') } |
       Select-Object -First 1).IPAddress
if (-not $ip) {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
         Where-Object {
           ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*') -and
           $_.InterfaceAlias -notlike '*vEthernet*' -and
           $_.InterfaceAlias -notlike '*Default Switch*' -and
           $_.InterfaceAlias -notlike '*WSL*'
         } |
         Select-Object -First 1).IPAddress
}
if (-not $ip) { $ip = '127.0.0.1' }

$env:EXPO_OFFLINE = '1'
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $ip

Write-Host ""
Write-Host "  Iniciando el servidor de la app en $ip ..." -ForegroundColor Green
Write-Host "  Deja esta ventana ABIERTA mientras usas la app." -ForegroundColor Yellow
Write-Host "  Para apagarlo: cerra esta ventana o presiona Ctrl+C." -ForegroundColor Yellow
Write-Host ""

npx expo start --host lan
