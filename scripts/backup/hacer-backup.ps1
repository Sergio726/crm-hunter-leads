# Baja un backup completo de la base de Hunter Leads.
#
# Qué produce, en la carpeta de destino:
#   hunter-leads-<fecha>.dump       el backup en sí (formato custom de pg_dump)
#   hunter-leads-<fecha>.conteos    cuántas filas tenía cada tabla en ese momento
#
# El archivo de conteos es la mitad que suele faltar. Sin él, "restauré el
# backup y no dio error" es todo lo que se puede decir; con él se puede
# comparar el resultado contra lo que había, que es lo que convierte una
# restauración en una restauración *verificada*.
#
# Requisitos: Docker (usa la imagen oficial de Postgres, así no hace falta
# instalar el cliente de Postgres en Windows) y la cadena de conexión de la
# base, que está en el panel de Supabase → Project Settings → Database →
# Connection string → URI. Incluye la contraseña, así que NO se escribe en
# ningún archivo del repo: se pasa por parámetro o por la variable de entorno
# HUNTER_LEADS_DB_URL.
#
# Uso:
#   .\scripts\backup\hacer-backup.ps1
#   .\scripts\backup\hacer-backup.ps1 -Destino "D:\backups" -VersionPg 17

param(
  # Cadena de conexión completa. Si no se pasa, se busca en dos lugares, en
  # este orden: la variable de entorno HUNTER_LEADS_DB_URL de la consola, y
  # `web\.env.local`. Así alcanza con pegarla una vez en ese archivo.
  [string]$CadenaConexion = "",

  # Dónde dejar el backup. Por defecto, FUERA del repo: son datos de clientes
  # reales y no tienen que poder terminar en un commit por accidente.
  [string]$Destino = "",

  # La versión de pg_dump tiene que ser >= la del servidor. Supabase corre 15 o
  # 17 según cuándo se creó el proyecto; 17 sirve para las dos.
  [int]$VersionPg = 17,

  # Región del proyecto en Supabase. Solo se usa para armar el host del pooler
  # cuando la conexión directa no llega (ver más abajo). `hunter-leads` está en
  # ca-central-1; se ve en el panel, arriba del nombre del proyecto.
  [string]$Region = "ca-central-1"
)

$ErrorActionPreference = "Stop"

$raizRepo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# El checkout principal del repo. Corriendo desde un worktree, `$raizRepo` es
# `...\.claude\worktrees\<nombre>`, y tanto las claves como los backups tienen
# que salir de ahi y no quedar enterrados adentro de una copia de trabajo que
# se puede borrar. Se lo pregunta a git, que sabe donde esta el repo de verdad.
function Buscar-RepoPrincipal($desde) {
  $comun = & git -C $desde rev-parse --git-common-dir 2>$null
  if ($LASTEXITCODE -eq 0 -and $comun) {
    if (-not [System.IO.Path]::IsPathRooted($comun)) { $comun = Join-Path $desde $comun }
    return (Split-Path -Parent (Resolve-Path $comun).Path)
  }
  return $desde
}
$repoPrincipal = Buscar-RepoPrincipal $raizRepo

if ([string]::IsNullOrWhiteSpace($Destino)) {
  $Destino = Join-Path (Split-Path -Parent $repoPrincipal) "backups-hunter-leads"
}

# Busca una variable dentro de web\.env.local. Ese archivo no se comparte entre
# worktrees: vive solo en el checkout principal.
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
  return ""
}

if ([string]::IsNullOrWhiteSpace($CadenaConexion)) { $CadenaConexion = $env:HUNTER_LEADS_DB_URL }
if ([string]::IsNullOrWhiteSpace($CadenaConexion)) { $CadenaConexion = Leer-DeEnvLocal "HUNTER_LEADS_DB_URL" }

if ([string]::IsNullOrWhiteSpace($CadenaConexion)) {
  Write-Host "Falta la cadena de conexion a la base." -ForegroundColor Red
  Write-Host ""
  Write-Host "Ya esta la linea esperandola en web\.env.local:"
  Write-Host ""
  Write-Host "  HUNTER_LEADS_DB_URL="
  Write-Host ""
  Write-Host "Copiala del panel de Supabase (Project Settings -> Database ->"
  Write-Host "Connection string -> URI), pegala despues del '=' y volve a correr"
  Write-Host "este script. Queda solo en tu maquina: ese archivo no se commitea."
  Write-Host ""
  exit 1
}

if ($CadenaConexion -notmatch "^postgres(ql)?://") {
  Write-Host "La cadena de conexion no tiene la forma esperada." -ForegroundColor Red
  Write-Host "Tiene que empezar con postgresql:// — copiala completa del panel (opcion URI)."
  exit 1
}

if ($CadenaConexion -match "TU-CONTRASENA|\[YOUR-PASSWORD\]") {
  Write-Host "La cadena todavia tiene el texto de ejemplo en lugar de la contrasena." -ForegroundColor Red
  Write-Host "Reemplazalo por la contrasena real de la base en web\.env.local."
  exit 1
}

docker version --format '{{.Server.Version}}' > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker no responde. Abri Docker Desktop y volve a intentar." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Force -Path $Destino | Out-Null }
$Destino = (Resolve-Path $Destino).Path

$sello  = Get-Date -Format "yyyyMMdd-HHmm"
$nombre = "hunter-leads-$sello"
$imagen = "postgres:$VersionPg"

