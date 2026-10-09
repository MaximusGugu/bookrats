# Bookrats

Aplicação estática com acesso obrigatório por Google, inclusive no localhost.

## Executar

Abra `index.html` pelo Live Server em **http://localhost:5500** (ou a porta configurada). Não abra por `file://`. O SDK Firebase já está incluído em `auth.bundle.js`, então o Live Server não precisa de build nem carregar módulos de uma CDN.

Para alterar a integração: `npm ci`, edite `auth.js` e execute `npm run build`. Publique também o bundle gerado. A configuração pública do aplicativo está em `firebase-config.js`, projeto `bookrats-ea53d`. Analytics não é inicializado.

O provedor Google precisa estar habilitado no Firebase Authentication. A lista de domínios autorizados consultada inclui `localhost` e `maximusgugu.github.io`; para usar `127.0.0.1`, adicione-o em Authentication > Settings > Authorized domains. Permita pop-ups para abrir a conta Google.

O login usa a sessão do Firebase. Se a persistência local estiver bloqueada, tenta persistência da aba e depois memória (nesse caso, uma recarga exige novo login). Uma falha de inicialização mostra a causa e libera o botão para tentar novamente. Não existe modo visitante, seletor de perfis ou usuário demonstrativo no aplicativo.

Referência: https://firebase.google.com/docs/auth/web/google-signin

## Livros e dados

As estantes mostram primeiro os livros alterados mais recentemente: cadastro, edição, progresso, status e compartilhamento atualizam `updatedAt`. Datas históricas de leitura não impedem uma atualização recente de ir para o topo. A ordenação é preservada em recargas e backups.

Os livros ainda ficam armazenados neste navegador, separados por UID autenticado (`bookrats.account.v1:<uid>`). **Esta versão não sincroniza dados entre dispositivos e não tem banco remoto.** O login não criptografa os dados do navegador. Uma futura API/banco deve validar tokens e aplicar autorização no servidor. Nunca conectar ao projeto/documento do Entrelinhas.

A conta nova começa vazia. Backups só podem ser restaurados na mesma conta. Dados antigos de demonstração não são carregados nem apagados. Convites locais e troca de perfis foram removidos; compartilhamento real entre contas exige um banco remoto.

## Testes

Com Node.js e Microsoft Edge instalados: `npm ci` e `npm test`. Os testes cobrem livros, ranking, layout, ordenação, recuperação após falha de inicialização, cancelamento, sessão, saída, bloqueio de telas sem login e isolamento de contas. A autenticação é simulada na suíte; o SDK real e a abertura da página Google foram verificados separadamente em localhost, inclusive com a CDN de módulos bloqueada.
