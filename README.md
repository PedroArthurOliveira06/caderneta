# Caderneta

Controle de gastos pessoais com o dinheiro separado por banco. Feito para
substituir a planilha: você lança o gasto em segundos pelo celular e vê,
a qualquer momento, quanto tem em cada banco e para onde o dinheiro foi.

É uma página web estática — abre no navegador do celular ou do computador,
pode ser instalada como aplicativo e funciona sem internet.

## O que ele faz

- **Saldo por banco.** Quantos bancos você quiser (a tela inicial começa com
  três). Cada um tem cor própria, que acompanha o lançamento pelo app todo.
- **Gasto, entrada e transferência entre bancos.** Transferência move o
  dinheiro de um banco para outro sem contar como gasto do mês — é a conta
  que planilha costuma errar.
- **Cartão de crédito de verdade.** O cartão é uma linha própria, separada
  dos bancos. Comprar no crédito não mexe no saldo do banco: soma na fatura
  em aberto. Quando você paga a fatura, aí o dinheiro sai do banco e a
  dívida abate. Assim o saldo mostrado bate com o extrato do banco — e o app
  ainda responde "pagando a fatura agora, sobra quanto?".
- **Resumo do mês:** para onde foi o dinheiro (por categoria), quanto saiu de
  cada banco e a comparação dos últimos seis meses.
- **Qualquer mês**, para frente ou para trás.
- **Backup** em arquivo, e exportação para planilha (CSV que abre no Excel
  em português, com acento e vírgula decimal certos).

## Onde os seus dados ficam

**No seu aparelho, no armazenamento do próprio navegador. Em nenhum servidor.**
Ninguém além de você vê os lançamentos — nem quem hospeda a página.

O outro lado dessa moeda é importante:

- Os dados **não se sincronizam** entre celular e computador. Cada aparelho
  tem a sua caderneta.
- **Limpar os dados de navegação apaga tudo.**

Por isso o backup faz parte do app, e não é um extra. Em *Ajustes → Backup*,
baixe o arquivo e guarde no e-mail ou na nuvem. O app avisa quando o último
backup passa de 30 dias. Para levar os dados a outro aparelho: baixe o backup
num, restaure no outro.

## Rodando na sua máquina

Precisa de [Node.js](https://nodejs.org) 20 ou mais novo. Não há nada para
instalar — o projeto não tem dependências.

```bash
npm run dev      # abre em http://localhost:4173
npm test         # roda os testes das contas
npm run icones   # regera os ícones do aplicativo
```

Abrir o `index.html` com dois cliques **não funciona**: o app usa módulos
JavaScript, que o navegador só carrega por um servidor. Por isso o
`npm run dev`.

## Publicando no GitHub Pages

O repositório já está no formato que o GitHub Pages espera — não há etapa de
compilação. No repositório, em **Settings → Pages**, escolha a branch `main`
e a pasta `/ (root)`. Em um ou dois minutos a página fica no ar.

A cada `git push`, o site atualiza sozinho.

Ao publicar uma versão nova, troque o número em `VERSAO` no arquivo
[`sw.js`](sw.js). É o que faz os celulares que já abriram o app baixarem os
arquivos novos em vez de usar os guardados.

## Instalando no celular

Abra o endereço no Chrome (Android) ou no Safari (iPhone) e use
**Adicionar à tela de início**. Ele passa a abrir como aplicativo, em tela
cheia e sem barra de endereço, e funciona offline.

## Como o código está organizado

```
index.html            uma página; as três abas são seções dela
css/styles.css        o visual inteiro, sem framework
js/
  formato.js          dinheiro e datas (texto <-> número)
  dados.js            leitura e gravação; é o único que fala com o navegador
  calculos.js         saldos e totais — funções puras, é o que os testes cobrem
  telas.js            desenha extrato, resumo e ajustes
  ui.js               peças reaproveitadas (elementos, avisos, download)
  app.js              junta tudo: navegação, formulários, backup
sw.js                 modo offline e instalação
ferramentas/          servidor local e gerador de ícones (só desenvolvimento)
tests/                testes das contas, rodam com o Node puro
```

Duas regras que o código todo segue:

1. **Dinheiro é inteiro em centavos**, nunca decimal. `R$ 1,99` é `199`.
   Somar dinheiro com número quebrado erra centavos no fechamento do mês.
2. **Data é texto `AAAA-MM-DD`**, nunca objeto de data guardado. No fuso do
   Brasil, `new Date('2026-09-17')` volta como dia 16.
