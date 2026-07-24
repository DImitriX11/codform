# ConfirmaPedido — Guía de instalación

App con **registro de usuarios**: cada negocio crea su cuenta, configura su
WhatsApp, y obtiene un link de formulario COD para poner en sus anuncios.
Cuando un cliente lo llena, te llega la notificación por WhatsApp automático
(API oficial de Meta — sin riesgo de baneo, gratis en volumen bajo).

Todo corre gratis en **Supabase + Netlify**, igual que tu app de Libertad
Financiera.

---

## PARTE 1 — Supabase (base de datos + funciones)

### 1. Crea el proyecto
Puedes usar un proyecto Supabase **nuevo** (recomendado, para no mezclar con
tus datos de Libertad Financiera) en **supabase.com** → New project.

### 2. Corre el esquema
1. **SQL Editor → New query**
2. Abre el archivo `supabase/schema.sql` de esta carpeta, copia **todo** el
   contenido (sin las comillas de markdown si las hay) y pégalo
3. **Run** — debe decir "Success"

### 3. Copia tus llaves
**Project Settings → API**:
- **Project URL**
- **anon / public key**

Pégalas en **dashboard.html** Y en **pedido.html** (el mismo bloque
`SUPABASE_CONFIG` en ambos archivos), y arma `functionsUrl` como tu Project
URL + `/functions/v1` (ej: `https://abcdefgh.supabase.co/functions/v1`).

### 4. Desactiva confirmación de correo (opcional, recomendado para arrancar rápido)
**Authentication → Providers → Email** → desactiva "Confirm email".

### 5. Instala Supabase CLI y despliega la Edge Function
La función que manda el WhatsApp vive en `supabase/functions/submit-order/`
y se despliega con la CLI de Supabase (no se sube arrastrando como los HTML).

```bash
npm install -g supabase
supabase login
```
(Se abre el navegador para autorizar — inicia sesión con tu cuenta de
Supabase.)

```bash
cd confirma-pedido
supabase link --project-ref TU-PROJECT-REF
```
(El `project-ref` es el código en tu Project URL: `https://TU-PROJECT-REF.supabase.co`)

```bash
supabase functions deploy submit-order
```

Eso sube la función. Verifica en el dashboard de Supabase → **Edge Functions**
que aparezca `submit-order` como desplegada.

> Las variables `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` que usa la función
> ya están disponibles automáticamente en el entorno de Supabase — no hay que
> configurarlas a mano.

---

## PARTE 2 — Meta (API oficial de WhatsApp)

Esto lo hace **cada negocio que se registre**, no tú una sola vez — cada uno
consigue su propio Phone Number ID y Access Token y los pega en su panel.

### 1. Crea tu app en Meta for Developers
1. Entra a **developers.facebook.com** → **My Apps** → **Create App**
2. Tipo de app: **Business**
3. Dale nombre, sigue el asistente

### 2. Agrega el producto WhatsApp
1. En el panel de tu app, busca **WhatsApp** → **Set up**
2. Meta te da automáticamente un **número de prueba gratis** (no necesitas
   verificar tu negocio todavía para empezar a probar)
3. Ahí mismo verás:
   - **Phone Number ID** (un número largo, ej: `109876543210987`)
   - **Temporary Access Token** (dura 24h — para producción necesitas uno
     permanente, ver paso 4)

### 3. Agrega un número destino de prueba
Meta te deja agregar hasta 5 números "verificados" para pruebas sin verificar
tu negocio — agrega tu propio WhatsApp ahí para recibir las notificaciones de
prueba.

### 4. Para producción: Access Token permanente
El token temporal expira en 24h. Para uno permanente:
1. **Business Settings → System Users** → crea un System User
2. Asígnale el activo de WhatsApp de tu app
3. Genera un token para ese System User con permiso `whatsapp_business_messaging`
   — este no expira

### 5. Verificación de negocio (para salir de modo prueba)
Cuando quieras mandar mensajes a números que no agregaste manualmente (o sea,
a tus clientes reales), Meta pide verificar tu negocio — **Business Settings
→ Business Verification**. Toma unos días, es gratis.

### 6. Pega tus datos en el panel de ConfirmaPedido
Con Phone Number ID + Access Token + tu número (el que recibe las
notificaciones), entra a tu dashboard de ConfirmaPedido → **Configuración de
tienda** → pégalos ahí y guarda.

---

## PARTE 3 — Publicar en Netlify

1. Ve a **app.netlify.com/drop**
2. Arrastra la carpeta `confirma-pedido` completa (con `dashboard.html` y
   `pedido.html` ya con tus llaves pegadas)
3. Te da un link, ej `https://algo.netlify.app`

Tus 2 páginas quedan en:
- `https://algo.netlify.app/dashboard.html` — donde te registras y configuras
- `https://algo.netlify.app/pedido.html?t=tu-slug` — el link que compartes en
  tus anuncios (el slug lo defines tú en el panel)

---

## Cómo se prueba todo el flujo

1. Entra a `dashboard.html`, crea tu cuenta
2. En "Configuración de tienda" pega tus datos de Meta (Parte 2) y guarda
3. Copia tu link público
4. Ábrelo en otra pestaña (o pásaselo a alguien), llena el formulario como si
   fueras cliente
5. Debería llegarte un WhatsApp automático al número que configuraste
6. En el dashboard, en "Pedidos", debe aparecer la fila nueva con
   "WhatsApp: Enviado" ✅ — si dice "Falló", pasa el mouse sobre el chip para
   ver el error exacto que devolvió Meta

## Si "WhatsApp: Falló"

Los errores más comunes de Meta y qué significan:
- **"(#131030) Recipient phone number not in allowed list"** — en modo
  prueba, solo puedes mandar a los números que agregaste en el paso 3 de la
  Parte 2. Agrega tu número de pruebas ahí.
- **"Invalid OAuth access token"** — el token expiró (si usas el temporal de
  24h) o está mal copiado. Genera uno permanente (paso 4).
- **"(#100) Invalid parameter"** — revisa que el Phone Number ID sea el
  correcto (no el número de teléfono en sí, es el ID interno de Meta).

## Multi-usuario (varios negocios usando la misma app)

Cada quien que se registre en `dashboard.html` tiene su **propia fila** en
`stores`, su propio slug, su propio Phone Number ID/Token — completamente
aislados por Row Level Security (nadie ve los pedidos ni credenciales de
otro). No necesitas hacer nada extra para que esto funcione con varios
clientes tuyos a la vez.
