-- =========================================================================
--  Caderneta — cor para cada categoria
--
--  O QUE ISSO FAZ: guarda a cor escolhida para cada categoria, para ela ser
--  a mesma no celular e no computador. Sem isto o app funciona igual, mas a
--  cor fica só no aparelho onde você escolheu.
--
--  COMO RODAR: abra o Supabase, vá em SQL Editor, aperte Ctrl+A e depois
--  Delete para limpar TUDO o que estiver lá, cole este arquivo inteiro e
--  clique em Run. Rodar de novo por engano não faz mal nenhum.
--
--  O Supabase vai avisar que a consulta "altera objetos". É por causa do
--  ALTER TABLE abaixo, que ACRESCENTA uma coluna. Não apaga nada: nenhum
--  DROP, nenhum DELETE, nenhum TRUNCATE neste arquivo.
-- =========================================================================

alter table public.categorias
  add column if not exists cor text;
