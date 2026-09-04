
-- LISTA DA CASA - SUPABASE
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- Depois, execute apenas o bloco "CRIAR A CASA" no final, ajustando código/PIN/nomes.

create extension if not exists pgcrypto;

create table if not exists public.houses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.house_users (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null,
  role text not null default 'user' check (role in ('admin','user')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  token uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null references public.house_users(id) on delete cascade,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null,
  category text not null default 'Outros',
  brand text,
  default_unit text,
  purchase_place text,
  favorite boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.house_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  custom_name text,
  quantity text,
  unit text,
  priority text not null default 'acabando' check (priority in ('acabando','acabou')),
  note text,
  added_by uuid references public.house_users(id),
  bought_by uuid references public.house_users(id),
  bought_at timestamptz,
  created_at timestamptz not null default now(),
  check (product_id is not null or nullif(trim(custom_name),'') is not null)
);

alter table public.houses enable row level security;
alter table public.house_users enable row level security;
alter table public.devices enable row level security;
alter table public.products enable row level security;
alter table public.shopping_items enable row level security;

revoke all on public.houses, public.house_users, public.devices, public.products, public.shopping_items from anon, authenticated;

create or replace function public._device(p_token uuid)
returns table(house_id uuid,user_id uuid,user_name text,role text,house_code text)
language sql security definer set search_path=public
as $$
  select d.house_id,d.user_id,u.name,u.role,h.code
  from devices d
  join house_users u on u.id=d.user_id and u.house_id=d.house_id
  join houses h on h.id=d.house_id
  where d.token=p_token and d.active and u.active
$$;
revoke all on function public._device(uuid) from public;

create or replace function public.house_users(p_house_code text,p_pin text)
returns table(id uuid,name text,role text)
language sql security definer set search_path=public
as $$
  select u.id,u.name,u.role
  from house_users u join houses h on h.id=u.house_id
  where upper(h.code)=upper(trim(p_house_code))
    and h.pin_hash=encode(extensions.digest(p_pin,'sha256'),'hex')
    and u.active
  order by case when u.role='admin' then 0 else 1 end,u.name
$$;

create or replace function public.login_house(p_house_code text,p_pin text,p_user_id uuid)
returns table(device_token uuid,house_code text,user_id uuid,user_name text,role text)
language plpgsql security definer set search_path=public
as $$
declare v_house houses%rowtype; v_user house_users%rowtype; v_token uuid;
begin
  select * into v_house from houses
   where upper(code)=upper(trim(p_house_code))
     and pin_hash=encode(extensions.digest(p_pin,'sha256'),'hex');
  if v_house.id is null then return; end if;
  select * into v_user from house_users where id=p_user_id and house_id=v_house.id and active;
  if v_user.id is null then return; end if;
  insert into devices(house_id,user_id) values(v_house.id,v_user.id) returning token into v_token;
  return query select v_token,v_house.code,v_user.id,v_user.name,v_user.role;
end $$;

create or replace function public.session_info(p_token uuid)
returns table(device_token uuid,house_code text,user_id uuid,user_name text,role text)
language sql security definer set search_path=public
as $$
  select p_token,d.house_code,d.user_id,d.user_name,d.role from public._device(p_token) d
$$;

create or replace function public.list_products(p_token uuid)
returns table(id uuid,name text,category text,brand text,default_unit text,purchase_place text,favorite boolean,created_at timestamptz)
language sql security definer set search_path=public
as $$
  select p.id,p.name,p.category,p.brand,p.default_unit,p.purchase_place,p.favorite,p.created_at
  from products p join public._device(p_token) d on d.house_id=p.house_id
  where p.active order by p.favorite desc,p.category,p.name
$$;

create or replace function public.create_product(
  p_token uuid,p_name text,p_category text,p_brand text,p_default_unit text,p_purchase_place text,p_favorite boolean
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare d record; v_id uuid;
begin
  select * into d from public._device(p_token); if d.house_id is null then raise exception 'Sessão inválida'; end if;
  insert into products(house_id,name,category,brand,default_unit,purchase_place,favorite,created_by)
  values(d.house_id,trim(p_name),coalesce(nullif(trim(p_category),''),'Outros'),nullif(trim(p_brand),''),
  nullif(trim(p_default_unit),''),nullif(trim(p_purchase_place),''),coalesce(p_favorite,false),d.user_id)
  returning id into v_id; return v_id;
end $$;

create or replace function public.toggle_product_favorite(p_token uuid,p_product_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare d record; v boolean;
begin
  select * into d from public._device(p_token); if d.house_id is null then raise exception 'Sessão inválida'; end if;
  update products set favorite=not favorite where id=p_product_id and house_id=d.house_id returning favorite into v;
  return v;
end $$;

create or replace function public.list_items(p_token uuid)
returns table(
 id uuid,product_id uuid,product_name text,custom_name text,quantity text,unit text,priority text,note text,
 added_by_name text,bought_by_name text,bought_at timestamptz,created_at timestamptz
)
language sql security definer set search_path=public
as $$
 select i.id,i.product_id,p.name,i.custom_name,i.quantity,coalesce(i.unit,p.default_unit),i.priority,i.note,
        au.name,bu.name,i.bought_at,i.created_at
 from shopping_items i
 join public._device(p_token) d on d.house_id=i.house_id
 left join products p on p.id=i.product_id
 left join house_users au on au.id=i.added_by
 left join house_users bu on bu.id=i.bought_by
 order by (i.bought_at is not null), case when i.priority='acabou' then 0 else 1 end, i.created_at desc
$$;

create or replace function public.add_item(
 p_token uuid,p_product_id uuid,p_custom_name text,p_quantity text,p_unit text,p_priority text,p_note text
) returns uuid language plpgsql security definer set search_path=public as $$
declare d record; v_id uuid; v_ok boolean;
begin
 select * into d from public._device(p_token); if d.house_id is null then raise exception 'Sessão inválida'; end if;
 if p_product_id is not null then
   select exists(select 1 from products where id=p_product_id and house_id=d.house_id and active) into v_ok;
   if not v_ok then raise exception 'Produto inválido'; end if;
 end if;
 insert into shopping_items(house_id,product_id,custom_name,quantity,unit,priority,note,added_by)
 values(d.house_id,p_product_id,nullif(trim(p_custom_name),''),nullif(trim(p_quantity),''),
        nullif(trim(p_unit),''),case when p_priority='acabou' then 'acabou' else 'acabando' end,
        nullif(trim(p_note),''),d.user_id) returning id into v_id;
 return v_id;
end $$;

create or replace function public.toggle_item_bought(p_token uuid,p_item_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare d record; v_current timestamptz;
begin
 select * into d from public._device(p_token); if d.house_id is null then raise exception 'Sessão inválida'; end if;
 select bought_at into v_current from shopping_items where id=p_item_id and house_id=d.house_id;
 if not found then raise exception 'Item não encontrado'; end if;
 if v_current is null then
   update shopping_items set bought_at=now(),bought_by=d.user_id where id=p_item_id and house_id=d.house_id;
   return true;
 else
   update shopping_items set bought_at=null,bought_by=null where id=p_item_id and house_id=d.house_id;
   return false;
 end if;
end $$;

create or replace function public.delete_item(p_token uuid,p_item_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare d record;
begin
 select * into d from public._device(p_token); if d.house_id is null then raise exception 'Sessão inválida'; end if;
 delete from shopping_items where id=p_item_id and house_id=d.house_id;
 return found;
end $$;

create or replace function public.list_history(p_token uuid,p_limit integer default 50)
returns table(id uuid,product_name text,custom_name text,bought_at timestamptz,bought_by_name text)
language sql security definer set search_path=public
as $$
 select i.id,p.name,i.custom_name,i.bought_at,u.name
 from shopping_items i
 join public._device(p_token) d on d.house_id=i.house_id
 left join products p on p.id=i.product_id
 left join house_users u on u.id=i.bought_by
 where i.bought_at is not null
 order by i.bought_at desc limit least(greatest(coalesce(p_limit,50),1),200)
$$;

grant execute on function public.house_users(text,text) to anon,authenticated;
grant execute on function public.login_house(text,text,uuid) to anon,authenticated;
grant execute on function public.session_info(uuid) to anon,authenticated;
grant execute on function public.list_products(uuid) to anon,authenticated;
grant execute on function public.create_product(uuid,text,text,text,text,text,boolean) to anon,authenticated;
grant execute on function public.toggle_product_favorite(uuid,uuid) to anon,authenticated;
grant execute on function public.list_items(uuid) to anon,authenticated;
grant execute on function public.add_item(uuid,uuid,text,text,text,text,text) to anon,authenticated;
grant execute on function public.toggle_item_bought(uuid,uuid) to anon,authenticated;
grant execute on function public.delete_item(uuid,uuid) to anon,authenticated;
grant execute on function public.list_history(uuid,integer) to anon,authenticated;

-- ==========================================================
-- CRIAR A CASA (EXECUTE UMA VEZ; ALTERE O PIN E OS NOMES)
-- ==========================================================
do $$
declare h uuid;
begin
  if not exists(select 1 from public.houses where upper(code)='CASA PETRY') then
    insert into public.houses(code,pin_hash)
    values('CASA PETRY',encode(extensions.digest('1234','sha256'),'hex')) returning id into h;

    insert into public.house_users(house_id,name,role) values
      (h,'Tiago','admin'),
      (h,'Esposa','admin'),
      (h,'Empregada 1','user'),
      (h,'Empregada 2','user');

    insert into public.products(house_id,name,category,default_unit,favorite) values
      (h,'Leite','Geladeira / Freezer','1 L',true),
      (h,'Ovos','Geladeira / Freezer','dúzia',true),
      (h,'Café','Despensa','500 g',true),
      (h,'Arroz','Despensa','5 kg',false),
      (h,'Feijão','Despensa','1 kg',false),
      (h,'Papel higiênico','Banheiros','pacote',true),
      (h,'Sabonete','Banheiros','un.',false),
      (h,'Detergente','Cozinha','un.',true),
      (h,'Papel toalha','Cozinha','rolo',false),
      (h,'Sabão para roupas','Lavanderia','un.',true),
      (h,'Amaciante','Lavanderia','un.',false),
      (h,'Saco de lixo 50 L','Lavanderia','pacote',false);
  end if;
end $$;

-- IMPORTANTE: o PIN inicial acima é 1234 SOMENTE PARA FACILITAR A INSTALAÇÃO.
-- Depois do primeiro teste, troque-o executando:
-- update public.houses
-- set pin_hash=encode(extensions.digest('SEU_NOVO_PIN','sha256'),'hex')
-- where upper(code)='CASA PETRY';
