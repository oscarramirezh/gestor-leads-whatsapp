import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Agente, Lead } from '../lib/types';
import { LeadList } from '../components/LeadList';
import { LeadChat } from '../components/LeadChat';
import { Logo } from '../components/Logo';

const ESTADOS_BANDEJA = ['asignado', 'en_gestion'] as const;

export function Dashboard({ agente }: { agente: Agente }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [seleccionado, setSeleccionado] = useState<Lead | null>(null);
  const [noLeidos, setNoLeidos] = useState<Record<string, number>>({});
  const seleccionadoRef = React.useRef<Lead | null>(null);

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
        if (activo) setLeads((data as Lead[]) ?? []);
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
    setNoLeidos((prev) => {
      if (!prev[lead.id]) return prev;
      const siguiente = { ...prev };
      delete siguiente[lead.id];
      return siguiente;
    });
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
          <span>{agente.nombre}</span>
          <button onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </header>
      <div className="dashboard-cuerpo">
        <aside className="dashboard-bandeja">
          <LeadList leads={leads} seleccionadoId={seleccionado?.id ?? null} onSeleccionar={onSeleccionar} noLeidos={noLeidos} />
        </aside>
        <main className="dashboard-chat">
          {seleccionado ? (
            <LeadChat lead={seleccionado} agente={agente} onLeadActualizado={onLeadActualizado} />
          ) : (
            <p className="dashboard-chat-vacio">Selecciona un lead de la lista.</p>
          )}
        </main>
      </div>
    </div>
  );
}
