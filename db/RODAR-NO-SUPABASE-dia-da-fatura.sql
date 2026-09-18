-- =========================================================================
--  Caderneta — o dia em que a fatura do cartão é debitada
--
--  O QUE ISSO FAZ: guarda, em cada cartão, o dia do mês em que o banco
--  desconta a fatura (no seu caso, dia 10). É com isso que o app sabe a hora
--  de avisar, e some com o aviso quando você lança o pagamento.
--
--  COMO RODAR: abra o Supabase, vá em SQL Editor, aperte Ctrl+A e depois
--  Delete para limpar TUDO o que estiver lá, cole este arquivo inteiro e
--  clique em Run. Rodar de novo por engano não faz mal nenhum.
-- =========================================================================

alter table public.contas
  add column if not exists dia_vencimento integer not null default 10;

-- Entre 1 e 28: dia 29, 30 ou 31 não existe em todo mês.
alter table public.contas
  drop constraint if exists contas_dia_vencimento_check;

alter table public.contas
  add constraint contas_dia_vencimento_check
  check (dia_vencimento between 1 and 28);
