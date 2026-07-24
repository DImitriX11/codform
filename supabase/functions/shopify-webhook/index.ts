// ============================================================
// Edge Function: shopify-webhook
// Shopify (o Releasit, EasySell, etc. — todas crean un pedido
// normal de Shopify por detras) manda un aviso automatico aqui
// cada vez que entra un pedido nuevo. Esta funcion:
//   1. Verifica que el aviso sea realmente de Shopify (firma HMAC)
//   2. Extrae nombre / telefono / direccion / producto
//   3. Arma el mensaje personalizado de esa tienda
//   4. Lo manda por WhatsApp (API oficial de Meta)
//
// URL que cada negocio pega en Shopify:
//   https://TU-PROYECTO.supabase.co/functions/v1/shopify-webhook?store=SU-SLUG
// ============================================================

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function verifyShopifyHmac(rawBody: string, hmacHeader: string | null, secret: string): Promise<boolean> {
  if (!hmacHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const bytes = new Uint8Array(sigBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const computed = btoa(binary);
  // Comparacion — no necesita ser constant-time aqui: el secreto nunca se expone,
  // solo se compara el resultado ya calculado.
  return computed === hmacHeader;
}

function extractOrderData(payload: any) {
  const shipping = payload.shipping_address || {};
  const customer = payload.customer || {};

  const name =
    shipping.name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    "Cliente";

  const phone =
    shipping.phone ||
    customer.phone ||
    payload.phone ||
    (payload.billing_address && payload.billing_address.phone) ||
    "";

  const addressParts = [shipping.address1, shipping.address2, shipping.city, shipping.province]
    .filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : "Sin direccion";

  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  const product = lineItems
    .map((li: any) => {
      const variant = li.variant_title ? " (" + li.variant_title + ")" : "";
      return li.title + variant + " x" + (li.quantity || 1);
    })
    .join(", ") || "—";

  return {
    shopify_order_id: String(payload.id || ""),
    shopify_order_number: String(payload.order_number || payload.name || ""),
    customer_name: name,
    customer_phone: String(phone).replace(/[^\d+]/g, ""),
    customer_address: address,
    product,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Servidor mal configurado (faltan env vars)" }, 500);

  const url = new URL(req.url);
  const storeSlug = url.searchParams.get("store");
  if (!storeSlug) return json({ error: "Falta ?store=tu-slug en la URL del webhook" }, 400);

  // El body se lee UNA vez como texto crudo — la firma HMAC de Shopify se calcula
  // sobre los bytes exactos que mandaron, no sobre el JSON ya interpretado.
  const rawBody = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "JSON invalido" }, 400);
  }

  const restHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  // 1. Buscar la tienda por slug
  const storeRes = await fetch(`${SUPABASE_URL}/rest/v1/stores?slug=eq.${encodeURIComponent(storeSlug)}&select=*`, { headers: restHeaders });
  const stores = await storeRes.json();
  const store = Array.isArray(stores) ? stores[0] : null;
  if (!store) return json({ error: "Tienda no encontrada" }, 404);

  // 2. Verificar que el aviso realmente venga de Shopify (si la tienda ya configuro su secreto)
  if (store.shopify_webhook_secret) {
    const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
    const valid = await verifyShopifyHmac(rawBody, hmacHeader, store.shopify_webhook_secret);
    if (!valid) return json({ error: "Firma invalida — este aviso no parece venir de Shopify" }, 401);
  }

  // 3. Extraer los datos del pedido
  const orderInfo = extractOrderData(payload);
  if (!orderInfo.customer_phone) {
    return json({ error: "El pedido no trae numero de telefono, no se puede notificar" }, 200);
  }

  // 4. Guardar el pedido (evita duplicados si Shopify reenvia el mismo webhook)
  const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: { ...restHeaders, Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({ store_id: store.id, ...orderInfo }),
  });
  const orderData = await orderRes.json();
  const order = Array.isArray(orderData) ? orderData[0] : orderData;
  if (!order) return json({ ok: true, note: "Pedido ya estaba registrado (duplicado ignorado)" });

  // 5. Armar el mensaje personalizado y mandarlo por WhatsApp
  let whatsappSent = false;
  let whatsappError: string | null = null;

  if (store.whatsapp_phone_number_id && store.whatsapp_access_token && store.whatsapp_notify_number) {
    const template: string = store.confirmation_template ||
      "Nuevo pedido #{numero_pedido} de {nombre} — {producto} — Tel: {telefono} — Direccion: {direccion}";
    const message = template
      .replace("{numero_pedido}", orderInfo.shopify_order_number)
      .replace("{nombre}", orderInfo.customer_name)
      .replace("{producto}", orderInfo.product)
      .replace("{telefono}", orderInfo.customer_phone)
      .replace("{direccion}", orderInfo.customer_address);

    try {
      const metaRes = await fetch(`https://graph.facebook.com/v20.0/${store.whatsapp_phone_number_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${store.whatsapp_access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: store.whatsapp_notify_number, type: "text", text: { body: message } }),
      });
      const metaData = await metaRes.json();
      if (metaRes.ok) whatsappSent = true;
      else whatsappError = metaData?.error?.message || "Error desconocido de la API de Meta";
    } catch (err) {
      whatsappError = (err as Error).message;
    }
  } else {
    whatsappError = "La tienda aun no configuro su WhatsApp";
  }

  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
    method: "PATCH",
    headers: restHeaders,
    body: JSON.stringify({ whatsapp_sent: whatsappSent, whatsapp_error: whatsappError }),
  });

  return json({ ok: true, order_id: order.id, whatsapp_sent: whatsappSent, whatsapp_error: whatsappError });
});
