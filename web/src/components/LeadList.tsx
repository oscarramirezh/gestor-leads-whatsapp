import type { Lead } from '../lib/types';
import { TiempoTranscurrido } from './TiempoTranscurrido';

const ETIQUETA_PRODUCTO: Record<Lead['producto_interes'], string> = {
  portabilidad: 'Portabilidad',
  alta_nueva: 'Alta nueva',
  indefinido: '—',
};

const ETIQUETA_ESTADO: Record<Lead['estado'], string> = {
  nuevo: 'Nuevo',
  perfilando: 'Calificando',
  asignado: 'Sin tocar',
  en_gestion: 'En gestión',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

interface Props {
  leads: Lead[];
  seleccionadoId: string | null;
  onSeleccionar: (lead: Lead) => void;
  noLeidos?: Record<string, number>;
}

export function LeadList({ leads, seleccionadoId, onSeleccionar, noLeidos = {} }: Props) {
  if (leads.length === 0) {
    return <p className="lead-list-vacio">No tienes leads asignados por ahora.</p>;
  }

  return (
    <ul className="lead-list">
      {leads.map((lead) => (
        <li
          key={lead.id}
          className={lead.id === seleccionadoId ? 'lead-item seleccionado' : 'lead-item'}
          onClick={() => onSeleccionar(lead)}
        >
          <div className="lead-item-encabezado">
            <strong>{lead.nombre || lead.telefono}</strong>
            <div className="lead-item-badges">
              {noLeidos[lead.id] > 0 && (
                <span className="lead-badge">{noLeidos[lead.id]}</span>
              )}
              <span className={`estado estado-${lead.estado}`}>{ETIQUETA_ESTADO[lead.estado]}</span>
            </div>
          </div>
          <div className="lead-item-detalle">
            <span>{ETIQUETA_PRODUCTO[lead.producto_interes]}</span>
            {lead.ciudad && <span> · {lead.ciudad}</span>}
          </div>
          {!lead.primer_toque_humano_en && <TiempoTranscurrido desde={lead.creado_en} />}
        </li>
      ))}
    </ul>
  );
}
