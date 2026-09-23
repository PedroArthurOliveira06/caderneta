# Caderneta — contexto para sessões futuras

App de controle de gastos pessoais do Pedro, para substituir planilha. O
recorte que define o projeto: **o dinheiro está espalhado em vários lugares**
— três bancos, um cartão de crédito e uma caixinha — e saber quanto tem em
cada um é a pergunta principal, não um detalhe.

Página web estática (sem build, sem dependências), pensada primeiro para o
celular, publicada no GitHub Pages, com contas de usuário no Supabase.
Ver [README.md](README.md) para uso e publicação.

## Regras inegociáveis (valem para todo o código)

1. **Dinheiro é inteiro em centavos.** `R$ 1,99` é `199`. Nunca float, em
   lugar nenhum — nem em variável temporária.
2. **Data é a string `'AAAA-MM-DD'`.** Nunca um `Date` guardado. No fuso do
   Brasil, `new Date('2026-09-17')` é lido como UTC e volta como dia 16.
   Para virar `Date` local, use `fmt.paraData()`.
3. **Transferência não é gasto.** Muda o saldo dos dois lados, mas fica fora
   de "entrou" e "saiu" do mês. Coberto por teste — não "consertar".
4. **Cartão de crédito é conta de sinal invertido.** Comprar no crédito é
   saída no cartão (saldo fica negativo = fatura em aberto); pagar a fatura é
   transferência do banco para o cartão. Por isso nenhuma função de cálculo
   precisou mudar para os cartões existirem.
   - **A compra conta no mês em que ACONTECEU**, não no mês em que a fatura é
     paga. Ele corrigiu isso em 18/09/2026: a fatura paga em 10/09 era de
     compras de agosto, e lançá-las em setembro fazia os dois meses mentirem.
   - "Corrente x esporádico" existe **só no cartão** e mora no **lançamento**,
     não na categoria: o mesmo "Ifood" é assinatura num mês e pedido avulso
     no outro.
5. **Caixinha (`tipo: 'reserva'`) fica fora do número grande.** Dinheiro
   separado para um objetivo não é dinheiro disponível.
6. **Verde e vermelho significam entrou/saiu.** As cores de conta nunca usam
   esses dois, para um número vermelho não ter dois significados.
7. **Cor de conta é variável do CSS, não código fixo** (`--conta-amarelo`).
   Cada uma tem versão clara e escura: amarelo claro some no branco, roxo
   escuro some no preto.
8. **Só `js/dados.js` fala com localStorage e com o servidor.** Toda escrita
   passa por `mutar()`.

## Dependência em mão única

```
app.js  ->  telas.js  ->  calculos.js / formato.js
app.js  ->  dados.js  ->  servidor.js / mapear.js
```

Cálculo nunca conhece tela; tela nunca grava dado. É isso que deixa
`calculos.js`, `formato.js`, `interpretar.js`, `mapear.js` e `segredo.js`
testáveis sem navegador.

## Comandos

```bash
npm run dev      # http://localhost:4173 (servidor próprio, sem dependências)
npm test         # 160 testes, Node puro, sem instalar nada
npm run versao   # OBRIGATÓRIO antes de cada publicação (ver armadilhas)
npm run icones   # regera icons/
```

Não existe `npm install`: zero dependências, de propósito.

## Estrutura

```
index.html          uma página; todas as telas são seções dela
css/styles.css      visual inteiro, claro e escuro, sem framework
js/formato.js       dinheiro e datas (texto <-> número)
js/calculos.js      saldos, totais, fatura, natureza — funções puras
js/interpretar.js   "mercado 45" -> lançamento; atalhos frequentes
js/segredo.js       embaralha o PIN (PBKDF2)
js/mapear.js        formato do app <-> formato do banco
js/servidor.js      Supabase por fetch puro: entrar, ler, gravar
js/dados.js         estado, localStorage, fila de envio, importação
js/tema.js          claro / escuro / automático
js/tranca.js        tela do PIN
js/conta.js         entrar, criar conta, fila de aprovação
js/telas.js         desenha extrato, resumo, ajustes
js/ui.js            el(), recado(), download
js/app.js           navegação, formulários, backup, versão
db/                 esquema.sql + migrações
ferramentas/        servidor local, gerador de ícones, carimbo de versão
```

## Armadilhas já encontradas (não repetir)

**Publicação**

- **`npm run versao` antes de cada commit que vai ao ar.** Quando dependia de
  memória, esqueci sete publicações seguidas e o app ficou permanentemente
  uma versão atrás.
