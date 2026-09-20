-- =========================================================================
--  Caderneta — gastos que se repetem todo mês
--
--  O QUE ISSO FAZ: cria o lugar onde ficam guardados os gastos que voltam
--  todo mês (Apple, Spotify, mesada...) e marca cada lançamento que nasceu
--  de um deles. É a marca que faz o app saber o que já foi lançado neste
--  mês e não oferecer duas vezes.
--
--  COMO RODAR: abra o Supabase, vá em SQL Editor, aperte Ctrl+A e depois
--  Delete para limpar TUDO o que estiver lá, cole este arquivo inteiro e
--  clique em Run. Rodar de novo por engano não faz mal nenhum.
-- =========================================================================

create table if not exists public.recorrentes (
  id           uuid primary key default gen_random_uuid(),
  usuario      uuid not null references auth.users on delete cascade,
  descricao    text not null default '',
  valor        bigint not null default 0,
  -- Entre 1 e 31. Dia 31 num mês de 30 cai no último dia dele; quem resolve
  -- isso é o aplicativo, porque depende de qual mês está sendo visto.
  dia          integer not null default 1 check (dia between 1 and 31),
  tipo         text not null default 'saida' check (tipo in ('saida', 'entrada')),
  conta_id     uuid references public.contas on delete cascade,
  categoria_id uuid references public.categorias on delete set null,
  -- Só o cartão de crédito usa: 'corrente' (volta todo mês) ou 'esporadico'.
  natureza     text check (natureza in ('corrente', 'esporadico')),
  -- 'AAAA-MM': o mês a partir do qual ele vale. Sem isso, cadastrar hoje
  -- faria o app oferecer todos os meses anteriores, que já estão lançados.
  desde        text not null,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- A marca no lançamento: de qual gasto repetido ele nasceu.
alter table public.lancamentos
  add column if not exists recorrente_id uuid references public.recorrentes on delete set null;

-- O aviso do mês procura por esta coluna todo mês; sem índice, procuraria
-- lendo a tabela inteira.
create index if not exists lancamentos_recorrente_idx
  on public.lancamentos (usuario, recorrente_id);

-- ------------------------------------------------------------------------
--  Cada um só enxerga o que é seu. Sem isto, a tabela nasceria aberta.
-- ------------------------------------------------------------------------
--  A mesma regra das outras tabelas, palavra por palavra: além de ser o
--  dono, a conta precisa estar aprovada. Uma política mais frouxa aqui
--  seria uma porta lateral para quem ainda está na fila de espera.
-- ------------------------------------------------------------------------
alter table public.recorrentes enable row level security;

drop policy if exists "dono dos proprios dados" on public.recorrentes;
create policy "dono dos proprios dados" on public.recorrentes
  for all
  using      (usuario = auth.uid() and public.esta_aprovado())
  with check (usuario = auth.uid() and public.esta_aprovado());
