// Cliente de Supabase para el LADO SERVIDOR (funciones de Netlify).
// Usa la SERVICE_ROLE_KEY, que se salta Row Level Security — por eso
// NUNCA debe usarse en el frontend ni subirse al código.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('Faltan las variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
}

export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false }, // en serverless no hay sesión de usuario que guardar
});
