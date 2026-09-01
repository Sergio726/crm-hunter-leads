# Restaura un backup de Hunter Leads en un Postgres descartable y comprueba
# que lo que volvió sirve.
#
# Por qué existe: un backup que nadie restauró no es un backup. Que Supabase
# diga "backup diario" no prueba que el archivo se pueda abrir, ni que las
# políticas RLS vuelvan, ni que los acentos sobrevivan. Esto lo prueba, en un
# contenedor que se borra al terminar y sin tocar producción en ningún momento.
#
# Dos modos:
#
#   -Dump <archivo>       Restaura un backup real (el que baja hacer-backup.ps1)
#                         y lo compara contra el archivo .conteos de al lado.
#                         Es la verificación de verdad.
#
#   -DesdeMigraciones     Sin ningún backup: reconstruye el esquema aplicando
#                         supabase/migrations/*.sql en orden sobre un Postgres
#                         pelado. Responde otra pregunta —"¿el esquema del repo
#                         alcanza para levantar la base de cero?"— y es lo único
#                         que se puede correr sin la contraseña de la base.
#
# Uso:
#   .\scripts\backup\verificar-restauracion.ps1 -Dump "..\backups-hunter-leads\hunter-leads-20260831-0500.dump"
#   .\scripts\backup\verificar-restauracion.ps1 -DesdeMigraciones

param(
  [string]$Dump = "",
  [switch]$DesdeMigraciones,

  # Tiene que ser >= la version de pg_dump que hizo el archivo, o pg_restore lo
  # rechaza con "unsupported version (1.16) in file header" — un mensaje que
  # suena a archivo corrupto y en realidad solo dice que el que restaura es mas
  # viejo que el que copio. Por eso el default es el mismo 17 que usa
  # hacer-backup.ps1.
  [int]$VersionPg = 17,
  # Deja el contenedor vivo al terminar, para poder entrar a mirar.
  [switch]$NoBorrar
)

# A propósito NO se usa "Stop": en Windows PowerShell 5.1, cualquier cosa que
# un ejecutable escriba en stderr —incluido un `docker rm` de un contenedor que
# todavía no existe, que es lo normal en la primera corrida— se convierte en un
# error de PowerShell y cortaría el script antes de empezar. Cada paso mira su
# propio $LASTEXITCODE, que es la señal que de verdad dice si algo falló.
$ErrorActionPreference = "Continue"

if ([string]::IsNullOrWhiteSpace($Dump) -and -not $DesdeMigraciones) {
  Write-Host "Elegi un modo: -Dump <archivo> o -DesdeMigraciones" -ForegroundColor Red
  exit 1
}

$raizRepo   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$carpetaSql = $PSScriptRoot
$contenedor = "hl-verificar-restauracion"
$imagen     = "postgres:$VersionPg"
$errores    = 0

function Paso($texto) { Write-Host "  $texto" -NoNewline }
function Ok()   { Write-Host " ok" -ForegroundColor Green }
function Mal($detalle) {
  Write-Host " FALLO" -ForegroundColor Red
  if ($detalle) { Write-Host "    $detalle" -ForegroundColor Red }
  $script:errores++
}

function Psql($sql) {
  docker exec $contenedor psql -U postgres -d hunterleads -Atc $sql 2>&1
}

Write-Host ""
Write-Host "Verificacion de restauracion — Hunter Leads" -ForegroundColor Cyan
Write-Host ""

docker version --format '{{.Server.Version}}' > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker no responde. Abri Docker Desktop y volve a intentar." -ForegroundColor Red
  exit 1
}

# --- Postgres descartable ------------------------------------------------
Write-Host "Levantando un Postgres $VersionPg descartable" -ForegroundColor White
docker rm -f $contenedor 2>$null | Out-Null
docker run -d --name $contenedor -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=hunterleads $imagen | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "No se pudo levantar el contenedor." -ForegroundColor Red; exit 1 }

# `pg_isready` miente durante el arranque de la imagen oficial: el entrypoint
# levanta un servidor temporal para inicializar la base, y ahí ya contesta que
# acepta conexiones — pero enseguida lo apaga para arrancar el definitivo. Si se
# le cree a la primera respuesta, el primer psql se encuentra con "the database
# system is shutting down" y todo lo que sigue falla en cascada por una causa
# que no tiene nada que ver.
# Por eso se exigen tres respuestas buenas seguidas, y con psql —que además
# prueba que se puede consultar de verdad, no solo abrir el socket—.
Paso "esperando a que acepte conexiones..."
$listo = $false
$seguidas = 0
foreach ($i in 1..90) {
  docker exec $contenedor psql -U postgres -d hunterleads -Atc "select 1" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $seguidas++ } else { $seguidas = 0 }
  if ($seguidas -ge 3) { $listo = $true; break }
  Start-Sleep -Milliseconds 500
}
if (-not $listo) { Mal "no arranco en 45 segundos"; docker rm -f $contenedor 2>$null | Out-Null; exit 1 }
Ok