- **Repositório privado derruba o site.** Pages gratuito só publica
  repositório público, e ao voltar para público o Pages fica DESLIGADO —
  religar à mão em Settings → Pages, logado.
- O endereço diferencia maiúscula: `/Caderneta/` dá 404.
- A página de Settings dá 404 para quem não está logado.
- Aparelho preso na versão velha: Ajustes → Versão → "Buscar versão nova".
  Em último caso, abrir o link com `?novo=1`.

**Código**

- `[hidden] { display: none !important; }` é essencial, senão o `display` das
  classes anula o atributo e as telas aparecem empilhadas.
- Grade de formulário precisa de `grid-template-columns: minmax(0, 1fr)`,
  senão o diálogo vaza para fora da tela do celular.
- O `R$` do `Intl` pt-BR usa **espaço fixo (U+00A0)**.
- CSV para Excel: separador `;`, decimal com vírgula e **BOM** no começo.
- Ordenar `sheetN.xml` de um xlsx por texto embaralha as abas (sheet10 vem
  antes de sheet2). Ordenar por número.

**Ao explicar algo a ele**

- Não conhece GitHub nem SQL. Cada passo em linguagem simples.
- "Apague o que estiver no editor" não basta: dizer **Ctrl+A e Delete**.
- Ele acha os bugs de uso que eu não acho: pediu botão Salvar no rodapé
  (o do cabeçalho passava despercebido) e botão de atualizar (a faixa
  automática não aparece quando o cache está travado). Levar a sério.

## Estado atual

No ar: **https://pedroarthuroliveira06.github.io/caderneta/**

- GitHub: `PedroArthurOliveira06`, repositório `caderneta`, público
- Supabase: projeto `sbelyvcsbilsgpzlecuw`; ele é dono e aprovado
- Usa nos dois aparelhos. Em 22/09/2026 o app passou a ter o histórico
  INTEIRO de março a setembro/2026 — planilha antiga, extrato do BB e as
  seis faturas do cartão — e as **cinco contas batem com o banco ao
  centavo**: BB 61,00 · Nubank 158,43 · Itaú 1.000,42 · Caixinha 1.386,25 ·
  Cartão −32,80
- Bancos: Banco do Brasil (amarelo), Nubank (roxo), Itaú (laranja),
  Cartão BB (azul), Caixinha do Nubank (roxo claro)

**Pronto:** conferir com o banco, aviso de lançamento repetido, patrimônio
mês a mês, categoria comparada com o MÊS ANTERIOR, histórico de uma
categoria, de onde veio o dinheiro, cartão de crédito, parcelamento,
caixinha, lançar escrevendo,
login com aprovação manual, recuperação de senha, PIN, modo escuro,
importação de arquivo (adicionar, acertar contas, mover datas), aviso e
botão de atualização, lembrete da fatura com o pagamento já preenchido,
busca em todo o histórico, gastos que se repetem todo mês, classificador em
lote, categoria aprendida pelo nome, aviso de categoria que subiu em relação
ao mês passado, cor por categoria.

A cada envio o GitHub roda sozinho os 160 testes e confere se a versão foi
carimbada — inclusive se o commit mexeu no app sem carimbar, que é o erro
que os três arquivos de versão concordando entre si NÃO pegam.

`js/dados.js` tem teste desde 18/09/2026, com um localStorage de mentira
montado antes de importar o módulo. Continuam sem teste: `app.js`,
`telas.js`, `conta.js`, `tranca.js`, `servidor.js` e `ui.js` — todos
pesados em tela e rede.

**A lista que ele pediu acabou.** Sobrava a previsão de quanto sobra no fim
do mês, e em 21/09/2026 ele disse que não quer.

**Pendências com ele:** (nenhuma aberta)

- `db/RODAR-NO-SUPABASE-gastos-que-se-repetem.sql` — rodado em 21/09/2026,
  e a Apple e o Spotify sobreviveram (conferido no backup dele). Resolvido.
- `db/RODAR-NO-SUPABASE-cor-da-categoria.sql` e
  `db/RODAR-NO-SUPABASE-categoria-dos-dois-lados.sql` — rodados em
  22/09/2026. **Todas as migrações do `db/` estão aplicadas.**
- `db/RODAR-NO-SUPABASE-conferir-com-o-banco.sql` — **ele ainda precisa
  rodar.** Sem ele o "conferir com o banco" funciona, mas cada conferência
  fica só no aparelho onde foi feita: a tabela é buscada com
  `.catch(() => [])` e o envio recusado é descartado, então nada quebra.

**Extrato do BB importado em 21/09/2026.** Sete meses de CSV viraram 159
lançamentos; o saldo fecha em R$ 60,61, igual ao do banco. Duas coisas que
custaram caro para descobrir:

