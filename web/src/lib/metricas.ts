import type { Agente, Lead } from './types';

export interface ResumenGeneral {
  sinAsignar: number;
  sinTocar: number;
  enGestion: number;
  ganados: number;
  perdidos: number;
  tiempoPromedioTocaSeg: number | null; // promedio (primer_toque_humano_en - creado_en)
}

export interface ResumenVendedor {
  agenteId: string;
  nombre: string;
  disponible: boolean;
  asignados: number;
  sinTocar: number;
  enGestion: number;
  ganados: number;
  perdidos: number;
  tasaConversion: number | null; // ganados / (ganados + perdidos)
  tiempoPromedioTocaSeg: number | null;
}

function diffSegundos(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 1000;
}

export function calcularResumenGeneral(leads: Lead[]): ResumenGeneral {
  let sinAsignar = 0;
  let sinTocar = 0;
  let enGestion = 0;
  let ganados = 0;
  let perdidos = 0;
  let sumaToque = 0;
  let cuentaToque = 0;

  for (const l of leads) {
    if (!l.vendedor_asignado_id && l.estado !== 'ganado' && l.estado !== 'perdido') sinAsignar++;
    if ((l.estado === 'asignado' || l.estado === 'perfilando') && !l.primer_toque_humano_en) sinTocar++;
    if (l.estado === 'en_gestion') enGestion++;
    if (l.estado === 'ganado') ganados++;
    if (l.estado === 'perdido') perdidos++;
    if (l.primer_toque_humano_en) {
      sumaToque += diffSegundos(l.creado_en, l.primer_toque_humano_en);
      cuentaToque++;
    }
  }

  return {
    sinAsignar,
    sinTocar,
    enGestion,
    ganados,
    perdidos,
    tiempoPromedioTocaSeg: cuentaToque > 0 ? sumaToque / cuentaToque : null,
  };
}

export function calcularResumenPorVendedor(leads: Lead[], vendedores: Agente[]): ResumenVendedor[] {
  return vendedores.map((v) => {
    const propios = leads.filter((l) => l.vendedor_asignado_id === v.id);
    const ganados = propios.filter((l) => l.estado === 'ganado').length;
    const perdidos = propios.filter((l) => l.estado === 'perdido').length;
    const cerrados = ganados + perdidos;

    const tocados = propios.filter((l) => l.primer_toque_humano_en);
    const sumaToque = tocados.reduce(
      (acc, l) => acc + diffSegundos(l.creado_en, l.primer_toque_humano_en as string),
      0,
    );

    return {
      agenteId: v.id,
      nombre: v.nombre,
      disponible: v.disponible,
      asignados: propios.length,
      sinTocar: propios.filter((l) => (l.estado === 'asignado' || l.estado === 'perfilando') && !l.primer_toque_humano_en).length,
      enGestion: propios.filter((l) => l.estado === 'en_gestion').length,
      ganados,
      perdidos,
      tasaConversion: cerrados > 0 ? ganados / cerrados : null,
      tiempoPromedioTocaSeg: tocados.length > 0 ? sumaToque / tocados.length : null,
    };
  });
}

export function formatearDuracion(segundos: number | null): string {
  if (segundos === null) return '—';
  if (segundos < 60) return `${Math.round(segundos)}s`;
  const minutos = segundos / 60;
  if (minutos < 60) return `${minutos.toFixed(1)}min`;
  return `${(minutos / 60).toFixed(1)}h`;
}
