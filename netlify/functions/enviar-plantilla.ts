import type { Handler } from '@netlify/functions';
import { supabase } from '../../src/lib/supabase';
import { enviarPlantillaReenganche } from '../../src/lib/whatsapp';

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

  let body: { lead_id?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { lead_id } = body;
  if (!lead_id) return { statusCode: 400, body: JSON.stringify({ error: 'Falta lead_id' }) };

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

  if (lead.no_contactar) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Este cliente pidió no ser contactado' }) };
  }

  const waMessageId = await enviarPlantillaReenganche(lead.telefono, lead.nombre ?? '');

  if (!waMessageId) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        error:
          'Meta rechazó la plantilla. Verifica que "reenganche_lead" esté aprobada en el Administrador de WhatsApp.',
      }),
    };
  }

  await supabase.from('conversaciones').insert({
    lead_id,
    direccion: 'saliente',
    cuerpo: '📋 Plantilla de reenganche enviada',
    tipo: 'texto',
    autor: 'agente',
    agente_id: agente.id,
    wa_message_id: waMessageId,
  });

  await supabase.from('eventos').insert({
    lead_id,
    tipo_evento: 'plantilla_reenganche',
    agente_id: agente.id,
    payload: { plantilla: 'reenganche_lead' },
  });

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
