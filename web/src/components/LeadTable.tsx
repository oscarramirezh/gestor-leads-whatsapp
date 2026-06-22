import { useState } from 'react';
import type { Agente, Lead, LeadEstado } from '../lib/types';
import { TiempoTranscurrido } from './TiempoTranscurrido';

const ETIQUETA_ESTADO: Record<LeadEstado, string> = {
  nuevo: 'Nuevo',
  perfilando: 'Calificando',
  asignado: 'Sin tocar',
  en_gestion: 'Contactado',
  propuesta_enviada: 'Propuesta',
  documentacion: 'Documentación',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

type Filtro = 'sin_asignar' | 'sin_tocar' | 'en_gestion' | 'propuesta_enviada' | 'documentacion' | 'cerrados' | 'todos';

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'sin_asignar',      etiqueta: 'Sin asignar' },
  { id: 'sin_tocar',        etiqueta: 'Sin tocar' },
  { id: 'en_gestion',       etiqueta: 'Contactado' },
  { id: 'propuesta_enviada', etiqueta: 'Propuesta' },
  { id: 'documentacion',    etiqueta: 'Documentación' },
  { id: 'cerrados',         etiqueta: 'Cerrados' },
  { id: 'todos',            etiqueta: 'Todos' },
];

function aplicarFiltro(leads: Lead[], filtro: Filtro): Lead[] {
  switch (filtro) {
    case 'sin_asignar':
      return leads.filter(
        (l) => !l.vendedor_asignado_id && l.estado !== 'ganado' && l.estado !== 'perdido',
      );
    case 'sin_tocar':
      return leads.filter(
        (l) => (l.estado === 'asignado' || l.estado === 'perfilando') && !l.primer_toque_humano_en,
      );
    case 'en_gestion':
      return leads.filter((l) => l.estado === 'en_gestion');
    case 'propuesta_enviada':
      return leads.filter((l) => l.estado === 'propuesta_enviada');
    case 'documentacion':
      return leads.filter((l) => l.estado === 'documentacion');
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
  noLeidos?: Record<string, number>;
}

export function LeadTable({ leads, vendedores, seleccionadoId, onSeleccionar, onReasignar, noLeidos = {} }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('sin_tocar');
  const [vendedorFiltro, setVendedorFiltro] = useState<string>('todos');
  const leadsPorVendedor = vendedorFiltro === 'todos' ? leads : leads.filter((l) => l.vendedor_asignado_id === vendedorFiltro);
  const visibles = aplicarFiltro(leadsPorVendedor, filtro);
  const nombreVendedor = (id: string | null) => vendedores.find((v) => v.id === id)?.nombre ?? '—';
  const vendedoresOrdenados = [...vendedores].sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="lead-table-wrap">
      <div className="lead-table-filtros">
        <select
          className="select-vendedor-filtro"
          value={vendedorFiltro}
          onChange={(e) => setVendedorFiltro(e.target.value)}
        >
          <option value="todos">Todos los agentes</option>
          {vendedoresOrdenados.map((v) => (
            <option key={v.id} value={v.id}>{v.nombre}</option>
          ))}
        </select>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            className={f.id === filtro ? 'filtro activo' : 'filtro'}
            onClick={() => setFiltro(f.id)}
          >
            {f.etiqueta} ({aplicarFiltro(leadsPorVendedor, f.id).length})
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
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  {lead.nombre || lead.telefono}
                  {noLeidos[lead.id] > 0 && (
                    <span className="lead-badge">{noLeidos[lead.id]}</span>
                  )}
                </span>
              </td>
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
