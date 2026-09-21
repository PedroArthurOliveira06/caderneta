-- =========================================================================
--  Caderneta — categoria que serve para gasto E para entrada
--
--  O QUE ISSO FAZ: permite que uma categoria valha para os dois lados, em
--  vez de você precisar de duas com o mesmo nome. Reembolso é o caso
--  comum: às vezes sai, às vezes entra.
--
--  COMO RODAR: abra o Supabase, vá em SQL Editor, aperte Ctrl+A e depois
--  Delete para limpar TUDO o que estiver lá, cole este arquivo inteiro e
--  clique em Run. Rodar de novo por engano não faz mal nenhum.
--
--  O Supabase vai avisar que a consulta "altera objetos". É por causa do
--  ALTER TABLE, que aqui só TROCA UMA REGRA de validação por outra mais
--  larga. Não apaga dado nenhum: não há DELETE nem TRUNCATE neste arquivo,
--  e o único DROP é o da regra antiga, recriada na linha seguinte.
-- =========================================================================

alter table public.categorias
  drop constraint if exists categorias_tipo_check;

alter table public.categorias
  add constraint categorias_tipo_check
  check (tipo in ('saida', 'entrada', 'ambos'));
