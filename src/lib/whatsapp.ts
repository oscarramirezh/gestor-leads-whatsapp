// Envío de mensajes por la WhatsApp Cloud API (Graph API de Meta).
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

const GRAPH_VERSION = 'v23.0';

function config() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error('Faltan WHATSAPP_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID');
  }
  return { token, phoneNumberId };
}

async function llamarGraphApi(body: Record<string, unknown>): Promise<string | null> {
  const { token, phoneNumberId } = config();
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    // Logueamos el error pero no tiramos la función: Meta reintentaría el
    // webhook entero y duplicaríamos trabajo.
    console.error('Error de la Cloud API:', res.status, JSON.stringify(data));
    return null;
  }
  // Devolvemos el wa_message_id para guardarlo en `conversaciones`.
  return data?.messages?.[0]?.id ?? null;
}

/** Mensaje de texto simple. */
export function enviarTexto(telefono: string, texto: string) {
  return llamarGraphApi({
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'text',
    text: { body: texto },
  });
}

/**
 * Mensaje con botones de respuesta rápida (máximo 3 botones, título de 20
 * caracteres máx.). El cliente toca un botón y el webhook recibe el `id`.
 */
export function enviarBotones(
  telefono: string,
  texto: string,
  botones: { id: string; titulo: string }[],
) {
  return llamarGraphApi({
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: texto },
      action: {
        buttons: botones.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.titulo },
        })),
      },
    },
  });
}
