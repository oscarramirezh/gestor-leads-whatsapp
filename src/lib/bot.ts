// Bot de calificación: 3–4 preguntas acotadas al negocio antes de pasar el
// lead a un vendedor humano. NO es un chatbot de IA de propósito general
// (Meta los prohíbe desde el 15-ene-2026); es una máquina de estados fija.
//
// El estado se guarda en la columna `bot_paso` del lead:
//   0  = no iniciado            3 = esperando ciudad
//   1  = esperando plan         4 = esperando confirmación de nombre
//   2  = esperando producto     5 = esperando nombre escrito a mano
//   99 = bot terminado (lead listo para asignar)

export const BOT_TERMINADO = 99;

/** Lo que el webhook extrajo del mensaje entrante. */
export interface EntradaBot {
  texto: string;          // cuerpo del mensaje (o título del botón pulsado)
  botonId?: string;       // id del botón interactivo, si pulsó uno
  nombrePerfil?: string;  // nombre del perfil de WhatsApp del cliente
}

/** Una respuesta que el bot quiere mandar. */
export type RespuestaBot =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'botones'; texto: string; botones: { id: string; titulo: string }[] };

/** Resultado de procesar un mensaje: qué actualizar en el lead y qué responder. */
export interface ResultadoBot {
  updates: Record<string, unknown>; // columnas del lead a actualizar
  respuestas: RespuestaBot[];
  terminado: boolean; // true => el webhook debe disparar la asignación round-robin
}

/** El cliente pidió hablar con una persona: saltamos el bot y asignamos ya. */
export function pideHumano(texto: string): boolean {
  return /\b(humano|asesor|agente|persona|vendedor|llamen|ll[aá]mame)\b/i.test(texto);
}

const PREGUNTA_PLAN: RespuestaBot = {
  tipo: 'texto',
  texto:
    '¡Hola! 👋 Gracias por escribirnos a MejoraTuTarifa.\n\n' +
    'Para darte la mejor oferta Movistar, cuéntame: ¿qué plan te interesa, ' +
    'o cuánto pagas hoy por tu línea?',
};

const PREGUNTA_PRODUCTO: RespuestaBot = {
  tipo: 'botones',
  texto: '¿Quieres conservar tu número actual o sacar una línea nueva?',
  botones: [
    { id: 'producto_portabilidad', titulo: 'Conservar mi número' },
    { id: 'producto_alta_nueva', titulo: 'Línea nueva' },
  ],
};

const PREGUNTA_CIUDAD: RespuestaBot = {
  tipo: 'texto',
  texto: '¡Perfecto! 📍 ¿De qué ciudad nos escribes?',
};

function preguntaNombre(nombrePerfil?: string): RespuestaBot {
  if (nombrePerfil) {
    return {
      tipo: 'botones',
      texto: `Última pregunta: ¿te llamas ${nombrePerfil}?`,
      botones: [
        { id: 'nombre_si', titulo: 'Sí, soy yo' },
        { id: 'nombre_otro', titulo: 'Es otro nombre' },
      ],
    };
  }
  return { tipo: 'texto', texto: 'Última pregunta: ¿cuál es tu nombre?' };
}

const MENSAJE_FINAL: RespuestaBot = {
  tipo: 'texto',
  texto:
    '¡Listo! ✅ Ya tengo todo. En un momento te atiende uno de nuestros ' +
    'asesores con tu oferta personalizada. 🚀',
};

/**
 * Deduce portabilidad / alta nueva a partir de texto libre, por si el
 * cliente escribe en vez de tocar el botón.
 */
function detectarProducto(texto: string, botonId?: string): string {
  if (botonId === 'producto_portabilidad') return 'portabilidad';
  if (botonId === 'producto_alta_nueva') return 'alta_nueva';
  if (/portab|conservar|mantener|mi n[uú]mero|me quedo/i.test(texto)) return 'portabilidad';
  if (/nueva|nuevo|otra l[ií]nea|adicional/i.test(texto)) return 'alta_nueva';
  return 'indefinido';
}

/**
 * Avanza la máquina de estados un paso. El webhook es quien aplica los
 * `updates` en la base y manda las `respuestas` — esta función es pura
 * (no toca la red ni la base) para que sea fácil de testear.
 */
export function avanzarBot(
  lead: { bot_paso: number; nombre: string | null },
  entrada: EntradaBot,
): ResultadoBot {
  const texto = entrada.texto.trim();

  // Escape: en cualquier paso, si pide humano, terminamos el bot ya.
  if (pideHumano(texto)) {
    return {
      updates: { bot_paso: BOT_TERMINADO },
      respuestas: [
        { tipo: 'texto', texto: '¡Claro! Ahora mismo te paso con un asesor. 🙋' },
      ],
      terminado: true,
    };
  }

  switch (lead.bot_paso) {
    case 0: // primer mensaje del lead: saludar y preguntar plan
      return {
        updates: { bot_paso: 1, estado: 'perfilando' },
        respuestas: [PREGUNTA_PLAN],
        terminado: false,
      };

    case 1: // respondió el plan
      return {
        updates: { plan_interes: texto, bot_paso: 2 },
        respuestas: [PREGUNTA_PRODUCTO],
        terminado: false,
      };

    case 2: // respondió portabilidad / línea nueva
      return {
        updates: { producto_interes: detectarProducto(texto, entrada.botonId), bot_paso: 3 },
        respuestas: [PREGUNTA_CIUDAD],
        terminado: false,
      };

    case 3: // respondió la ciudad
      return {
        updates: { ciudad: texto, bot_paso: 4 },
        respuestas: [preguntaNombre(entrada.nombrePerfil)],
        terminado: false,
      };

    case 4: // confirmó (o no) su nombre
      if (entrada.botonId === 'nombre_otro') {
        return {
          updates: { bot_paso: 5 },
          respuestas: [{ tipo: 'texto', texto: 'Sin problema, ¿cómo te llamas?' }],
          terminado: false,
        };
      }
      return {
        updates: {
          nombre: entrada.botonId === 'nombre_si' ? entrada.nombrePerfil : texto,
          bot_paso: BOT_TERMINADO,
        },
        respuestas: [MENSAJE_FINAL],
        terminado: true,
      };

    case 5: // escribió su nombre a mano
      return {
        updates: { nombre: texto, bot_paso: BOT_TERMINADO },
        respuestas: [MENSAJE_FINAL],
        terminado: true,
      };

    default:
      // Bot ya terminado: no respondemos nada, el mensaje es para el vendedor.
      return { updates: {}, respuestas: [], terminado: false };
  }
}
