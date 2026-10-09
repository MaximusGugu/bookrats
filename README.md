# Bookrats

Aplicação estática com login Google, dados privados no Firestore e clubes compartilhados por convite.

## Executar

Abra `index.html` com Live Server em **http://localhost:5500** (ou a porta configurada). O SDK está incluído em `auth.bundle.js`. Para alterar `auth.js`, `cloud.js` ou `shared.js`: `npm ci` e `npm run build`; publique o bundle junto.

Projeto Firebase: **bookrats-ea53d**, banco **(default)**. A configuração web pública está em `firebase-config.js`. O provedor Google deve estar habilitado e o host autorizado no Firebase Authentication. Não há Analytics. Nunca conectar ao projeto/documento do Entrelinhas.

## Regras do Firestore

**Esta versão precisa das regras atualizadas de `firestore.rules`.** No Firebase Console → Firestore Database → Regras, substitua o conteúdo pelo arquivo completo e clique Publicar. As regras incluem contas privadas, clubes, membros e convites; não acrescente permissões globais.

Alternativa com CLI autenticada: `npx firebase deploy --only firestore --project bookrats-ea53d`. As consultas não exigem índices compostos.

## Convites por link

1. Abra o clube como administrador e use **Menu → Convidar por link** (também disponível na aba Clube).
2. Copie o link e compartilhe. Ele vale por **7 dias**. Links gerados no localhost apontam para `https://maximusgugu.github.io/bookrats/`, para funcionar no computador/celular dos convidados.
3. O convidado abre o link, entra com Google e confirma **Entrar no clube**. Abrir o link ou fazer login não aceita automaticamente. A entrada repetida é idempotente.
4. **Gerar novo link** invalida o anterior. **Revogar link** impede novas entradas pelo link atual e preserva os membros existentes. Remover um membro revoga também o link atual, evitando reentrada por ele. O administrador não pode sair do próprio clube nesta versão.

O primeiro convite converte o clube privado existente em um clube compartilhado real, preservando seu ID e conteúdo. Os perfis demonstrativos antigos não se tornam membros autenticados. Apenas leituras do administrador marcadas para aquele clube são publicadas inicialmente. Membros novos começam sem compartilhar livros; eles escolhem os clubes ao cadastrar/editar uma leitura.

Os convites usam tokens aleatórios de 256 bits, acessíveis individualmente após login. Não há listagem de convites. As regras validam validade, token ativo e associação ao clube no servidor. Uma revogação entre a prévia e a confirmação também bloqueia a entrada.

## Dados privados e compartilhados

- `bookratsAccounts/{uid}` e `items`: estante, perfil, leituras e atividades privados da conta. Somente o UID dono pode ler/escrever.
- `bookratsAccounts/{uid}/clubLinks`: referências aos clubes. Uma referência só pode ser criada se o usuário se tornou membro. Referências antigas funcionam como marcadores para impedir que um clube removido reapareça a partir da cópia privada.
- `bookratsClubs/{clubId}`: informações do clube, comentários, votos e encontros; somente membros podem ler. O administrador controla nome, configurações e convites. Membros só alteram seus votos, acrescentam seus comentários/encontros e removem seus próprios encontros.
- Subcoleções `members`, `readings` e `activities`: perfis de membros e cópias apenas dos dados compartilhados naquele clube. As leituras omitem as notas privadas e os IDs de outros clubes. Cada pessoa altera suas leituras; reações só permitem adicionar/remover o próprio UID. A remoção do membro bloqueia o acesso imediatamente.
- `bookratsInvites/{token}`: nome/ID do clube e validade; não expõe livros nem a lista de membros antes da entrada.

As telas acompanham atualizações do clube em tempo real. Formulários abertos não são substituídos: uma revisão impede sobrescritas silenciosas quando outra pessoa salva primeiro. O app só mostra sucesso depois de a gravação ser confirmada. Estante privada e alterações compartilhadas da mesma ação são gravadas na mesma transação.

Os metadados de uma edição pertencem à leitura de cada pessoa. Para sugerir uma leitura coletiva, o livro deve estar compartilhado no clube. Backups continuam exportáveis; a restauração de backups com clubes compartilhados fica bloqueada para não sobrescrever dados dos demais membros.

## Migração e limites

Os dados antigos de `bookrats.account.v1:<uid>` só são importados se a conta ainda não existir no Firestore. A importação mantém IDs e não apaga a cópia antiga. Dados existentes na nuvem prevalecem.

Gravações privadas suportam até 450 registros alterados e 8 MB por operação. Cada registro deve ter menos de 900 KB; novas capas têm limite de 600 KB. Uma ação pode atualizar até cinco clubes compartilhados e 400 registros compartilhados. Use URLs para capas grandes. Erros de limite não são apresentados como sucesso.

## Testes

- `npm test`: testes de interface no Microsoft Edge, incluindo login, persistência, falhas/retry, ordenação e ciclo completo de convite (autenticação/Firestore simulados).
- `npm run test:firestore`: emulador oficial com Java 21+, sem produção. Testa migração, transações, isolamento, associação por convite, privacidade, comentários e livros entre duas contas, atualizações em tempo real, conflitos, renovação, expiração, remoção e saída.
- `npm run build`: gera o bundle estático.

Referências: https://firebase.google.com/docs/firestore/manage-data/transactions e https://firebase.google.com/docs/firestore/security/rules-conditions.

### Sess�o e cache do navegador

A sess�o Google usa persist�ncia do Firebase. Ap�s o Firebase identificar a conta, uma c�pia dos dados confirmados � exibida a partir do IndexedDB enquanto o Firestore sincroniza. O cache � separado por usu�rio e removido ao sair ou trocar de conta. Sem conex�o, a c�pia fica dispon�vel para consulta; altera��es exigem sincroniza��o. Navega��o privada ou limpeza dos dados do site podem remover a sess�o e o cache.