- O BB tem um **varrimento automático ("BB Rende Fácil")** que joga a sobra
  do dia para a poupança e traz de volta quando falta. São 63 linhas do
  extrato que **não são movimentação nenhuma** — contá-las dobra tudo.
- Casar lançamento do app com linha do extrato **por valor absoluto está
  errado**: em 07/03 ele recebeu 200 e mandou 200 no mesmo dia, o par saiu
  trocado e o saldo deu −1.339,39. Casar pelo **efeito com sinal**.

**Faturas do cartão importadas em 21/09/2026.** Seis PDFs (abril a setembro)
viraram 77 lançamentos; o cartão fecha em −32,80, que é a fatura aberta de
setembro. Mais três armadilhas:

- **Fatura paga por Pix não se parece com fatura.** No extrato da conta ela
  vira "Pix - Enviado / BANCO DO BRASIL SA", não "Pagto cartão crédito", e
  eu a importei como gasto solto — o cartão ficou 943,08 sem crédito.
  Procurar pelos dois nomes.
- **Dívida anterior ao corte vira `saldoInicial` negativo do cartão**, não
  lançamento. A fatura que venceu em 10/03 era de compras de fevereiro, e
  fevereiro está fora do app: −641,95 no ponto de partida diz a verdade sem
  ressuscitar o mês.
- **Parcela é cobrada no mês do período da fatura, não na data da compra.**
  A fatura mostra a data original ("03/02 PARC 05/12"); lançar nela empilha
  doze parcelas em fevereiro. Mês da fatura menos um.
- `pdftotext -raw` dá uma linha por lançamento; `-layout` separa a coluna
  de valores das descrições e embaralha tudo.

**O número do cartão num mês NÃO é o total da fatura, e ele estranhou isso
em 23/09/2026.** Março mostrava R$ 970,07 e a fatura correspondente era
R$ 943,08. Os dois estavam certos e medem coisas diferentes:

- o app conta a compra no dia em que ela aconteceu, então março vai até 31;
- a fatura fecha por volta do dia 27 (varia: 30/03, 27/04…) e carrega as
  compras do fim do mês anterior.

A diferença em março era um Ifood de R$ 26,99 comprado em 30/03, que o
banco empurrou para a fatura seguinte. Reproduzir os totais de fatura por
mês exigiria saber o dia de fechamento de cada mês, que muda — uma regra
fixa de "fecha dia 25" erraria abril em R$ 32,00.

**A decisão dele foi cortar o nó: "esquece o dia que fecha o cartão".** A
linha do cartão mostra `gastoDoCartaoNoMes` — a soma do que se gastou nele
naquele mês — e não o saldo acumulado, com a legenda "a pagar em 10/04/26".
Funciona porque **ele paga a fatura inteira todo mês**: nas seis faturas
lidas, "Pagamentos/Créditos" sempre quitou o saldo anterior por completo,
então o que ficaria de trás é sempre zero.

O saldo de verdade não sumiu: `faturaAVencer` continua cobrando a fatura
fechada no aviso do topo do Extrato, com o valor que se deve mesmo. Se um
dia ele parar de pagar tudo, é lá que a diferença aparece.

**Quando um saldo não bate, o app costuma ter dinheiro A MAIS, não a menos.**
Três casos no mesmo dia, todos de dinheiro contado duas vezes:

- **Itaú:** a mesma entrada de 308,34 lançada como transferência do Nubank
  *e* como entrada solta.
- **Caixinha:** criada com `saldoInicial` 1.384,63 *e* recebendo a
  transferência de 1.383,00 que era esse mesmo dinheiro. Conta nova cujo
  dinheiro veio de outra conta do app começa com saldo inicial ZERO.
- **Cartão:** o pagamento da fatura sem as compras do outro lado.

Primeira pergunta diante de uma diferença: "isso entrou duas vezes?" —
antes de "o que está faltando?".

Em 22/09/2026 isso virou funcionalidade: `conferencias` guarda o que o
BANCO dizia num dia, e `estadoDaConferencia` compara com o saldo do app
**naquela data** — nunca com o de hoje, senão toda compra feita depois da
conferência viraria diferença e o aviso mentiria no dia seguinte. O aviso
mora na própria linha do saldo, não numa faixa no topo: alerta longe do
número que ele acusa faz procurar.

O que sobra depois disso costuma ser **rendimento**, que nenhum extrato
lança como linha: o saldo só cresce sozinho. Foi 0,39 no BB, 0,04 no Itaú,
2,94 no Nubank e 3,25 na Caixinha.

