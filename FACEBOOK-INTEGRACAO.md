# Teste manual de publicações Facebook — Jokar + Leal

**Estado:** desenvolvimento em branch e PR rascunho, sem deploy nem publicação. A Meta for Developers ainda depende da liberação da conta no novo dispositivo.

## Modo manual (funciona sem API Meta)
1. Entrar no sistema com usuário administrador.
2. Abrir `facebook-publicacoes.html` (ou o atalho proposto na tela principal).
3. Selecionar empresa e veículo disponível, escolher as fotos desejadas.
4. Revisar e editar a legenda; copiar o texto.
5. Tentar o compartilhamento nativo de fotos e texto no celular (a disponibilidade varia por navegador e aplicativo).
6. Se indisponível, selecionar **Baixar fotos escolhidas**, salvar cada imagem pelos botões e publicar manualmente na Página do Facebook.

**Importante:** o navegador pode não transferir texto e múltiplas fotos juntos para o Facebook. Confirme a postagem manualmente. As fotos vêm de bucket privado via URLs assinadas temporárias. O modo manual não grava no banco histórico de publicação e não chama a Graph API.

## Fase futura — API oficial
A função `supabase/functions/facebook-publicar/index.ts` e a migração `supabase/facebook_publicacoes.sql` permanecem como protótipo de backend; não instale/execute antes da revisão de segurança e configuração das permissões Meta, Page ID e Page Token no painel Supabase. Não inserir tokens em arquivos públicos.

## Testes necessários antes do merge
- Login não-administrador não acessa o preparador.
- Escolha de empresa filtra os veículos corretos.
- Veículos vendidos/reservados não aparecem.
- Fotos 1–10 podem ser selecionadas/desmarcadas.
- Legenda é editável, copiada e prévia atualiza.
- Download de foto funciona no Safari do Mac e no celular; fallback de compartilhamento é legível.
- Nenhuma publicação ou chamada à Meta ocorre sem ação e configuração explícitas.
