# Integração Facebook — Jokar + Leal

**Estado:** código em revisão; NÃO publicado em produção. O deploy da função e a configuração da Meta ainda precisam ser realizados.

## Fluxo
1. O administrador entra no estoque, abre `facebook-publicacoes.html` e escolhe a empresa.
2. Seleciona veículo disponível, marca fotos, edita legenda e visualiza a prévia.
3. Ao clicar em **Autorizar e publicar**, confirma novamente.
4. A Edge Function revalida JWT, `is_admin()`, empresa, disponibilidade e fotos, reserva publicação no banco, lê fotos no Storage privado e envia à página da empresa.
5. O registro fica `publicado` ou `revisao` (em erros incertos, NUNCA retentar automaticamente).

## Preparação no Supabase
- Revise e execute `supabase/facebook_publicacoes.sql` no SQL Editor da instância correta.
- Configure Secrets da Edge Function (valores reais **somente no painel do Supabase**, nunca no GitHub):
  `META_JOKAR_PAGE_ID`, `META_LEAL_PAGE_ID`, `META_JOKAR_PAGE_TOKEN`, `META_LEAL_PAGE_TOKEN`.
- Opcional: `META_GRAPH_VERSION` para versão suportada pela Meta.
- Implemente `supabase/functions/facebook-publicar/index.ts` na instância e deixe JWT obrigatório.
- É necessário que as páginas Meta e o app de desenvolvedor autorizem postagem de conteúdo e páginas, incluindo as permissões vigentes exigidas pela Meta.
- A credencial de service role não pode ser colocada em arquivos públicos; usa-se apenas segredo server-side já provisionado no Supabase.
- **Nunca** coloque tokens de página no GitHub, no `config.js` ou no navegador.

## Observações importantes
- O frontend oferece seleção manual das até 10 fotos existentes; o Supabase entrega os blobs privados diretamente à API Meta, sem depender da expiração das URLs assinadas.
- Os posts são feitos em páginas corporativas, não no Marketplace.
- A tabela de deduplicação impede um segundo envio do mesmo veículo; eventual republicação requer fluxo futuro explícito de revisão por administrador.
- Se o POST da Meta funcionou e a gravação local falhou, o status permanece em revisão; confira a página antes de qualquer ajuste.
- Em ambientes com Supabase publishable keys assimétricas, revise as chaves e a configuração de autenticação conforme documentação atual antes do deploy.
- Teste com um veículo de demonstração antes de habilitar em produção.

## Testes mínimos
- Não autenticado / usuário sem admin => bloqueado.
- Carro de empresa diferente e vendido => bloqueado pelo servidor.
- Foto inválida => bloqueado antes da Meta.
- Secrets ausentes => erro seguro sem publicação.
- Autorização válida => fotos escolhidas e legenda chegam à página certa.
- Clique repetido ou erro de rede => sem publicação duplicada automática.