**A barra de categoria mostra só o número.** Em 22/09/2026 ele pediu a
comparação mês a mês em vez da média e, ao ver as frases embaixo de cada
barra, mandou tirar: "deixa só os valores sem comentários". A lição não é
sobre média nem sobre mês a mês — é que **uma explicação por linha vira
ruído quando a lista é longa**. Seis categorias com seis frases embaixo
escondem o ranking, que era o que o bloco existia para mostrar.

A comparação não sumiu: mora no diálogo que abre ao TOCAR na barra, onde é
a resposta pedida em vez de um comentário não solicitado.
`comparadoComOMesAnterior` foi apagada junto — ninguém mais a chamava.

O aviso do topo do Resumo virou `categoriasQueSubiram`, também mês a mês.
O preço é honesto e vale lembrar: um mês fora da curva agora vira DOIS
avisos — um quando sobe, outro quando desce de volta. A média amortecia
isso, ao custo de ninguém conseguir conferir o número.

**Nenhum botão do app está solto.** Auditei os 79 do `index.html` em
23/09/2026: 14 são `submit` de formulário, 56 têm clique ligado por id, e
9 são ligados por classe (`.aba`, `.segmento`, `.botao-data`) lendo
`dataset`. Os 16 criados em `el('button', …)` trazem `onclick` no próprio
objeto. Os dois quebrados eram os que eu tinha acabado de criar.

## Lições de 20–21/09/2026 (o dia em que o app "resetou" no celular dele)

Três erros meus em fila. O padrão vale para o que vier:

- **Coisa nova não pode ter poder de veto sobre o que já funcionava.** Pus a
  busca dos recorrentes no mesmo `Promise.all` das contas, categorias e
  lançamentos; num banco sem aquela tabela, a promessa inteira falhava e o
  app ficava sem NADA. Tabela acessória agora é buscada à parte, com
  `.catch(() => [])`.
- **Deslogar é destrutivo, mesmo sem apagar nada.** Os dados de quem tem
  conta moram em `caderneta.v1.<usuarioId>`; sem sessão o app lê a chave
  comum, vazia, e convida a começar do zero ao lado de meses de lançamentos.
  Existe `dados.temDadosDeConta()` para a tela de entrada dizer a verdade, e
  `garantirTokenValido` só descarta a sessão numa recusa explícita do
  servidor — nunca num 500 nem numa falha sem status.
- **`el()` faz SVG agora**, com `createElementNS`, e `class` vai por
  `setAttribute`. Antes criava uma caixa vazia sem desenho, sem erro nenhum.
- **O botão `[data-fechar]` é ligado em `ligarDialogos()`, para todos os
  diálogos de uma vez.** Antes cada `ligarDialogoX()` ligava o seu, e em
  22/09/2026 criei dois diálogos novos e esqueci a linha nos dois: o botão
  ficou ali, bonito, sem fazer nada. Quem varre os diálogos já existe —
  ligar o botão lá tira o passo que dá para esquecer.
- **O evento `close` do `<dialog>` não dispara em todo navegador.** O
  atributo `open` vai e volta certinho, o evento nunca chega. Quem precisa
  saber que um diálogo fechou observa o atributo (`MutationObserver`), não o
  evento — é o que destrava a página em `ligarDialogos()`.
- **Campo de formulário com `background` precisa de `color` junto.** Sem ela
  o navegador pinta o texto de preto por conta própria, e no modo escuro
  fica preto sobre fundo escuro. Aconteceu em `.linha-nova input`.
- **Atualizar o app é uma viagem de DUAS etapas, e tem de continuar sendo.**
  Enquanto o service worker comanda a página, todo `fetch` passa por ele —
  inclusive `cache: 'reload'`, que então nunca chega ao cache do navegador.
  Etapa 1 desliga o service worker e recarrega; etapa 2, já livre, renova os
  arquivos. Se falhar duas vezes, o app para e diz para fechar e voltar em
  dez minutos. Perdi meia hora "consertando" isso pela metade porque medi o
  cache errado — a versão chegou a ANDAR PARA TRÁS no teste.

E duas do pente-fino de design:

- A barra do mês tem **um botão de cada lado**. Um terceiro de um lado só
  empurra o nome do mês 24px para fora do centro, e não há folga para
  equilibrar: "Dezembro de 2026" mede 156px e sobrariam 112 num celular de
  320px. Por isso a busca mora na fila de pílulas do filtro.
- **O Extrato tem de mostrar extrato na primeira tela.** Já esteve com 716px
  de introdução antes do primeiro lançamento. Ao acrescentar qualquer coisa
  no topo, medir onde `.item` começa.