Write-Host "Backup de Hunter Leads" -ForegroundColor Cyan
Write-Host "  destino: $Destino"
Write-Host ""

# --- 0. Elegir por donde se llega a la base ------------------------------
#
# La cadena que da el panel (`db.<ref>.supabase.co`) resuelve **solo a IPv6**.
# Docker Desktop en Windows no le da IPv6 al contenedor, asi que `pg_dump`
# muere con "Network is unreachable" — un error que parece de credenciales o de
# base caida y no es ninguna de las dos cosas.
#
# La salida es el pooler (Supavisor), que si tiene IPv4. Cambian dos cosas: el
# host, y el usuario, que pasa de `postgres` a `postgres.<ref>`. Se usa el
# **puerto 5432 (session mode)** a proposito: el 6543 (transaction mode) no
# soporta `pg_dump`.
#
# Se prueban las tres puertas en orden y se usa la primera que conteste, para
# que el script siga sirviendo si el proyecto se muda o le agregan IPv4.
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

Write-Host "0/2  Buscando por donde se llega a la base..." -NoNewline
$elegida = $null
foreach ($c in $candidatos) {
  if (Probar-Conexion $c.Cadena) { $elegida = $c; break }
}
if (-not $elegida) {
  Write-Host " FALLO" -ForegroundColor Red
  Write-Host ""
  Write-Host "  No se pudo conectar por ninguna via:" -ForegroundColor Red
  foreach ($c in $candidatos) { Write-Host "    - $($c.Nombre)" }
  Write-Host ""
  Write-Host "  Cosas para mirar, en orden:"
  Write-Host "    1. Que la contrasena en web\.env.local sea la correcta."
  Write-Host "    2. Que la region sea la del proyecto (esta es '$Region'; se cambia con -Region)."
  Write-Host "    3. Que el proyecto no este pausado en el panel de Supabase."
  exit 1
}
Write-Host " $($elegida.Nombre)" -ForegroundColor Green
$CadenaConexion = $elegida.Cadena

# El archivo lo escribe pg_dump adentro del contenedor, sobre la carpeta
# montada. Redirigir la salida con ">" de PowerShell no sirve: reescribe la
# codificacion y deja el .dump binario corrupto, que es la clase de error que
# solo se descubre el dia que hace falta restaurar.
$montaje = "${Destino}:/backup"

# --- 1. El dump ---------------------------------------------------------
# --format=custom permite restaurar tabla por tabla y comprime solo.
# Se dumpea la base entera a proposito: `auth` (los usuarios que pueden
# entrar) y `storage` (avatares y adjuntos) importan tanto como `public`.
Write-Host "1/2  Bajando el dump..." -NoNewline
docker run --rm -e PGCONN="$CadenaConexion" -v $montaje $imagen `
  sh -c "pg_dump `"`$PGCONN`" --format=custom --no-owner --file=/backup/$nombre.dump"
$dump = Join-Path $Destino "$nombre.dump"

# Un dump a medias es peor que ninguno: parece un backup y no lo es. Si pg_dump
# fallo, el archivo que dejo se borra en el acto.
if ($LASTEXITCODE -ne 0) {
  Write-Host " FALLO" -ForegroundColor Red
  if (Test-Path $dump) { Remove-Item $dump -Force }
  Write-Host "  Si dice 'server version mismatch', volve a correrlo con -VersionPg 17 (o 18)."
  exit 1
}
if ((Get-Item $dump).Length -eq 0) {
  Write-Host " FALLO (el archivo quedo vacio)" -ForegroundColor Red
  Remove-Item $dump -Force
  exit 1
}
$tamanio = [math]::Round((Get-Item $dump).Length / 1MB, 2)
Write-Host " listo ($tamanio MB)" -ForegroundColor Green

# --- 2. Los conteos -----------------------------------------------------
# Se leen en la misma corrida para que sean del mismo momento que el dump.
# La consulta vive en conteos.sql y no aca: pasada como argumento se rompia al
# atravesar PowerShell -> docker -> sh, y el script daba "listo" sin haber
# escrito nada. Ahora ademas se comprueba que el archivo exista y no este vacio.
Write-Host "2/2  Anotando cuantas filas tenia cada tabla..." -NoNewline
$conteos = Join-Path $Destino "$nombre.conteos"
docker run --rm -e PGCONN="$CadenaConexion" -v $montaje -v "${PSScriptRoot}:/sql:ro" $imagen `
  sh -c "psql `"`$PGCONN`" -At -f /sql/conteos.sql > /backup/$nombre.conteos"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $conteos) -or (Get-Item $conteos).Length -eq 0) {
  Write-Host " FALLO" -ForegroundColor Yellow
  Write-Host "  El dump quedo bien, pero sin este archivo la verificacion no puede" -ForegroundColor Yellow
  Write-Host "  comparar fila por fila: solo va a decir si la base restaura." -ForegroundColor Yellow
  if (Test-Path $conteos) { Remove-Item $conteos -Force }
} else {
  Write-Host " listo" -ForegroundColor Green
}

Write-Host ""
Write-Host "Backup guardado:" -ForegroundColor Green
Write-Host "  $dump"
Write-Host "  $(Join-Path $Destino "$nombre.conteos")"
Write-Host ""
Write-Host "Un backup que nadie restauro no es un backup. El paso que falta:" -ForegroundColor Yellow
Write-Host "  .\scripts\backup\verificar-restauracion.ps1 -Dump `"$dump`""
