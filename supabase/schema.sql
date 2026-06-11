-- ============================================================
-- Esquema de la base de datos — Gestor de Leads de WhatsApp
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ---------- Tipos (enums) ----------
-- Un enum restringe los valores posibles de una columna.
-- Si mañana necesitas un valor nuevo: ALTER TYPE ... ADD VALUE 'nuevo_valor';

create type producto_tipo as enum ('portabilidad', 'alta_nueva', 'indefinido');
create type lead_estado as enum ('nuevo', 'perfilando', 'asignado', 'en_gestion', 'ganado', 'perdido');
create type agente_rol as enum ('vendedor', 'capitan', 'lider');
create type mensaje_direccion as enum ('entrante', 'saliente');
create type mensaje_autor as enum ('cliente', 'bot', 'agente');
create type asignacion_origen as enum ('sistema', 'manual');

-- ---------- agentes ----------
-- Va primero porque leads la referencia (fk).
create table agentes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  telefono    text not null unique,          -- formato E.164: +521234567890
  rol         agente_rol not null default 'vendedor',
  disponible  boolean not null default true, -- el round-robin solo reparte entre disponibles
  capitan_id  uuid references agentes(id),   -- jerarquía: vendedor -> su capitán
  user_id     uuid unique,                   -- enlace con Supabase Auth (se llena en el paso 5, dashboard)
  creado_en   timestamptz not null default now()
);

-- ---------- leads ----------
create table leads (
  id                      uuid primary key default gen_random_uuid(),
  telefono                text not null unique,  -- E.164; clave natural para encontrar el lead al entrar un mensaje
  nombre                  text,
  fuente_anuncio          text,                  -- viene en el webhook como "referral" del anuncio click-to-WhatsApp
  primer_mensaje          text,
  idioma                  text default 'es',
  producto_interes        producto_tipo not null default 'indefinido',
  ciudad                  text,
  plan_interes            text,
  estado                  lead_estado not null default 'nuevo',
  bot_paso                int not null default 0, -- en qué pregunta del bot va (0 = no iniciado, 99 = terminado)
  vendedor_asignado_id    uuid references agentes(id),
  creado_en               timestamptz not null default now(),
  asignado_en             timestamptz,
  primer_toque_humano_en  timestamptz,
  cerrado_en              timestamptz,
  motivo_perdida          text
);

-- ---------- conversaciones (mensajes del hilo) ----------
create table conversaciones (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  direccion     mensaje_direccion not null,
  cuerpo        text,
  tipo          text not null default 'texto',  -- texto | imagen | audio | boton | ...
  autor         mensaje_autor not null,
  agente_id     uuid references agentes(id),
  wa_message_id text unique,                    -- id de Meta; unique evita duplicados cuando Meta reintenta el webhook
  timestamp     timestamptz not null default now()
);

-- ---------- asignaciones (historial / auditoría) ----------
create table asignaciones (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id) on delete cascade,
  agente_id    uuid not null references agentes(id),
  asignado_en  timestamptz not null default now(),
  asignado_por asignacion_origen not null default 'sistema'
);

-- ---------- eventos (auditoría general para reportes y SLA) ----------
create table eventos (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete cascade,
  tipo_evento text not null,        -- lead_creado | bot_iniciado | bot_terminado | lead_asignado | primer_toque | ...
  agente_id   uuid references agentes(id),
  payload     jsonb,
  timestamp   timestamptz not null default now()
);

-- ---------- Índices ----------
-- Aceleran las consultas que el dashboard y el webhook hacen todo el tiempo.
create index idx_leads_estado on leads(estado);
create index idx_leads_vendedor on leads(vendedor_asignado_id);
create index idx_conversaciones_lead on conversaciones(lead_id, timestamp);
create index idx_asignaciones_agente on asignaciones(agente_id, asignado_en desc);
create index idx_eventos_lead on eventos(lead_id, timestamp);

-- ---------- Función: asignación round-robin ----------
-- Se llama desde el webhook con: supabase.rpc('asignar_lead', { p_lead_id: ... })
-- Elige al vendedor disponible que lleva MÁS tiempo sin recibir un lead
-- (nulls first = el que nunca ha recibido uno va primero).
-- Hacerlo dentro de una función SQL garantiza que todo (update + historial +
-- evento) ocurre en una sola transacción: o pasa todo, o no pasa nada.
create or replace function asignar_lead(
  p_lead_id uuid,
  p_origen  asignacion_origen default 'sistema'
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_agente_id uuid;
begin
  select a.id into v_agente_id
  from agentes a
  where a.rol = 'vendedor'
    and a.disponible = true
  order by
    (select max(s.asignado_en) from asignaciones s where s.agente_id = a.id) asc nulls first,
    a.creado_en asc
  limit 1;

  -- Si no hay nadie disponible, devolvemos null y el lead queda sin asignar
  -- (el dashboard del Líder mostrará "leads sin asignar").
  if v_agente_id is null then
    insert into eventos (lead_id, tipo_evento, payload)
    values (p_lead_id, 'asignacion_fallida', '{"motivo": "sin_vendedores_disponibles"}'::jsonb);
    return null;
  end if;

  update leads
  set vendedor_asignado_id = v_agente_id,
      estado = 'asignado',
      asignado_en = now()
  where id = p_lead_id;

  insert into asignaciones (lead_id, agente_id, asignado_por)
  values (p_lead_id, v_agente_id, p_origen);

  insert into eventos (lead_id, tipo_evento, agente_id)
  values (p_lead_id, 'lead_asignado', v_agente_id);

  return v_agente_id;
end;
$$;

-- ---------- Seguridad (RLS) ----------
-- Row Level Security: sin una política que lo permita, nadie puede leer/escribir.
-- El webhook usa la SERVICE_ROLE_KEY, que se salta RLS (es el "admin").
-- Las políticas finas por rol (vendedor solo ve sus leads, etc.) las haremos
-- en el paso 5 cuando montemos el auth del dashboard.
alter table agentes enable row level security;
alter table leads enable row level security;
alter table conversaciones enable row level security;
alter table asignaciones enable row level security;
alter table eventos enable row level security;

-- Política provisional: cualquier usuario autenticado puede leer todo.
-- (La refinamos por rol en el paso del dashboard.)
create policy "lectura autenticados" on agentes for select to authenticated using (true);
create policy "lectura autenticados" on leads for select to authenticated using (true);
create policy "lectura autenticados" on conversaciones for select to authenticated using (true);
create policy "lectura autenticados" on asignaciones for select to authenticated using (true);
create policy "lectura autenticados" on eventos for select to authenticated using (true);

-- ---------- Realtime ----------
-- Habilita notificaciones en vivo para el dashboard (leads nuevos, mensajes).
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table conversaciones;
