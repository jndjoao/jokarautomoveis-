-- Instagram — Jokar
-- Execute uma vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Requer a migração 20261109000000_facebook_publicacoes.sql já executada.
-- Pode ser executado de novo sem erro (idempotente). Não apaga dados.

-- 1. Histórico passa a registrar a rede social de cada envio.
alter table public.facebook_publicacoes
  add column if not exists plataforma text not null default 'facebook';

alter table public.facebook_publicacoes drop constraint if exists facebook_publicacoes_plataforma_check;
alter table public.facebook_publicacoes
  add constraint facebook_publicacoes_plataforma_check check (plataforma in ('facebook','instagram'));

-- 2. A trava contra duplicidade passa a valer por veículo E por rede:
--    um envio pendente no Facebook não bloqueia o Instagram (e vice-versa).
drop index if exists public.facebook_publicacoes_um_pendente_por_veiculo;
create unique index if not exists facebook_publicacoes_um_pendente_por_veiculo_rede
  on public.facebook_publicacoes (produto_id, plataforma)
  where status in ('enviando','revisao');

-- 3. Função de reserva com a rede social (padrão 'facebook': a função do Facebook continua igual).
drop function if exists public.facebook_reservar_publicacao(uuid, text, integer[], text);

create or replace function public.facebook_reservar_publicacao(
  p_request_id uuid, p_produto_id text, p_foto_indices integer[], p_legenda text,
  p_plataforma text default 'facebook'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_produto  public.produtos%rowtype;
  v_existente public.facebook_publicacoes%rowtype;
  v_id uuid;
  v_max int;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Apenas administradores podem publicar';
  end if;

  if p_plataforma not in ('facebook','instagram') then raise exception 'Rede social inválida'; end if;
  v_max := case when p_plataforma = 'instagram' then 2200 else 5000 end;

  if p_request_id is null or p_produto_id is null
     or p_legenda is null or length(trim(p_legenda)) not between 5 and v_max then
    raise exception 'Dados inválidos (legenda entre 5 e % caracteres)', v_max;
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
             where produto_id = p_produto_id and plataforma = p_plataforma
               and status in ('enviando','revisao')) then
    raise exception 'Já existe uma publicação deste veículo no % em andamento ou aguardando revisão',
      case when p_plataforma = 'instagram' then 'Instagram' else 'Facebook' end;
  end if;

  insert into public.facebook_publicacoes(request_id, produto_id, empresa, plataforma, status, foto_indices, legenda, solicitado_por)
  values (p_request_id, p_produto_id, v_produto.empresa, p_plataforma, 'enviando', p_foto_indices, trim(p_legenda), auth.uid())
  returning id into v_id;

  return jsonb_build_object('reservado', true, 'id', v_id, 'empresa', v_produto.empresa);
end $$;

revoke all on function public.facebook_reservar_publicacao(uuid, text, integer[], text, text) from public, anon;
grant execute on function public.facebook_reservar_publicacao(uuid, text, integer[], text, text) to authenticated;
