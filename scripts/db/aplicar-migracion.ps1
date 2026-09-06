<#
.SYNOPSIS
  Aplica un archivo .sql de supabase/migrations contra la base de Hunter Leads.

.DESCRIPTION
  Existe porque hasta ahora la unica via era pegar la migracion en el editor SQL
  del panel, y eso ya fallo: una linea larga se corta al pegar y Postgres
  devuelve "unterminated quoted string" (D42). Aca el archivo viaja entero.

  Corre con ON_ERROR_STOP=1 y dentro de una transaccion: si algo falla, no queda
  la migracion aplicada a medias.

  Usa la misma cadena que los backups (HUNTER_LEADS_DB_URL en web\.env.local) y
  el mismo rodeo por el pooler, porque la conexion directa de Supabase es solo
  IPv6 y Docker no la alcanza (D69).

.EXAMPLE
  .\scripts\db\aplicar-migracion.ps1 -Archivo supabase\migrations\0053_algo.sql
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Archivo,
  [string]$CadenaConexion = $env:HUNTER_LEADS_DB_URL,
  [int]$VersionPg = 17,
  [string]$Region = "ca-central-1",
  # Muestra lo que haria sin escribir nada: corre la migracion y la deshace.
  [switch]$Ensayo
)

$ErrorActionPreference = "Stop"

$raizRepo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Buscar-RepoPrincipal($desde) {
  $comun = & git -C $desde rev-parse --git-common-dir 2>$null
  if ($LASTEXITCODE -eq 0 -and $comun) {
    if (-not [System.IO.Path]::IsPathRooted($comun)) { $comun = Join-Path $desde $comun }
    return (Split-Path -Parent (Resolve-Path $comun).Path)
  }
  return $desde
}
$repoPrincipal = Buscar-RepoPrincipal $raizRepo

function Leer-DeEnvLocal($nombre) {
  $candidatos = @(
    (Join-Path $raizRepo "web\.env.local"),
    (Join-Path $repoPrincipal "web\.env.local")
  )
  foreach ($ruta in $candidatos) {
    if (Test-Path $ruta) {
      foreach ($linea in (Get-Content $ruta)) {
        if ($linea -match "^\s*$nombre\s*=\s*(.+)$") {
          return $Matches[1].Trim().Trim('"').Trim("'")
        }
      }
    }
  }
  return $null
}

if ([string]::IsNullOrWhiteSpace($CadenaConexion)) {
  $CadenaConexion = Leer-DeEnvLocal "HUNTER_LEADS_DB_URL"
}
if ([string]::IsNullOrWhiteSpace($CadenaConexion)) {
  Write-Host "Falta HUNTER_LEADS_DB_URL en web\.env.local." -ForegroundColor Red
  Write-Host "Se copia del panel: Project Settings > Database > Connection string > URI."
  exit 1
}
if ($CadenaConexion -match "\[YOUR-PASSWORD\]|TU_CONTRASENA") {
  Write-Host "La cadena todavia tiene el texto de ejemplo en lugar de la contrasena." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $Archivo)) {
  Write-Host "No existe el archivo: $Archivo" -ForegroundColor Red
  exit 1
}
$Archivo = (Resolve-Path $Archivo).Path
$carpeta = Split-Path -Parent $Archivo
$soloNombre = Split-Path -Leaf $Archivo
$imagen = "postgres:$VersionPg"

docker version --format "{{.Server.Version}}" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker no responde. Abri Docker Desktop y volve a intentar." -ForegroundColor Red
  exit 1
}

Write-Host "Aplicar migracion" -ForegroundColor Cyan
Write-Host "  archivo: $soloNombre"
if ($Ensayo) { Write-Host "  modo:    ENSAYO (se deshace al final, no escribe nada)" -ForegroundColor Yellow }
Write-Host ""

function Probar-Conexion($cadena) {
  docker run --rm -e PGCONN="$cadena" $imagen `
    sh -c "psql `"`$PGCONN`" -Atc 'select 1' > /dev/null 2>&1" | Out-Null
  return ($LASTEXITCODE -eq 0)
}

