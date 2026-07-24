# ConfirmaPedido — Guía de instalación

App con **registro de usuarios**: cada negocio crea su cuenta, configura su
WhatsApp, y **conecta su formulario COD existente de Shopify** (Releasit,
EasySell, Madgic, o cualquier otro — todos crean un pedido normal de Shopify
por detrás). Cuando entra un pedido, Shopify te avisa automático a esta app,
y esta app manda la notificación por WhatsApp con tu mensaje personalizado.

No se construye ningún formulario nuevo — te conectas al que ya usas.

---

## PARTE 1 — Supabase (ya la hicimos)

Si ya corriste `supabase/schema.sql` una vez, **no lo vuelvas a correr
completo** — solo corre `supabase/migration-01-shopify.sql` (SQL Editor →
New query → pega → Run) para aplicar los cambios nuevos.

Si es un proyecto nuevo, corre `schema.sql` completo directamente.

### Desplegar la función del webhook
```bash
supabase functions deploy shopify-webhook
```

---

## PARTE 2 — Meta (API oficial de WhatsApp)

Cada negocio que se registre configura esto en su propio panel.

### 1. Crea tu app en Meta for Developers
1. **developers.facebook.com** → **My Apps** → **Create App** → tipo **Business**
2. Agrega el producto **WhatsApp**
3. Meta te da un **número de prueba gratis** con:
   - **Phone Number ID**
   - **Temporary Access Token** (dura 24h)
4. Agrega tu propio WhatsApp como número de prueba verificado (hasta 5 gratis, sin verificar tu negocio)

### 2. Token permanente (para producción)
**Business Settings → System Users** → crea uno → asígnale el activo de
WhatsApp → genera un token con permiso `whatsapp_business_messaging` (no expira).

### 3. Pega tus datos en el dashboard de ConfirmaPedido
Phone Number ID + Access Token + tu número de WhatsApp para recibir avisos.

---

## PARTE 3 — Conectar tu formulario de Shopify (la parte nueva)

### 1. Consigue tu URL de webhook
Entra a tu **dashboard.html**, en la tarjeta **"Tu URL de webhook para
Shopify"** — cópiala. Se ve así:
```
https://tu-proyecto.supabase.co/functions/v1/shopify-webhook?store=tu-slug
```

### 2. Crea el webhook en Shopify
1. En tu tienda Shopify: **Configuración → Notificaciones**
2. Baja hasta **Webhooks** → **Crear webhook**
3. **Evento**: `Creación de pedido` (Order creation)
4. **Formato**: JSON
5. **URL**: pega la que copiaste del dashboard
6. Guarda

### 3. Copia el "Signing secret"
Shopify te muestra un **signing secret** (empieza distinto según tu tienda) —
cópialo y pégalo en el dashboard de ConfirmaPedido, campo **"Signing secret
del webhook"**, y guarda. Esto verifica que los avisos sean realmente de
Shopify (nadie más puede mandarte falsos).

> Si usas Releasit, EasySell, Madgic u otra app de COD Form: no necesitas
> configurar nada en esa app — como todas terminan creando un pedido de
> Shopify normal, el webhook de "Creación de pedido" las captura a todas por
> igual, sin importar cuál uses.

---

## PARTE 4 — Publicar en Netlify

Ya está conectado a GitHub — cada vez que se sube un cambio, Netlify lo
publica solo. Solo entra a tu link de Netlify → `/dashboard.html`.

---

## Cómo probar todo el flujo

1. Entra a `dashboard.html`, crea tu cuenta (o inicia sesión)
2. Configura tu WhatsApp (Parte 2) y tu Signing secret (Parte 3.3)
3. Copia tu URL de webhook (Parte 3.1) y créala en Shopify (Parte 3.2)
4. Haz un pedido de prueba en tu tienda (usando tu formulario COD normal)
5. Debería llegarte un WhatsApp automático en segundos
6. En el dashboard, en "Pedidos", debe aparecer la fila nueva con
   "WhatsApp: Enviado" ✅

## Si "WhatsApp: Falló"

- **"Firma inválida — este aviso no parece venir de Shopify"** — el Signing
  secret que pegaste no coincide con el que te dio Shopify. Vuelve a copiarlo
  desde Shopify (Configuración → Notificaciones → tu webhook) y pégalo de nuevo.
- **"(#131030) Recipient phone number not in allowed list"** — en modo prueba
  de Meta, solo puedes mandar a los números que agregaste como verificados
  (Parte 2, paso 1.4).
- **"Invalid OAuth access token"** — el token expiró o está mal copiado.
  Genera uno permanente (Parte 2, paso 2).
- **"El pedido no trae número de teléfono"** — el formulario COD que usas no
  está capturando el teléfono en el campo que Shopify espera. Revisa la
  configuración de tu app COD Form.

## Multi-usuario (varios negocios usando la misma app)

Cada quien que se registre tiene su propia fila en `stores`, su propio slug
(y por lo tanto su propia URL de webhook), su propio Phone Number ID/Token —
todo aislado por seguridad a nivel de fila. Cada cliente tuyo conecta su
propia tienda Shopify al webhook con su slug único, sin pisarse entre ellos.
