// Tipos espejo de supabase/schema.sql, solo con los campos que usa el dashboard.

export type ProductoTipo = 'portabilidad' | 'alta_nueva' | 'indefinido';
export type LeadEstado = 'nuevo' | 'perfilando' | 'asignado' | 'en_gestion' | 'propuesta_enviada' | 'documentacion' | 'entrega' | 'ganado' | 'perdido';
export type Temperatura = 'caliente' | 'tibio' | 'frio' | null;
export type AgenteRol = 'vendedor' | 'capitan' | 'lider';
export type MensajeDireccion = 'entrante' | 'saliente';
export type MensajeAutor = 'cliente' | 'bot' | 'agente';

export interface Agente {
  id: string;
  nombre: string;
  telefono: string;
  rol: AgenteRol;
  disponible: boolean;
  capitan_id: string | null;
  user_id: string | null;
}

export interface Lead {
  id: string;
  telefono: string;
  nombre: string | null;
  fuente_anuncio: string | null;
  producto_interes: ProductoTipo;
  ciudad: string | null;
  plan_interes: string | null;
  estado: LeadEstado;
  vendedor_asignado_id: string | null;
  creado_en: string;
  asignado_en: string | null;
  primer_toque_humano_en: string | null;
  cerrado_en: string | null;
  motivo_perdida: string | null;
  notas: string | null;
  temperatura: Temperatura;
  ultimo_mensaje_entrante_en: string | null;
  seguimiento_en: string | null;
  seguimiento_nota: string | null;
  no_contactar: boolean;
}

export interface RespuestaRapida {
  id: string;
  titulo: string;
  cuerpo: string;
  agente_id: string | null;
  creado_en: string;
}

// Opciones fijas para poder analizar por qué se pierden los leads.
// Con texto libre cada quien escribe distinto y no se puede agrupar.
export const MOTIVOS_PERDIDA = [
  'No contestó',
  'Precio / no le convenció',
  'Ya contrató con otro',
  'Fuera de cobertura',
  'Solo preguntaba',
  'Datos incorrectos',
  'Otro',
] as const;

export interface Mensaje {
  id: string;
  lead_id: string;
  direccion: MensajeDireccion;
  cuerpo: string | null;
  tipo: string;
  autor: MensajeAutor;
  agente_id: string | null;
  timestamp: string;
  reply_to_id: string | null;
  reply_to_cuerpo: string | null;
  reply_to_autor: string | null;
}