$candidatos = @([pscustomobject]@{ Nombre = "conexion directa"; Cadena = $CadenaConexion })
if ($CadenaConexion -match '^postgres(ql)?://([^:]+):([^@]+)@db\.([a-z0-9]+)\.supabase\.co:\d+/(.+)$') {
  $clave = $Matches[3]; $ref = $Matches[4]; $baseDatos = $Matches[5]
  foreach ($prefijo in @("aws-0", "aws-1")) {
    $candidatos += [pscustomobject]@{
      Nombre = "pooler $prefijo-$Region"
      Cadena = "postgresql://postgres.${ref}:${clave}@${prefijo}-${Region}.pooler.supabase.com:5432/${baseDatos}"
    }
  }
}

Write-Host "1/2  Buscando por donde se llega a la base..." -NoNewline
$elegida = $null
foreach ($c in $candidatos) {
  if (Probar-Conexion $c.Cadena) { $elegida = $c; break }
}
if (-not $elegida) {
  Write-Host " FALLO" -ForegroundColor Red
  Write-Host "  Revisa la contrasena, la region ('$Region') y que el proyecto no este pausado."
  exit 1
}
Write-Host " $($elegida.Nombre)" -ForegroundColor Green
$CadenaConexion = $elegida.Cadena

# La salida se guarda en un archivo y no se lee de la consola: cuando el comando
# lleva la contrasena, el filtro de secretos del entorno puede recortar todo lo
# que imprime y hace parecer que el comando se colgo.
$salida = Join-Path ([System.IO.Path]::GetTempPath()) "aplicar-migracion-$(Get-Date -Format 'HHmmss').log"

# `--single-transaction` es lo que evita una migracion a medias.
# El `2>&1` va ADENTRO del contenedor, no en PowerShell: en 5.1, redirigir el
# stderr de un ejecutable convierte cada linea en un error de PowerShell y, con
# ErrorActionPreference en Stop, un simple NOTICE de Postgres corta el script.
if ($Ensayo) {
  # begin/rollback explicitos, sin `-1`: con `-1` psql ya cerro su transaccion
  # antes de llegar al rollback y Postgres avisa "no transaction in progress".
  $comando = "{ echo 'begin;'; cat /sql/$soloNombre; echo 'rollback;'; } | " +
             "psql `"`$PGCONN`" -v ON_ERROR_STOP=1 2>&1"
} else {
  $comando = "psql `"`$PGCONN`" --single-transaction -v ON_ERROR_STOP=1 -f /sql/$soloNombre 2>&1"
}

Write-Host "2/2  Aplicando..." -NoNewline
docker run --rm -e PGCONN="$CadenaConexion" -v "${carpeta}:/sql:ro" $imagen `
  sh -c $comando | Out-File -FilePath $salida -Encoding utf8
$codigo = $LASTEXITCODE

if ($codigo -ne 0) {
  Write-Host " FALLO" -ForegroundColor Red
  Write-Host ""
  Get-Content $salida | ForEach-Object { Write-Host "  $_" }
  Write-Host ""
  Write-Host "  No se aplico nada: la transaccion se deshizo entera." -ForegroundColor Yellow
  Remove-Item $salida -Force -ErrorAction SilentlyContinue
  exit 1
}

Write-Host " ok" -ForegroundColor Green
Write-Host ""
Get-Content $salida | ForEach-Object { Write-Host "  $_" }
Remove-Item $salida -Force -ErrorAction SilentlyContinue
Write-Host ""
if ($Ensayo) {
  Write-Host "Ensayo terminado: entro sin errores y se deshizo. No se cambio nada." -ForegroundColor Cyan
} else {
  Write-Host "Migracion aplicada." -ForegroundColor Green
  Write-Host "Conviene correr get_advisors en el panel para confirmar que no quedo nada sin RLS."
}
