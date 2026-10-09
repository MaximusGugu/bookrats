# Bookrats

Aplicação estática com login obrigatório por Google e dados no Cloud Firestore.

## Executar

Abra `index.html` pelo Live Server em **http://localhost:5500** (ou a porta configurada). Não use `file://`. O SDK está incluído em `auth.bundle.js`.

Para alterar o código de autenticação/Firestore: `npm ci`, edite `auth.js` ou `cloud.js` e execute `npm run build`. Publique também o bundle gerado. O projeto é `bookrats-ea53d`; a configuração web pública está em `firebase-config.js`. Não há inicialização do Analytics.

## Ativar Firestore

1. No Firebase Console, selecione **bookrats-ea53d → Firestore Database → Criar banco**. Use o banco **(default)** e modo de produção, escolhendo a região apropriada.
2. Em **Firestore Database → Regras**, substitua o conteúdo pelo arquivo **firestore.rules** e clique **Publicar**. Essas regras se destinam ao projeto exclusivo do Bookrats.
3. Recarregue o app e entre com Google. Ele carregará seus dados ou migrará os dados da conta que estão neste navegador.

Alternativa por CLI autenticada: `npx firebase deploy --only firestore --project bookrats-ea53d`. O arquivo de índices desativa a indexação de campos de conteúdo; as consultas usadas não exigem índices compostos.

## Dados e sincronização

Cada conta tem seu espaço em `bookratsAccounts/{uid}`. Metadados e revisão ficam no documento da conta; cada livro, leitura, clube, perfil e atividade ocupa um documento próprio na subcoleção `items`. As regras permitem leitura e escrita apenas ao UID dono da conta. Todos os caminhos não declarados ficam bloqueados.

**Esta etapa sincroniza os dados da mesma conta entre dispositivos. Clubes ainda são privados à conta; convites e colaboração entre contas não estão implementados.**

O Firestore é a fonte dos dados. O app só confirma gravações após o servidor responder e mantém o formulário aberto quando a gravação falha. Operações são transacionais: ou todos os registros são gravados, ou nenhum. Uma revisão impede que uma aba desatualizada sobrescreva outra silenciosamente; feche o formulário e atualize para refazer a alteração. O listener atualiza a interface ao detectar uma nova revisão, sem substituir formulários em edição.

No primeiro acesso, a chave anterior `bookrats.account.v1:<uid>` é importada somente se a conta ainda não existir no Firestore. A importação é atômica, mantém os IDs e não apaga a cópia local. Se já há dados na nuvem, eles prevalecem e o armazenamento antigo não é lido. Nenhuma nova gravação de livros/clubes vai para localStorage. O tema e a persistência de autenticação continuam locais.

Backups JSON continuam disponíveis e só podem ser restaurados na mesma conta. Restaurar substitui os dados no Firestore e afeta todos os dispositivos dessa conta. Cada operação suporta até 450 registros alterados e 8 MB de conteúdo; cada registro deve ter menos de 900 KB. Novas capas enviadas são limitadas a 600 KB. Uma importação acima do limite é recusada antes de gravar; use URLs para capas ou um backup menor.

As estantes mantêm a ordem da alteração mais recente, incluindo edições, progresso e status.

## Autenticação

Habilite Google em Firebase Authentication. `localhost` e `maximusgugu.github.io` estavam autorizados no projeto na última verificação. Adicione `127.0.0.1` separadamente caso use esse endereço. Permita pop-ups. Falhas mostram uma mensagem e permitem tentar novamente.

Nunca conectar ao projeto/documento do Entrelinhas. O projeto Bookrats tem suas próprias regras e coleções.

## Testes

- `npm test`: interface no Microsoft Edge com adaptadores simulados; cobre login, falhas/retry do Firestore, gravação negada, livros, ranking, ordenação, sessão e isolamento de contas.
- `npm run test:firestore`: emulador oficial (Java 21+), sem acessar produção. Cobre migração, recarga, gravação/remoção atômica, atualizações entre clientes, conflito de revisões e negação de acesso anônimo ou de outra conta.
- `npm run build`: gera o bundle estático.

Referências: https://firebase.google.com/docs/firestore/manage-data/transactions e https://firebase.google.com/docs/firestore/security/rules-conditions.
