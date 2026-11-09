-- Publicação automática no Facebook — Jokar + Leal
-- Execute uma vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Requer a função public.is_admin() já usada pela Central.
-- Pode ser executado de novo sem perder dados (idempotente).

create table if not exists public.facebook_publicacoes (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null unique,              -- gerado pelo navegador; evita envio duplicado em caso de reenvio
  produto_id       text not null,                     -- id do veículo em public.produtos (guardado como texto)
  empresa          text not null check (empresa in ('jokar','leal')),
  status           text not null check (status in ('enviando','publicado','revisao','cancelado')),
  foto_indices     integer[] not null,
  legenda          text not null,
  facebook_post_id text,
  ultimo_erro      text,
  solicitado_por   uuid not null references auth.users(id),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

-- Só pode existir UM envio em andamento ou aguardando revisão por veículo.
create unique index if not exists facebook_publicacoes_um_pendente_por_veiculo
  on public.facebook_publicacoes (produto_id)
  where status in ('enviando','revisao');

create index if not exists facebook_publicacoes_produto_idx
  on public.facebook_publicacoes (produto_id, criado_em desc);

alter table public.facebook_publicacoes enable row level security;
revoke all on public.facebook_publicacoes from anon, authenticated;
grant select on public.facebook_publicacoes to authenticated;

drop policy if exists "admin ve publicacoes facebook" on public.facebook_publicacoes;
create policy "admin ve publicacoes facebook" on public.facebook_publicacoes
  for select to authenticated using ((select public.is_admin()));

-- Reserva o envio ANTES de qualquer chamada à Meta.
-- Retorna:
--   {"reservado": true,  "id": ...}                      -> pode enviar
--   {"reservado": false, "status": "publicado", ...}     -> esse request_id já foi publicado (reenvio do navegador)
--   exceção                                              -> bloqueado (veículo indisponível, envio pendente etc.)
create or replace function public.facebook_reservar_publicacao(
  p_request_id uuid, p_produto_id text, p_foto_indices integer[], p_legenda text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_produto  public.produtos%rowtype;
  v_existente public.facebook_publicacoes%rowtype;
  v_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Apenas administradores podem publicar';
  end if;

  if p_request_id is null or p_produto_id is null
     or p_legenda is null or length(trim(p_legenda)) not between 5 and 5000 then
    raise exception 'Dados inválidos';
  end if;

  if p_foto_indices is null or cardinality(p_foto_indices) not between 1 and 10
     or exists (select 1 from unnest(p_foto_indices) s where s < 1 or s > 10)
     or (select count(distinct s) from unnest(p_foto_indices) s) <> cardinality(p_foto_indices) then
    raise exception 'Seleção de fotos inválida';
  end if;

  -- Reenvio do mesmo pedido: não publica de novo, apenas informa o resultado anterior.
  select * into v_existente from public.facebook_publicacoes where request_id = p_request_id;
  if found then
    return jsonb_build_object('reservado', false, 'id', v_existente.id,
      'status', v_existente.status, 'facebook_post_id', v_existente.facebook_post_id);
  end if;

  select * into v_produto from public.produtos where id::text = p_produto_id for update;
  if not found then raise exception 'Veículo não encontrado'; end if;
  if v_produto.status is distinct from 'disponivel' then raise exception 'Veículo não está disponível'; end if;
  if v_produto.empresa not in ('jokar','leal') then raise exception 'Empresa do veículo inválida'; end if;

  if exists (select 1 from public.facebook_publicacoes
             where produto_id = p_produto_id and status in ('enviando','revisao')) then
    raise exception 'Já existe uma publicação deste veículo em andamento ou aguardando revisão';
  end if;

  insert into public.facebook_publicacoes(request_id, produto_id, empresa, status, foto_indices, legenda, solicitado_por)
  values (p_request_id, p_produto_id, v_produto.empresa, 'enviando', p_foto_indices, trim(p_legenda), auth.uid())
  returning id into v_id;

  return jsonb_build_object('reservado', true, 'id', v_id, 'empresa', v_produto.empresa);
end $$;

revoke all on function public.facebook_reservar_publicacao(uuid, text, integer[], text) from public, anon;
grant execute on function public.facebook_reservar_publicacao(uuid, text, integer[], text) to authenticated;

-- Resolve um envio que ficou em 'revisao' (erro no meio do caminho).
-- Confira a Página no Facebook e então rode, no SQL Editor:
--   select public.facebook_resolver_revisao('<id>', true,  '<id do post>'); -- o post saiu
--   select public.facebook_resolver_revisao('<id>', false);                 -- não saiu; libera nova tentativa
create or replace function public.facebook_resolver_revisao(
  p_id uuid, p_publicado boolean, p_facebook_post_id text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- No SQL Editor auth.uid() é nulo (acesso de dono do banco); pelo app, exige administrador.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Apenas administradores';
  end if;
  update public.facebook_publicacoes
     set status = case when p_publicado then 'publicado' else 'cancelado' end,
         facebook_post_id = coalesce(p_facebook_post_id, facebook_post_id),
         atualizado_em = now()
   where id = p_id and status in ('revisao','enviando');
  if not found then raise exception 'Registro não encontrado ou já resolvido'; end if;
end $$;

revoke all on function public.facebook_resolver_revisao(uuid, boolean, text) from public, anon;
grant execute on function public.facebook_resolver_revisao(uuid, boolean, text) to authenticated;
