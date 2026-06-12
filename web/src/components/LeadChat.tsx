import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Agente, Lead, Mensaje } from '../lib/types';

interface Props {
  lead: Lead;
  agente: Agente;
  onLeadActualizado: (lead: Lead) => void;
}

export function LeadChat({ lead, agente, onLeadActualizado }: Props) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let activo = true;

    supabase
      .from('conversaciones')
      .select('*')
      .eq('lead_id', lead.id)
      .order('timestamp', { ascending: true })
      .then(({ data }) => {
        if (activo) setMensajes((data as Mensaje[]) ?? []);
      });

    const canal = supabase
      .channel(`conversaciones-${lead.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversaciones', filter: `lead_id=eq.${lead.id}` },
        (payload) => setMensajes((actuales) => [...actuales, payload.new as Mensaje]),
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [lead.id]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function enviarMensaje(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);

    const { data: sesion } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/enviar-mensaje', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sesion.session?.access_token}`,
      },
      body: JSON.stringify({ lead_id: lead.id, texto }),
    });

    setEnviando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'No se pudo enviar el mensaje');
      return;
    }
    setTexto('');
  }

  async function tomarLead() {
    const ahora = new Date().toISOString();
    const cambios: Partial<Lead> = { estado: 'en_gestion' };
    if (!lead.primer_toque_humano_en) cambios.primer_toque_humano_en = ahora;

    const { data, error } = await supabase
      .from('leads')
      .update(cambios)
      .eq('id', lead.id)
      .select()
      .single();

    if (!error && data) onLeadActualizado(data as Lead);
  }

  async function cerrarLead(estado: 'ganado' | 'perdido') {
    let motivo_perdida: string | null = null;
    if (estado === 'perdido') {
      motivo_perdida = window.prompt('¿Por qué se perdió este lead?') ?? '';
      if (!motivo_perdida) return;
    }

    const { data, error } = await supabase
      .from('leads')
      .update({ estado, cerrado_en: new Date().toISOString(), motivo_perdida })
      .eq('id', lead.id)
      .select()
      .single();

    if (!error && data) onLeadActualizado(data as Lead);
  }

  return (
    <div className="lead-chat">
      <header className="lead-chat-header">
        <div>
          <h2>{lead.nombre || lead.telefono}</h2>
          <p>
            {lead.telefono} · {lead.producto_interes} {lead.ciudad ? `· ${lead.ciudad}` : ''}
          </p>
        </div>
        <div className="lead-chat-acciones">
          {lead.estado === 'asignado' && <button onClick={tomarLead}>Tomar</button>}
          {lead.estado !== 'ganado' && lead.estado !== 'perdido' && (
            <>
              <button onClick={() => cerrarLead('ganado')}>Marcar ganado</button>
              <button onClick={() => cerrarLead('perdido')}>Marcar perdido</button>
            </>
          )}
        </div>
      </header>

      <div className="lead-chat-mensajes">
        {mensajes.map((m) => (
          <div key={m.id} className={`mensaje mensaje-${m.direccion}`}>
            <span className="mensaje-autor">{m.autor === 'agente' ? agente.nombre : m.autor}</span>
            <p>{m.cuerpo}</p>
          </div>
        ))}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviarMensaje} className="lead-chat-form">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un mensaje…"
          disabled={enviando}
        />
        <button type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
