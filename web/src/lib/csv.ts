import type { Agente, Lead } from './types';

const COLUMNAS: { etiqueta: string; valor: (lead: Lead, nombreVendedor: string) => string }[] = [
  { etiqueta: 'Nombre', valor: (l) => l.nombre ?? '' },
  { etiqueta: 'Teléfono', valor: (l) => l.telefono },
  { etiqueta: 'Producto', valor: (l) => l.producto_interes },
  { etiqueta: 'Ciudad', valor: (l) => l.ciudad ?? '' },
  { etiqueta: 'Plan de interés', valor: (l) => l.plan_interes ?? '' },
  { etiqueta: 'Estado', valor: (l) => l.estado },
  { etiqueta: 'Fuente del anuncio', valor: (l) => l.fuente_anuncio ?? '' },
  { etiqueta: 'Vendedor', valor: (_l, nombreVendedor) => nombreVendedor },
  { etiqueta: 'Creado', valor: (l) => l.creado_en },
  { etiqueta: 'Asignado', valor: (l) => l.asignado_en ?? '' },
  { etiqueta: 'Primer toque humano', valor: (l) => l.primer_toque_humano_en ?? '' },
  { etiqueta: 'Cerrado', valor: (l) => l.cerrado_en ?? '' },
  { etiqueta: 'Motivo de pérdida', valor: (l) => l.motivo_perdida ?? '' },
];

function celda(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

/** Genera un CSV de los leads dados y dispara su descarga en el navegador. */
export function exportarLeadsCSV(leads: Lead[], vendedores: Agente[]) {
  const nombrePorId = new Map(vendedores.map((v) => [v.id, v.nombre]));
  const filas = [
    COLUMNAS.map((c) => c.etiqueta),
    ...leads.map((lead) => {
      const nombreVendedor = lead.vendedor_asignado_id
        ? nombrePorId.get(lead.vendedor_asignado_id) ?? lead.vendedor_asignado_id
        : '';
      return COLUMNAS.map((c) => celda(c.valor(lead, nombreVendedor)));
    }),
  ];

  // BOM al inicio para que Excel detecte UTF-8 (acentos, ñ).
  const csv = '﻿' + filas.map((fila) => fila.join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
