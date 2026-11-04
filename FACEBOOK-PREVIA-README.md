# Prévia Facebook — teste sem publicação automática

Rota: `/facebook-publicacoes.html` no GitHub Pages.

- Interface privada via sessão Supabase e RPC `is_admin`.
- Carros disponíveis de ambas as empresas, organizados por empresa.
- Seleção manual de fotos do bucket privado; legenda editável.
- Prévia com imagens selecionadas, copiar legenda, exportação de imagens, Web Share API quando disponível.
- Botão "Publicar automaticamente (em breve)" **desabilitado**; nenhum POST ao Facebook nem Edge Function.
- A publicação manual depende do usuário abrir sua Página e enviar os arquivos pelo Facebook.
- Nada grava ou altera registros do estoque.

O protótipo da API Meta permanece fora desta entrega. Para habilitar futuramente, revisão e autorização de Pages pela Meta e configuração segura dos tokens no Supabase serão necessárias.

## Validação sugerida
1. Abrir a rota autenticado como administrador; usuários não autenticados ou sem administrador devem ser bloqueados.
2. Selecionar carro da empresa certa e comparar imagens/valores com o estoque.
3. Editar texto, selecionar e desmarcar fotos e verificar prévia.
4. Copiar legenda e baixar fotos no celular ou Mac.
5. Verificar que o botão de publicar continua desativado.
6. Se o Safari não oferecer o compartilhamento nativo, usar download + copiar legenda.
