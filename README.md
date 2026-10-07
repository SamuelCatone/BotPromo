# Painel do Bot — BotPromo

Painel administrativo para monitoramento e controle de um bot de promoções (n8n + Supabase).
Construído em **HTML, CSS e JavaScript puro**, otimizado para o menor número de arquivos possível.

## Estrutura (3 arquivos)

```
painel-min/
├── index.html   → Página única (SPA por hash: #dashboard / #configuracoes)
├── style.css    → Todo o CSS (tokens, temas, layout, componentes, modais)
└── app.js       → Todo o JavaScript (utils, tema, toasts, modal, dados,
                    roteador/sidebar, dashboard, configurações)
```

Não há mais páginas separadas: `index.html` contém as duas telas (Dashboard e
Configurações) como `<section data-view="...">`, alternadas via JavaScript
usando a URL (`#dashboard` / `#configuracoes`) — sem recarregar a página.

## Como abrir

O painel usa um servidor Node local para manter a senha do banco fora do
navegador. Requer Node.js 18 ou superior:

```bash
npm install
copy .env.example .env
# preencha DATABASE_URL em .env
npm start
```

Depois, abra `http://localhost:3000`. Não abra `index.html` diretamente: as
rotas `/api` necessárias para acessar o banco são fornecidas pelo servidor.

## Conectando ao Supabase

Este projeto já está configurado para a conexão PostgreSQL do Supabase através
de `server.js`. A variável `DATABASE_URL` deve ficar exclusivamente em `.env`,
arquivo que está ignorado pelo Git. A interface chama apenas a API local e não
recebe a senha do banco.

A URL pública do projeto e a chave `publishable` também ficam no `.env` como
`SUPABASE_URL` e `SUPABASE_ANON_KEY`. A chave pública pode ser usada no cliente;
segredos do banco e a chave `service_role` nunca devem ir para o navegador.

### Isolamento por usuário

Todas as rotas da API validam a sessão Supabase e filtram as tabelas por
`id_usuario = auth.uid()`. O servidor nunca aceita o UID vindo do navegador:
ele usa exclusivamente o UID contido no token autenticado. As rotinas externas
que inserem produtos, links ou histórico também precisam gravar o UID correto
na coluna `id_usuario`; registros sem correspondência não são exibidos pelo
painel.

As tabelas usadas pela API são as listadas abaixo. O usuário do banco precisa
ter permissões de leitura e exclusão nelas.

### OAuth no Supabase

`SUPABASE_OAUTH_CLIENT_ID` e `SUPABASE_OAUTH_CLIENT_SECRET` são credenciais de
um provedor OAuth externo. Elas não são, por si só, uma credencial do SDK do
Supabase. O provedor correspondente precisa ser identificado e ativado em
**Supabase Dashboard → Authentication → Providers**, junto com a URL de
redirecionamento do projeto. O client secret permanece apenas no `.env` e não
deve ser enviado para o navegador.

> A seção abaixo é o fluxo alternativo via SDK Supabase; ele não é necessário
> com a configuração atual por `DATABASE_URL`.

Toda a comunicação com o banco passa por um único objeto dentro de `app.js`:
`DataClient` (procure por `CAMADA DE DADOS` no topo do arquivo).

1. Adicione o SDK no `<head>` de `index.html`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ```
2. Em `app.js`, preencha as credenciais:
   ```js
   const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
   const SUPABASE_ANON_KEY = 'sua-chave-anon';
   const USE_MOCK_DATA = false;
   ```
3. Crie o client logo abaixo:
   ```js
   const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   ```
4. Em cada método de `DataClient` (`getLinkAtual`, `countProdutosEnviados`,
   `countProdutosGeral`, `getUltimosEnviados`, `pararBot`, `reiniciarBot`),
   remova o bloco `if (USE_MOCK_DATA) { ... }` e descomente as chamadas já
   escritas logo abaixo, marcadas com `// TODO SUPABASE`.

## Tabelas esperadas

| Tabela                  | Uso no painel                                          |
|--------------------------|-----------------------------------------------------------|
| `n8n_link_atual`         | Link ativo do bot (card "Link Atual" + status do bot)     |
| `n8n_produtos_enviados`  | Total enviado, último envio, lista de últimos produtos    |
| `n8n_produtos_geral`     | Total de produtos disponíveis                              |

## Funcionalidades

- Dashboard com link atual, status do bot, contadores e últimos produtos enviados.
- Configurações com **Parar Bot** (remove `n8n_link_atual`) e **Reiniciar Bot**
  (apaga `n8n_produtos_enviados` e `n8n_produtos_geral`), ambas com modal de
  confirmação — reiniciar exige digitar "REINICIAR".
- Tema claro/escuro com paleta azul, persistido em `localStorage`.
- Totalmente responsivo: sidebar recolhível no desktop, off-canvas no mobile,
  tabelas viram cards em telas pequenas.
- Estados de carregamento (skeleton), vazio, erro (com "tentar novamente") e
  notificações toast.
