/* =========================================================================
   Conversa com o Supabase: entrar, cadastrar e ler/gravar as tabelas.

   Escrito com `fetch` puro, sem biblioteca. O motivo é o mesmo do resto do
   projeto: nada para instalar, nada para compilar, e o arquivo inteiro cabe
   numa leitura. O Supabase é um Postgres com uma porta HTTP na frente — e o
   que a gente precisa dele são seis chamadas.

   O que este arquivo NÃO faz: decidir quem pode ver o quê. Isso é decidido
   no banco (db/esquema.sql) e não dá para contornar daqui.
   ========================================================================= */

import { SUPABASE } from './configuracao.js';

const CHAVE_SESSAO = 'caderneta.sessao';

/* Tokens do usuário logado. Ficam em memória e espelhados no navegador, para
   não precisar digitar a senha de novo a cada abertura do app. */
let sessao = null;

/* ------------------------------ sessão --------------------------------- */

export function carregarSessao() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    sessao = bruto ? JSON.parse(bruto) : null;
  } catch {
    sessao = null;
  }
  return sessao;
}

function guardarSessao(dados) {
  if (!dados) {
    sessao = null;
    try { localStorage.removeItem(CHAVE_SESSAO); } catch { /* modo anônimo */ }
    return null;
  }
  sessao = {
    token: dados.access_token,
    renovacao: dados.refresh_token,
    // `expires_in` vem em segundos. Guardamos o instante do fim, que é o que
    // realmente interessa na hora de decidir se precisa renovar.
    expiraEm: Date.now() + (dados.expires_in || 3600) * 1000,
    usuario: dados.user || (sessao && sessao.usuario) || null,
  };
  try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao)); } catch { /* modo anônimo */ }
  return sessao;
}

export function usuarioAtual() {
  return sessao ? sessao.usuario : null;
}

export function temSessao() {
  return Boolean(sessao && sessao.renovacao);
}

/* ------------------------- chamadas de base ----------------------------- */

/** Mensagens do Supabase chegam em inglês e técnicas. Quem lê é o usuário. */
function emPortugues(resposta, corpo) {
  const texto = String((corpo && (corpo.error_description || corpo.msg || corpo.message)) || '');

  if (/invalid login credentials/i.test(texto)) return 'E-mail ou senha não conferem.';
  if (/email not confirmed/i.test(texto)) return 'Este e-mail ainda não foi confirmado.';
  if (/user already registered|already been registered/i.test(texto)) return 'Já existe uma conta com este e-mail.';
  if (/password should be at least/i.test(texto)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/unable to validate email|invalid format/i.test(texto)) return 'Esse e-mail não parece válido.';
  if (/rate limit|too many/i.test(texto)) return 'Muitas tentativas seguidas. Espere um minuto.';
  if (resposta.status === 401 || resposta.status === 403) return 'Seu acesso não está liberado.';
  if (resposta.status >= 500) return 'O servidor não respondeu agora. Tente de novo em instantes.';
  return texto || 'Não deu para falar com o servidor.';
}

async function chamar(caminho, opcoes = {}, comToken = true) {
  const cabecalhos = {
    apikey: SUPABASE.chaveAnon,
    'Content-Type': 'application/json',
    ...(opcoes.headers || {}),
  };

  if (comToken && sessao && sessao.token) {
    cabecalhos.Authorization = `Bearer ${sessao.token}`;
  } else if (!cabecalhos.Authorization) {
    cabecalhos.Authorization = `Bearer ${SUPABASE.chaveAnon}`;
  }

  let resposta;
  try {
    resposta = await fetch(`${SUPABASE.url}${caminho}`, { ...opcoes, headers: cabecalhos });
  } catch {
    // Só cai aqui quando o aparelho está sem rede ou o servidor sumiu.
    const erro = new Error('Sem conexão com a internet.');
    erro.semRede = true;
    throw erro;
  }

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    const erro = new Error(emPortugues(resposta, corpo));
    erro.status = resposta.status;
    throw erro;
  }
  return corpo;
}

/**
 * Renova o token quando ele está para vencer. O Supabase entrega um token de
 * uma hora; sem isto, o app quebraria sozinho depois de uma hora aberto.
 * A renovação é feita um minuto antes, para não perder a corrida.
 */
async function garantirTokenValido() {
  if (!sessao || !sessao.renovacao) return false;
  if (Date.now() < sessao.expiraEm - 60000) return true;

  try {
    const novo = await chamar('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: sessao.renovacao }),
    }, false);
    guardarSessao(novo);
    return true;
  } catch (erro) {
    // Sem rede a sessão continua valendo; é só esperar a conexão voltar.
    if (erro.semRede) return true;
    guardarSessao(null);
    return false;
  }
}

/* --------------------------- entrar e sair ------------------------------ */

export async function cadastrar(email, senha, nome) {
  const corpo = await chamar('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password: senha, data: { nome } }),
  }, false);

  // Com a confirmação por e-mail desligada, o cadastro já devolve a sessão.
  if (corpo && corpo.access_token) guardarSessao(corpo);
  return corpo;
}

