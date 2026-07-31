import { useState } from 'react';
import type { Lead } from '../lib/types';
import { TiempoTranscurrido } from './TiempoTranscurrido';
import { claseSLA } from './LeadTable';

const ETIQUETA_PRODUCTO: Record<Lead['producto_interes'], string> = {
  portabilidad: 'Portabilidad',
  alta_nueva: 'Alta nueva',
  indefinido: '—',
};

const ETIQUETA_ESTADO: Record<Lead['estado'], string> = {
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

interface Props {
  leads: Lead[];
  seleccionadoId: string | null;
  onSeleccionar: (lead: Lead) => void;
  noLeidos?: Record<string, number>;
}

export function LeadList({ leads, seleccionadoId, onSeleccionar, noLeidos = {} }: Props) {
  const [busqueda, setBusqueda] = useState('');

  // El teléfono va en E.164 (+52…) y el vendedor teclea solo los dígitos.
  const termino = busqueda.trim().toLowerCase();
  const digitos = termino.replace(/\D/g, '');
  const visibles = !termino
    ? leads
    : leads.filter((l) => {
        const porNombre = (l.nombre ?? '').toLowerCase().includes(termino);
        const porTelefono = digitos.length > 0 && l.telefono.replace(/\D/g, '').includes(digitos);
        return porNombre || porTelefono;
      });

  if (leads.length === 0) {
    return <p className="lead-list-vacio">No tienes leads asignados por ahora.</p>;
  }

  return (
    <>
      <div className="lead-list-buscador">
        <input
          type="search"
          className="input-buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar teléfono o nombre…"
        />
      </div>
      {visibles.length === 0 && (
        <p className="lead-list-vacio">Ningún lead coincide con "{busqueda.trim()}".</p>
      )}
      <ul className="lead-list">
      {visibles.map((lead) => (
        <li
          key={lead.id}
          className={[
            'lead-item',
            lead.id === seleccionadoId ? 'seleccionado' : '',
            claseSLA(lead),
          ].filter(Boolean).join(' ')}
          onClick={() => onSeleccionar(lead)}
        >
          <div className="lead-item-encabezado">
            <strong>{lead.nombre || lead.telefono}</strong>
            <div className="lead-item-badges">
              {lead.no_contactar && <span title="No contactar">🚫</span>}
              {lead.seguimiento_en &&
                new Date(lead.seguimiento_en).getTime() <= Date.now() && (
                  <span title="Seguimiento vencido">⏰</span>
                )}
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
    </>
  );
}
