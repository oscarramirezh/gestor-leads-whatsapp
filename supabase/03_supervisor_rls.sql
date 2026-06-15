-- ============================================================
-- Paso 6 — Vista Capitán/Líder (supervisión + reasignación)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- (después de supabase/02_dashboard_rls.sql)
-- ============================================================

-- Un capitán o líder puede reasignar cualquier lead (cambiar
-- vendedor_asignado_id, estado, etc.) desde la vista de supervisión.
-- La política "vendedor actualiza sus leads asignados" (02) sigue cubriendo
-- al vendedor normal sobre sus propios leads.
create policy "capitan y lider actualizan cualquier lead" on leads
  for update to authenticated
  using (
    exists (
      select 1 from agentes a
      where a.user_id = auth.uid() and a.rol in ('capitan', 'lider')
    )
  )
  with check (
    exists (
      select 1 from agentes a
      where a.user_id = auth.uid() and a.rol in ('capitan', 'lider')
    )
  );

-- Permite registrar la reasignación manual en el historial de auditoría.
create policy "capitan y lider insertan asignaciones" on asignaciones
  for insert to authenticated
  with check (
    exists (
      select 1 from agentes a
      where a.user_id = auth.uid() and a.rol in ('capitan', 'lider')
    )
  );

create policy "capitan y lider insertan eventos" on eventos
  for insert to authenticated
  with check (
    exists (
      select 1 from agentes a
      where a.user_id = auth.uid() and a.rol in ('capitan', 'lider')
    )
  );
