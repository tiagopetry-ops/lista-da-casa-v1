# Lista da Casa — Guia de instalação

Este pacote foi criado como um **PWA** (aplicativo web instalável). O GitHub Pages hospeda a interface e o Supabase guarda os dados compartilhados.

## O que já funciona

- Código da casa + PIN no primeiro acesso.
- Escolha do usuário.
- O aparelho permanece autorizado por um token local.
- Lista compartilhada.
- “Está acabando” e “Acabou”.
- Quantidade, unidade e observação.
- Identificação de quem adicionou.
- Marcar/desmarcar como comprado.
- Modo Compra.
- Produtos permanentes.
- Favoritos / Adicionar rápido.
- Revisar a Casa por categorias.
- Histórico de itens comprados.
- Sincronização automática a cada 5 segundos e ao voltar ao app.
- Instalação na tela inicial do iPhone.
- Sem fotografias de produtos.

---

# PARTE 1 — Criar o banco no Supabase

1. Entre em **supabase.com** e crie uma conta, caso ainda não tenha.
2. Clique em **New project**.
3. Dê um nome como `lista-da-casa`.
4. Crie uma senha forte para o banco e guarde-a.
5. Escolha uma região próxima.
6. Aguarde o projeto ser criado.

## Executar a estrutura

1. No menu esquerdo do Supabase, abra **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo `supabase-setup.sql` deste pacote.
4. Antes de executar, vá até o bloco final “CRIAR A CASA”.
5. O pacote vem com:
   - Código: `CASA PETRY`
   - PIN inicial: `1234`
   - Usuários: Tiago, Esposa, Empregada 1 e Empregada 2.
6. Você pode manter esses valores para o primeiro teste.
7. Cole TODO o conteúdo do arquivo no SQL Editor.
8. Clique em **Run**.

Se não aparecer erro, o banco está pronto.

> Segurança: as tabelas não ficam liberadas diretamente para a chave pública. O aplicativo usa funções RPC que validam o token do aparelho. O PIN não fica gravado no código do aplicativo.

---

# PARTE 2 — Pegar as chaves do Supabase

No Supabase:

1. Abra **Project Settings**.
2. Procure a seção **API**.
3. Copie:
   - **Project URL**
   - a chave pública **anon** ou **publishable**
4. NUNCA copie a chave `service_role` para o aplicativo.

Agora abra o arquivo `config.js` e altere:

```js
SUPABASE_URL: "COLE_AQUI_A_PROJECT_URL",
SUPABASE_ANON_KEY: "COLE_AQUI_A_ANON_OU_PUBLISHABLE_KEY",
```

Salve o arquivo.

---

# PARTE 3 — Publicar no GitHub Pages

## Criar o repositório

1. Entre em **github.com**.
2. Clique em **New repository**.
3. Nome sugerido: `lista-da-casa`.
4. Para o método mais simples no GitHub Free, deixe-o **Public**.
5. Clique em **Create repository**.

> O site do GitHub Pages será público. Isso não significa que os dados das compras estarão dentro do GitHub: os dados ficam no Supabase. Ainda assim, não coloque senhas ou a chave `service_role` nos arquivos.

## Enviar os arquivos

Descompacte o ZIP e envie para a raiz do repositório:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `manifest.webmanifest`
- `sw.js`
- `.nojekyll`
- pasta `icons`

Os arquivos `supabase-setup.sql` e `GUIA-DE-INSTALACAO.md` podem permanecer no repositório, mas não são necessários para o funcionamento do site.

No GitHub, você pode usar **Add file → Upload files**, arrastar os arquivos/pastas e clicar em **Commit changes**.

## Ativar o Pages

1. Dentro do repositório, abra **Settings**.
2. No menu lateral, abra **Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Branch: `main`.
5. Pasta: `/(root)`.
6. Clique em **Save**.
7. Depois, em **Settings → Pages**, use **Visit site** quando aparecer.

O endereço deverá ser semelhante a:

`https://SEU-USUARIO.github.io/lista-da-casa/`

---

# PARTE 4 — Primeiro teste

Abra o endereço publicado.

Na primeira entrada:

1. Código: `CASA PETRY`
2. PIN: `1234` (se você não o alterou antes)
3. Escolha `Tiago`.

Teste:

1. Adicione um produto à lista.
2. Abra o mesmo endereço em outro aparelho.
3. Entre como outro usuário.
4. O produto deverá aparecer automaticamente.

---

# PARTE 5 — Trocar o PIN

Depois do primeiro teste, recomendo trocar o PIN inicial.

No Supabase, abra **SQL Editor** e execute:

```sql
update public.houses
set pin_hash=encode(extensions.digest('SEU_NOVO_PIN','sha256'),'hex')
where upper(code)='CASA PETRY';
```

Substitua `SEU_NOVO_PIN`.

Exemplo para PIN 583921:

```sql
update public.houses
set pin_hash=encode(extensions.digest('583921','sha256'),'hex')
where upper(code)='CASA PETRY';
```

Depois dessa mudança, aparelhos que já foram autorizados continuam funcionando. O novo PIN será necessário somente em novos aparelhos ou depois de “sair deste aparelho”.

---

# PARTE 6 — Alterar nomes dos usuários

No Supabase, abra **Table Editor → house_users**.

Altere apenas a coluna `name`.

Exemplos:

- Esposa → nome real.
- Empregada 1 → nome real.
- Empregada 2 → nome real.

Não altere `id` nem `house_id`.

---

# PARTE 7 — Instalar no iPhone

No iPhone:

1. Abra o endereço do aplicativo no **Safari**.
2. Faça o primeiro login.
3. Toque no botão **Compartilhar** do Safari.
4. Escolha **Adicionar à Tela de Início**.
5. Confirme o nome `Lista da Casa`.
6. Toque em **Adicionar**.

Depois disso, use o ícone como um aplicativo normal.

Repita em cada aparelho.

---

# Como atualizar o aplicativo depois

Quando eu lhe entregar uma versão nova:

1. Substitua os arquivos correspondentes no GitHub.
2. Faça o commit.
3. O GitHub Pages republicará.
4. O aplicativo atualiza os arquivos automaticamente quando houver conexão.

Se alguma versão antiga ficar presa no iPhone, feche o aplicativo e abra novamente. Em casos extremos, remova o ícone e adicione-o de novo.

---

# Observações importantes

- A sincronização desta versão ocorre automaticamente a cada 5 segundos e também quando o aplicativo volta para a tela.
- Os dados não dependem do `localStorage`; somente o token de autorização do aparelho fica local.
- Se o Safari apagar o armazenamento do site ou se você usar “Trocar usuário / sair deste aparelho”, será necessário informar código + PIN novamente.
- Não publique a senha do banco nem a chave `service_role`.
- O arquivo `config.js` contém apenas a URL do projeto e uma chave pública apropriada para aplicativos de navegador.

---

# Próximas melhorias possíveis

Depois que esta versão estiver funcionando nos quatro aparelhos, podemos acrescentar:

- edição de produtos;
- excluir/desativar produtos;
- gerenciamento de usuários dentro do app;
- mudança de PIN pelo administrador;
- listas por supermercado/açougue/fruteira/farmácia;
- agrupamento automático por local de compra;
- compras por ocasião (“churrasco”, “jantar”, etc.);
- sugestões por frequência de compra;
- notificações;
- relatório mensal de itens comprados.
