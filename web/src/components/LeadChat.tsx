import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Agente, Lead, Mensaje } from '../lib/types';

interface Props {
  lead: Lead;
  agente: Agente;
  onLeadActualizado: (lead: Lead) => void;
  onVolver?: () => void;
}

export function LeadChat({ lead, agente, onLeadActualizado, onVolver }: Props) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState(lead.notas ?? '');
  const [notasGuardando, setNotasGuardando] = useState(false);
  const [mostrarNotas, setMostrarNotas] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const [imagen, setImagen] = useState<{ base64: string; mime: string; preview: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [enviandoImg, setEnviandoImg] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const notasTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotas(lead.notas ?? '');
  }, [lead.id, lead.notas]);

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

  function onCambiarNotas(valor: string) {
    setNotas(valor);
    if (notasTimer.current) clearTimeout(notasTimer.current);
    notasTimer.current = setTimeout(async () => {
      setNotasGuardando(true);
      await supabase.from('leads').update({ notas: valor }).eq('id', lead.id);
      setNotasGuardando(false);
    }, 1000);
  }

  function onPickImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setImagen({ base64, mime: file.type, preview: dataUrl });
      setCaption('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function enviarImagen() {
    if (!imagen) return;
    setEnviandoImg(true);
    setError(null);
    const { data: sesion } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/enviar-imagen', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sesion.session?.access_token}`,
      },
      body: JSON.stringify({ lead_id: lead.id, imageBase64: imagen.base64, mimeType: imagen.mime, caption }),
    });
    setEnviandoImg(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'No se pudo enviar la imagen');
    } else {
      setImagen(null);
      setCaption('');
    }
  }

  async function reactivarLead() {
    const confirmar = window.confirm(
      `¿Enviar plantilla de reactivación a ${lead.nombre || lead.telefono}?\n\n` +
      `Tiene un costo ~$0.05 USD por mensaje.\n` +
      `Úsala solo si el cliente no respondió y han pasado más de 24 horas.`,
    );
    if (!confirmar) return;
    setReactivando(true);
    setError(null);
    const { data: sesion } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/enviar-plantilla', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sesion.session?.access_token}`,
      },
      body: JSON.stringify({ lead_id: lead.id }),
    });
    setReactivando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'No se pudo enviar la plantilla');
    }
  }

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

  const cerrado = lead.estado === 'ganado' || lead.estado === 'perdido';
  const sinTocarMas24h =
    !lead.primer_toque_humano_en &&
    Date.now() - new Date(lead.creado_en).getTime() > 24 * 60 * 60 * 1000;

  return (
    <div className="lead-chat">
      <header className="lead-chat-header">
        <div className="lead-chat-header-izq">
          {onVolver && (
            <button className="btn-volver" onClick={onVolver} aria-label="Volver">
              ←
            </button>
          )}
          <div>
            <h2>{lead.nombre || lead.telefono}</h2>
            <p>
              {lead.telefono}
              {lead.producto_interes !== 'indefinido' && ` · ${lead.producto_interes}`}
              {lead.ciudad && ` · ${lead.ciudad}`}
            </p>
          </div>
        </div>
        <div className="lead-chat-acciones">
          <button
            className={`btn-notas${mostrarNotas ? ' activo' : ''}`}
            onClick={() => setMostrarNotas((v) => !v)}
            title="Notas internas"
          >
            📝
          </button>
          {lead.estado === 'asignado' && <button onClick={tomarLead}>Tomar</button>}
          {!cerrado && (
            <>
              <button className="btn-ganado" onClick={() => cerrarLead('ganado')}>✓</button>
              <button className="btn-perdido" onClick={() => cerrarLead('perdido')}>✗</button>
            </>
          )}
          {sinTocarMas24h && !cerrado && (
            <button
              className="btn-reactivar"
              onClick={reactivarLead}
              disabled={reactivando}
              title="Enviar plantilla de reactivación (tiene costo ~$0.05 USD)"
            >
              {reactivando ? '…' : '↩️ Reactivar'}
            </button>
          )}
        </div>
      </header>

      {mostrarNotas && (
        <div className="notas-panel">
          <div className="notas-panel-titulo">
            Notas internas {notasGuardando && <span className="notas-guardando">Guardando…</span>}
          </div>
          <textarea
            className="notas-textarea"
            value={notas}
            onChange={(e) => onCambiarNotas(e.target.value)}
            placeholder="Apuntes privados (no le llegan al cliente)…"
            rows={3}
          />
        </div>
      )}

      <div className="lead-chat-mensajes">
        {mensajes.map((m) => (
          <div key={m.id} className={`mensaje mensaje-${m.direccion}`}>
            <span className="mensaje-autor">{m.autor === 'agente' ? agente.nombre : m.autor}</span>
            <p>{m.cuerpo}</p>
          </div>
        ))}
        <div ref={finRef} />
      </div>

      {!cerrado && (
        <>
          {imagen && (
            <div className="imagen-preview">
              <img src={imagen.preview} alt="preview" className="imagen-preview-thumb" />
              <div className="imagen-preview-controles">
                <input
                  type="text"
                  className="imagen-caption-input"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Texto opcional (pie de foto)…"
                  disabled={enviandoImg}
                />
                <button className="btn-enviar-img" onClick={enviarImagen} disabled={enviandoImg}>
                  {enviandoImg ? 'Enviando…' : 'Enviar imagen'}
                </button>
                <button className="btn-cancelar-img" onClick={() => setImagen(null)} disabled={enviandoImg}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <form onSubmit={enviarMensaje} className="lead-chat-form">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onPickImagen}
            />
            <button
              type="button"
              className="btn-adjuntar"
              onClick={() => fileRef.current?.click()}
              title="Enviar imagen"
            >
              🖼️
            </button>
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
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
