-- ============================================================
-- Respuestas rápidas, sacadas de lo que el equipo ya escribe
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--
-- Variables disponibles (se sustituyen al insertar la respuesta en el chat):
--   {agente}  → primer nombre de quien está escribiendo
--   {cliente} → primer nombre del lead, si ya lo tenemos
--
-- Reemplaza las 4 respuestas de arranque que venían de ejemplo.

delete from respuestas_rapidas where agente_id is null;

insert into respuestas_rapidas (titulo, cuerpo, agente_id) values

-- ---------- Apertura ----------
-- Base: la de Santiago (18 usos, la más clara del equipo).
-- Se le agrega el nombre del cliente, que ninguna versión usaba.
('1. Apertura',
 'Hola {cliente}, soy {agente}, tu asesor en MejoraTuTarifa. Estos son nuestros planes. ¿Cuál te interesa para darte todos los detalles?',
 null),

-- Versión corta, para cuando el cliente ya escribió algo concreto.
('1b. Apertura corta',
 'Hola {cliente}, te saluda {agente} de MejoraTuTarifa. Con gusto te ayudo.',
 null),

-- ---------- Reenganche ----------
-- ~31 envíos con 7 redacciones distintas. Ojo: si pasaron más de 24 h desde
-- el último mensaje del cliente, esto NO le llega. Usa el botón Reactivar.
('2. Sigue interesado',
 'Hola {cliente}, sigo al pendiente de tu solicitud. ¿Continúas interesado en alguno de nuestros planes?',
 null),

('2b. Retomar contacto',
 'Hola {cliente}, retomo tu caso. ¿Te parece si revisamos juntos qué plan te conviene más?',
 null),

-- ---------- Perfilamiento ----------
-- Esto define la comisión: alta nueva paga bastante más que portabilidad.
('3. Portabilidad o línea nueva',
 '¿Quieres conservar tu número actual (portabilidad) o prefieres una línea nueva?',
 null),

('3b. Cuánto pagas hoy',
 'Para recomendarte el plan correcto, ¿cuánto pagas hoy y con qué compañía estás?',
 null),

-- ---------- Cierre / documentos ----------
('4. Pedir INE',
 'Para avanzar con tu contratación necesito foto de tu INE por ambos lados. La usamos únicamente para dar de alta tu línea.',
 null),

('4b. Cobertura',
 '¿Me compartes tu código postal? Con eso reviso la cobertura en tu zona.',
 null),

('4c. Datos para el alta',
 'Para generar tu contrato necesito: nombre completo como aparece en tu INE, correo electrónico y dirección con código postal.',
 null),

-- ---------- Seguimiento ----------
('5. Sigo atendiéndote',
 'Sigo atendiéndote, {cliente}. Dame un momento por favor.',
 null),

('5b. Confirmar entrega',
 'Hola {cliente}, ¿ya recibiste tu eSIM y quedó activa sin problema?',
 null);