# Los roles de Supabase van SIEMPRE primero: sin ellos falla la primera
# politica que diga `to authenticated`, venga de un dump o de las migraciones.
Paso "creando los roles de Supabase..."
docker cp "$carpetaSql\roles-supabase.sql" "${contenedor}:/tmp/roles.sql" | Out-Null
$salida = docker exec $contenedor psql -U postgres -d hunterleads -q -v ON_ERROR_STOP=1 -f /tmp/roles.sql 2>&1
if ($LASTEXITCODE -ne 0) { Mal $salida } else { Ok }

Write-Host ""

if ($DesdeMigraciones) {
  # --- Modo B: reconstruir desde las migraciones -------------------------
  Write-Host "Reconstruyendo el esquema desde supabase/migrations/" -ForegroundColor White

  Paso "andamio (auth, storage, pg_net simulados)..."
  docker cp "$carpetaSql\andamio-supabase.sql" "${contenedor}:/tmp/andamio.sql" | Out-Null
  $salida = docker exec $contenedor psql -U postgres -d hunterleads -q -v ON_ERROR_STOP=1 -f /tmp/andamio.sql 2>&1
  if ($LASTEXITCODE -ne 0) { Mal $salida } else { Ok }

  Paso "aplicando las migraciones en orden..."
  docker cp "$raizRepo\supabase\migrations" "${contenedor}:/tmp/migraciones" | Out-Null
  docker cp "$carpetaSql\aplicar-migraciones.sh" "${contenedor}:/tmp/aplicar-migraciones.sh" | Out-Null
  $salida = docker exec $contenedor sh /tmp/aplicar-migraciones.sh hunterleads 2>&1
  if ($salida -match "fallos=0") { Ok } else { Mal ($salida -join "`n") }

  Paso "cargando datos de prueba (sinteticos, sin datos reales)..."
  docker cp "$carpetaSql\datos-de-prueba.sql" "${contenedor}:/tmp/datos.sql" | Out-Null
  $salida = docker exec $contenedor psql -U postgres -d hunterleads -q -v ON_ERROR_STOP=1 -f /tmp/datos.sql 2>&1
  if ($LASTEXITCODE -ne 0) { Mal $salida } else { Ok }

} else {
  # --- Modo A: restaurar un backup real ----------------------------------
  if (-not (Test-Path $Dump)) {
    Write-Host "No existe el archivo: $Dump" -ForegroundColor Red
    docker rm -f $contenedor | Out-Null
    exit 1
  }
  $Dump = (Resolve-Path $Dump).Path
  Write-Host "Restaurando $([System.IO.Path]::GetFileName($Dump))" -ForegroundColor White

  Paso "copiando el dump al contenedor..."
  docker cp $Dump "${contenedor}:/tmp/backup.dump" | Out-Null
  if ($LASTEXITCODE -ne 0) { Mal "no se pudo copiar" } else { Ok }

  Paso "pg_restore..."
  # El restore corre con --exit-on-error para que ningun error pase inadvertido
  # entre cientos de lineas. Lo unico que se saltea son las extensiones que
  # Supabase tiene y esta imagen no puede instalar; el script las lista.
  docker cp "$carpetaSql\restaurar-dump.sh" "${contenedor}:/tmp/restaurar-dump.sh" | Out-Null
  $salida = docker exec $contenedor sh /tmp/restaurar-dump.sh hunterleads 2>&1
  $salteadas = @($salida | Where-Object { $_ -match "^SALTEADA-EXTENSION" } | ForEach-Object { ($_ -replace "^SALTEADA-EXTENSION ", "") })
  if ($salida -match "RESTORE-OK") {
    Ok
  } else {
    Mal (($salida | Where-Object { $_ -notmatch "^SALTEADA-EXTENSION" } | Select-Object -First 5) -join "`n")
    if ($salida -match "unsupported version") {
      Write-Host "    El archivo lo hizo un pg_dump mas nuevo que este Postgres $VersionPg." -ForegroundColor Yellow
      Write-Host "    No esta corrupto: volve a correr esto con -VersionPg 18." -ForegroundColor Yellow
    }
  }
  if ($salteadas.Count -gt 0) {
    Write-Host "    extensiones salteadas (no existen fuera de Supabase): $($salteadas -join ', ')" -ForegroundColor DarkGray
  }
  $rolesCreados = @($salida | Where-Object { $_ -match "^ROL-CREADO" } | ForEach-Object { ($_ -split " ")[1] })
  if ($rolesCreados.Count -gt 0) {
    Write-Host "    roles de Supabase creados vacios para el restore: $($rolesCreados -join ', ')" -ForegroundColor DarkGray
  }
}

# --- Comprobaciones ------------------------------------------------------
Write-Host ""
Write-Host "Comprobando lo que volvio" -ForegroundColor White

