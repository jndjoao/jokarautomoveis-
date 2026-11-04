-- Execute no SQL Editor do Supabase, somente após revisar este arquivo.
-- Cada veículo pode ter apenas um envio confirmado/pendente por vez.
create table if not exists public.facebook_publicacoes (
  vehicle_id uuid primary key references public.produtos(id) on delete cascade,
  empresa text not null check (empresa in ('leal','jokar')),
  status text not null check(status in ('enviando','publicado','revisao')),
  photo_slots integer[] not null,
  message text not null,
  facebook_post_id text,
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text
);
alter table public.facebook_publicacoes enable row level security;
revoke all on public.facebook_publicacoes from anon, authenticated;
grant select on public.facebook_publicacoes to authenticated;
drop policy if exists "admin ve publicacoes facebook" on public.facebook_publicacoes;
create policy "admin ve publicacoes facebook" on public.facebook_publicacoes
  for select to authenticated using ((select public.is_admin()));

-- Trava transacional: se houve uma tentativa, revisão manual é exigida antes de repetir.
-- Em particular, falha de rede depois do POST ao Facebook NÃO é prova de que o post não foi criado.
create or replace function public.facebook_claim_publicacao(
  p_vehicle_id uuid, p_empresa text, p_photo_slots integer[], p_message text
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_produto public.produtos%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Acesso negado'; end if;
  if p_empresa not in ('leal','jokar') or p_message is null or length(trim(p_message)) not between 1 and 5000 then raise exception 'Dados inválidos'; end if;
  if p_photo_slots is null or cardinality(p_photo_slots) not between 1 and 10
     or exists(select 1 from unnest(p_photo_slots) slot where slot < 1 or slot > 10)
     or (select count(distinct slot) from unnest(p_photo_slots) slot) <> cardinality(p_photo_slots) then
     raise exception 'Seleção de fotos inválida';
  end if;
  select * into v_produto from public.produtos where id=p_vehicle_id for update;
  if not found or v_produto.empresa is distinct from p_empresa or v_produto.status is distinct from 'disponivel' then
    raise exception 'Veículo não está disponível nesta empresa';
  end if;
  insert into public.facebook_publicacoes(vehicle_id,empresa,status,photo_slots,message,requested_by)
  values(p_vehicle_id,p_empresa,'enviando',p_photo_slots,trim(p_message),auth.uid())
  on conflict do nothing;
  return found;
end $$;
revoke all on function public.facebook_claim_publicacao(uuid,text,integer[],text) from public,anon;
grant execute on function public.facebook_claim_publicacao(uuid,text,integer[],text) to authenticated;
