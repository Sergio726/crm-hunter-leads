#!/bin/sh
# Restaura /tmp/backup.dump dentro del contenedor de prueba, salteando las
# extensiones de Postgres que Supabase tiene instaladas y la imagen oficial no.
#
# Por que hace falta: el dump de un proyecto Supabase trae `CREATE EXTENSION`
# de cosas como `pg_net`, que no existen en `postgres:17`. Con --exit-on-error
# —que es justamente lo que hace que la verificacion sirva— la primera de esas
# lineas corta el restore entero y parece que el backup esta roto. No lo esta:
# le falta el entorno, no los datos.
#
# La alternativa facil seria sacar --exit-on-error y dejar que los errores
# pasen. Seria peor: cualquier error de verdad se perderia entre el ruido. Asi
# que se saltean **solo** las extensiones que esta imagen no puede instalar, se
# dice cuales fueron, y todo lo demas sigue teniendo que restaurar sin un error.
#
# Uso: sh restaurar-dump.sh <base>

set -u
BASE="${1:-hunterleads}"

pg_restore -l /tmp/backup.dump > /tmp/lista.txt 2>/tmp/lista-error.txt
if [ ! -s /tmp/lista.txt ]; then
  echo "NO-SE-PUDO-LEER-EL-DUMP"
  head -3 /tmp/lista-error.txt
  exit 1
fi

# Extensiones que el dump quiere crear.
grep "EXTENSION - " /tmp/lista.txt \
  | sed -e 's/.*EXTENSION - //' -e 's/ .*//' \
  | sort -u > /tmp/ext-dump.txt

# Extensiones que esta imagen puede instalar.
psql -U postgres -d "$BASE" -Atc "select name from pg_available_extensions" \
  | sort -u > /tmp/ext-ok.txt

# Las que faltan: estan en el dump y no se pueden instalar aca.
comm -23 /tmp/ext-dump.txt /tmp/ext-ok.txt > /tmp/ext-faltan.txt

# Cada extension trae su propio esquema, y ese esquema NO aparece como
# `CREATE SCHEMA` en el dump: lo crea la extension al instalarse. Si se saltea
# la extension y no se saltea su esquema, el restore llega al `COPY` de una
# tabla que nadie creo y se corta ahi — con los datos ya cargados pero sin las
# politicas RLS ni los triggers, que van al final. O sea: una copia que parece
# haber funcionado y no tiene seguridad.
esquema_de_extension() {
  case "$1" in
    pg_net)         echo "net" ;;
    supabase_vault) echo "vault" ;;
    pgsodium)       echo "pgsodium" ;;
    pg_graphql)     echo "graphql" ;;
    pg_cron)        echo "cron" ;;
    *)              echo "$1" ;;
  esac
}

cp /tmp/lista.txt /tmp/lista-filtrada.txt
if [ -s /tmp/ext-faltan.txt ]; then
  while read -r ext; do
    [ -z "$ext" ] && continue
    esq=$(esquema_de_extension "$ext")
    echo "SALTEADA-EXTENSION $ext (esquema $esq)"
    # Se saltea la extension, su comentario y todo objeto de su esquema.
    grep -v -e "EXTENSION - $ext " -e "EXTENSION $ext " -e " $esq " \
      /tmp/lista-filtrada.txt > /tmp/lista-tmp.txt
    mv /tmp/lista-tmp.txt /tmp/lista-filtrada.txt
  done < /tmp/ext-faltan.txt
fi

# Los roles que el dump menciona en sus GRANT y que no existen en un Postgres
# pelado. Supabase tiene una decena (dashboard_user, pgbouncer, los de
# pgsodium...) y la lista cambia entre proyectos y entre versiones, asi que en
# vez de mantenerla a mano se lee del dump: se vuelca el esquema como texto y
# se juntan los nombres que aparecen despues de un TO.
#
# Se crean vacios y sin permisos: no se busca reproducir a Supabase, solo que
# `GRANT ... TO dashboard_user` no corte el restore por un rol que en esta
# prueba no le sirve a nadie.
pg_restore --schema-only -f /tmp/esquema.sql /tmp/backup.dump 2>/dev/null
if [ -s /tmp/esquema.sql ]; then
  grep -ohE "(GRANT|OWNER)[^;]*TO +[a-zA-Z_][a-zA-Z0-9_]*" /tmp/esquema.sql \
    | awk '{print $NF}' \
    | grep -vE "^(PUBLIC|public|CURRENT_USER|SESSION_USER|pg_)" \
    | sort -u > /tmp/roles-dump.txt

  while read -r rol; do
    [ -z "$rol" ] && continue
    existe=$(psql -U postgres -d "$BASE" -Atc "select 1 from pg_roles where rolname = '$rol'")
    if [ "$existe" != "1" ]; then
      psql -U postgres -d "$BASE" -q -c "create role \"$rol\" nologin noinherit" > /dev/null 2>&1
      echo "ROL-CREADO $rol"
    fi
  done < /tmp/roles-dump.txt
fi

pg_restore -U postgres -d "$BASE" --no-owner --exit-on-error \
  -L /tmp/lista-filtrada.txt /tmp/backup.dump > /tmp/restore-salida.txt 2>&1
codigo=$?

if [ $codigo -eq 0 ]; then
  echo "RESTORE-OK"
else
  echo "RESTORE-FALLO"
  head -6 /tmp/restore-salida.txt
fi
exit $codigo
