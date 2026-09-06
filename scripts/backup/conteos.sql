-- Cuántas filas tiene cada tabla de `public`, en formato `tabla=filas`.
--
-- Es el manifiesto que acompaña al backup: sin él, lo único que se puede decir
-- después de restaurar es "no dio error". Con él se compara tabla por tabla.
--
-- Vive en un archivo y no como argumento de `psql -c` porque al pasar una
-- consulta larga con comillas simples a través de PowerShell -> docker -> sh,
-- las comillas llegan partidas: el comando se malforma, la redirección nunca
-- corre y el script cree que salió bien porque nadie devolvió un código de
-- error. Un archivo no pasa por ese molinete.
--
-- `count(*)` de verdad y no la estimación de `pg_stat_user_tables`: esa depende
-- del último ANALYZE y compararía contra un número inventado.

select string_agg(t.tabla || '=' || t.filas, chr(10) order by t.tabla)
from (
  select
    c.relname as tabla,
    (xpath(
      '/row/c/text()',
      query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')
    ))[1]::text::bigint as filas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
) t;
