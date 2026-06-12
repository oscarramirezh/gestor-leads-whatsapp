import { useEffect, useState } from 'react';

function formatear(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  return `${horas}h ${minutos % 60}min`;
}

/** Reloj en vivo: "hace Xmin" desde `desde`. Se actualiza cada segundo. */
export function TiempoTranscurrido({ desde }: { desde: string }) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const segundos = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 1000));
  const urgente = segundos > 5 * 60; // alerta de SLA: > 5 min sin primer toque

  return <span className={urgente ? 'tiempo urgente' : 'tiempo'}>hace {formatear(segundos)}</span>;
}
