-- ============================================================
-- Migracion: pasar del formulario propio al webhook de Shopify.
-- Corre esto en SQL Editor (ya corriste schema.sql antes, este
-- script solo aplica los cambios nuevos, no repite todo).
-- ============================================================

-- Nuevas columnas en stores
alter table public.stores add column if not exists shopify_webhook_secret text;
alter table public.stores alter column confirmation_template
  set default 'Nuevo pedido #{numero_pedido} de {nombre} — {producto} — Tel: {telefono} — Direccion: {direccion}';

-- Nuevas columnas en orders (para no duplicar pedidos si Shopify reintenta el webhook)
alter table public.orders add column if not exists shopify_order_id text;
alter table public.orders add column if not exists shopify_order_number text;

create unique index if not exists orders_shopify_order_unique
  on public.orders(store_id, shopify_order_id)
  where shopify_order_id is not null;

-- Ya no hace falta la vista publica ni la policy de insert publico
-- (los pedidos ahora entran por el webhook, no por un formulario nuestro)
drop view if exists public.stores_public;
drop policy if exists "Cualquiera puede crear un pedido (via formulario publico)" on public.orders;
