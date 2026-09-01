#!/bin/sh
# Aplica supabase/migrations/*.sql en orden dentro del contenedor de prueba.
#
# Vive en un archivo y no como argumento de `docker exec` por una razon
# practica: PowerShell vuelve a citar los argumentos al llamar a un ejecutable
# nativo, y las comillas dobles de la expresion `sed` llegaban partidas al
# contenedor ("Syntax error: end of file unexpected"). Un archivo copiado con
# `docker cp` no pasa por ese molinete.
#
# Espera las migraciones en /tmp/migraciones y la base en $PGDATABASE.

set -u
BASE="${1:-hunterleads}"
fallos=0

for f in /tmp/migraciones/*.sql; do
  nombre=$(basename "$f")

  # `create extension pg_net` se reemplaza por un no-op: la extension no existe
  # en la imagen oficial de Postgres y el andamio ya dejo un net.http_post que
  # no llama a nadie. La verificacion NO prueba los webhooks a n8n, y no
  # deberia: mandar pedidos reales desde una prueba de restauracion seria peor
  # que no probarla.
  sed -E 's/^create extension if not exists pg_net;/select 1;/' "$f" > /tmp/migracion-actual.sql

  if psql -U postgres -d "$BASE" -v ON_ERROR_STOP=1 -q -f /tmp/migracion-actual.sql > /tmp/error-actual.txt 2>&1; then
    :
  else
    echo "FALLO $nombre"
    head -3 /tmp/error-actual.txt
    fallos=$((fallos + 1))
  fi
done

echo "fallos=$fallos"
