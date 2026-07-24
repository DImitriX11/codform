-- ============================================================
-- ConfirmaPedido — Esquema de base de datos
-- Pega esto completo en Supabase SQL Editor y dale Run.
-- ============================================================

-- Una fila por negocio registrado (dueño de tienda)
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  store_name text not null default 'Mi Tienda',
  slug text not null unique,                    -- usado en la URL publica del formulario: pedido.html?t=slug
  whatsapp_phone_number_id text,                 -- Phone Number ID de Meta (no es el numero de telefono)
  whatsapp_access_token text,                    -- Access Token de Meta (permanente, tras verificar negocio)
  whatsapp_notify_number text,                   -- Numero al que llega la notificacion de nuevo pedido (formato 593987654321)
  confirmation_template text default 'Nuevo pedido de {nombre} — {producto} — Tel: {telefono} — Direccion: {direccion}',
  created_at timestamptz not null default now()
);

alter table public.stores enable row level security;

create policy "Cada quien ve solo su tienda"
  on public.stores for select using (auth.uid() = user_id);
create policy "Cada quien crea solo su tienda"
  on public.stores for insert with check (auth.uid() = user_id);
create policy "Cada quien edita solo su tienda"
  on public.stores for update using (auth.uid() = user_id);

-- NO se agrega una policy publica sobre "stores" a proposito: esa tabla tiene
-- whatsapp_access_token (secreto). Para que el formulario publico muestre el
-- nombre de la tienda sin arriesgar el token, se usa esta vista con SOLO
-- columnas seguras. Las vistas corren con permisos del dueño (postgres) por
-- defecto, no del usuario que consulta, así que expone exactamente estas
-- 3 columnas y nada mas, sin importar los permisos de "anon".
create view public.stores_public as
  select id, store_name, slug from public.stores;

grant select on public.stores_public to anon, authenticated;

-- ------------------------------------------------------------

-- Un pedido por cada envio del formulario COD
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
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

alter table public.orders enable row level security;

create policy "El dueno ve los pedidos de su tienda"
  on public.orders for select using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );
create policy "El dueno actualiza los pedidos de su tienda"
  on public.orders for update using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

-- Cualquiera (cliente final anonimo llenando el formulario) puede crear un pedido.
-- La Edge Function usa la service_role key y no depende de esta policy, pero la
-- dejamos por si en el futuro se inserta directo desde el formulario sin la funcion.
create policy "Cualquiera puede crear un pedido (via formulario publico)"
  on public.orders for insert with check (true);

create index if not exists orders_store_id_idx on public.orders(store_id);
