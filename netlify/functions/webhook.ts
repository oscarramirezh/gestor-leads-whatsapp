// Webhook de la WhatsApp Cloud API.
// URL final: https://TU-SITIO.netlify.app/.netlify/functions/webhook
//
// Meta lo llama de dos formas:
//   GET  -> una sola vez, al configurar el webhook (verificación).
//   POST -> cada vez que entra un mensaje, cambia un estado, etc.

import type { Handler, HandlerEvent } from '@netlify/functions';
import * as crypto from 'node:crypto';
import { supabase } from '../../src/lib/supabase';
import { enviarTexto, enviarBotones } from '../../src/lib/whatsapp';
import type { RespuestaBot } from '../../src/lib/bot';

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'GET') return verificarSuscripcion(event);
  if (event.httpMethod === 'POST') return procesarNotificacion(event);
  return { statusCode: 405, body: 'Método no permitido' };
};

// ---------- GET: verificación inicial del webhook ----------
// Meta manda hub.verify_token (el que tú inventaste y pusiste en las dos
// partes: panel de Meta y variable de entorno). Si coincide, devolvemos
// hub.challenge tal cual y la suscripción queda activa.
function verificarSuscripcion(event: HandlerEvent) {
  const params = event.queryStringParameters ?? {};
  if (
    params['hub.mode'] === 'subscribe' &&
    params['hub.verify_token'] === process.env.META_VERIFY_TOKEN
  ) {
    return { statusCode: 200, body: params['hub.challenge'] ?? '' };
  }
  return { statusCode: 403, body: 'Token de verificación incorrecto' };
}

// ---------- Firma: comprobar que el POST viene de Meta de verdad ----------
// Meta firma el cuerpo crudo con tu App Secret (HMAC SHA-256) y manda la
// firma en la cabecera x-hub-signature-256. Si no coincide, alguien está
// intentando suplantar a Meta y rechazamos.
function firmaValida(event: HandlerEvent): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error('Falta META_APP_SECRET — rechazando por seguridad');
    return false;
  }
  const firma = event.headers['x-hub-signature-256'];
  if (!firma || !event.body) return false;

  const esperada =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(event.body, 'utf8').digest('hex');

  // timingSafeEqual evita ataques de temporización; exige misma longitud.
  if (firma.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
}

// ---------- POST: mensaje entrante ----------
async function procesarNotificacion(event: HandlerEvent) {
  if (!firmaValida(event)) {
    return { statusCode: 401, body: 'Firma inválida' };
  }

  let payload: any;
  try {
    payload = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  // El payload puede traer varios mensajes agrupados; los recorremos todos.
  // Cualquier cosa que no sea un mensaje (estados de entrega, etc.) se ignora.
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;

      for (const mensaje of value.messages) {
        try {
          await procesarMensaje(mensaje, value.contacts?.[0]);
        } catch (err) {
          // Logueamos pero seguimos: un mensaje malo no debe tirar el lote.
          console.error('Error procesando mensaje', mensaje?.id, err);
        }
      }
    }
  }

  // Siempre 200 rápido: si Meta no recibe 200, reintenta y duplica trabajo.
  return { statusCode: 200, body: 'OK' };
}

