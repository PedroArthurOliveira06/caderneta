-- ===========================================================================
-- Caderneta — estrutura do banco no Supabase.
--
-- COMO USAR: abra o painel do Supabase, menu "SQL Editor", cole este arquivo
-- inteiro e clique em "Run". Rodar duas vezes não quebra nada.
--
-- A ideia central está nas políticas do fim do arquivo. A segurança NÃO mora
-- no aplicativo: mora aqui. Mesmo que alguém abra o código da página, mude o
-- que quiser e chame o servidor direto, o banco só devolve as linhas da
-- própria pessoa — e só se ela estiver aprovada. O aplicativo é um cliente
-- sem privilégio nenhum.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Perfis: quem é cada usuário e se já foi liberado por você
-- ---------------------------------------------------------------------------
-- O Supabase guarda e-mail e senha numa área dele (auth.users) em que não se
-- mexe. Esta tabela é o nosso complemento: o estado de aprovação.

create table if not exists public.perfis (
  id         uuid primary key references auth.users on delete cascade,
  nome       text,
  email      text,
  status     text not null default 'pendente'
             check (status in ('pendente', 'aprovado', 'bloqueado')),
  papel      text not null default 'usuario'
             check (papel in ('dono', 'usuario')),
  criado_em  timestamptz not null default now()
);

-- Todo cadastro novo nasce 'pendente'. Ninguém entra sem você liberar, e isso
-- é decidido aqui no banco — não numa tela que dê para contornar.
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();


-- ---------------------------------------------------------------------------
-- 2. Os dados de cada pessoa
-- ---------------------------------------------------------------------------
-- `usuario` é o dono da linha. É a coluna em que toda a proteção se apoia.
-- Dinheiro é bigint em centavos, a mesma regra do aplicativo: 1,99 é 199.

create table if not exists public.contas (
  id            uuid primary key default gen_random_uuid(),
  usuario       uuid not null references auth.users on delete cascade,
  nome          text not null,
  cor           text not null default 'azul',
  -- 'conta' é banco, 'cartao' é cartão de crédito (saldo negativo = fatura),
  -- 'reserva' é caixinha: dinheiro que existe mas está separado de propósito.
  tipo          text not null default 'conta' check (tipo in ('conta', 'cartao', 'reserva')),
  saldo_inicial bigint not null default 0,
  -- Dia do mês em que a fatura do cartão é debitada. Entre 1 e 28 porque 29,
  -- 30 e 31 não existem em todo mês, e o lembrete sumiria em fevereiro.
  dia_vencimento integer not null default 10 check (dia_vencimento between 1 and 28),
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now()
);

create table if not exists public.categorias (
  id       uuid primary key default gen_random_uuid(),
  usuario  uuid not null references auth.users on delete cascade,
  nome     text not null,
  tipo     text not null default 'saida' check (tipo in ('saida', 'entrada')),
  -- A cor escolhida para ela, do mesmo conjunto das contas. Nula enquanto
  -- ninguém escolhe: aí o app tira uma do identificador, para a tela nunca
  -- ficar toda cinza esperando configuração.
  cor      text,
  natureza text not null default 'frequente' check (natureza in ('frequente', 'esporadico')) -- não usado; ficou de uma versão anterior
);

create table if not exists public.lancamentos (
  id                uuid primary key default gen_random_uuid(),
  usuario           uuid not null references auth.users on delete cascade,
  data              date not null,
  tipo              text not null check (tipo in ('saida', 'entrada', 'transferencia')),
  valor             bigint not null check (valor >= 0),
  conta_id          uuid references public.contas on delete cascade,
  conta_destino_id  uuid references public.contas on delete cascade,
  categoria_id      uuid references public.categorias on delete set null,
  descricao         text not null default '',
  grupo             uuid,
  parcela           integer,
  parcelas_total    integer,
  -- Só gasto no cartão usa: 'corrente' (volta todo mês) ou 'esporadico'.
  natureza          text check (natureza is null or natureza in ('corrente', 'esporadico')),
  -- De qual gasto repetido este lançamento nasceu. É a marca que faz o aviso
  -- do mês saber o que já foi lançado e não oferecer duas vezes.
  recorrente_id     uuid,
  criado_em         timestamptz not null default now(),

  -- Transferência precisa dos dois lados, e eles têm de ser diferentes. A
  -- mesma regra que o aplicativo já aplica, repetida aqui porque o banco é
  -- a última linha de defesa contra dado inconsistente.
  constraint transferencia_tem_destino check (
    tipo <> 'transferencia'
    or (conta_destino_id is not null and conta_destino_id <> conta_id)
  )
);

-- O app quase sempre pergunta "os lançamentos deste usuário, neste período".
create index if not exists lancamentos_por_data
  on public.lancamentos (usuario, data desc);


