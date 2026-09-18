# Caderneta — contexto para sessões futuras

App de controle de gastos pessoais do Pedro, para substituir planilha. O
recorte que define o projeto: **o dinheiro está espalhado em três bancos**, e
saber quanto tem em cada um é a pergunta principal, não um detalhe.

Página web estática (sem servidor, sem build, sem dependências), pensada
primeiro para o celular, hospedada no GitHub Pages. Ver
[README.md](README.md) para instruções de uso e publicação.

## Regras inegociáveis (valem para todo o código)

1. **Dinheiro é inteiro em centavos.** `R$ 1,99` é `199`. Nunca float, em
   lugar nenhum — nem em variável temporária. Ponto flutuante erra centavos
   na soma do mês.
2. **Data é a string `'AAAA-MM-DD'`.** Nunca um `Date` guardado. No fuso do
   Brasil, `new Date('2026-09-17')` é lido como UTC e volta como dia 16.
   Comparar e ordenar string ISO já funciona; para virar `Date` local, use
   `fmt.paraData()`.
3. **Transferência entre bancos não é gasto.** Muda o saldo dos dois lados,
   mas fica fora de "entrou" e "saiu" do mês. É o erro clássico de controle
   de gastos e está coberto por teste — não "consertar" isso.
4. **Cartão de crédito é uma conta de sinal invertido.** `conta.tipo` é
   `'conta'` (banco) ou `'cartao'`; a ausência do campo significa `'conta'`,
   por causa dos registros gravados antes de os cartões existirem.
   - Comprar no crédito é uma **saída no cartão**: não toca no saldo do banco
     e o saldo do cartão fica negativo — essa dívida é a "fatura em aberto".
   - Pagar a fatura é uma **transferência do banco para o cartão**. Por isso
     nenhuma função de cálculo precisou mudar para os cartões existirem.
   - A compra no crédito **conta** em "saiu no mês" (o gasto aconteceu); o
     pagamento da fatura **não**, senão o mesmo dinheiro seria contado duas
     vezes.
   - O número grande do topo é só o dos bancos. Somar a dívida do cartão ali
     responderia outra pergunta — a que a linha "pagando a fatura agora,
     sobram…" responde separadamente.
5. **Verde e vermelho significam entrou/saiu.** As cores de banco
   (`CORES_CONTA` em `js/dados.js`) excluem verde e vermelho de propósito,
   para um número vermelho nunca ter dois significados possíveis.
6. **Só `js/dados.js` fala com o localStorage.** Toda escrita passa por
   `mutar()`, que grava e avisa a tela.

## Dependência em mão única

```
app.js  ->  telas.js  ->  calculos.js / formato.js
app.js  ->  dados.js
```

Cálculo nunca conhece tela; tela nunca grava dado. É isso que deixa
`js/calculos.js` testável sem navegador.

## Comandos

```bash
npm run dev      # http://localhost:4173 (servidor próprio, sem dependências)
npm test         # 18 testes, Node puro (node --test), sem instalar nada
npm run icones   # regera icons/ a partir de ferramentas/gerar-icones.js
```

Não existe `npm install` — o projeto tem zero dependências, de propósito.
Abrir o `index.html` direto no navegador não funciona (módulos ES exigem
servidor).

## Estrutura

```
index.html        uma página; as três abas são seções dela
css/styles.css    visual inteiro, sem framework
js/formato.js     dinheiro e datas (texto <-> número)
js/dados.js       estado + localStorage + backup
js/calculos.js    saldos, totais, agrupamentos — funções puras
js/telas.js       desenha extrato, resumo, ajustes
js/ui.js          el(), recado(), download
js/app.js         navegação, formulários, backup, service worker
sw.js             offline/instalação — TROCAR `VERSAO` a cada publicação
ferramentas/      servidor local e gerador de ícones (só desenvolvimento)
tests/            testes dos cálculos
```

## Armadilhas já encontradas (não repetir)

- `[hidden] { display: none !important; }` no topo do CSS é **essencial**:
  sem ele, o `display` das classes (`.tela`, `.boas-vindas`) anula o
  atributo `hidden` e as telas aparecem empilhadas.
- Grade de formulário precisa de `grid-template-columns: minmax(0, 1fr)`.
  Com `1fr` ou `auto`, a coluna cresce até o item mais largo e o diálogo
  vaza para fora da tela do celular.
- O `R$` do `Intl` pt-BR vem com **espaço fixo (U+00A0)**, não espaço comum.
  Quebra comparação de texto e busca.
- CSV para Excel em português: separador `;`, decimal com vírgula e **BOM**
  (`﻿`) no começo, senão os acentos viram `AlimentaÃ§Ã£o`.

## Estado atual e próximo passo

Primeira versão completa, testada no navegador e commitada. Falta **publicar
no GitHub**:

- Conta do usuário: `PedroArthurOliviera06` (confirmado; grafia "Oliviera")
- Bancos dele: Banco do Brasil, Nubank e Itaú. Cartão de crédito só no BB
  (no BB ele usa crédito e pix). Os nomes já vêm preenchidos na tela de
  primeiro acesso (`BANCOS_SUGERIDOS` em js/app.js)
- Repositório a criar (ainda não existe): `caderneta`, **público** (decidido
  com o usuário — Pages gratuito exige público; o repositório guarda só
  código, nenhum dado de gasto)
- Ainda falta: `git remote add origin`, primeiro `push`, e ligar
  **Settings → Pages** na branch `main`, pasta `/ (root)`

O usuário não conhece GitHub — explicar cada passo em linguagem simples,
sem jargão.

## Limite conhecido (assumido, não é bug)

Os dados ficam no localStorage do aparelho: não sincronizam entre celular e
computador, e limpar dados do navegador apaga tudo. Por isso backup é botão
de primeira linha em Ajustes, com aviso após 30 dias. Se um dia isso
incomodar, o caminho conversado foi GitHub Pages + Supabase.
