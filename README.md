# Bookrats local

Abra esta pasta no VS Code e use Open with Live Server no index.html. Nao requer build, npm ou Firebase.

Os arquivos desta pasta sao independentes do Entrelinhas. Os dados usam a chave bookrats.local.v1 no localStorage. Use sempre o mesmo host e porta: localhost e 127.0.0.1 possuem armazenamentos diferentes.

Perfis de demonstracao permitem experimentar leituras de varias pessoas. Eles nao sao contas autenticadas. Os convites JSON importados em outro navegador criam uma copia independente do clube; nao sincronizam dados. Revogacao so pode ser verificada quando o clube original existe no mesmo armazenamento.

Use Perfil e dados para exportar um backup antes de limpar o navegador. As seis capas de demonstracao estao em assets, obtidas do Open Library por ISBN. Capas cadastradas por URL e fontes externas precisam de internet; uploads, capas de demonstracao e fontes do sistema funcionam offline.

Implementado: estante, livros, progresso, historico, compartilhamento por clube, perfis, clubes, membros, convites locais, atividades, reacoes, metas, conquistas, votacoes, encontros e comentarios com spoiler.

Proxima etapa: Firebase Authentication, Firestore com regras por membro, Storage para imagens e convites com validacao central. Nunca conectar ao documento de dados do Entrelinhas.
