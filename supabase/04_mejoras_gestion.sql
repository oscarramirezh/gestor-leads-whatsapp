-- ============================================================
-- Paso 6 — Mejoras de gestión de leads
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Se puede correr completo de una sola vez y es seguro repetirlo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ventana de 24h de WhatsApp
-- ------------------------------------------------------------
-- Guarda cuándo escribió el cliente por última vez. Dentro de las 24h
-- siguientes podemos responder gratis; después solo con plantillas de pago.
-- La actualiza el webhook en cada mensaje entrante.
alter table leads add column if not exists ultimo_mensaje_entrante_en timestamptz;

-- Backfill: tomamos el último mensaje entrante que ya está registrado,
-- para que los leads existentes no aparezcan todos como "ventana cerrada".
update leads l
set ultimo_mensaje_entrante_en = c.ultimo
from (
  select lead_id, max(timestamp) as ultimo
  from conversaciones
  where direccion = 'entrante'
  group by lead_id
) c
where c.lead_id = l.id
  and l.ultimo_mensaje_entrante_en is null;

-- ------------------------------------------------------------
-- 2. Recordatorio de seguimiento
-- ------------------------------------------------------------
alter table leads add column if not exists seguimiento_en timestamptz;
alter table leads add column if not exists seguimiento_nota text;

create index if not exists idx_leads_seguimiento
  on leads (seguimiento_en)
  where seguimiento_en is not null;

-- ------------------------------------------------------------
-- 3. No contactar (opt-out)
-- ------------------------------------------------------------
-- Si el cliente pide que no le escriban, marcamos el lead y bloqueamos
-- el envío. Evita reportes que bajan el quality rating del número en Meta.
alter table leads add column if not exists no_contactar boolean not null default false;

-- ------------------------------------------------------------
-- 4. Respuestas rápidas
-- ------------------------------------------------------------
-- agente_id null = respuesta global (la ve todo el equipo).
-- agente_id con valor = respuesta personal de ese agente.
create table if not exists respuestas_rapidas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cuerpo text not null,
  agente_id uuid references agentes(id) on delete cascade,
  creado_en timestamptz not null default now()
);

alter table respuestas_rapidas enable row level security;

-- Todos leen las globales y las suyas.
drop policy if exists "leer respuestas rapidas" on respuestas_rapidas;
create policy "leer respuestas rapidas" on respuestas_rapidas
  for select to authenticated
  using (
    agente_id is null
    or agente_id = (select id from agentes where user_id = auth.uid())
  );

-- Cada quien crea las suyas; capitán y líder además pueden crear globales.
drop policy if exists "crear respuestas rapidas" on respuestas_rapidas;
create policy "crear respuestas rapidas" on respuestas_rapidas
  for insert to authenticated
  with check (
    agente_id = (select id from agentes where user_id = auth.uid())
    or (
      agente_id is null
      and (select rol from agentes where user_id = auth.uid()) in ('capitan', 'lider')
    )
  );

-- Borrar: las propias siempre; las globales solo capitán y líder.
drop policy if exists "borrar respuestas rapidas" on respuestas_rapidas;
create policy "borrar respuestas rapidas" on respuestas_rapidas
  for delete to authenticated
  using (
    agente_id = (select id from agentes where user_id = auth.uid())
    or (
      agente_id is null
      and (select rol from agentes where user_id = auth.uid()) in ('capitan', 'lider')
    )
  );

-- ------------------------------------------------------------
-- 5. Respuestas rápidas de arranque (edítalas a tu gusto)
-- ------------------------------------------------------------
insert into respuestas_rapidas (titulo, cuerpo, agente_id)
select * from (values
  ('Saludo',        'Hola, soy tu asesor de MejoraTuTarifa. ¿Me confirmas tu nombre para darte seguimiento?', null::uuid),
  ('Pedir INE',     'Para avanzar necesito una foto de tu INE por ambos lados. La usamos solo para dar de alta tu línea.', null::uuid),
  ('Cobertura',     '¿Me compartes tu código postal? Con eso reviso la cobertura en tu zona.', null::uuid),
  ('Sin respuesta', '¿Sigues interesado? Si prefieres que te marque, dime a qué hora te queda mejor.', null::uuid)
) as v(titulo, cuerpo, agente_id)
where not exists (select 1 from respuestas_rapidas where agente_id is null);
