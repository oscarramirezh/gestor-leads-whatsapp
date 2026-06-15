# Gestor de Leads de WhatsApp — MejoraTuTarifa

App para administrar leads de anuncios click-to-WhatsApp de un equipo de ventas
Movistar. Ver [CLAUDE.md](CLAUDE.md) para el contexto completo del negocio.

## Estado actual (pasos 1–4 del plan)

- ✅ **Esquema de base de datos** — [supabase/schema.sql](supabase/schema.sql)
- ✅ **Webhook de Meta** — [netlify/functions/webhook.ts](netlify/functions/webhook.ts)
- ✅ **Bot de calificación** — [src/lib/bot.ts](src/lib/bot.ts)
- ✅ **Asignación round-robin** — función SQL `asignar_lead` en el esquema
- ✅ **Dashboard Vendedor** (paso 5) — [web/](web/), bandeja + chat + tomar/cerrar
- ✅ **Vistas Capitán/Líder + métricas + alerta SLA** (paso 6) — supervisión global, reasignar leads
- ✅ **Exportar a CSV** (paso 7) — botón "Exportar CSV" en la vista de supervisión

Ver [GUIA.md](GUIA.md) para cómo usar el dashboard día a día y cómo dar de
alta vendedores, capitanes y líderes.

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
El dashboard (web/) recibe el lead por Supabase Realtime
        │  el vendedor ve su bandeja, "Tomar" el lead y chatear
        ▼
Responder en el dashboard → netlify/functions/enviar-mensaje
        │  valida la sesión, llama a la Cloud API y registra el mensaje saliente
```

## Puesta en marcha

### 1. Supabase (base de datos)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta en orden: `supabase/schema.sql`,
   `supabase/02_dashboard_rls.sql` y `supabase/03_supervisor_rls.sql`.
3. Da de alta a tus vendedores (puedes hacerlo desde **Table Editor > agentes**):
   ```sql
   insert into agentes (nombre, telefono, rol) values
     ('Juan Pérez', '+5215511111111', 'vendedor'),
     ('Ana López', '+5215522222222', 'vendedor');
   ```
4. Copia de **Project Settings > API**: la URL del proyecto, la `anon` key y
   la `service_role` key (para el `.env`).
5. En **Authentication > Users**, crea un usuario (email/contraseña) por cada
   vendedor y enlázalo con su fila de `agentes`:
   ```sql
   update agentes set user_id = '<uuid-del-usuario>' where telefono = '+5215511111111';
   ```

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

### 6. Dashboard Vendedor

1. Carga `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (de `.env.example`) en
   las variables de entorno de Netlify (son públicas, van en el bundle).
2. Tras el deploy, el dashboard queda en `https://TU-SITIO.netlify.app/`.
3. Cada vendedor entra con el email/contraseña que le creaste en
   Authentication > Users (paso 1.5).

## Desarrollo local

```bash
npm install
npm run typecheck       # comprueba tipos del backend (netlify/functions, src/)
npm run typecheck:web   # comprueba tipos del dashboard (web/)
npm run dev              # netlify dev: levanta las funciones en localhost
npm run dev:web           # vite: levanta el dashboard en localhost con recarga en vivo
```

`npm run dev:web` necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en
`.env` (cópialo de `.env.example`). Para que el botón "Enviar" del chat
funcione en local, corre `npm run dev` (netlify dev) en otra terminal — Vite
no sirve las funciones serverless.

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
- **Dashboard (`web/`) separado del backend (`src/`, `netlify/functions/`)**:
  el dashboard usa la clave `anon` + RLS (lo que ve cada vendedor lo decide
  Postgres); las funciones serverless usan `service_role`. Vite compila
  `web/` a `public/`, que es lo que Netlify publica.
- **Enviar mensajes pasa por `enviar-mensaje.ts`** (no directo a la Cloud API
  desde el navegador): así el `WHATSAPP_TOKEN` nunca llega al cliente, y la
  función valida que el lead esté asignado a quien escribe antes de mandar
  nada.
- **RLS de `leads` para escritura** (`supabase/02_dashboard_rls.sql`): un
  vendedor solo puede actualizar (tomar/cerrar) los leads donde
  `vendedor_asignado_id` sea su propio `agentes.id`.
