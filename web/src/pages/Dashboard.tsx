import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Agente, Lead } from '../lib/types';
import { LeadList } from '../components/LeadList';
import { LeadChat } from '../components/LeadChat';

const ESTADOS_BANDEJA = ['asignado', 'en_gestion'] as const;

export function Dashboard({ agente }: { agente: Agente }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [seleccionado, setSeleccionado] = useState<Lead | null>(null);

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

    const canal = supabase
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

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [agente.id]);

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
        <h1>Mis leads</h1>
        <div>
          <span>{agente.nombre}</span>
          <button onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </header>
      <div className="dashboard-cuerpo">
        <aside className="dashboard-bandeja">
          <LeadList leads={leads} seleccionadoId={seleccionado?.id ?? null} onSeleccionar={setSeleccionado} />
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
