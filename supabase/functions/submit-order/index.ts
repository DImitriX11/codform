// ============================================================
// Edge Function: submit-order
// Recibe un pedido del formulario COD publico, lo guarda, y
// manda la notificacion de WhatsApp via la API oficial de Meta.
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Servidor mal configurado (faltan env vars)" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalido" }, 400);
  }

  const { store_slug, customer_name, customer_phone, customer_address, product, notes } = body || {};
  if (!store_slug || !customer_name || !customer_phone || !customer_address) {
    return json({ error: "Faltan campos obligatorios (nombre, telefono, direccion)" }, 400);
  }

  const restHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  // 1. Buscar la tienda por slug
  const storeRes = await fetch(
    `${SUPABASE_URL}/rest/v1/stores?slug=eq.${encodeURIComponent(store_slug)}&select=*`,
    { headers: restHeaders }
  );
  const stores = await storeRes.json();
  const store = Array.isArray(stores) ? stores[0] : null;
  if (!store) return json({ error: "Tienda no encontrada" }, 404);

  // 2. Guardar el pedido
  const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: { ...restHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      store_id: store.id,
      customer_name,
      customer_phone,
      customer_address,
      product: product || null,
      notes: notes || null,
    }),
  });
  const orderData = await orderRes.json();
  if (!orderRes.ok) return json({ error: "No se pudo guardar el pedido", detail: orderData }, 500);
  const order = Array.isArray(orderData) ? orderData[0] : orderData;

  // 3. Mandar WhatsApp via API oficial de Meta (si la tienda ya configuro sus credenciales)
  let whatsappSent = false;
  let whatsappError: string | null = null;

  if (store.whatsapp_phone_number_id && store.whatsapp_access_token && store.whatsapp_notify_number) {
    const template: string = store.confirmation_template ||
      "Nuevo pedido de {nombre} — {producto} — Tel: {telefono} — Direccion: {direccion}";
    const message = template
      .replace("{nombre}", customer_name)
      .replace("{producto}", product || "—")
      .replace("{telefono}", customer_phone)
      .replace("{direccion}", customer_address);

    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v20.0/${store.whatsapp_phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${store.whatsapp_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: store.whatsapp_notify_number,
            type: "text",
            text: { body: message },
          }),
        }
      );
      const metaData = await metaRes.json();
      if (metaRes.ok) {
        whatsappSent = true;
      } else {
        whatsappError = metaData?.error?.message || "Error desconocido de la API de Meta";
      }
    } catch (err) {
      whatsappError = (err as Error).message;
    }
  } else {
    whatsappError = "La tienda aun no configuro su WhatsApp (Phone Number ID / Access Token / numero destino)";
  }

  // 4. Actualizar el pedido con el resultado del envio
  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
    method: "PATCH",
    headers: restHeaders,
    body: JSON.stringify({ whatsapp_sent: whatsappSent, whatsapp_error: whatsappError }),
  });

  return json({ ok: true, order_id: order.id, whatsapp_sent: whatsappSent, whatsapp_error: whatsappError });
});
