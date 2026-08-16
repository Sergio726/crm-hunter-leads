-- Corrección de la 0036: que `kind` y `source` los derive el trigger.
--
-- La 0036 les puso DEFAULT a las dos columnas y además escribió un trigger que
-- las completa cuando llegan vacías. No funciona: Postgres aplica los DEFAULT de
-- columna ANTES de correr los BEFORE triggers, así que el trigger nunca veía un
-- NULL y su rama de derivación era código muerto. El síntoma concreto: insertar
-- una persona de LinkedIn la guardaba con kind='business'.
--
-- Se sacan los DEFAULT. Las columnas siguen siendo NOT NULL y eso no rompe la
-- app desplegada, que inserta sin mencionarlas: las restricciones se validan
-- DESPUÉS de los BEFORE triggers, así que el trigger llega a tiempo de llenarlas.
--
-- Detectado por la verificación de la 0036, que probaba el comportamiento real
-- (insertar y revertir) en vez de limitarse a comprobar que las columnas
-- existieran.

alter table public.prospects alter column source drop default;
alter table public.prospects alter column kind   drop default;
