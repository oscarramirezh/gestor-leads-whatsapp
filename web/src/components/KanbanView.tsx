import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Agente, Lead, LeadEstado, Temperatura } from '../lib/types';

interface Props {
  leads: Lead[];
  vendedores: Agente[];
  agente: Agente;
  seleccionadoId: string | null;
  onSeleccionar: (lead: Lead) => void;
  onLeadActualizado: (lead: Lead) => void;
}

type ModoKanban = 'estado' | 'temperatura';

interface Columna {
  key: string;
  label: string;
  color: string;
}

const COLUMNAS_ESTADO: Columna[] = [
  { key: 'sin_tomar',         label: 'Sin tomar',          color: '#f3f4f6' },
  { key: 'en_gestion',        label: 'Contactado',         color: '#eff6ff' },
  { key: 'propuesta_enviada', label: 'Propuesta enviada',  color: '#fefce8' },
  { key: 'documentacion',     label: 'Documentación',      color: '#fdf4ff' },
  { key: 'ganado',            label: 'Ganado',             color: '#f0fdf4' },
  { key: 'perdido',           label: 'Perdido',            color: '#fff1f2' },
];

const COLUMNAS_TEMP: Columna[] = [
  { key: 'caliente',     label: '🔥 Caliente',     color: '#fff7ed' },
  { key: 'tibio',        label: '🌤 Tibio',         color: '#fefce8' },
  { key: 'frio',         label: '❄️ Frío',          color: '#eff6ff' },
  { key: 'sin_temp',     label: 'Sin clasificar',   color: '#f9fafb' },
];

function columnaDeEstado(lead: Lead): string {
  if (lead.estado === 'perfilando' || lead.estado === 'asignado') return 'sin_tomar';
  if (lead.estado === 'en_gestion') return 'en_gestion';
  if (lead.estado === 'propuesta_enviada') return 'propuesta_enviada';
  if (lead.estado === 'documentacion') return 'documentacion';
  if (lead.estado === 'ganado') return 'ganado';
  if (lead.estado === 'perdido') return 'perdido';
  return 'sin_tomar';
}

function columnaDeTemp(lead: Lead): string {
  return lead.temperatura ?? 'sin_temp';
}

const ESTADO_POR_COLUMNA: Record<string, LeadEstado> = {
  sin_tomar:         'asignado',
  en_gestion:        'en_gestion',
  propuesta_enviada: 'propuesta_enviada',
  documentacion:     'documentacion',
  ganado:            'ganado',
  perdido:           'perdido',
};

const TEMP_POR_COLUMNA: Record<string, Temperatura> = {
  caliente: 'caliente',
  tibio:    'tibio',
  frio:     'frio',
  sin_temp: null,
};

const TEMP_ICON: Record<string, string> = { caliente: '🔥', tibio: '🌤', frio: '❄️' };

export function KanbanView({ leads, vendedores, agente, seleccionadoId, onSeleccionar, onLeadActualizado }: Props) {
  const [modo, setModo] = useState<ModoKanban>('estado');
  const [sobreColumna, setSobreColumna] = useState<string | null>(null);

  const columnas = modo === 'estado' ? COLUMNAS_ESTADO : COLUMNAS_TEMP;

  function leadsDeColumna(col: Columna): Lead[] {
    return leads.filter((l) => (modo === 'estado' ? columnaDeEstado(l) : columnaDeTemp(l)) === col.key);
  }

  function nombreVendedor(id: string | null): string {
    if (!id) return '';
    return vendedores.find((v) => v.id === id)?.nombre ?? '';
  }

  function onDragStart(e: React.DragEvent, lead: Lead) {
    e.dataTransfer.setData('lead_id', lead.id);
  }

  async function onDrop(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    setSobreColumna(null);
    const leadId = e.dataTransfer.getData('lead_id');
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    let cambios: Partial<Lead> = {};
    if (modo === 'estado') {
      const nuevoEstado = ESTADO_POR_COLUMNA[colKey];
      if (!nuevoEstado || lead.estado === nuevoEstado) return;
      cambios = { estado: nuevoEstado };
      if (nuevoEstado === 'ganado' || nuevoEstado === 'perdido') {
        cambios.cerrado_en = new Date().toISOString();
      }
      if (nuevoEstado === 'en_gestion' && !lead.primer_toque_humano_en) {
        cambios.primer_toque_humano_en = new Date().toISOString();
      }
    } else {
      const nuevaTemp = TEMP_POR_COLUMNA[colKey];
      if (lead.temperatura === nuevaTemp) return;
      cambios = { temperatura: nuevaTemp };
    }

    const { data, error } = await supabase
      .from('leads').update(cambios).eq('id', leadId).select().single();
    if (!error && data) onLeadActualizado(data as Lead);
  }

  return (
    <div className="kanban-wrap">
      <div className="kanban-toolbar">
        <span className="kanban-toolbar-label">Ver por:</span>
        <button
          className={`kanban-tab${modo === 'estado' ? ' activo' : ''}`}
          onClick={() => setModo('estado')}
        >Estado</button>
        <button
          className={`kanban-tab${modo === 'temperatura' ? ' activo' : ''}`}
          onClick={() => setModo('temperatura')}
        >Temperatura</button>
      </div>

      <div className="kanban-board">
        {columnas.map((col) => {
          const items = leadsDeColumna(col);
          const sobre = sobreColumna === col.key;
          return (
            <div
              key={col.key}
              className={`kanban-col${sobre ? ' kanban-col-sobre' : ''}`}
              style={{ background: col.color }}
              onDragOver={(e) => { e.preventDefault(); setSobreColumna(col.key); }}
              onDragLeave={() => setSobreColumna(null)}
              onDrop={(e) => onDrop(e, col.key)}
            >
              <div className="kanban-col-header">
                <span className="kanban-col-titulo">{col.label}</span>
                <span className="kanban-col-count">{items.length}</span>
              </div>
              <div className="kanban-col-body">
                {items.map((lead) => (
                  <div
                    key={lead.id}
                    className={`kanban-card${seleccionadoId === lead.id ? ' kanban-card-activa' : ''}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, lead)}
                    onClick={() => onSeleccionar(lead)}
                  >
                    <div className="kanban-card-nombre">
                      {lead.temperatura && (
                        <span className="kanban-temp-icon">{TEMP_ICON[lead.temperatura]}</span>
                      )}
                      {lead.nombre || lead.telefono}
                    </div>
                    {lead.nombre && (
                      <div className="kanban-card-tel">{lead.telefono}</div>
                    )}
                    {agente.rol !== 'vendedor' && lead.vendedor_asignado_id && (
                      <div className="kanban-card-vendedor">{nombreVendedor(lead.vendedor_asignado_id)}</div>
                    )}
                    {lead.ciudad && (
                      <div className="kanban-card-meta">{lead.ciudad}{lead.producto_interes !== 'indefinido' ? ` · ${lead.producto_interes}` : ''}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