async function procesarMensaje(mensaje: any, contacto: any) {
  // wa_id viene sin "+" (ej. "5215512345678"); lo guardamos en E.164.
  const telefono = '+' + (mensaje.from ?? '');
  const nombrePerfil: string | undefined = contacto?.profile?.name;

  // Extraer el texto según el tipo de mensaje.
  let texto = '';
  let botonId: string | undefined;
  let tipo = mensaje.type ?? 'desconocido';
  let mediaUrl: string | null = null;

  if (mensaje.type === 'text') {
    texto = mensaje.text?.body ?? '';
  } else if (mensaje.type === 'interactive' && mensaje.interactive?.button_reply) {
    botonId = mensaje.interactive.button_reply.id;
    texto = mensaje.interactive.button_reply.title ?? '';
    tipo = 'boton';
  } else if (mensaje.type === 'button' && mensaje.button) {
    botonId = mensaje.button.payload;
    texto = mensaje.button.text ?? '';
    tipo = 'boton';
  } else if (mensaje.type === 'image' && mensaje.image?.id) {
    mediaUrl = await descargarYGuardarImagen(mensaje.image.id, mensaje.image.mime_type ?? 'image/jpeg');
    tipo = 'imagen';
  }

  // 1. Buscar el lead por teléfono; si no existe, crearlo.
  let { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('telefono', telefono)
    .maybeSingle();

  const esNuevo = !lead;
  let asignadoEsteRequest = false;
  if (!lead) {
    // El anuncio click-to-WhatsApp llega en mensaje.referral: ahí viene qué
    // anuncio trajo al cliente (clave para medir qué creativo funciona).
    const fuente =
      mensaje.referral?.source_id ??
      mensaje.referral?.headline ??
      mensaje.referral?.source_url ??
      null;

    const { data: creado, error } = await supabase
      .from('leads')
      .insert({
        telefono,
        nombre: null, // se confirma con el bot, no asumimos el del perfil
        fuente_anuncio: fuente,
        primer_mensaje: texto || `[${tipo}]`,
        estado: 'nuevo',
      })
      .select('*')
      .single();
    if (error) throw error;
    lead = creado;

    await supabase.from('eventos').insert({
      lead_id: lead.id,
      tipo_evento: 'lead_creado',
      payload: { fuente_anuncio: fuente, tipo_mensaje: tipo },
    });

    // Asignar inmediatamente al entrar, sin esperar a que termine el bot.
    const { data: agenteId, error: errorAsig } = await supabase.rpc('asignar_lead', {
      p_lead_id: lead.id,
    });
    if (errorAsig) {
      console.error('Error en asignar_lead (inmediato):', errorAsig);
    } else {
      asignadoEsteRequest = true;
      console.log(
        agenteId
          ? `Lead ${lead.id} asignado al agente ${agenteId} al entrar`
          : `Lead ${lead.id} SIN asignar: no hay agentes disponibles`,
      );
      // Recargar lead para tener vendedor_asignado_id actualizado.
      const { data: leadActualizado } = await supabase
        .from('leads')
        .select('*')
        .eq('id', lead.id)
        .single();
      if (leadActualizado) lead = leadActualizado;
    }
  }

  // 2. Registrar el mensaje entrante. El unique de wa_message_id nos protege
  //    de duplicados: si Meta reintenta el webhook, el insert falla con 23505
  //    y cortamos aquí para no responderle dos veces al cliente.
  const { error: errorMensaje } = await supabase.from('conversaciones').insert({
    lead_id: lead.id,
    direccion: 'entrante',
    cuerpo: mediaUrl ?? (texto || null),
    tipo,
    autor: 'cliente',
    wa_message_id: mensaje.id,
    timestamp: mensaje.timestamp
      ? new Date(Number(mensaje.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
  });
  if (errorMensaje) {
    if (errorMensaje.code === '23505') {
      console.log('Mensaje duplicado (reintento de Meta), ignorado:', mensaje.id);
      return;
    }
    throw errorMensaje;
  }

  // 3. Si el lead ya está con un vendedor, no responder automáticamente.
  if (!esNuevo) return;

  // 4. Primer mensaje: solo bienvenida, sin preguntas de perfilamiento.
  await enviarRespuestaBot(lead.id, telefono, {
    tipo: 'texto',
    texto: '¡Hola! 👋 Gracias por contactarnos. En un momento uno de nuestros asesores te atenderá. 😊',
  });

  // Si por alguna razón no se asignó al entrar (no había agentes disponibles), intentar ahora.
  if (!asignadoEsteRequest && !lead.vendedor_asignado_id) {
    const { data: agenteId, error } = await supabase.rpc('asignar_lead', { p_lead_id: lead.id });
    if (error) console.error('Error en asignar_lead (fallback):', error);
    else console.log(agenteId ? `Lead ${lead.id} asignado (fallback) a ${agenteId}` : `Lead ${lead.id} sin asignar`);
  }
}

/** Descarga una imagen de WhatsApp y la sube a Supabase Storage. Devuelve la URL pública. */
async function descargarYGuardarImagen(mediaId: string, mimeType: string): Promise<string | null> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return null;

  try {
    // 1. Obtener la URL temporal de descarga desde Meta
    const metaRes = await fetch(`https://graph.facebook.com/v23.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) return null;
    const metaData: any = await metaRes.json();
    const downloadUrl: string = metaData.url;
    if (!downloadUrl) return null;

    // 2. Descargar los bytes de la imagen
    const imgRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!imgRes.ok) return null;
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // 3. Subir a Supabase Storage (bucket: chat-media)
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const ruta = `entrantes/${mediaId}.${ext}`;
    const { error } = await supabase.storage
      .from('chat-media')
      .upload(ruta, buffer, { contentType: mimeType, upsert: true });
    if (error) {
      console.error('Error subiendo imagen a Storage:', error);
      return null;
    }

    // 4. Devolver URL pública
    const { data } = supabase.storage.from('chat-media').getPublicUrl(ruta);
    return data.publicUrl;
  } catch (err) {
    console.error('Error descargando imagen de WhatsApp:', err);
    return null;
  }
}

/** Manda una respuesta del bot y la registra en el hilo de conversación. */
async function enviarRespuestaBot(leadId: string, telefono: string, respuesta: RespuestaBot) {
  const waMessageId =
    respuesta.tipo === 'botones'
      ? await enviarBotones(telefono, respuesta.texto, respuesta.botones)
      : await enviarTexto(telefono, respuesta.texto);

  await supabase.from('conversaciones').insert({
    lead_id: leadId,
    direccion: 'saliente',
    cuerpo: respuesta.texto,
    tipo: respuesta.tipo === 'botones' ? 'boton' : 'texto',
    autor: 'bot',
    wa_message_id: waMessageId,
  });
}
