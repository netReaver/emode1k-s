-- Аудит изменений деревьев и статей + роль администратора (проверка на бэке).
-- Применяется в Supabase: Dashboard → SQL Editor → Run.
-- ВАЖНО: замените 'emode1koff@gmail.com' на реальный email администратора, если он другой.

-- 1) Профили и роль.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  updated_at timestamptz not null default now()
);

-- Автосоздание профиля при регистрации нового пользователя.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when new.email = 'emode1koff@gmail.com' then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Бэкфилл уже существующих пользователей (чтобы роль появилась и у текущего админа).
insert into public.profiles (id, email, role)
select id, email, case when email = 'emode1koff@gmail.com' then 'admin' else 'user' end
from auth.users
on conflict (id) do update
  set email = excluded.email, role = excluded.role;

-- 2) Журнал аудита.
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('node', 'article')),
  action text not null check (action in ('create', 'update', 'delete')),
  entity_id text not null,
  label text,
  changed jsonb not null default '{}'::jsonb,
  author_email text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
create index if not exists audit_log_entity_type_idx on audit_log (entity_type);

-- 3) Проверка роли на бэке (используется RPC ниже).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 4) Триггеры аудита для узлов дерева.
create or replace function public.audit_nodes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  author text;
  changed jsonb := '{}'::jsonb;
begin
  author := (select email from auth.users where id = auth.uid());

  if tg_op = 'INSERT' then
    insert into public.audit_log (entity_type, action, entity_id, label, changed, author_email)
    values ('node', 'create', new.id, new.label,
      jsonb_build_object(
        'label', jsonb_build_array(null, new.label),
        'info', jsonb_build_array(null, left(coalesce(new.info, ''), 2000))
      ),
      author);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.label is distinct from old.label then
      changed := changed || jsonb_build_object('label', jsonb_build_array(old.label, new.label));
    end if;
    if new.info is distinct from old.info then
      changed := changed || jsonb_build_object(
        'info',
        jsonb_build_array(left(coalesce(old.info, ''), 2000), left(coalesce(new.info, ''), 2000))
      );
    end if;
    if changed <> '{}'::jsonb then
      insert into public.audit_log (entity_type, action, entity_id, label, changed, author_email)
      values ('node', 'update', new.id, new.label, changed, author);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (entity_type, action, entity_id, label, changed, author_email)
    values ('node', 'delete', old.id, old.label,
      jsonb_build_object(
        'label', jsonb_build_array(old.label, null),
        'info', jsonb_build_array(left(coalesce(old.info, ''), 2000), null)
      ),
      author);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists nodes_audit on nodes;
create trigger nodes_audit
  after insert or update or delete on nodes
  for each row execute function public.audit_nodes();

-- 5) Триггеры аудита для статей.
create or replace function public.audit_articles()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  author text;
  changed jsonb := '{}'::jsonb;
begin
  author := (select email from auth.users where id = auth.uid());

  if tg_op = 'INSERT' then
    insert into public.audit_log (entity_type, action, entity_id, label, changed, author_email)
    values ('article', 'create', new.id, new.title,
      jsonb_build_object(
        'title', jsonb_build_array(null, new.title),
        'content', jsonb_build_array(null, left(coalesce(new.content, ''), 2000))
      ),
      author);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.title is distinct from old.title then
      changed := changed || jsonb_build_object('title', jsonb_build_array(old.title, new.title));
    end if;
    if new.content is distinct from old.content then
      changed := changed || jsonb_build_object(
        'content',
        jsonb_build_array(left(coalesce(old.content, ''), 2000), left(coalesce(new.content, ''), 2000))
      );
    end if;
    if changed <> '{}'::jsonb then
      insert into public.audit_log (entity_type, action, entity_id, label, changed, author_email)
      values ('article', 'update', new.id, new.title, changed, author);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (entity_type, action, entity_id, label, changed, author_email)
    values ('article', 'delete', old.id, old.title,
      jsonb_build_object(
        'title', jsonb_build_array(old.title, null),
        'content', jsonb_build_array(left(coalesce(old.content, ''), 2000), null)
      ),
      author);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists articles_audit on articles;
create trigger articles_audit
  after insert or update or delete on articles
  for each row execute function public.audit_articles();

-- 6) RPC для выдачи репортов. Данные отдаёт только администратору.
create or replace function public.get_audit_log(
  p_entity_type text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_page int default 1,
  p_page_size int default 20
)
returns table (
  id bigint,
  entity_type text,
  action text,
  entity_id text,
  label text,
  changed jsonb,
  author_email text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  p_page := greatest(p_page, 1);
  p_page_size := least(greatest(p_page_size, 1), 100);

  return query
    select a.id, a.entity_type, a.action, a.entity_id, a.label, a.changed, a.author_email, a.created_at
    from public.audit_log a
    where (p_entity_type is null or a.entity_type = p_entity_type)
      and (p_date_from is null or a.created_at >= p_date_from)
      and (p_date_to is null or a.created_at <= p_date_to)
    order by a.created_at desc, a.id desc
    limit p_page_size
    offset (p_page - 1) * p_page_size;
end;
$$;

create or replace function public.get_audit_log_count(
  p_entity_type text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  return (
    select count(*)
    from public.audit_log a
    where (p_entity_type is null or a.entity_type = p_entity_type)
      and (p_date_from is null or a.created_at >= p_date_from)
      and (p_date_to is null or a.created_at <= p_date_to)
  );
end;
$$;

-- 7) Прямой доступ к журналу через клиент запрещён: данные отдаёт только RPC.
alter table public.audit_log enable row level security;
-- Политик нет => прямой SELECT/INSERT/UPDATE/DELETE через PostgREST отклоняется.
