import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Agente, Lead, LeadEstado, Mensaje, ProductoTipo, RespuestaRapida, Temperatura } from '../lib/types';
import { MOTIVOS_PERDIDA } from '../lib/types';
import { useRefrescoSilencioso, mismaLista } from '../lib/useRefrescoSilencioso';

const ESTADOS_AVANCE: { valor: LeadEstado; label: string }[] = [
  { valor: 'en_gestion',        label: 'Contactado' },
  { valor: 'propuesta_enviada', label: 'Propuesta enviada' },
  { valor: 'documentacion',     label: 'Documentación' },
  { valor: 'entrega',           label: 'En entrega' },
];

const TEMPS: { valor: Temperatura; icon: string; label: string }[] = [
  { valor: 'caliente', icon: '🔥', label: 'Caliente' },
  { valor: 'tibio',    icon: '🌤', label: 'Tibio' },
  { valor: 'frio',     icon: '❄️', label: 'Frío' },
];

// Alta nueva paga bastante más comisión que portabilidad, así que marcarlo
// es lo que permite medir el mix de producto por vendedor y por anuncio.
const PRODUCTOS: { valor: ProductoTipo; corto: string; label: string }[] = [
  { valor: 'portabilidad', corto: 'PORT', label: 'Portabilidad' },
  { valor: 'alta_nueva',   corto: 'ALTA', label: 'Alta nueva' },
];

const SEGUIMIENTOS: { horas: number; label: string }[] = [
  { horas: 3,  label: 'En 3 horas' },
  { horas: 24, label: 'Mañana' },
  { horas: 72, label: 'En 3 días' },
];

interface Props {
  lead: Lead;
  agente: Agente;
  onLeadActualizado: (lead: Lead) => void;
  onVolver?: () => void;
}

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

/**
 * Reduce la foto antes de subirla.
 *
 * Una foto de celular pesa 3-6 MB, que en base64 son 4-8 MB. Netlify rechaza
 * el POST por tamaño ANTES de que corra la función, así que devuelve un 400
 * sin cuerpo JSON y el chat solo podía mostrar el error genérico.
 *
 * A 1600 px de lado y calidad 0.82 una foto queda en 200-500 KB, que además
 * viaja mucho más rápido con datos móviles. WhatsApp recomprime igual, así
 * que el cliente no nota diferencia.
 */
const LADO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.82;

/**
 * ¿El aparato se maneja con el dedo (sin teclado físico)?
 *
 * No se puede usar el ancho de pantalla: un teléfono en horizontal supera los
 * 760 px y volvería a tratarse como computadora. `pointer: coarse` mira el
 * puntero principal, así que da true en celular y tablet, y false en una
 * laptop —incluso con pantalla táctil— porque ahí manda el trackpad.
 *
 * En estos aparatos Enter escribe un salto de línea y solo se envía con el
 * botón, igual que en WhatsApp.
 */
