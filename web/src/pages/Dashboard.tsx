import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Agente, Lead } from '../lib/types';
import { LeadList } from '../components/LeadList';
import { LeadChat } from '../components/LeadChat';
import { KanbanView } from '../components/KanbanView';
import { Logo } from '../components/Logo';

const ESTADOS_BANDEJA = ['perfilando', 'asignado', 'en_gestion', 'propuesta_enviada', 'documentacion', 'entrega'] as const;

export function Dashboard({ agente }: { agente: Agente }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [seleccionado, setSeleccionado] = useState<Lead | null>(null);
  const [noLeidos, setNoLeidos] = useState<Record<string, number>>({});
  const [disponible, setDisponible] = useState(agente.disponible);
  const [vistaMovil, setVistaMovil] = useState<'lista' | 'chat'>('lista');
  const [vistaPanel, setVistaPanel] = useState<'lista' | 'kanban'>('lista');
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const seleccionadoRef = React.useRef<Lead | null>(null);

  function onResizerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev: MouseEvent) {
      const next = Math.max(200, Math.min(520, startW + ev.clientX - startX));
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
      .from('leads')
      .select('*')
      .eq('vendedor_asignado_id', agente.id)
      .in('estado', ESTADOS_BANDEJA)
      .order('creado_en', { ascending: true })
      .then(({ data }) => {
        if (!activo) return;
        const lista = (data as Lead[]) ?? [];
        setLeads(lista);
        const idGuardado = localStorage.getItem('leadSeleccionadoId');
        if (idGuardado) {
          const leadGuardado = lista.find((l) => l.id === idGuardado);
          if (leadGuardado) {
            setSeleccionado(leadGuardado);
            setVistaMovil('chat');
          }
        }
      });

    const canalLeads = supabase
      .channel(`leads-vendedor-${agente.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `vendedor_asignado_id=eq.${agente.id}` },
        (payload) => {
          const lead = payload.new as Lead;
          setLeads((actuales) => {
            const sinEste = actuales.filter((l) => l.id !== lead.id);
            const enBandeja = (ESTADOS_BANDEJA as readonly string[]).includes(lead.estado);
            const siguiente = enBandeja
              ? [...sinEste, lead].sort((a, b) => a.creado_en.localeCompare(b.creado_en))
              : sinEste;
            return siguiente;
          });
          setSeleccionado((actual) => (actual?.id === lead.id ? lead : actual));
        },
      )
      .subscribe();

    const canalMensajes = supabase
      .channel(`mensajes-vendedor-${agente.id}`)
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
  }, [agente.id]);

  function onSeleccionar(lead: Lead) {
    setSeleccionado(lead);
    setVistaMovil('chat');
    localStorage.setItem('leadSeleccionadoId', lead.id);
    localStorage.setItem('vistaMovil', 'chat');
    setNoLeidos((prev) => {
      if (!prev[lead.id]) return prev;
      const siguiente = { ...prev };
      delete siguiente[lead.id];
      return siguiente;
    });
  }

  async function toggleDisponible() {
    const nuevo = !disponible;
    const { error } = await supabase.from('agentes').update({ disponible: nuevo }).eq('id', agente.id);
    if (!error) setDisponible(nuevo);
  }

  function onLeadActualizado(lead: Lead) {
    setSeleccionado(lead);
    setLeads((actuales) => {
      const enBandeja = (ESTADOS_BANDEJA as readonly string[]).includes(lead.estado);
      if (!enBandeja) return actuales.filter((l) => l.id !== lead.id);
      return actuales.map((l) => (l.id === lead.id ? lead : l));
    });
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <Logo subtitulo="Mis leads" />
        <div>
          <button
            className={`btn-disponible ${disponible ? 'activo' : 'pausado'}`}
            onClick={toggleDisponible}
            title={disponible ? 'Estás recibiendo leads — clic para pausar' : 'Pausado — clic para activar'}
          >
            <span className="punto-disponible" />
            {disponible ? 'Disponible' : 'Pausado'}
          </button>
          <div className="vista-tabs oculto-movil">
            <button className={`vista-tab${vistaPanel === 'lista' ? ' activo' : ''}`} onClick={() => setVistaPanel('lista')}>☰ Lista</button>
            <button className={`vista-tab${vistaPanel === 'kanban' ? ' activo' : ''}`} onClick={() => setVistaPanel('kanban')}>⊞ Kanban</button>
          </div>
          <span className="header-nombre">{agente.nombre}</span>
          <button onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </header>
      <div className="dashboard-cuerpo">
        {vistaPanel === 'kanban' ? (
          <div className="kanban-fullpane">
            <KanbanView
              leads={leads}
              vendedores={[agente]}
              agente={agente}
              seleccionadoId={seleccionado?.id ?? null}
              onSeleccionar={(lead) => { onSeleccionar(lead); setVistaPanel('lista'); setVistaMovil('chat'); }}
              onLeadActualizado={onLeadActualizado}
            />
          </div>
        ) : (
          <>
            <aside
              className={`dashboard-bandeja${vistaMovil === 'chat' ? ' oculto-movil' : ''}`}
              style={{ width: sidebarWidth, minWidth: sidebarWidth }}
            >
              <LeadList leads={leads} seleccionadoId={seleccionado?.id ?? null} onSeleccionar={onSeleccionar} noLeidos={noLeidos} />
            </aside>
            <div className="resizer oculto-movil" onMouseDown={onResizerMouseDown} />
            <main className={`dashboard-chat${vistaMovil === 'lista' ? ' oculto-movil' : ''}`}>
              {seleccionado ? (
                <LeadChat
                  lead={seleccionado}
                  agente={agente}
                  onLeadActualizado={onLeadActualizado}
                  onVolver={() => { setVistaMovil('lista'); localStorage.removeItem('leadSeleccionadoId'); localStorage.removeItem('vistaMovil'); }}
                />
              ) : (
                <p className="dashboard-chat-vacio">Selecciona un lead de la lista.</p>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
