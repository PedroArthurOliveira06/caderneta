-- =========================================================================
--  Caderneta — conferir com o banco
--
--  O QUE ISSO FAZ: cria o lugar onde fica guardado o que o BANCO dizia em
--  cada dia em que você conferiu. É o que permite ao app comparar o próprio
--  saldo com o de verdade e avisar quando os dois se separam.
--
--  Por que isso existe: em 22/09/2026 três contas estavam erradas há meses
--  — a mesma entrada lançada duas vezes no Itaú, o dinheiro da caixinha
--  contado como saldo inicial E como transferência, e o pagamento de uma
--  fatura sem as compras do outro lado. Nenhum apareceu como erro. Todos
--  apareceram como saldo.
--
--  COMO RODAR: abra o Supabase, vá em SQL Editor, aperte Ctrl+A e depois
--  Delete para limpar TUDO o que estiver lá, cole este arquivo inteiro e
--  clique em Run. Rodar de novo por engano não faz mal nenhum.
--
--  O Supabase vai avisar que a consulta "altera objetos". É por causa do
--  CREATE TABLE, que cria uma tabela nova. Não apaga nada: neste arquivo
--  não há DELETE nem TRUNCATE, e o único DROP é o de uma regra de acesso
--  recriada na linha seguinte.
-- =========================================================================

create table if not exists public.conferencias (
  id              uuid primary key default gen_random_uuid(),
  usuario         uuid not null references auth.users on delete cascade,
  conta_id        uuid not null references public.contas on delete cascade,
  -- 'AAAA-MM-DD': o dia a que este saldo se refere. A comparação usa o saldo
  -- do app NESTA data, não o de hoje — senão toda compra feita depois da
  -- conferência viraria "diferença", e o aviso mentiria no dia seguinte.
  data            text not null,
  -- Em centavos, como todo dinheiro no app. Pode ser negativo: conta no
  -- vermelho é um saldo como outro qualquer.
  saldo_informado bigint not null default 0,
  criado_em       timestamptz not null default now()
);

-- Uma conferência por conta por dia. Conferir duas vezes no mesmo dia e
-- guardar as duas encheria a lista de linhas dizendo a mesma coisa; a
-- segunda corrige a primeira.
create unique index if not exists conferencias_conta_dia_idx
  on public.conferencias (usuario, conta_id, data);

-- ------------------------------------------------------------------------
--  Cada um só enxerga o que é seu. Sem isto, a tabela nasceria aberta.
-- ------------------------------------------------------------------------
--  A mesma regra das outras tabelas, palavra por palavra: além de ser o
--  dono, a conta precisa estar aprovada. Uma política mais frouxa aqui
--  seria uma porta lateral para quem ainda está na fila de espera.
-- ------------------------------------------------------------------------
alter table public.conferencias enable row level security;

drop policy if exists "dono dos proprios dados" on public.conferencias;
create policy "dono dos proprios dados" on public.conferencias
  for all
  using      (usuario = auth.uid() and public.esta_aprovado())
  with check (usuario = auth.uid() and public.esta_aprovado());
