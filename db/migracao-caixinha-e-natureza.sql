-- ===========================================================================
-- Caderneta — atualização do banco (setembro/2026)
--
-- COMO USAR: no painel do Supabase, menu "SQL Editor", apague TUDO o que
-- estiver na área de código (Ctrl+A e Delete), cole este arquivo inteiro e
-- clique em Run. Rodar duas vezes não quebra nada.
--
-- O que muda:
--   1. As contas passam a aceitar um terceiro tipo: 'reserva' (as caixinhas).
--   2. As categorias ganham 'natureza': se o gasto se repete todo mês ou
--      aparece de vez em quando.
-- ===========================================================================


-- 1. Caixinhas -------------------------------------------------------------
-- A regra antiga só permitia 'conta' e 'cartao'. Ela é trocada por uma que
-- também aceita 'reserva'. A troca é feita em duas etapas porque o Postgres
-- não sabe editar uma regra existente: tira a antiga, põe a nova.

alter table public.contas drop constraint if exists contas_tipo_check;

alter table public.contas
  add constraint contas_tipo_check
  check (tipo in ('conta', 'cartao', 'reserva'));


-- 2. Gasto de todo mês x gasto de vez em quando ----------------------------
-- Toda categoria que já existe nasce como 'frequente', que é o padrão do
-- app. Ajustar uma por uma é um toque na tela de Ajustes.

alter table public.categorias
  add column if not exists natureza text not null default 'frequente';

alter table public.categorias drop constraint if exists categorias_natureza_check;

alter table public.categorias
  add constraint categorias_natureza_check
  check (natureza in ('frequente', 'esporadico'));


-- Confira se deu certo (deve listar suas categorias com a coluna nova):
select nome, tipo, natureza from public.categorias order by tipo, nome;
