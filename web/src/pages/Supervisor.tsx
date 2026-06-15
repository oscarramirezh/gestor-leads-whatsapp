import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let activo = true;

    supabase
      .from('agentes')
      .select('*')
      .eq('rol', 'vendedor')
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

    const canal = supabase
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

    return () => {
      activo = false;
      supabase.removeChannel(canal);
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

    if (error || !data) return;
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
        <Metricas leads={leads} vendedores={vendedores} />
        <div className="dashboard-cuerpo">
          <aside className="dashboard-bandeja dashboard-bandeja-ancha">
            <LeadTable
              leads={leads}
              vendedores={vendedores}
              seleccionadoId={seleccionado?.id ?? null}
              onSeleccionar={setSeleccionado}
              onReasignar={onReasignar}
            />
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
    </div>
  );
}
