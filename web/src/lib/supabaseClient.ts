// Cliente de Supabase para el NAVEGADOR. Usa la clave "anon" (pública) y
// respeta Row Level Security: cada vendedor solo ve lo que sus políticas
// (supabase/schema.sql) le permiten.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY (revisa tu .env)');
}

export const supabase = createClient(url, anonKey);
