# Gestor de Leads de WhatsApp — MejoraTuTarifa

App para administrar leads de anuncios click-to-WhatsApp de un equipo de ventas
Movistar. Ver [CLAUDE.md](CLAUDE.md) para el contexto completo del negocio.

## Estado actual (pasos 1–4 del plan)

- ✅ **Esquema de base de datos** — [supabase/schema.sql](supabase/schema.sql)
- ✅ **Webhook de Meta** — [netlify/functions/webhook.ts](netlify/functions/webhook.ts)
- ✅ **Bot de calificación** — [src/lib/bot.ts](src/lib/bot.ts)
- ✅ **Asignación round-robin** — función SQL `asignar_lead` en el esquema
- ⬜ Dashboard Vendedor (paso 5)
- ⬜ Vistas Capitán/Líder + alerta SLA (paso 6)
- ⬜ Exportar a CSV (paso 7)

## Cómo funciona

```
Cliente toca el anuncio → escribe por WhatsApp
        │
        ▼
Meta hace POST al webhook (netlify/functions/webhook.ts)
        │  valida firma, responde 200 rápido
        ▼
¿Lead nuevo? → se crea en `leads` (estado=nuevo, guarda fuente del anuncio)
        │
        ▼
Bot de calificación (src/lib/bot.ts): plan → portabilidad/línea nueva → ciudad → nombre
        │  cada respuesta se guarda en el lead; si pide humano, salta el bot
        ▼
asignar_lead() en Postgres: round-robin entre vendedores disponibles
        │  estado=asignado, historial en `asignaciones`, auditoría en `eventos`
        ▼
El dashboard (próximo paso) recibe el lead por Supabase Realtime
```

## Puesta en marcha

### 1. Supabase (base de datos)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta el contenido de `supabase/schema.sql`.
3. Da de alta a tus vendedores (puedes hacerlo desde **Table Editor > agentes**):
   ```sql
   insert into agentes (nombre, telefono, rol) values
     ('Juan Pérez', '+5215511111111', 'vendedor'),
     ('Ana López', '+5215522222222', 'vendedor');
   ```
4. Copia de **Project Settings > API**: la URL del proyecto y la
   `service_role` key (para el `.env`).

### 2. Meta / WhatsApp Cloud API

1. En [developers.facebook.com](https://developers.facebook.com) crea una app
   de tipo **Business** y añade el producto **WhatsApp**.
2. Usa el **número de prueba** que te da Meta y registra hasta 5 números
   destinatarios de prueba (los tuyos y los del equipo).
3. Crea un **System User** en Business Settings y genera un **token
   permanente** con permiso `whatsapp_business_messaging` (el token del panel
   caduca en 24h, no sirve para producción).
4. Apunta: token, **Phone number ID**, **App Secret** (Settings > Basic) e
   inventa un **verify token** (cualquier cadena aleatoria).

### 3. Netlify (deploy del webhook)

1. Sube el repo a GitHub y conéctalo a un sitio nuevo en
   [netlify.com](https://netlify.com).
2. En **Site settings > Environment variables** carga las variables de
   `.env.example` con sus valores reales.
3. Tras el deploy, tu webhook queda en:
   `https://TU-SITIO.netlify.app/.netlify/functions/webhook`

### 4. Conectar el webhook en Meta

1. En la app de Meta: **WhatsApp > Configuration > Webhook > Edit**.
2. Callback URL: la URL de arriba. Verify token: el que inventaste.
3. Al guardar, Meta hace el GET de verificación (debe poner ✅).
4. En **Webhook fields** suscríbete a `messages`.

### 5. Probar

Escribe desde un número de prueba al número de WhatsApp de la app. Deberías
recibir el saludo del bot, y al terminar las 4 preguntas, ver en Supabase el
lead con `estado=asignado` y un registro en `asignaciones`.

## Desarrollo local

```bash
npm install
npm run typecheck      # comprueba tipos
npm run dev            # netlify dev: levanta las funciones en localhost
```

Para probar el webhook en local frente a Meta necesitas un túnel HTTPS
(`netlify dev --live` te da una URL pública temporal).

## Decisiones que conviene conocer

- **`bot_paso` en la tabla leads**: columna extra (no estaba en el modelo
  original) que guarda en qué pregunta va el bot. Sin ella habría que adivinar
  el paso a partir de qué campos están llenos, que es frágil.
- **Asignación dentro de Postgres** (función `asignar_lead`): garantiza que
  actualizar el lead + historial + evento ocurren en una sola transacción y
  evita que dos webhooks simultáneos asignen mal.
- **`wa_message_id` único**: Meta reintenta webhooks si tardas en responder;
  el unique hace que el reintento se detecte y no se conteste dos veces.
- **El bot no responde a leads en gestión**: en cuanto `estado` pasa de
  `perfilando`, los mensajes solo se registran para el vendedor.
- **Ventana de 24h**: el bot solo responde a mensajes entrantes (siempre
  dentro de ventana), así que nunca gasta plantillas de pago.
