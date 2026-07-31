-- ============================================================
-- Qué escriben más los vendedores → candidatas a respuesta rápida
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Solo lee, no modifica nada.
-- ============================================================
--
-- Cómo funciona la normalización (la parte importante):
--   - lower + espacios colapsados  → "Hola  Buenas" = "hola buenas"
--   - los números se vuelven #     → "son 450 pesos" = "son # pesos"
--     así agrupa el mismo texto aunque cambie el precio o el plan.
--
-- Efecto secundario útil: como solo salen frases REPETIDAS, los mensajes
-- personales de un cliente concreto no aparecen (aparecen una sola vez).
-- Lo que sube a la superficie es el texto machacado, que es justo lo que
-- queremos convertir en respuesta rápida.


-- ------------------------------------------------------------
-- 1. Frases más repetidas por los agentes
-- ------------------------------------------------------------
select
  count(*)                  as veces,
  count(distinct lead_id)   as clientes_distintos,
  min(cuerpo)               as ejemplo_real
from conversaciones
where autor = 'agente'
  and tipo  = 'texto'
  and cuerpo is not null
  -- descarta "ok", "sí", "va" y textos larguísimos que nunca se repiten igual
  and length(btrim(cuerpo)) between 25 and 600
group by regexp_replace(
           regexp_replace(lower(btrim(cuerpo)), '[0-9]+', '#', 'g'),
           '\s+', ' ', 'g')
having count(*) >= 3
order by veces desc
limit 40;


-- ------------------------------------------------------------
-- 2. Cómo abren la conversación (primer mensaje del vendedor)
-- ------------------------------------------------------------
-- Sirve para estandarizar el saludo: si cada quien abre distinto,
-- conviene fijar el que mejor convierte.
with primer_mensaje_agente as (
  select distinct on (lead_id) lead_id, cuerpo
  from conversaciones
  where autor = 'agente' and tipo = 'texto' and cuerpo is not null
  order by lead_id, timestamp
)
select
  count(*)    as veces,
  min(cuerpo) as ejemplo_real
from primer_mensaje_agente
where length(btrim(cuerpo)) >= 15
group by regexp_replace(
           regexp_replace(lower(btrim(cuerpo)), '[0-9]+', '#', 'g'),
           '\s+', ' ', 'g')
having count(*) >= 2
order by veces desc
limit 25;


-- ------------------------------------------------------------
-- 3. Qué pregunta más el cliente
-- ------------------------------------------------------------
-- Las respuestas rápidas más valiosas son las que contestan esto.
select
  count(*)    as veces,
  min(cuerpo) as ejemplo_real
from conversaciones
where autor = 'cliente'
  and tipo  = 'texto'
  and cuerpo is not null
  and length(btrim(cuerpo)) between 10 and 200
group by regexp_replace(
           regexp_replace(lower(btrim(cuerpo)), '[0-9]+', '#', 'g'),
           '\s+', ' ', 'g')
having count(*) >= 3
order by veces desc
limit 30;
