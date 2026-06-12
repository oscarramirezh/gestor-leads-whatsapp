-- ============================================================
-- Paso 5 — Políticas RLS para el Dashboard Vendedor
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- (después de supabase/schema.sql)
-- ============================================================

-- Permite que un vendedor actualice SOLO los leads que tiene asignados:
-- botones "Tomar" (estado, primer_toque_humano_en) y "Marcar ganado/perdido"
-- (estado, cerrado_en, motivo_perdida) en el dashboard.
create policy "vendedor actualiza sus leads asignados" on leads
  for update to authenticated
  using (vendedor_asignado_id = (select id from agentes where user_id = auth.uid()))
  with check (vendedor_asignado_id = (select id from agentes where user_id = auth.uid()));

-- ============================================================
-- Vincular tu usuario de Supabase Auth con tu fila en `agentes`
-- ============================================================
-- 1. Crea el usuario en Authentication > Users > Add user (con email/contraseña).
-- 2. Copia su UUID y enlázalo con el vendedor correspondiente:
--
--   update agentes set user_id = '<uuid-del-usuario>' where telefono = '+5215511111111';
