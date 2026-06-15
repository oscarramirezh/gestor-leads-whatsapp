import { useState } from 'react';
import type { Agente, Lead, LeadEstado } from '../lib/types';
import { TiempoTranscurrido } from './TiempoTranscurrido';

const ETIQUETA_ESTADO: Record<LeadEstado, string> = {
  nuevo: 'Nuevo',
  perfilando: 'Calificando',
  asignado: 'Sin tocar',
  en_gestion: 'En gestión',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

type Filtro = 'sin_asignar' | 'sin_tocar' | 'en_gestion' | 'cerrados' | 'todos';

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'sin_asignar', etiqueta: 'Sin asignar' },
  { id: 'sin_tocar', etiqueta: 'Sin tocar' },
  { id: 'en_gestion', etiqueta: 'En gestión' },
  { id: 'cerrados', etiqueta: 'Cerrados' },
  { id: 'todos', etiqueta: 'Todos' },
];

function aplicarFiltro(leads: Lead[], filtro: Filtro): Lead[] {
  switch (filtro) {
    case 'sin_asignar':
      return leads.filter(
        (l) => !l.vendedor_asignado_id && l.estado !== 'ganado' && l.estado !== 'perdido',
      );
    case 'sin_tocar':
      return leads.filter((l) => l.estado === 'asignado' && !l.primer_toque_humano_en);
    case 'en_gestion':
      return leads.filter((l) => l.estado === 'en_gestion');
    case 'cerrados':
      return leads.filter((l) => l.estado === 'ganado' || l.estado === 'perdido');
    case 'todos':
      return leads;
  }
}

interface Props {
  leads: Lead[];
  vendedores: Agente[];
  seleccionadoId: string | null;
  onSeleccionar: (lead: Lead) => void;
  onReasignar: (lead: Lead, nuevoVendedorId: string) => void;
}

export function LeadTable({ leads, vendedores, seleccionadoId, onSeleccionar, onReasignar }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('sin_tocar');
  const visibles = aplicarFiltro(leads, filtro);
  const nombreVendedor = (id: string | null) => vendedores.find((v) => v.id === id)?.nombre ?? '—';

  return (
    <div className="lead-table-wrap">
      <div className="lead-table-filtros">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            className={f.id === filtro ? 'filtro activo' : 'filtro'}
            onClick={() => setFiltro(f.id)}
          >
            {f.etiqueta} ({aplicarFiltro(leads, f.id).length})
          </button>
        ))}
      </div>

      <table className="lead-table">
        <thead>
          <tr>
            <th>Lead</th>
            <th>Producto</th>
            <th>Ciudad</th>
            <th>Estado</th>
            <th>Vendedor</th>
            <th>Tiempo</th>
            <th>Reasignar</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((lead) => (
            <tr
              key={lead.id}
              className={lead.id === seleccionadoId ? 'seleccionada' : ''}
              onClick={() => onSeleccionar(lead)}
            >
              <td>{lead.nombre || lead.telefono}</td>
              <td>{lead.producto_interes}</td>
              <td>{lead.ciudad || '—'}</td>
              <td>
                <span className={`estado estado-${lead.estado}`}>{ETIQUETA_ESTADO[lead.estado]}</span>
              </td>
              <td>{nombreVendedor(lead.vendedor_asignado_id)}</td>
              <td>
                {lead.estado === 'ganado' || lead.estado === 'perdido' ? (
                  '—'
                ) : !lead.primer_toque_humano_en ? (
                  <TiempoTranscurrido desde={lead.creado_en} />
                ) : (
                  '—'
                )}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <select
                  value={lead.vendedor_asignado_id ?? ''}
                  onChange={(e) => onReasignar(lead, e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {visibles.length === 0 && (
            <tr>
              <td colSpan={7} className="lead-table-vacio">
                No hay leads en esta categoría.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
