import { useEffect, useRef } from 'react';

/**
 * Ejecuta `alVolver` cuando la pestaña vuelve a estar visible o se recupera la
 * conexión. Sirve para rellenar lo que Realtime se haya perdido mientras el
 * socket estuvo caído, sin que el usuario tenga que recargar.
 *
 * Reglas para que no se vean "brincos":
 *  - El callback SOLO debe recargar datos. Nunca tocar el lead seleccionado ni
 *    la vista activa: hacerlo cierra el chat que el vendedor tenía abierto.
 *  - Si los datos no cambiaron, el callback debe devolver el mismo arreglo para
 *    que React no re-renderice (ver `mismaLista`).
 *
 * Guardamos el callback en un ref para no re-registrar los listeners en cada
 * render ni quedarnos con una versión vieja de la función.
 */
export function useRefrescoSilencioso(alVolver: () => void) {
  const callbackRef = useRef(alVolver);

  useEffect(() => {
    callbackRef.current = alVolver;
  });

  useEffect(() => {
    function alVisible() {
      if (document.visibilityState !== 'visible') return;
      callbackRef.current();
    }
    document.addEventListener('visibilitychange', alVisible);
    window.addEventListener('online', alVisible);
    window.addEventListener('focus', alVisible);
    return () => {
      document.removeEventListener('visibilitychange', alVisible);
      window.removeEventListener('online', alVisible);
      window.removeEventListener('focus', alVisible);
    };
  }, []);
}

/**
 * true si ambas listas representan lo mismo (mismo largo y mismos extremos).
 * Se usa para conservar la referencia anterior y evitar renders innecesarios,
 * que en el chat provocarían un scroll automático fuera de lugar.
 */
export function mismaLista<T extends { id: string }>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return a[0].id === b[0].id && a[a.length - 1].id === b[b.length - 1].id;
}