export async function entrar(email, senha) {
  const corpo = await chamar('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password: senha }),
  }, false);
  return guardarSessao(corpo);
}

/**
 * Pede ao Supabase que envie o link de recuperação por e-mail.
 *
 * `redirect_to` é para onde o link traz a pessoa de volta. Esse endereço
 * precisa estar autorizado no painel do Supabase (Authentication → URL
 * Configuration), senão o link cai no endereço padrão e a pessoa se perde.
 */
export function pedirNovaSenha(email) {
  const volta = encodeURIComponent(location.origin + location.pathname);
  return chamar(`/auth/v1/recover?redirect_to=${volta}`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false);
}

/**
 * Troca a senha de quem está com sessão aberta.
 *
 * Funciona tanto para quem chegou pelo link de recuperação (o link já traz
 * uma sessão) quanto para quem quiser trocar a senha estando logado.
 */
export async function definirNovaSenha(senha) {
  if (!(await garantirTokenValido())) {
    throw new Error('O link expirou. Peça um novo e tente de novo.');
  }
  let corpo;
  try {
    corpo = await chamar('/auth/v1/user', {
      method: 'PUT',
      body: JSON.stringify({ password: senha }),
    });
  } catch (erro) {
    // Aqui um 401 não quer dizer "sem permissão": quer dizer que o link do
    // e-mail expirou ou já foi usado. A mensagem genérica mandaria a pessoa
    // procurar o problema no lugar errado.
    if (erro.status === 401 || erro.status === 403) {
      throw new Error('Este link expirou ou já foi usado. Peça um novo na tela de entrar.');
    }
    throw erro;
  }
  if (sessao) {
    sessao.usuario = corpo || sessao.usuario;
    guardarSessao({
      access_token: sessao.token,
      refresh_token: sessao.renovacao,
      expires_in: Math.max(60, Math.round((sessao.expiraEm - Date.now()) / 1000)),
      user: sessao.usuario,
    });
  }
  return corpo;
}

/**
 * O link do e-mail volta com a sessão pendurada no endereço, depois do "#".
 * Guarda essa sessão e limpa o endereço — deixar token à mostra na barra do
 * navegador é convite para ele acabar num histórico ou num print.
 *
 * Devolve o tipo do link ('recovery', 'signup'...) ou vazio.
 */
export function sessaoVindaDoEndereco() {
  const pedaco = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!pedaco) return '';

  const campos = new URLSearchParams(pedaco);
  const token = campos.get('access_token');
  const tipo = campos.get('type') || '';
  if (!token) return '';

  guardarSessao({
    access_token: token,
    refresh_token: campos.get('refresh_token'),
    expires_in: Number(campos.get('expires_in')) || 3600,
    user: null,
  });

  history.replaceState(null, '', location.pathname);
  return tipo;
}

export async function sair() {
  try {
    if (sessao && sessao.token) await chamar('/auth/v1/logout', { method: 'POST' });
  } catch {
    // Falhar ao avisar o servidor não pode impedir alguém de sair do app.
  }
  guardarSessao(null);
}

/* ---------------------------- tabelas ----------------------------------- */

async function rest(caminho, opcoes = {}) {
  if (!(await garantirTokenValido())) {
    const erro = new Error('Sua sessão expirou. Entre de novo.');
    erro.semSessao = true;
    throw erro;
  }
  return chamar(`/rest/v1/${caminho}`, opcoes);
}

export function listar(tabela, consulta = 'select=*') {
  return rest(`${tabela}?${consulta}`);
}

/**
 * Grava criando ou atualizando, conforme o id já exista ou não.
 *
 * É o que torna seguro reenviar: uma operação que ficou na fila offline e
 * subiu duas vezes atualiza a mesma linha, em vez de criar duas. Sem isso,
 * qualquer reenvio duplicaria gastos — o pior erro possível num app de
 * controle de dinheiro.
 */
export function upsert(tabela, linhas) {
  return rest(tabela, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([].concat(linhas)),
  });
}

export function atualizar(tabela, id, campos) {
  return rest(`${tabela}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(campos),
  });
}

export function remover(tabela, filtro) {
  return rest(`${tabela}?${filtro}`, { method: 'DELETE' });
}

/* ----------------------------- perfis ----------------------------------- */

/** O perfil de quem está logado — é dele que sai "estou aprovado?". */
export async function meuPerfil() {
  const usuario = usuarioAtual();
  if (!usuario) return null;
  const linhas = await listar('perfis', `select=*&id=eq.${usuario.id}`);
  return linhas[0] || null;
}

/** A fila de aprovação. Só devolve alguma coisa para o dono — quem garante
 *  isso é a política do banco, não esta função. */
export function listarPerfis() {
  return listar('perfis', 'select=*&order=criado_em.desc');
}

export function definirStatus(perfilId, status) {
  return atualizar('perfis', perfilId, { status });
}
