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
  entrega: 'En entrega',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

// Semáforo de SLA: la meta es primer toque humano en menos de 2 min.
// Devuelve la clase de la fila para que el capitán detecte el atraso de un vistazo.
export function claseSLA(lead: Lead): string {
  const sinTocar = (lead.estado === 'asignado' || lead.estado === 'perfilando') && !lead.primer_toque_humano_en;
  if (!sinTocar) return '';
  const minutos = (Date.now() - new Date(lead.creado_en).getTime()) / 60000;
  if (minutos >= 5) return 'sla-critico';
  if (minutos >= 2) return 'sla-alerta';
  return '';
}

function seguimientoVencido(lead: Lead): boolean {
  if (!lead.seguimiento_en) return false;
  if (lead.estado === 'ganado' || lead.estado === 'perdido') return false;
  return new Date(lead.seguimiento_en).getTime() <= Date.now();
}

type Filtro = 'sin_asignar' | 'sin_tocar' | 'seguimiento' | 'en_gestion' | 'propuesta_enviada' | 'documentacion' | 'entrega' | 'cerrados' | 'todos';

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'sin_asignar',       etiqueta: 'Sin asignar' },
  { id: 'sin_tocar',         etiqueta: 'Sin tocar' },
  { id: 'seguimiento',       etiqueta: 'Seguimiento hoy' },
  { id: 'en_gestion',        etiqueta: 'Contactado' },
  { id: 'propuesta_enviada', etiqueta: 'Propuesta' },
  { id: 'documentacion',     etiqueta: 'Documentación' },
  { id: 'entrega',           etiqueta: 'En entrega' },
  { id: 'cerrados',          etiqueta: 'Cerrados' },
  { id: 'todos',             etiqueta: 'Todos' },
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
    case 'seguimiento':
      return leads.filter(seguimientoVencido);
    case 'en_gestion':
      return leads.filter((l) => l.estado === 'en_gestion');
    case 'propuesta_enviada':
      return leads.filter((l) => l.estado === 'propuesta_enviada');
    case 'documentacion':
      return leads.filter((l) => l.estado === 'documentacion');
    case 'entrega':
      return leads.filter((l) => l.estado === 'entrega');
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
  const [busqueda, setBusqueda] = useState('');
  const leadsPorVendedor = vendedorFiltro === 'todos' ? leads : leads.filter((l) => l.vendedor_asignado_id === vendedorFiltro);

  // El teléfono se guarda en E.164 (+52…), pero el vendedor suele escribir solo
  // los 10 dígitos, así que comparamos ambos lados sin símbolos.
  const termino = busqueda.trim().toLowerCase();
  const digitos = termino.replace(/\D/g, '');
  const buscados = !termino
    ? leadsPorVendedor
    : leadsPorVendedor.filter((l) => {
        const porNombre = (l.nombre ?? '').toLowerCase().includes(termino);
        const porTelefono = digitos.length > 0 && l.telefono.replace(/\D/g, '').includes(digitos);
        return porNombre || porTelefono;
      });

  // Al buscar mostramos todos los estados: si el lead que busco está en
  // "Ganado" y la pestaña activa es "Sin tocar", esconderlo sería confuso.
  const visibles = termino ? buscados : aplicarFiltro(buscados, filtro);
  const nombreVendedor = (id: string | null) => vendedores.find((v) => v.id === id)?.nombre ?? '—';
  const vendedoresOrdenados = [...vendedores].sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="lead-table-wrap">
      <div className="lead-table-buscador">
        <input
          type="search"
          className="input-buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por teléfono o nombre…"
        />
        {termino && (
          <span className="buscador-resultado">
            {visibles.length} {visibles.length === 1 ? 'resultado' : 'resultados'} · todos los estados
          </span>
        )}
      </div>

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
            onClick={() => { setFiltro(f.id); setBusqueda(''); }}
          >
            {f.etiqueta} ({aplicarFiltro(buscados, f.id).length})
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
              className={[lead.id === seleccionadoId ? 'seleccionada' : '', claseSLA(lead)].filter(Boolean).join(' ')}
              onClick={() => onSeleccionar(lead)}
            >
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  {lead.nombre || lead.telefono}
                  {noLeidos[lead.id] > 0 && (
                    <span className="lead-badge">{noLeidos[lead.id]}</span>
                  )}
                  {lead.no_contactar && <span title="No contactar">🚫</span>}
                  {seguimientoVencido(lead) && <span title="Seguimiento vencido">⏰</span>}
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
                {termino ? `Ningún lead coincide con "${busqueda.trim()}".` : 'No hay leads en esta categoría.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
