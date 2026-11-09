# Publicação automática no Facebook — Jokar

Tela: `facebook-publicacoes.html` (botão **↗ Publicações Facebook** na Central).

O administrador escolhe o veículo, marca as fotos, revisa a legenda, marca a caixa de autorização e confirma.
O navegador chama a Edge Function `publicar-facebook-jokar`, que:

1. confere que o usuário está logado e é administrador (`is_admin`);
2. relê o veículo no banco (precisa estar `disponivel`) e as fotos escolhidas;
3. reserva o envio na tabela `facebook_publicacoes` (impede post duplicado);
4. envia as fotos à Página (não publicadas) e cria **um** post com todas elas e a legenda;
5. grava o ID do post e devolve o link.

O token da Meta fica **somente** nos Secrets do Supabase. Nada de token no site/GitHub.
A Leal continua com o modo manual (copiar legenda + baixar fotos). O back-end já aceita a Leal se os Secrets dela forem configurados; falta apenas liberar o botão em `facebook-integracao-v15.js`.

---

## Passo 1 — Banco de dados (uma vez)

Supabase → **SQL Editor** → New query → cole o conteúdo de
`supabase/migrations/20261109000000_facebook_publicacoes.sql` → **Run**.

## Passo 2 — App e token da Meta

1. Em <https://developers.facebook.com> crie um App do tipo **Business** (ou use o existente).
   Quem gerar o token precisa ser **administrador do App e da Página Jokar** — assim não é necessário App Review.
2. No **Graph API Explorer**: selecione o App, clique em *Generate Access Token* e marque as permissões
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
3. Transforme em token de longa duração (Explorer → ícone ⓘ → *Open in Access Token Tool* → **Extend Access Token**).
4. Com esse token longo, chame `GET /me/accounts`. Na linha da Página Jokar copie:
   - `id` → será o **META_JOKAR_PAGE_ID**
   - `access_token` → será o **META_JOKAR_PAGE_TOKEN** (Page Token gerado de token longo não expira).
5. Confira no *Access Token Debugger* que o token é do tipo **Page** e que "Expires" mostra **Never**.

> Se mudar a senha do Facebook ou remover permissões do App, o token deixa de valer: repita os passos 2–4.

## Passo 3 — Secrets no Supabase

Supabase → **Edge Functions → Secrets** (ou `supabase secrets set ...`):

| Nome | Valor |
|---|---|
| `META_JOKAR_PAGE_ID` | id numérico da Página Jokar |
| `META_JOKAR_PAGE_TOKEN` | Page Token do passo 2 |
| `META_GRAPH_VERSION` | opcional, padrão `v25.0` |
| `ALLOWED_ORIGINS` | opcional, padrão `https://jndjoao.github.io` (se usar domínio próprio, inclua aqui, separado por vírgula) |

## Passo 4 — Deploy da função

**Pelo painel:** Edge Functions → *Deploy a new function* → *Via Editor* → nome **`publicar-facebook-jokar`** →
cole `supabase/functions/publicar-facebook-jokar/index.ts` → Deploy. Deixe **Verify JWT** ligado.

**Ou pela linha de comando:**

```bash
npx supabase login
npx supabase link --project-ref vmbvbchsrxieluvldazy
npx supabase functions deploy publicar-facebook-jokar
```

## Passo 5 — Teste

1. Entre na Central como administrador → **Publicações Facebook**.
2. Empresa Jokar → veículo → marque 1 foto → legenda → caixa de autorização → **Publicar no Facebook da Jokar** → confirmar.
3. Deve aparecer "Publicação confirmada pela Meta!" com o link do post. Confira na Página e apague o post de teste se quiser.
4. Teste também com usuário não-administrador: a tela deve bloquear.

---

## Quando algo dá errado

A mensagem na tela diz se é seguro tentar de novo:

- **"Nada foi publicado; você pode tentar de novo."** — a Meta recusou ou a foto falhou antes do post. Corrija e reenvie.
- **"Token da Página expirado ou inválido"** — refaça o Passo 2 e atualize o Secret.
- **"Confira a Página… registro em revisão: `<id>`"** — a conexão caiu durante a criação do post; ele **pode** ter saído.
  Enquanto estiver em revisão, o veículo fica bloqueado para novo envio. Confira a Página e resolva no SQL Editor:

```sql
-- O post saiu:
select public.facebook_resolver_revisao('<id>', true, '<id do post, se souber>');
-- O post NÃO saiu (libera nova tentativa):
select public.facebook_resolver_revisao('<id>', false);
```

Histórico de envios:

```sql
select criado_em, empresa, produto_id, status, facebook_post_id, ultimo_erro
from public.facebook_publicacoes order by criado_em desc limit 50;
```

Logs da função: Supabase → Edge Functions → `publicar-facebook-jokar` → **Logs**.
