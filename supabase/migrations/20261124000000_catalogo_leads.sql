-- Leads vindos do catálogo (botão "Falar no WhatsApp")
-- Execute uma vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Pode ser executado de novo sem erro (idempotente). Não apaga dados.
--
-- ANTES DE RODAR: troque  COLOQUE_O_EMAIL_DO_ADMIN_AQUI  (no fim do arquivo)
-- pelo e-mail de login do administrador que vai receber esses leads.

-- 1. Configurações do CRM (ex.: quem recebe os leads do catálogo)
create table if not exists public.crm_configuracoes (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.crm_configuracoes enable row level security;
revoke all on public.crm_configuracoes from anon, authenticated;

-- 2. Registro de envios do catálogo (limite contra abuso)
create table if not exists public.crm_catalogo_envios (
  id bigint generated always as identity primary key,
  telefone text not null,
  produto_id text,
  criado_em timestamptz not null default now()
);
create index if not exists crm_catalogo_envios_tel_idx on public.crm_catalogo_envios (telefone, criado_em desc);
create index if not exists crm_catalogo_envios_data_idx on public.crm_catalogo_envios (criado_em desc);
alter table public.crm_catalogo_envios enable row level security;
revoke all on public.crm_catalogo_envios from anon, authenticated;

-- 3. Função chamada pelo catálogo público.
--    Cria o lead na etapa "novo" (Interessados), dono = admin configurado, origem "Catálogo".
--    Se o mesmo telefone já tem um lead aberto do admin, não duplica: só anota o novo contato.
create or replace function public.catalogo_registrar_lead(
  p_produto_id text, p_nome text, p_telefone text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid;
  v_nome text := left(regexp_replace(trim(coalesce(p_nome,'')), '\s+', ' ', 'g'), 80);
  v_tel text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  v_prod public.produtos%rowtype;
  v_interesse text;
  v_lead uuid;
  v_nota text;
begin
  -- Telefone brasileiro: aceita com ou sem 55; guarda com DDD, sem o 55 (igual ao CRM).
  if v_tel like '55%' and length(v_tel) in (12, 13) then v_tel := substr(v_tel, 3); end if;
  if length(v_nome) < 2 or length(v_tel) not in (10, 11) then
    return jsonb_build_object('ok', false, 'motivo', 'dados');
  end if;

  select * into v_prod from public.produtos where id::text = p_produto_id;
  if not found or v_prod.status = 'vendido' then
    return jsonb_build_object('ok', false, 'motivo', 'veiculo');
  end if;

  -- Limites: no máximo 3 envios do mesmo telefone a cada 10 min e 60 envios por hora no total.
  if (select count(*) from public.crm_catalogo_envios where telefone = v_tel and criado_em > now() - interval '10 minutes') >= 3
     or (select count(*) from public.crm_catalogo_envios where criado_em > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'motivo', 'limite');
  end if;
  insert into public.crm_catalogo_envios(telefone, produto_id) values (v_tel, p_produto_id);

  select valor::uuid into v_owner from public.crm_configuracoes where chave = 'dono_leads_catalogo';
  if v_owner is null then
    return jsonb_build_object('ok', false, 'motivo', 'configuracao');
  end if;

  v_interesse := nullif(trim(concat_ws(' ', v_prod.marca, v_prod.modelo, v_prod.ano)), '');
  if v_interesse is null then v_interesse := v_prod.nome; end if;
  v_nota := 'Contato pelo catálogo (WhatsApp) em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
            || ' sobre ' || coalesce(v_interesse, 'veículo') || '.';

  -- Já existe lead aberto do admin com esse telefone? Só anota.
  select l.id into v_lead
    from public.crm_leads l join public.crm_contatos_privados c on c.lead_id = l.id
   where l.owner_uid = v_owner and c.telefone = v_tel and l.etapa not in ('ganho','perdido')
   order by l.updated_at desc nulls last limit 1;
  if v_lead is not null then
    update public.crm_leads
       set observacoes = left(concat_ws(E'\n', observacoes, v_nota), 4000), updated_at = now()
     where id = v_lead;
    return jsonb_build_object('ok', true, 'novo', false);
  end if;

  insert into public.crm_leads(owner_uid, criado_por, empresa, nome, produto_id, origem, interesse, etapa, observacoes)
  values (v_owner, 'Catálogo', v_prod.empresa, v_nome, v_prod.id, 'Catálogo', v_interesse, 'novo', v_nota)
  returning id into v_lead;

  insert into public.crm_contatos_privados(lead_id, owner_uid, telefone)
  values (v_lead, v_owner, v_tel);

  return jsonb_build_object('ok', true, 'novo', true);
end $$;

revoke all on function public.catalogo_registrar_lead(text, text, text) from public;
grant execute on function public.catalogo_registrar_lead(text, text, text) to anon, authenticated;

-- 4. Quem recebe os leads do catálogo (TROQUE O E-MAIL ABAIXO antes de rodar)
insert into public.crm_configuracoes(chave, valor)
select 'dono_leads_catalogo', u.id::text from auth.users u
 where lower(u.email) = lower('COLOQUE_O_EMAIL_DO_ADMIN_AQUI')
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();

-- Conferência: deve mostrar 1 linha com o id do admin. Se vier vazio, o e-mail não foi encontrado.
select chave, valor from public.crm_configuracoes where chave = 'dono_leads_catalogo';
