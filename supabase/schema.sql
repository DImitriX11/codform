-- ============================================================
-- ConfirmaPedido — Esquema de base de datos
-- Pega esto completo en Supabase SQL Editor y dale Run.
-- ============================================================

-- Una fila por negocio registrado (dueño de tienda)
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  store_name text not null default 'Mi Tienda',
  slug text not null unique,                    -- usado en la URL del webhook: .../shopify-webhook?store=slug
  whatsapp_phone_number_id text,                 -- Phone Number ID de Meta (no es el numero de telefono)
  whatsapp_access_token text,                    -- Access Token de Meta (permanente, tras verificar negocio)
  whatsapp_notify_number text,                   -- Numero al que llega la notificacion de nuevo pedido (formato 593987654321)
  confirmation_template text default 'Nuevo pedido #{numero_pedido} de {nombre} — {producto} — Tel: {telefono} — Direccion: {direccion}',
  shopify_webhook_secret text,                   -- "Signing secret" que Shopify da al crear el webhook (para verificar que el aviso es real)
  created_at timestamptz not null default now()
);

alter table public.stores enable row level security;

create policy "Cada quien ve solo su tienda"
  on public.stores for select using (auth.uid() = user_id);
create policy "Cada quien crea solo su tienda"
  on public.stores for insert with check (auth.uid() = user_id);
create policy "Cada quien edita solo su tienda"
  on public.stores for update using (auth.uid() = user_id);

-- No hay lectura publica de "stores": ya no existe un formulario publico que
-- la necesite (los pedidos entran por el webhook de Shopify, no por un
-- formulario nuestro), y esa tabla tiene whatsapp_access_token (secreto).

-- ------------------------------------------------------------

-- Un pedido por cada envio del formulario COD
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  shopify_order_id text,                         -- id del pedido en Shopify (para evitar duplicados si Shopify reintenta el webhook)
  shopify_order_number text,                     -- numero de pedido visible, ej "#1042"
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  product text,
  notes text,
  status text not null default 'pendiente',      -- pendiente | confirmado | rechazado | entregado
  whatsapp_sent boolean not null default false,
  whatsapp_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists orders_shopify_order_unique
  on public.orders(store_id, shopify_order_id)
  where shopify_order_id is not null;

alter table public.orders enable row level security;

create policy "El dueno ve los pedidos de su tienda"
  on public.orders for select using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );
create policy "El dueno actualiza los pedidos de su tienda"
  on public.orders for update using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

-- Los pedidos los crea la Edge Function del webhook de Shopify, que usa la
-- service_role key (bypasea RLS). No hace falta una policy publica de insert.

create index if not exists orders_store_id_idx on public.orders(store_id);
