// Permite a un vendedor responder un lead desde el dashboard.
// URL: https://TU-SITIO.netlify.app/.netlify/functions/enviar-mensaje
//
// El navegador manda el JWT de Supabase Auth (sesión del vendedor) en
// Authorization: Bearer <token>. Esta función lo valida con la
// SERVICE_ROLE_KEY, comprueba que el lead esté asignado a ese vendedor (o que
// sea capitán/líder), envía el mensaje por la Cloud API y lo registra en
// `conversaciones`.

import type { Handler } from '@netlify/functions';
import { supabase } from '../../src/lib/supabase';
import { enviarTexto } from '../../src/lib/whatsapp';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  const token = event.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Falta token de sesión' }) };

  const { data: usuario, error: errorAuth } = await supabase.auth.getUser(token);
  if (errorAuth || !usuario?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida' }) };
  }

  let body: { lead_id?: string; texto?: string; reply_to_id?: string; reply_to_cuerpo?: string; reply_to_autor?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { lead_id, texto, reply_to_id, reply_to_cuerpo, reply_to_autor } = body;
  if (!lead_id || !texto?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan lead_id y/o texto' }) };
  }

  const { data: agente } = await supabase
    .from('agentes')
    .select('*')
    .eq('user_id', usuario.user.id)
    .maybeSingle();
  if (!agente) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Tu usuario no está vinculado a ningún agente' }) };
  }

  const { data: lead } = await supabase.from('leads').select('*').eq('id', lead_id).maybeSingle();
  if (!lead) return { statusCode: 404, body: JSON.stringify({ error: 'Lead no encontrado' }) };

  const puedeEscribir =
    lead.vendedor_asignado_id === agente.id || agente.rol === 'capitan' || agente.rol === 'lider';
  if (!puedeEscribir) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Este lead no está asignado a tu cuenta' }) };
  }

  // El bloqueo real va aquí, no solo en la UI: escribirle a quien pidió no ser
  // contactado genera reportes y baja el quality rating del número en Meta.
  if (lead.no_contactar) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Este cliente pidió no ser contactado' }) };
  }

  const waMessageId = await enviarTexto(lead.telefono, texto.trim());
  if (!waMessageId) {
    return { statusCode: 502, body: JSON.stringify({ error: 'La Cloud API no aceptó el mensaje' }) };
  }

  const { error: errorInsert } = await supabase.from('conversaciones').insert({
    lead_id,
    direccion: 'saliente',
    cuerpo: texto.trim(),
    tipo: 'texto',
    autor: 'agente',
    agente_id: agente.id,
    wa_message_id: waMessageId,
    reply_to_id: reply_to_id ?? null,
    reply_to_cuerpo: reply_to_cuerpo ?? null,
    reply_to_autor: reply_to_autor ?? null,
  });
  if (errorInsert) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Mensaje enviado pero no se pudo registrar' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
