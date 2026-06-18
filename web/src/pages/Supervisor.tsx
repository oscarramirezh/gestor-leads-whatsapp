import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Agente, Lead } from '../lib/types';
import { Metricas } from '../components/Metricas';
import { LeadTable } from '../components/LeadTable';
import { LeadChat } from '../components/LeadChat';
import { exportarLeadsCSV } from '../lib/csv';
import { Logo } from '../components/Logo';

export function Supervisor({ agente }: { agente: Agente }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Agente[]>([]);
  const [seleccionado, setSeleccionado] = useState<Lead | null>(null);
  const [metricasAbiertas, setMetricasAbiertas] = useState(false);
  const [noLeidos, setNoLeidos] = useState<Record<string, number>>({});
  const [vistaMovil, setVistaMovil] = useState<'lista' | 'chat'>('lista');
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const seleccionadoRef = React.useRef<Lead | null>(null);

  function onResizerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev: MouseEvent) {
      const next = Math.max(280, Math.min(680, startW + ev.clientX - startX));
      setSidebarWidth(next);
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    seleccionadoRef.current = seleccionado;
  }, [seleccionado]);

  useEffect(() => {
    let activo = true;

    supabase
      .from('agentes')
      .select('*')
      .in('rol', ['vendedor', 'capitan'])
      .then(({ data }) => {
        if (activo) setVendedores((data as Agente[]) ?? []);
      });

    supabase
      .from('leads')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (activo) setLeads((data as Lead[]) ?? []);
      });

    const canalLeads = supabase
      .channel('leads-supervisor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        const lead = payload.new as Lead;
        setLeads((actuales) => {
          const sinEste = actuales.filter((l) => l.id !== lead.id);
          return [lead, ...sinEste].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
        });
        setSeleccionado((actual) => (actual?.id === lead.id ? lead : actual));
      })
      .subscribe();

    const canalMensajes = supabase
      .channel('mensajes-supervisor')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversaciones' },
        (payload) => {
          const msg = payload.new as { lead_id: string; direccion: string };
          if (msg.direccion !== 'entrante') return;
          if (seleccionadoRef.current?.id === msg.lead_id) return;
          setNoLeidos((prev) => ({ ...prev, [msg.lead_id]: (prev[msg.lead_id] ?? 0) + 1 }));
        },
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canalLeads);
      supabase.removeChannel(canalMensajes);
    };
  }, []);

  function onLeadActualizado(lead: Lead) {
    setSeleccionado(lead);
    setLeads((actuales) => actuales.map((l) => (l.id === lead.id ? lead : l)));
  }

  async function onReasignar(lead: Lead, nuevoVendedorId: string) {
    const vendedorId = nuevoVendedorId || null;
    const cambios: Partial<Lead> = { vendedor_asignado_id: vendedorId };
    if (vendedorId && !lead.vendedor_asignado_id) {
      cambios.estado = 'asignado';
      cambios.asignado_en = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('leads')
      .update(cambios)
      .eq('id', lead.id)
      .select()
      .single();

    if (error || !data) {
      alert(`No se pudo reasignar: ${error?.message ?? 'sin datos'}. Verifica que tu usuario tenga rol capitan o lider con user_id vinculado en la tabla agentes.`);
      return;
    }
    onLeadActualizado(data as Lead);

    if (vendedorId) {
      await supabase.from('asignaciones').insert({
        lead_id: lead.id,
        agente_id: vendedorId,
        asignado_por: 'manual',
      });
      await supabase.from('eventos').insert({
        lead_id: lead.id,
        tipo_evento: 'lead_reasignado',
        agente_id: agente.id,
        payload: { vendedor_anterior: lead.vendedor_asignado_id, vendedor_nuevo: vendedorId },
      });
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <Logo subtitulo="Supervisión" />
        <div>
          <span>
            {agente.nombre} · {agente.rol === 'lider' ? 'Líder' : 'Capitán'}
          </span>
          <button onClick={() => exportarLeadsCSV(leads, vendedores)}>Exportar CSV</button>
          <button onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </header>
      <div className="supervisor-cuerpo">
        {agente.rol === 'lider' && (
          <div className="metricas-collapsible">
            <button
              className="metricas-toggle"
              onClick={() => setMetricasAbiertas((v) => !v)}
            >
              {metricasAbiertas ? '▾' : '▸'} Estadísticas del equipo
            </button>
            {metricasAbiertas && <Metricas leads={leads} vendedores={vendedores} />}
          </div>
        )}
        <div className="dashboard-cuerpo">
          <aside
            className={`dashboard-bandeja dashboard-bandeja-ancha${vistaMovil === 'chat' ? ' oculto-movil' : ''}`}
            style={{ width: sidebarWidth, minWidth: sidebarWidth }}
          >
            <LeadTable
              leads={leads}
              vendedores={vendedores}
              seleccionadoId={seleccionado?.id ?? null}
              onSeleccionar={(lead) => {
                setSeleccionado(lead);
                setVistaMovil('chat');
                setNoLeidos((prev) => {
                  if (!prev[lead.id]) return prev;
                  const siguiente = { ...prev };
                  delete siguiente[lead.id];
                  return siguiente;
                });
              }}
              onReasignar={onReasignar}
              noLeidos={noLeidos}
            />
          </aside>
          <div className="resizer oculto-movil" onMouseDown={onResizerMouseDown} />
          <main className={`dashboard-chat${vistaMovil === 'lista' ? ' oculto-movil' : ''}`}>
            {seleccionado ? (
              <LeadChat
                lead={seleccionado}
                agente={agente}
                onLeadActualizado={onLeadActualizado}
                onVolver={() => setVistaMovil('lista')}
              />
            ) : (
              <p className="dashboard-chat-vacio">Selecciona un lead de la lista.</p>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
