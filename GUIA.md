# Guía de uso — Gestor de Leads de WhatsApp

## Roles

| Rol | Qué ve | Qué puede hacer |
|---|---|---|
| **Vendedor** | Solo sus leads asignados (estado "Sin tocar" o "En gestión") | Tomar el lead, chatear, marcar ganado/perdido |
| **Capitán** / **Líder** | Todos los leads, métricas y tabla de vendedores | Todo lo del vendedor + reasignar cualquier lead a cualquier vendedor |

La app decide qué pantalla mostrar según el campo `agentes.rol` del usuario que inició sesión.

---

## Dar de alta a una persona (vendedor, capitán o líder)

Esto son **dos pasos**: crear su login (Supabase Auth) y crear/vincular su fila en `agentes`.

### 1. Crear el login

En Supabase: **Authentication > Users > Add user**
- Email y contraseña de la persona.
- Marca **"Auto Confirm User"** (para que no tenga que confirmar por correo).
- Guarda y copia el **UID** que le asigna (un UUID largo, ej. `dec6692a-e81e-4e29-b4f9-32a3a7f80476`).

### 2. Crear o actualizar su fila en `agentes`

En **SQL Editor**:

**Si la persona es nueva** (no tiene fila en `agentes`):
```sql
insert into agentes (nombre, telefono, rol, user_id) values
  ('Nombre Apellido', '+5215511112222', 'vendedor', '<UID-copiado>');
```
`rol` puede ser `vendedor`, `capitan` o `lider`.

**Si ya tiene fila en `agentes`** (por ejemplo, un vendedor que ya recibía leads pero no tenía acceso al dashboard):
```sql
update agentes set user_id = '<UID-copiado>' where telefono = '+5215511112222';
```

### 3. Verificar

La persona entra en `https://gestordeleadswhats.netlify.app/` con su email/contraseña. Si ve el mensaje *"Tu usuario no está vinculado..."*, revisa que el `user_id` en `agentes` coincida exactamente con el UID de Authentication.

---

## Quitar acceso a alguien

No borres su usuario de Authentication a menos que quieras borrar también su historial. Para solo quitarle el acceso al dashboard:
```sql
update agentes set user_id = null where telefono = '+5215511112222';
```
Y si ya no debe recibir leads nuevos:
```sql
update agentes set disponible = false where telefono = '+5215511112222';
```

---

## Uso diario — Vendedor

1. Entra al dashboard. La columna izquierda muestra tus leads, ordenados del más antiguo al más nuevo.
2. El reloj debajo de cada lead muestra cuánto tiempo lleva esperando. Se pone **rojo** después de 5 minutos sin que nadie lo toque — esa es tu prioridad.
3. Clic en un lead para ver la conversación completa.
4. **"Tomar"**: lo marca como "En gestión" y registra tu hora de primer contacto.
5. Escribe en el cuadro de abajo y presiona **Enviar** — el mensaje sale por WhatsApp al cliente.
6. Cuando se resuelve:
   - **"Marcar ganado"**: el lead se cierra como venta.
   - **"Marcar perdido"**: te pide el motivo (compártelo, sirve para detectar patrones — precio, cobertura, etc.).

---

## Uso diario — Capitán / Líder

La pantalla de supervisión tiene tres partes:

### 1. Tarjetas de resumen (arriba)
- **Sin asignar**: leads que terminaron el bot pero nadie los tiene (revisa si faltan vendedores disponibles).
- **Asignados sin tocar**: lo más urgente — leads ya repartidos que nadie ha contactado.
- **En gestión**, **Ganados**, **Perdidos**: totales.
- **Tiempo medio a 1er toque**: promedio general — la meta del negocio es < 2 min.

### 2. Tabla por vendedor
Conversión = ganados / (ganados + perdidos) de leads cerrados. Te dice quién convierte mejor y quién tiene leads sin tocar acumulados.

### 3. Tabla de leads (con filtros)
- Pestañas: **Sin asignar**, **Sin tocar**, **En gestión**, **Cerrados**, **Todos**.
- Clic en una fila para ver/leer la conversación (a la derecha) — puedes responder igual que un vendedor si es urgente.
- Columna **"Reasignar"**: cambia el vendedor de ese lead con el menú desplegable. Queda registrado en el historial (`asignaciones`) y en `eventos` como `lead_reasignado`.

---

## Glosario de estados de un lead

| Estado | Significado |
|---|---|
| `nuevo` | Llegó el primer mensaje, el bot no ha empezado |
| `perfilando` | El bot está haciendo las preguntas de calificación |
| `asignado` | El bot terminó y se repartió a un vendedor — **nadie lo ha tocado** |
| `en_gestion` | Un vendedor ya dio "Tomar" y está conversando |
| `ganado` | Venta cerrada |
| `perdido` | Se cerró sin venta (con `motivo_perdida`) |