function esTactil(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** El área de texto crece con el contenido, hasta un tope para no comerse el chat. */
const ALTO_MAXIMO_INPUT = 140;
function ajustarAlto(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, ALTO_MAXIMO_INPUT)}px`;
}

function prepararImagen(file: File): Promise<{ base64: string; mime: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();

      // Si el navegador no puede decodificarla (por ejemplo un HEIC en un
      // navegador sin soporte), mandamos el original y que decida el servidor.
      img.onerror = () =>
        resolve({ base64: dataUrl.split(',')[1], mime: file.type || 'image/jpeg', preview: dataUrl });

      img.onload = () => {
        let { width, height } = img;
        const mayor = Math.max(width, height);
        if (mayor > LADO_MAXIMO) {
          const escala = LADO_MAXIMO / mayor;
          width = Math.round(width * escala);
          height = Math.round(height * escala);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ base64: dataUrl.split(',')[1], mime: file.type || 'image/jpeg', preview: dataUrl });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const comprimida = canvas.toDataURL('image/jpeg', CALIDAD_JPEG);
        // Si comprimir no ayudó (imágenes ya pequeñas), nos quedamos con la original.
        const usarOriginal = comprimida.length >= dataUrl.length;
        const salida = usarOriginal ? dataUrl : comprimida;
        resolve({
          base64: salida.split(',')[1],
          mime: usarOriginal ? file.type || 'image/jpeg' : 'image/jpeg',
          preview: salida,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function LeadChat({ lead, agente, onLeadActualizado, onVolver }: Props) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const borrador_key = `borrador_${lead.id}`;
  const [texto, setTexto] = useState(() => localStorage.getItem(borrador_key) ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState(lead.notas ?? '');
  const [notasGuardando, setNotasGuardando] = useState(false);
  const [mostrarNotas, setMostrarNotas] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const [imagenes, setImagenes] = useState<{ base64: string; mime: string; preview: string }[]>([]);
  const [caption, setCaption] = useState('');
  const [enviandoImg, setEnviandoImg] = useState(false);
  const [progresoImg, setProgresoImg] = useState('');
  const [respondiendo, setRespondiendo] = useState<{ id: string; cuerpo: string; autor: string } | null>(null);
  const [respuestas, setRespuestas] = useState<RespuestaRapida[]>([]);
  const [mostrarRespuestas, setMostrarRespuestas] = useState(false);
  const [mostrarMotivos, setMostrarMotivos] = useState(false);
  const [motivoElegido, setMotivoElegido] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const notasTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number>(0);

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

  // Si el socket estuvo caído, aquí se recuperan los mensajes perdidos.
  // `mismaLista` evita re-renderizar cuando no hay nada nuevo: si no, el
  // efecto de arriba haría saltar el scroll cada vez que vuelves a la pestaña.
  useRefrescoSilencioso(async () => {
    const { data } = await supabase
      .from('conversaciones')
      .select('*')
      .eq('lead_id', lead.id)
      .order('timestamp', { ascending: true });
    const frescos = (data as Mensaje[]) ?? [];
    setMensajes((actuales) => (mismaLista(actuales, frescos) ? actuales : frescos));
  });

  // Las respuestas rápidas no cambian por lead: se cargan una vez.
  useEffect(() => {
    let activo = true;
    supabase
      .from('respuestas_rapidas')
      .select('*')
      .order('titulo')
      .then(({ data }) => {
        if (activo) setRespuestas((data as RespuestaRapida[]) ?? []);
      });
    return () => { activo = false; };
  }, []);

  // Cerrar el menú "Más" al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!menuAbierto) return;
    function alClic(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    }
    function alEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuAbierto(false);
    }
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alEscape);
    };
  }, [menuAbierto]);

  // El menú se cierra solo al cambiar de lead, si no queda abierto encima del siguiente chat.
  useEffect(() => {
    setMenuAbierto(false);
    setMostrarRespuestas(false);
    setMostrarMotivos(false);
    setMotivoElegido(null);
  }, [lead.id]);

  // Las aperturas llevan el nombre de quien escribe, así que una respuesta
  // global necesita variables. {agente} y {cliente} se sustituyen al insertar.
  function resolverVariables(cuerpo: string): string {
    const primerNombre = (lead.nombre ?? '').trim().split(/\s+/)[0] ?? '';
    let salida = cuerpo.replace(/\{agente\}/gi, agente.nombre.split(/\s+/)[0]);

    if (primerNombre) {
      salida = salida.replace(/\{cliente\}/gi, primerNombre);
    } else {
      // Muchos leads llegan sin nombre y el hueco se nota: "Hola , ..." o
      // "Sigo atendiéndote, . ...". Se quita junto con la puntuación sobrante,
      // pero conservando la coma cuando ésta va después ("Hola, soy Ángel").
      salida = salida
        .replace(/\s*\{cliente\}(\s*,)/gi, '$1')
        .replace(/\s*,?\s*\{cliente\}/gi, '');
    }
    return salida.replace(/\s{2,}/g, ' ').trim();
  }

  function insertarRespuesta(r: RespuestaRapida) {
    const cuerpo = resolverVariables(r.cuerpo);
    const nuevo = texto.trim() ? `${texto.trim()} ${cuerpo}` : cuerpo;
    setTexto(nuevo);
    localStorage.setItem(borrador_key, nuevo);
    setMostrarRespuestas(false);
    inputRef.current?.focus();
    // La respuesta suele ocupar varias líneas: hay que recalcular el alto.
    if (inputRef.current) ajustarAlto(inputRef.current);
  }

  function onCambiarNotas(valor: string) {
    setNotas(valor);
    if (notasTimer.current) clearTimeout(notasTimer.current);
    notasTimer.current = setTimeout(async () => {
      setNotasGuardando(true);
      await supabase.from('leads').update({ notas: valor }).eq('id', lead.id);
      setNotasGuardando(false);
    }, 1000);
  }

  async function onPickImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    setError(null);
    setProgresoImg('Preparando imagen…');
    try {
      for (const file of files) {
        const img = await prepararImagen(file);
        setImagenes((prev) => [...prev, img]);
      }
    } catch {
      setError('No se pudo leer la imagen. Intenta con otra.');
    }
    setProgresoImg('');
  }

  function quitarImagen(idx: number) {
    setImagenes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function enviarImagenes() {
    if (!imagenes.length) return;
    setEnviandoImg(true);
    setError(null);
    const token = await getToken();
    for (let i = 0; i < imagenes.length; i++) {
      const img = imagenes[i];
      setProgresoImg(`Enviando ${i + 1} de ${imagenes.length}…`);
      const isLast = i === imagenes.length - 1;
      const res = await fetch('/.netlify/functions/enviar-imagen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          imageBase64: img.base64,
          mimeType: img.mime,
          caption: isLast && caption.trim() ? caption.trim() : '',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        // Sin cuerpo JSON el rechazo viene de Netlify, no de nuestra función:
        // casi siempre es que el POST excedió el límite de tamaño.
        const detalle =
          data?.error ??
          (res.status === 400 || res.status === 413
            ? 'La imagen pesa demasiado para enviarse. Intenta con una foto más pequeña.'
            : `Falló el envío (código ${res.status}).`);
        setError(`Imagen ${i + 1}: ${detalle}`);
        setEnviandoImg(false);
        setProgresoImg('');
        return;
      }
    }
    setEnviandoImg(false);
    setProgresoImg('');
    setImagenes([]);
    setCaption('');
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
    const token = await getToken();
    const res = await fetch('/.netlify/functions/enviar-plantilla', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lead_id: lead.id }),
    });
    setReactivando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'No se pudo enviar la plantilla');
    }
  }

  function responderA(m: Mensaje) {
    const autor = m.autor === 'agente' ? agente.nombre : (lead.nombre || lead.telefono);
    setRespondiendo({ id: m.id, cuerpo: m.cuerpo ?? '📷 Imagen', autor });
    inputRef.current?.focus();
  }

  async function enviarMensaje(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);

    const token = await getToken();
    const res = await fetch('/.netlify/functions/enviar-mensaje', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lead_id: lead.id,
        texto,
        reply_to_id: respondiendo?.id ?? null,
        reply_to_cuerpo: respondiendo?.cuerpo ?? null,
        reply_to_autor: respondiendo?.autor ?? null,
      }),
    });

    setEnviando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'No se pudo enviar el mensaje');
      return;
    }
    setTexto('');
    localStorage.removeItem(borrador_key);
    setRespondiendo(null);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'; // vuelve a una línea
    }
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

  async function cambiarEstado(nuevoEstado: LeadEstado) {
    const cambios: Partial<Lead> = { estado: nuevoEstado };
    if (nuevoEstado === 'en_gestion' && !lead.primer_toque_humano_en) {
      cambios.primer_toque_humano_en = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('leads').update(cambios).eq('id', lead.id).select().single();
    if (!error && data) onLeadActualizado(data as Lead);
  }

  async function cambiarTemperatura(temp: Temperatura) {
    const nueva = lead.temperatura === temp ? null : temp;
    const { data, error } = await supabase
      .from('leads').update({ temperatura: nueva }).eq('id', lead.id).select().single();
    if (!error && data) onLeadActualizado(data as Lead);
  }

  async function cambiarProducto(producto: ProductoTipo) {
    const nuevo = lead.producto_interes === producto ? 'indefinido' : producto;
    const { data, error } = await supabase
      .from('leads').update({ producto_interes: nuevo }).eq('id', lead.id).select().single();
    if (!error && data) onLeadActualizado(data as Lead);
  }

  async function alternarNoContactar() {
    const nuevo = !lead.no_contactar;
    if (nuevo && !window.confirm('¿Marcar que este cliente NO quiere ser contactado?\n\nSe bloqueará el envío de mensajes.')) return;
    const { data, error } = await supabase
      .from('leads').update({ no_contactar: nuevo }).eq('id', lead.id).select().single();
    if (!error && data) onLeadActualizado(data as Lead);
  }

  async function fijarSeguimiento(horas: number | null) {
    const cambios: Partial<Lead> =
      horas === null
        ? { seguimiento_en: null, seguimiento_nota: null }
        : { seguimiento_en: new Date(Date.now() + horas * 3600_000).toISOString() };

    if (horas !== null) {
      const nota = window.prompt('Nota del recordatorio (opcional):') ?? '';
      cambios.seguimiento_nota = nota.trim() || null;
    }
    const { data, error } = await supabase
      .from('leads').update(cambios).eq('id', lead.id).select().single();
    if (!error && data) onLeadActualizado(data as Lead);
  }

  async function cerrarLead(estado: 'ganado' | 'perdido') {
    let motivo_perdida: string | null = null;
    if (estado === 'perdido') {
      if (!motivoElegido) {
        setMostrarMotivos(true);
        return;
      }
      motivo_perdida = motivoElegido;
    }

    const { data, error } = await supabase
      .from('leads')
      .update({ estado, cerrado_en: new Date().toISOString(), motivo_perdida })
      .eq('id', lead.id)
      .select()
      .single();

    if (!error && data) onLeadActualizado(data as Lead);
    setMostrarMotivos(false);
    setMotivoElegido(null);
  }

  const cerrado = lead.estado === 'ganado' || lead.estado === 'perdido';
  const enEntrega = lead.estado === 'entrega';
  const sinTocarMas24h =
    !lead.primer_toque_humano_en &&
    Date.now() - new Date(lead.creado_en).getTime() > 24 * 60 * 60 * 1000;

  // Ventana de servicio de WhatsApp: 24h desde el último mensaje del cliente.
  // Dentro de la ventana respondemos gratis; fuera, solo plantillas de pago.
  const ultimoEntrante = lead.ultimo_mensaje_entrante_en
    ? new Date(lead.ultimo_mensaje_entrante_en).getTime()
    : null;
  const horasDesdeEntrante = ultimoEntrante ? (Date.now() - ultimoEntrante) / 3600_000 : null;
  const ventanaCerrada = horasDesdeEntrante !== null && horasDesdeEntrante >= 24;
  const ventanaPorCerrar =
    horasDesdeEntrante !== null && horasDesdeEntrante >= 20 && horasDesdeEntrante < 24;
  const horasRestantes = horasDesdeEntrante !== null ? Math.max(0, Math.ceil(24 - horasDesdeEntrante)) : 0;

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
          {/* Temperatura: un clic, varias veces al día. Se queda a la vista. */}
          <div className="grupo-temp">
            {TEMPS.map((t) => (
              <button
                key={t.valor}
                className={`btn-temp${lead.temperatura === t.valor ? ' activo' : ''}`}
                onClick={() => cambiarTemperatura(t.valor)}
                title={t.label}
              >
                {t.icon}
              </button>
            ))}
          </div>

          {/* Avance del lead: lo que el vendedor toca en cada conversación. */}
          {(lead.estado === 'asignado' || lead.estado === 'perfilando') && (
            <button className="btn-tomar" onClick={tomarLead}>Tomar</button>
          )}
          {!['ganado', 'perdido', 'asignado', 'perfilando'].includes(lead.estado) && (
            <select
              className="select-estado"
              value={lead.estado}
              onChange={(e) => cambiarEstado(e.target.value as LeadEstado)}
            >
              {ESTADOS_AVANCE.map((s) => (
                <option key={s.valor} value={s.valor}>{s.label}</option>
              ))}
            </select>
          )}
          {!cerrado && (
            <div className="grupo-cierre">
              <button
                className="btn-ganado"
                onClick={() => cerrarLead('ganado')}
                title={enEntrega ? 'Confirmar ganado' : 'Marcar ganado'}
              >
                {enEntrega ? '✓ Confirmar' : '✓'}
              </button>
              <button className="btn-perdido" onClick={() => cerrarLead('perdido')} title="Marcar perdido">✗</button>
            </div>
          )}

          {/* Todo lo ocasional vive aquí, con etiquetas de texto en vez de iconos sueltos. */}
          <div className="menu-mas" ref={menuRef}>
            <button
              className={`btn-mas${menuAbierto ? ' activo' : ''}`}
              onClick={() => setMenuAbierto((v) => !v)}
              title="Más acciones"
              aria-haspopup="menu"
              aria-expanded={menuAbierto}
            >
              ⋯
            </button>
            {menuAbierto && (
              <div className="menu-panel" role="menu">
                <button
                  className="menu-item"
                  onClick={() => { setMostrarNotas((v) => !v); setMenuAbierto(false); }}
                >
                  📝 Notas internas
                  {lead.notas?.trim() && <span className="menu-punto" />}
                </button>

                <div className="menu-seccion">Producto</div>
                {PRODUCTOS.map((p) => (
                  <button
                    key={p.valor}
                    className={`menu-item${lead.producto_interes === p.valor ? ' activo' : ''}`}
                    onClick={() => { cambiarProducto(p.valor); setMenuAbierto(false); }}
                  >
                    {lead.producto_interes === p.valor ? '● ' : '○ '}{p.label}
                  </button>
                ))}

                <div className="menu-seccion">Recordarme</div>
                {SEGUIMIENTOS.map((s) => (
                  <button
                    key={s.horas}
                    className="menu-item"
                    onClick={() => { fijarSeguimiento(s.horas); setMenuAbierto(false); }}
                  >
                    ⏰ {s.label}
                  </button>
                ))}
                {lead.seguimiento_en && (
                  <button
                    className="menu-item"
                    onClick={() => { fijarSeguimiento(null); setMenuAbierto(false); }}
                  >
                    ✕ Quitar recordatorio
                  </button>
                )}

                <div className="menu-separador" />
                {sinTocarMas24h && !cerrado && (
                  <button
                    className="menu-item"
                    onClick={() => { reactivarLead(); setMenuAbierto(false); }}
                    disabled={reactivando}
                  >
                    ↩️ Reactivar <span className="menu-costo">~$0.05</span>
                  </button>
                )}
                <button
                  className={`menu-item${lead.no_contactar ? ' peligro' : ''}`}
                  onClick={() => { alternarNoContactar(); setMenuAbierto(false); }}
                >
                  🚫 {lead.no_contactar ? 'Permitir contacto' : 'No contactar'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Los avisos van en una sola franja para que no empujen el chat hacia abajo. */}
      {(lead.no_contactar || ventanaCerrada || ventanaPorCerrar || lead.seguimiento_en) && (
        <div className="avisos-fila">
          {lead.no_contactar && (
            <span className="aviso aviso-bloqueo" title="El envío está bloqueado">
              🚫 No contactar
            </span>
          )}
          {!lead.no_contactar && ventanaCerrada && (
            <span className="aviso aviso-bloqueo" title="Un mensaje normal no le llegará; usa la plantilla de reactivación">
              ⏳ Ventana de 24 h cerrada
            </span>
          )}
          {!lead.no_contactar && ventanaPorCerrar && (
            <span className="aviso aviso-alerta" title="Después solo podrás escribirle con plantilla de pago">
              ⏳ Cierra en ~{horasRestantes} h
            </span>
          )}
          {lead.seguimiento_en && (
            <span className="aviso aviso-info" title={lead.seguimiento_nota ?? 'Recordatorio de seguimiento'}>
              ⏰ {new Date(lead.seguimiento_en).toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </div>
      )}

      {mostrarMotivos && (
        <div className="motivos-panel">
          <div className="motivos-titulo">¿Por qué se perdió?</div>
          <div className="motivos-opciones">
            {MOTIVOS_PERDIDA.map((m) => (
              <button
                key={m}
                className={`motivo-chip${motivoElegido === m ? ' activo' : ''}`}
                onClick={() => setMotivoElegido(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="motivos-acciones">
            <button
              className="btn-perdido"
              disabled={!motivoElegido}
              onClick={() => cerrarLead('perdido')}
            >
              Marcar perdido
            </button>
            <button onClick={() => { setMostrarMotivos(false); setMotivoElegido(null); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

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
            spellCheck
            lang="es"
          />
        </div>
      )}

      <div className="lead-chat-mensajes">
        {mensajes.map((m, idx) => {
          const fechaActual = new Date(m.timestamp).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' });
          const fechaAnterior = idx > 0 ? new Date(mensajes[idx - 1].timestamp).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
          const mostrarSeparador = fechaActual !== fechaAnterior;
          const hoy = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' });
          const ayer = new Date(Date.now() - 86400000).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' });
          const etiquetaFecha = fechaActual === hoy ? 'Hoy' : fechaActual === ayer ? 'Ayer' : fechaActual;
          return (
            <React.Fragment key={m.id}>
              {mostrarSeparador && (
                <div className="mensaje-separador-fecha">
                  <span>{etiquetaFecha}</span>
                </div>
              )}
              <div
                className={`mensaje-fila mensaje-fila-${m.direccion}`}
                onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  const dx = e.changedTouches[0].clientX - touchStartX.current;
                  if (dx > 50) responderA(m);
                }}
              >
                <div className={`mensaje mensaje-${m.direccion}`}>
                  {m.reply_to_cuerpo && (
                    <div className="mensaje-cita">
                      <span className="mensaje-cita-autor">{m.reply_to_autor}</span>
                      <span className="mensaje-cita-texto">{m.reply_to_cuerpo}</span>
                    </div>
                  )}
                  <span className="mensaje-autor">{m.autor === 'agente' ? agente.nombre : m.autor}</span>
                  {m.tipo === 'imagen' && m.direccion === 'entrante' && m.cuerpo ? (
                    <a href={m.cuerpo} target="_blank" rel="noreferrer">
                      <img src={m.cuerpo} alt="imagen del cliente" className="mensaje-imagen" />
                    </a>
                  ) : (
                    <p>{m.cuerpo}</p>
                  )}
                  <span className="mensaje-hora">
                    {new Date(m.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}
                  </span>
                </div>
                <button className="btn-responder" onClick={() => responderA(m)} title="Responder">↩</button>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={finRef} />
      </div>

      {true && (
        <>
          {imagenes.length > 0 && (
            <div className="imagen-preview">
              <div className="imagen-preview-fila">
                {imagenes.map((img, idx) => (
                  <div key={idx} className="imagen-preview-item">
                    <img src={img.preview} alt={`imagen ${idx + 1}`} className="imagen-preview-thumb" />
                    <button
                      className="btn-quitar-img"
                      onClick={() => quitarImagen(idx)}
                      disabled={enviandoImg}
                      title="Quitar imagen"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="imagen-preview-controles">
                <input
                  type="text"
                  className="imagen-caption-input"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Texto opcional en última imagen…"
                  disabled={enviandoImg}
                />
                <button className="btn-enviar-img" onClick={enviarImagenes} disabled={enviandoImg}>
                  {enviandoImg ? progresoImg : `Enviar ${imagenes.length > 1 ? `${imagenes.length} imágenes` : 'imagen'}`}
                </button>
                <button className="btn-cancelar-img" onClick={() => { setImagenes([]); setCaption(''); }} disabled={enviandoImg}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {respondiendo && (
            <div className="responder-preview">
              <div className="responder-preview-contenido">
                <span className="responder-preview-autor">{respondiendo.autor}</span>
                <span className="responder-preview-texto">{respondiendo.cuerpo}</span>
              </div>
              <button type="button" className="responder-cancelar" onClick={() => setRespondiendo(null)}>✕</button>
            </div>
          )}
          {mostrarRespuestas && (
            <div className="respuestas-panel">
              {respuestas.length === 0 ? (
                <p className="respuestas-vacio">
                  Aún no hay respuestas rápidas. Se crean en la tabla
                  <code> respuestas_rapidas</code> de Supabase.
                </p>
              ) : (
                respuestas.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="respuesta-item"
                    onClick={() => insertarRespuesta(r)}
                  >
                    <span className="respuesta-titulo">
                      {r.titulo}
                      {r.agente_id && <span className="respuesta-personal">personal</span>}
                    </span>
                    <span className="respuesta-cuerpo">{resolverVariables(r.cuerpo)}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <form onSubmit={enviarMensaje} className="lead-chat-form">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={onPickImagen}
            />
            <button
              type="button"
              className={`btn-respuestas${mostrarRespuestas ? ' activo' : ''}`}
              onClick={() => setMostrarRespuestas((v) => !v)}
              title="Respuestas rápidas"
            >
              ⚡
            </button>
            <button
              type="button"
              className="btn-adjuntar"
              onClick={() => fileRef.current?.click()}
              title="Enviar imagen"
            >
              🖼️
            </button>
            <textarea
              ref={inputRef}
              className="input-mensaje"
              rows={1}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                localStorage.setItem(borrador_key, e.target.value);
                ajustarAlto(e.target);
              }}
              onKeyDown={(e) => {
                // En celular y tablet nunca interceptamos Enter: escribe un
                // salto de línea y se envía solo con la flecha.
                if (esTactil()) return;
                // Con teclado físico: Enter envía, Shift+Enter hace párrafo.
                if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
                  e.preventDefault();
                  enviarMensaje(e);
                }
              }}
              placeholder={lead.no_contactar ? 'Cliente marcado como no contactar' : 'Escribe un mensaje…'}
              disabled={enviando || lead.no_contactar}
              spellCheck
              lang="es"
              autoCapitalize="sentences"
            />
            <button
              type="submit"
              className="btn-enviar-msg"
              disabled={enviando || !texto.trim() || lead.no_contactar}
              aria-label="Enviar mensaje"
            >
              {/* En táctil se muestra la flecha; con teclado, la palabra. */}
              <span className="enviar-texto">Enviar</span>
              <span className="enviar-flecha" aria-hidden="true">➤</span>
            </button>
          </form>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
