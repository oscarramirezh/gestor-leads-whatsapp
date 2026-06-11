// Simulación del bot en consola, sin tocar WhatsApp ni la base de datos.
// Ejecutar con: node scripts/probar-bot.ts
import { avanzarBot, BOT_TERMINADO, type EntradaBot } from '../src/lib/bot.ts';

function simular(nombre: string, mensajes: EntradaBot[]) {
  console.log(`\n=== Escenario: ${nombre} ===`);
  const lead = { bot_paso: 0, nombre: null as string | null };

  for (const entrada of mensajes) {
    console.log(`  Cliente: ${entrada.texto}${entrada.botonId ? ` [botón ${entrada.botonId}]` : ''}`);
    const r = avanzarBot(lead, entrada);
    for (const resp of r.respuestas) {
      const botones = resp.tipo === 'botones' ? ` ${JSON.stringify(resp.botones.map((b) => b.titulo))}` : '';
      console.log(`  Bot: ${resp.texto.replace(/\n/g, ' ')}${botones}`);
    }
    Object.assign(lead, r.updates);
    console.log(`  -> updates: ${JSON.stringify(r.updates)} | terminado: ${r.terminado}`);
  }

  if (lead.bot_paso !== BOT_TERMINADO) {
    console.log(`  ⚠ El bot NO terminó (bot_paso=${lead.bot_paso})`);
  }
}

simular('Flujo feliz con botones', [
  { texto: 'Hola, vi su anuncio', nombrePerfil: 'Carlos M' },
  { texto: 'Pago 400 al mes con Telcel', nombrePerfil: 'Carlos M' },
  { texto: 'Conservar mi número', botonId: 'producto_portabilidad', nombrePerfil: 'Carlos M' },
  { texto: 'Guadalajara', nombrePerfil: 'Carlos M' },
  { texto: 'Sí, soy yo', botonId: 'nombre_si', nombrePerfil: 'Carlos M' },
]);

simular('Escribe en vez de tocar botones, y otro nombre', [
  { texto: 'info' },
  { texto: 'el plan de 300' },
  { texto: 'quiero una linea nueva' },
  { texto: 'CDMX', nombrePerfil: 'Cel de la tienda' },
  { texto: 'Es otro nombre', botonId: 'nombre_otro' },
  { texto: 'María Fernanda' },
]);

simular('Pide humano a mitad del bot', [
  { texto: 'hola' },
  { texto: 'mejor pásame con un asesor por favor' },
]);
