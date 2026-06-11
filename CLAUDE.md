# CLAUDE.md — Gestor de Leads de WhatsApp (MejoraTuTarifa)

> Mete este archivo en la raíz de tu repo. Claude Code lo lee en cada sesión
> y usa este contexto para construir e iterar el proyecto.

## Qué estamos construyendo

Una app web para administrar leads de WhatsApp de un equipo de ventas de planes
Movistar. Los leads llegan por anuncios **click-to-WhatsApp** al número de la
empresa vía **WhatsApp Cloud API** (webhooks de Meta). La conversión depende de
**contactar en segundos**. Hoy se pierden leads porque nadie sabe quién atiende
qué. Esto lo resuelve.

Objetivo doble: (1) ordenar mi propia operación; (2) que sea productizable para
vender a otras PYMES.

## Stack (todo en tier gratuito al inicio)

- **Código / deploys:** GitHub.
- **Frontend (dashboard) + función serverless del webhook:** Netlify (o Vercel).
- **Base de datos + realtime + auth:** Supabase (Postgres).
- **Lenguaje:** TypeScript. Frontend en React. Backend = funciones serverless.
- Sin dependencias de pago. Pensado para autohospedarse barato.

## Reglas de negocio (Movistar)

- Dos tipos de producto: **Portabilidad** y **Alta Nueva** (Canal Especialista).
  Alta Nueva paga ~83% más comisión que Portabilidad en Pro13.
- Equipo de 3 niveles: **Vendedor → Capitán → Líder**.
- Ventana de servicio de 24h = respuestas gratis. Plantillas (fuera de ventana)
  son de pago: usarlas solo para reenganche, no para conversación normal.
- Tier no verificado de Meta: 250 contactos únicos / 24h. Diseñar contando con
  ese límite al inicio.

## Modelo de datos (tablas Supabase)

**leads**
- id, telefono (E.164), nombre, fuente_anuncio, primer_mensaje, idioma
- producto_interes (enum: portabilidad | alta_nueva | indefinido)
- ciudad, plan_interes
- estado (enum: nuevo | perfilando | asignado | en_gestion | ganado | perdido)
- vendedor_asignado_id (fk agentes, nullable)
- creado_en, asignado_en, primer_toque_humano_en, cerrado_en
- motivo_perdida (nullable)

**agentes**
- id, nombre, telefono, rol (enum: vendedor | capitan | lider)
- disponible (bool), capitan_id (fk, para jerarquía), creado_en

**conversaciones** (mensajes del hilo)
- id, lead_id (fk), direccion (entrante | saliente), cuerpo, tipo (texto|imagen|...)
- autor (cliente | bot | agente), agente_id (nullable), wa_message_id, timestamp

**asignaciones** (historial / auditoría)
- id, lead_id, agente_id, asignado_en, asignado_por (sistema | manual)

**eventos** (auditoría general para reportes y SLA)
- id, lead_id, tipo_evento, agente_id (nullable), payload (jsonb), timestamp

## Flujo del webhook (cuando entra un mensaje)

1. Meta hace POST a la función serverless con el mensaje entrante.
2. Validar firma/verify token. Responder 200 rápido (Meta reintenta si tarda).
3. Buscar lead por telefono. Si no existe, crear lead con estado=nuevo y
   guardar fuente_anuncio y primer_mensaje. Si existe, solo append a conversaciones.
4. Si estado=nuevo → disparar **bot de calificación** (ver abajo), estado=perfilando.
5. Al terminar el bot → **asignación automática** (round-robin), estado=asignado,
   set asignado_en, registrar en asignaciones y eventos.
6. Notificar al vendedor asignado (realtime de Supabase / push web).
7. El primer mensaje que el vendedor humano manda → set primer_toque_humano_en
   y estado=en_gestion.

## Bot de calificación (3–4 preguntas, antes de pasar a humano)

Acotado al negocio (NO un chatbot de IA de propósito general — Meta los prohíbe
desde el 15-ene-2026). Preguntas:
1. ¿Qué plan te interesa? (o "cuánto pagas hoy")
2. ¿Es portabilidad (traes tu número) o línea nueva? → set producto_interes
3. ¿De qué ciudad nos escribes? → set ciudad
4. Confirmar nombre.

Guardar respuestas en el lead. Mensajes cortos, con botones interactivos cuando
se pueda. Si el cliente pide humano en cualquier momento, saltar el bot y asignar.

## Lógica de asignación (round-robin con disponibilidad)

- Solo entre agentes con rol=vendedor y disponible=true.
- Round-robin: el que lleva más tiempo sin recibir un lead recibe el siguiente.
- Registrar siempre en `asignaciones`. Un Capitán/Líder puede reasignar manual.
- Por defecto, solo el vendedor asignado puede responder ese lead (evita choques).

## Dashboard por rol

**Vendedor:** sus leads asignados, bandeja de chat, botón "tomar/cerrar",
notas, etiquetas. Reloj visible de tiempo desde que llegó el lead.

**Capitán:** leads de su equipo, tiempo de respuesta promedio por vendedor,
leads sin tocar, botón de reasignar.

**Líder:** todo lo anterior a nivel global + tasa de conversión por vendedor y
por producto (portabilidad vs alta nueva), y **alerta si un lead lleva >5 min
sin primer toque humano** (función programada / cron que revisa y notifica).

## Métricas clave a calcular

- Tiempo a primer toque (creado_en → primer_toque_humano_en). Meta: < 2 min.
- Tasa de conversión por vendedor y por producto.
- Leads sin asignar / sin tocar en este momento.
- Volumen por fuente_anuncio (qué creativo trae mejores leads).

## Orden sugerido de construcción

1. Esquema de Supabase (tablas de arriba) + auth básica por rol.
2. Función webhook: recibir, validar, crear/append lead, responder 200.
3. Bot de calificación.
4. Asignación round-robin + notificación realtime.
5. Dashboard Vendedor (bandeja + estados).
6. Vistas Capitán/Líder + métricas + alerta de SLA.
7. Exportar a CSV.

## Notas para Claude Code

- Explícame cada parte para poder iterarla; no asumas que sé toda la sintaxis.
- Guarda el token permanente de Meta como variable de entorno, nunca en el código.
- Usa siempre HTTPS para el webhook.
- Empieza con el número de prueba de Meta y 5 destinatarios de prueba antes de
  conectar el número real.