-- ---------------------------------------------------------------------------
-- 3. Duas perguntas que as políticas precisam fazer
-- ---------------------------------------------------------------------------
-- Estas funções são `security definer`: elas leem a tabela de perfis por
-- fora das políticas. Sem isso, uma política sobre `perfis` que consulta
-- `perfis` chamaria a si mesma para sempre e o banco recusaria a consulta.

create or replace function public.esta_aprovado()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and status = 'aprovado'
  );
$$;

create or replace function public.eh_dono()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel = 'dono' and status = 'aprovado'
  );
$$;


-- ---------------------------------------------------------------------------
-- 4. As regras de acesso (é aqui que a segurança realmente acontece)
-- ---------------------------------------------------------------------------

-- Gastos que voltam todo mês: assinatura, curso, mesada. Não confundir com
-- compra parcelada, que tem fim e mora nas colunas grupo/parcela acima.
create table if not exists public.recorrentes (
  id           uuid primary key default gen_random_uuid(),
  usuario      uuid not null references auth.users on delete cascade,
  descricao    text not null default '',
  valor        bigint not null default 0,
  -- Dia 31 num mês de 30 cai no último dia dele; quem resolve isso é o
  -- aplicativo, porque depende de qual mês está sendo visto.
  dia          integer not null default 1 check (dia between 1 and 31),
  tipo         text not null default 'saida' check (tipo in ('saida', 'entrada')),
  conta_id     uuid references public.contas on delete cascade,
  categoria_id uuid references public.categorias on delete set null,
  natureza     text check (natureza is null or natureza in ('corrente', 'esporadico')),
  -- 'AAAA-MM' a partir do qual ele vale, para o app não oferecer os meses
  -- anteriores ao cadastro.
  desde        text not null,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

alter table public.lancamentos
  drop constraint if exists lancamentos_recorrente_fk;

alter table public.lancamentos
  add constraint lancamentos_recorrente_fk
  foreign key (recorrente_id) references public.recorrentes on delete set null;

create index if not exists lancamentos_recorrente_idx
  on public.lancamentos (usuario, recorrente_id);

alter table public.perfis      enable row level security;
alter table public.contas      enable row level security;
alter table public.categorias  enable row level security;
alter table public.lancamentos enable row level security;
alter table public.recorrentes enable row level security;

-- --- perfis ---------------------------------------------------------------

-- Cada um enxerga o próprio perfil; o dono enxerga todos, que é o que
-- alimenta a fila de aprovação.
drop policy if exists "ler perfil" on public.perfis;
create policy "ler perfil" on public.perfis
  for select using (id = auth.uid() or public.eh_dono());

-- SÓ o dono altera perfis. De propósito não existe política de update para o
-- próprio usuário: se existisse, qualquer pessoa poderia mudar o próprio
-- status para 'aprovado' e entrar sozinha.
drop policy if exists "dono decide quem entra" on public.perfis;
create policy "dono decide quem entra" on public.perfis
  for update using (public.eh_dono()) with check (public.eh_dono());

-- --- dados ----------------------------------------------------------------

-- A mesma regra nas três tabelas: a linha tem de ser sua, e você tem de
-- estar aprovado. Vale para ler, criar, alterar e apagar.
drop policy if exists "dono dos proprios dados" on public.contas;
create policy "dono dos proprios dados" on public.contas
  for all
  using      (usuario = auth.uid() and public.esta_aprovado())
  with check (usuario = auth.uid() and public.esta_aprovado());

drop policy if exists "dono dos proprios dados" on public.categorias;
create policy "dono dos proprios dados" on public.categorias
  for all
  using      (usuario = auth.uid() and public.esta_aprovado())
  with check (usuario = auth.uid() and public.esta_aprovado());

drop policy if exists "dono dos proprios dados" on public.lancamentos;
create policy "dono dos proprios dados" on public.lancamentos
  for all
  using      (usuario = auth.uid() and public.esta_aprovado())
  with check (usuario = auth.uid() and public.esta_aprovado());

drop policy if exists "dono dos proprios dados" on public.recorrentes;
create policy "dono dos proprios dados" on public.recorrentes
  for all
  using      (usuario = auth.uid() and public.esta_aprovado())
  with check (usuario = auth.uid() and public.esta_aprovado());


-- ===========================================================================
-- DEPOIS DE RODAR ISTO
--
-- 1. Crie a sua conta pelo próprio aplicativo (tela de cadastro).
-- 2. Volte aqui no SQL Editor e rode a linha abaixo, trocando o e-mail pelo
--    que você usou. Ela promove você a dono e já aprova o seu acesso.
--    Este é o único passo que precisa ser feito à mão — o primeiro dono não
--    tem quem o aprove.
--
--      update public.perfis
--         set papel = 'dono', status = 'aprovado'
--       where email = 'troque@pelo.seu.email';
--
-- 3. Confira se deu certo:
--
--      select email, papel, status from public.perfis;
-- ===========================================================================
