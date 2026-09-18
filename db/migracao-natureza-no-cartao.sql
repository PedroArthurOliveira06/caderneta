-- ===========================================================================
-- Caderneta — atualização do banco (Corrente x Esporádico no cartão)
--
-- COMO USAR: Supabase → SQL Editor → apague TUDO da área de código
-- (Ctrl+A e Delete) → cole este arquivo → Run. Rodar duas vezes não quebra.
--
-- O que muda: a divisão entre "corrente" e "esporádico" sai da CATEGORIA e
-- passa para o LANÇAMENTO, e só vale para gasto no cartão de crédito.
--
-- Por quê: a pergunta é da fatura, não da vida. Gasto em conta corrente é
-- gasto e ponto. E o rótulo muda de um mês para o outro — o mesmo "Ifood"
-- pode ser a assinatura num mês e um pedido avulso no outro, o que a
-- categoria não consegue representar.
-- ===========================================================================

alter table public.lancamentos
  add column if not exists natureza text;

alter table public.lancamentos drop constraint if exists lancamentos_natureza_check;

alter table public.lancamentos
  add constraint lancamentos_natureza_check
  check (natureza is null or natureza in ('corrente', 'esporadico'));


-- A coluna antiga em `categorias` deixa de ser usada. Fica onde está, sem
-- atrapalhar: apagar coluna é a operação que não tem volta, e não há pressa
-- nenhuma para isso.


-- Confira (deve listar a coluna nova, ainda vazia):
select descricao, natureza from public.lancamentos limit 5;