Paso "tablas..."
$tablas = (Psql "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'") -join ""
if ([int]$tablas -gt 0) { Write-Host " $tablas" -ForegroundColor Green } else { Mal "no hay ninguna" }

Paso "politicas RLS..."
$politicas = (Psql "select count(*) from pg_policies where schemaname in ('public','storage')") -join ""
if ([int]$politicas -gt 0) { Write-Host " $politicas" -ForegroundColor Green } else { Mal "no volvio ninguna: la base restaurada no tendria aislamiento entre vendedores" }

Paso "funciones..."
$funciones = (Psql "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')") -join ""
if ([int]$funciones -gt 0) { Write-Host " $funciones" -ForegroundColor Green } else { Mal "no volvio ninguna" }

Paso "triggers..."
$triggers = (Psql "select count(*) from pg_trigger where not tgisinternal") -join ""
if ([int]$triggers -gt 0) { Write-Host " $triggers" -ForegroundColor Green } else { Mal "no volvio ninguno" }

Paso "tablas con RLS activo..."
$conRls = (Psql "select count(*) from pg_class where relrowsecurity and relnamespace='public'::regnamespace") -join ""
if ([int]$conRls -gt 0) { Write-Host " $conRls" -ForegroundColor Green } else { Mal "RLS quedo apagado en todas" }

# El aislamiento no se prueba mirando si las politicas existen, sino
# ejecutandolas: un uid que no es de nadie no tiene que ver un solo cliente.
# El `grant` de la linea siguiente modifica la copia restaurada — es a
# proposito y no afecta a nadie: el contenedor se borra al terminar. Hace falta
# porque las migraciones del repo no traen los grants que Supabase da por
# defecto, y sin el la consulta fallaria por permisos antes de llegar a RLS,
# que es justamente lo que se quiere medir.
Paso "aislamiento: un usuario desconocido no ve clientes..."
$ajeno = (Psql "grant select on public.clients to authenticated; set role authenticated; set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999'; select count(*) from public.clients") | Select-Object -Last 1
if ("$ajeno".Trim() -eq "0") { Ok } else { Mal "vio $ajeno clientes que no le tocan" }

# --- Conteos contra el manifiesto ---------------------------------------
if (-not $DesdeMigraciones) {
  $conteosArchivo = [System.IO.Path]::ChangeExtension($Dump, ".conteos")
  Write-Host ""
  if (Test-Path $conteosArchivo) {
    Write-Host "Comparando fila por fila contra el momento del backup" -ForegroundColor White
    $esperado = @{}
    Get-Content $conteosArchivo | Where-Object { $_ -match "=" } | ForEach-Object {
      $p = $_.Split("=", 2); $esperado[$p[0].Trim()] = [int]$p[1].Trim()
    }
    $obtenido = @{}
    (Psql "select string_agg(t.tabla || '=' || t.filas, chr(10) order by t.tabla) from (select c.relname as tabla, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as filas from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r') t") |
      Where-Object { $_ -match "=" } | ForEach-Object {
        $p = $_.Split("=", 2); $obtenido[$p[0].Trim()] = [int]$p[1].Trim()
      }
    foreach ($tabla in ($esperado.Keys | Sort-Object)) {
      $eran = $esperado[$tabla]
      $hay  = if ($obtenido.ContainsKey($tabla)) { $obtenido[$tabla] } else { -1 }
      if ($hay -eq $eran) {
        Write-Host ("  {0,-28} {1,6}  ok" -f $tabla, $hay) -ForegroundColor Green
      } elseif ($hay -lt 0) {
        Write-Host ("  {0,-28} {1,6}  la tabla no existe en la copia restaurada" -f $tabla, "-") -ForegroundColor Red
        $errores++
      } else {
        Write-Host ("  {0,-28} {1,6}  eran {2}" -f $tabla, $hay, $eran) -ForegroundColor Red
        $errores++
      }
    }
  } else {
    Write-Host "No hay archivo .conteos junto al dump: se verifico que la base" -ForegroundColor Yellow
    Write-Host "restauro y funciona, pero no que no falte ninguna fila." -ForegroundColor Yellow
  }
}

# --- Cierre --------------------------------------------------------------
Write-Host ""
if ($NoBorrar) {
  Write-Host "El contenedor '$contenedor' queda vivo para mirarlo:" -ForegroundColor Yellow
  Write-Host "  docker exec -it $contenedor psql -U postgres -d hunterleads"
  Write-Host "  docker rm -f $contenedor   (cuando termines)"
} else {
  docker rm -f $contenedor 2>$null | Out-Null
}

if ($errores -eq 0) {
  Write-Host "Restauracion verificada: el backup se puede usar." -ForegroundColor Green
  exit 0
} else {
  Write-Host "$errores comprobacion(es) fallaron. Este backup NO sirve como esta." -ForegroundColor Red
  exit 1
}
