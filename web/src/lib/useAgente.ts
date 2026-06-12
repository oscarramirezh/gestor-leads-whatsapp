import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { Agente } from './types';

interface EstadoSesion {
  cargando: boolean;
  session: Session | null;
  agente: Agente | null;
}

// Maneja la sesión de Supabase Auth y carga la fila de `agentes` enlazada
// (agentes.user_id = auth.uid()). Si un usuario inicia sesión pero no tiene
// fila en `agentes`, agente queda en null (pantalla de "sin acceso").
export function useAgente(): EstadoSesion {
  const [cargando, setCargando] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [agente, setAgente] = useState<Agente | null>(null);

  useEffect(() => {
    let activo = true;

    async function cargarAgente(s: Session | null) {
      setSession(s);
      if (!s) {
        setAgente(null);
        setCargando(false);
        return;
      }
      const { data } = await supabase
        .from('agentes')
        .select('*')
        .eq('user_id', s.user.id)
        .maybeSingle();
      if (activo) {
        setAgente((data as Agente) ?? null);
        setCargando(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => cargarAgente(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setCargando(true);
      cargarAgente(s);
    });

    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { cargando, session, agente };
}
