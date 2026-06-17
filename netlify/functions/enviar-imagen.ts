import type { Handler } from '@netlify/functions';
import { supabase } from '../../src/lib/supabase';

function config() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('Faltan variables de entorno de WhatsApp');
  return { token, phoneNumberId };
}

async function subirMedia(base64: string, mimeType: string, token: string, phoneNumberId: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const blob = new Blob([buffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, 'imagen.jpg');
  form.append('type', mimeType);
  form.append('messaging_product', 'whatsapp');

  const res = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data: any = await res.json();
  if (!res.ok || !data.id) {
    throw new Error(`Error subiendo imagen: ${JSON.stringify(data)}`);
  }
  return data.id as string;
}

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

  let body: { lead_id?: string; imageBase64?: string; mimeType?: string; caption?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { lead_id, imageBase64, mimeType, caption } = body;
  if (!lead_id || !imageBase64 || !mimeType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan lead_id, imageBase64 o mimeType' }) };
  }

  if (!mimeType.startsWith('image/')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Solo se permiten imágenes' }) };
  }

  const { data: agente } = await supabase
    .from('agentes').select('*').eq('user_id', usuario.user.id).maybeSingle();
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

  let mediaId: string;
  try {
    const { token: waToken, phoneNumberId } = config();
    mediaId = await subirMedia(imageBase64, mimeType, waToken, phoneNumberId);
  } catch (err: any) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo subir la imagen a WhatsApp' }) };
  }

  const { token: waToken, phoneNumberId } = config();
  const msgBody: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: lead.telefono,
    type: 'image',
    image: { id: mediaId, ...(caption?.trim() ? { caption: caption.trim() } : {}) },
  };

  const res = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(msgBody),
  });
  const resData: any = await res.json();
  if (!res.ok) {
    console.error('Error enviando imagen:', resData);
    return { statusCode: 502, body: JSON.stringify({ error: 'WhatsApp rechazó el mensaje' }) };
  }

  const waMessageId = resData?.messages?.[0]?.id ?? null;
  await supabase.from('conversaciones').insert({
    lead_id,
    direccion: 'saliente',
    cuerpo: caption?.trim() ? `🖼️ ${caption.trim()}` : '🖼️ Imagen enviada',
    tipo: 'imagen',
    autor: 'agente',
    agente_id: agente.id,
    wa_message_id: waMessageId,
  });

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
