import { useAgente } from './lib/useAgente';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { supabase } from './lib/supabaseClient';

export function App() {
  const { cargando, session, agente } = useAgente();

  if (cargando) return <p className="centro">Cargando…</p>;
  if (!session) return <Login />;

  if (!agente) {
    return (
      <div className="centro">
        <p>
          Tu usuario no está vinculado a ningún vendedor. Pide a tu Líder que añada tu
          <code> user_id</code> en la tabla <code>agentes</code>.
        </p>
        <button onClick={() => supabase.auth.signOut()}>Salir</button>
      </div>
    );
  }

  return <Dashboard agente={agente} />;
}
