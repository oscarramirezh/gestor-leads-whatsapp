import type { Agente, Lead } from '../lib/types';
import {
  calcularResumenGeneral,
  calcularResumenPorVendedor,
  formatearDuracion,
} from '../lib/metricas';

export function Metricas({ leads, vendedores }: { leads: Lead[]; vendedores: Agente[] }) {
  const resumen = calcularResumenGeneral(leads);
  const porVendedor = calcularResumenPorVendedor(leads, vendedores);

  return (
    <section className="metricas">
      <div className="metricas-tarjetas">
        <div className="tarjeta">
          <strong>{resumen.sinAsignar}</strong>
          <span>Sin asignar</span>
        </div>
        <div className={resumen.sinTocar > 0 ? 'tarjeta tarjeta-alerta' : 'tarjeta'}>
          <strong>{resumen.sinTocar}</strong>
          <span>Asignados sin tocar</span>
        </div>
        <div className="tarjeta">
          <strong>{resumen.enGestion}</strong>
          <span>En gestión</span>
        </div>
        <div className="tarjeta">
          <strong>{resumen.ganados}</strong>
          <span>Ganados</span>
        </div>
        <div className="tarjeta">
          <strong>{resumen.perdidos}</strong>
          <span>Perdidos</span>
        </div>
        <div className="tarjeta">
          <strong>{formatearDuracion(resumen.tiempoPromedioTocaSeg)}</strong>
          <span>Tiempo medio a 1er toque</span>
        </div>
      </div>

      {porVendedor.length > 0 && (
        <table className="tabla-vendedores">
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Asignados</th>
              <th>Sin tocar</th>
              <th>En gestión</th>
              <th>Ganados</th>
              <th>Perdidos</th>
              <th>Conversión</th>
              <th>Tiempo medio a 1er toque</th>
            </tr>
          </thead>
          <tbody>
            {porVendedor.map((v) => (
              <tr key={v.agenteId}>
                <td>{v.nombre}</td>
                <td>{v.asignados}</td>
                <td className={v.sinTocar > 0 ? 'alerta' : ''}>{v.sinTocar}</td>
                <td>{v.enGestion}</td>
                <td>{v.ganados}</td>
                <td>{v.perdidos}</td>
                <td>{v.tasaConversion === null ? '—' : `${(v.tasaConversion * 100).toFixed(0)}%`}</td>
                <td>{formatearDuracion(v.tiempoPromedioTocaSeg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
