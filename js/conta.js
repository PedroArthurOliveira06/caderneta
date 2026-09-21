/* =========================================================================
   Contas de usuário: entrar, criar conta, esperar liberação e — para o dono
   — liberar quem se cadastrou.

   A regra que organiza o arquivo: ter conta é OPCIONAL. O app nasceu
   funcionando sozinho no aparelho e continua assim. Quem não quer conta
   nunca é obrigado, e quem já usava sem conta não perde o que lançou — na
   primeira entrada o app oferece levar tudo para a conta.

   Nada aqui decide permissão. Quem decide é o banco, pelas políticas em
   db/esquema.sql. Estas telas só mostram o que o servidor respondeu.
   ========================================================================= */

import * as servidor from './servidor.js';
import * as dados from './dados.js';
import { temServidor } from './configuracao.js';
import { el, trocar, recado } from './ui.js';

const $ = (id) => document.getElementById(id);

let perfil = null;
let criandoConta = false;
let aoTrocarDeEstado = () => {};

export function perfilAtual() {
  return perfil;
}

export function ehDono() {
  return Boolean(perfil && perfil.papel === 'dono');
}

/* ============================== arranque ================================ */

/**
 * Descobre em que pé está a conta e devolve um destes:
 *
 *   'local'     -> sem conta, tudo neste aparelho (o modo original)
 *   'deslogado' -> aparelho novo e sem dados: mostrar entrar/criar conta
 *   'pendente'  -> logado, esperando liberação
 *   'aprovado'  -> logado e liberado, sincronizando
 */
export async function iniciar(aoMudar) {
  aoTrocarDeEstado = aoMudar || (() => {});
  ligarTelas();

  if (!temServidor()) return 'local';

  // O link de recuperação chega com a sessão pendurada no endereço. Isso é
  // conferido antes de tudo: quem chegou por ele quer trocar a senha, não
  // ver a tela de entrar.
  if (servidor.sessaoVindaDoEndereco() === 'recovery') return 'nova-senha';

  servidor.carregarSessao();
  if (!servidor.temSessao()) {
    // Quem já usa o app sem conta continua entrando direto. Só o aparelho
    // novo e vazio vê a tela de entrada.
    return dados.obter().configurado ? 'local' : 'deslogado';
  }

  return entrarNoModoServidor();
}

async function entrarNoModoServidor() {
  const usuario = servidor.usuarioAtual();
  dados.entrarModoServidor(usuario);

  try {
    perfil = await servidor.meuPerfil();
  } catch (erro) {
    // Sem internet não dá para conferir a liberação. Se este aparelho já
    // tem os dados baixados, abrir com eles é melhor que travar na porta.
    if (erro.semRede && dados.obter().configurado) {
      recado('Sem internet. Mostrando o que já estava neste aparelho.');
      return 'aprovado';
    }
    dados.sairModoServidor();
    throw erro;
  }

  if (!perfil || perfil.status !== 'aprovado') return 'pendente';

  await dados.sincronizar().catch(() => {
    recado('Não deu para atualizar agora. Mostrando o que já estava aqui.');
  });
  return 'aprovado';
}

/* ============================== telas =================================== */

function ligarTelas() {
  $('alternar-entrada').addEventListener('click', () => {
    criandoConta = !criandoConta;
    $('erro-entrada').hidden = true; // o erro era do outro modo
    $('aviso-entrada').hidden = true;
    aplicarModoDaEntrada();
  });

  $('usar-sem-conta').addEventListener('click', () => {
    aoTrocarDeEstado('local');
  });

  $('form-entrada').addEventListener('submit', enviarEntrada);
  $('esqueci-senha').addEventListener('click', pedirRecuperacao);
  $('form-nova-senha').addEventListener('submit', salvarNovaSenha);

  $('conferir-liberacao').addEventListener('click', async () => {
    try {
      perfil = await servidor.meuPerfil();
      if (perfil && perfil.status === 'aprovado') {
        aoTrocarDeEstado(await entrarNoModoServidor());
      } else if (perfil && perfil.status === 'bloqueado') {
        $('texto-pendente').textContent = 'Este acesso foi bloqueado. Fale com quem administra a Caderneta.';
      } else {
        recado('Ainda não foi liberado.');
      }
    } catch (erro) {
      recado(erro.message);
    }
  });

  $('sair-pendente').addEventListener('click', sair);
  $('entrar-na-conta').addEventListener('click', () => aoTrocarDeEstado('deslogado'));
  $('sair-da-conta').addEventListener('click', sair);

  aplicarModoDaEntrada();
}

function aplicarModoDaEntrada() {
  $('campo-nome-entrada').hidden = !criandoConta;
  $('ajuda-senha').hidden = !criandoConta;
  $('botao-entrada').textContent = criandoConta ? 'Criar minha conta' : 'Entrar';
  $('pergunta-conta').textContent = criandoConta ? 'Já tem conta?' : 'Ainda não tem conta?';
  $('alternar-entrada').textContent = criandoConta ? 'Entrar' : 'Criar uma conta';
  $('entrada-senha').autocomplete = criandoConta ? 'new-password' : 'current-password';
  // Quem já usou a conta neste aparelho e caiu na tela de entrada precisa
  // ouvir, antes de qualquer outra coisa, que não perdeu nada. Um app que
  // abre pedindo e-mail e senha, depois de meses de uso, parece um app que
  // esqueceu quem você é.
  const jaUsou = !criandoConta && dados.temDadosDeConta();

  $('entrada-explicacao').textContent = criandoConta
    ? 'Crie sua conta. Ela precisa ser liberada antes do primeiro acesso — é assim que ninguém entra sem permissão.'
    : jaUsou
      ? 'Seus lançamentos estão guardados na sua conta, nada foi perdido. Entre de novo para vê-los aqui.'
      : 'Entre com a sua conta para os seus lançamentos acompanharem você em qualquer aparelho.';

  // E o atalho de usar sem conta deixa de ser um convite inocente: daqui ele
  // leva para uma caderneta vazia, ao lado da que tem tudo.
  $('usar-sem-conta').textContent = jaUsou
    ? 'Começar uma caderneta vazia neste aparelho'
    : 'Usar só neste aparelho, sem conta';
  // Esta função NÃO esconde o erro: ela também roda ao terminar uma
  // tentativa que falhou, e esconderia a mensagem no mesmo instante em que
  // ela é escrita. Quem limpa é quem troca de modo.
}

function mostrarErro(mensagem) {
  const caixa = $('erro-entrada');
  caixa.textContent = mensagem;
  caixa.hidden = false;
}

async function enviarEntrada(evento) {
  evento.preventDefault();
  const email = $('entrada-email').value.trim();
  const senha = $('entrada-senha').value;
  const nome = $('entrada-nome').value.trim();
  const botao = $('botao-entrada');

  if (criandoConta && senha.length < 6) {
    mostrarErro('A senha precisa ter pelo menos 6 caracteres.');
    return;
  }

  botao.disabled = true;
  botao.textContent = criandoConta ? 'Criando…' : 'Entrando…';
  $('erro-entrada').hidden = true;

  try {
    // O que existe neste aparelho é lido ANTES de trocar de modo: entrar na
    // conta troca o estado em memória, e depois já não haveria o que levar.
    const daquiDeDentro = dados.obter().configurado
      ? JSON.parse(JSON.stringify(dados.obter()))
      : null;

    if (criandoConta) {
      await servidor.cadastrar(email, senha, nome);
      if (!servidor.temSessao()) {
        mostrarErro('Conta criada. Confirme o e-mail que você recebeu e entre de novo.');
        return;
      }
    } else {
      await servidor.entrar(email, senha);
    }

    const estado = await entrarNoModoServidor();
    if (estado === 'aprovado') await talvezLevarDadosDoAparelho(daquiDeDentro);
    $('entrada-senha').value = '';
    aoTrocarDeEstado(estado);
  } catch (erro) {
    mostrarErro(erro.message);
  } finally {
    botao.disabled = false;
    aplicarModoDaEntrada();
  }
}

/**
 * Manda o link de recuperação para o e-mail digitado.
 *
 * A resposta é a mesma existindo ou não a conta, de propósito: dizer "esse
 * e-mail não existe" entregaria, a quem tentasse adivinhar, quem tem conta
 * aqui.
 */
async function pedirRecuperacao() {
  const email = $('entrada-email').value.trim();
  if (!email) {
    mostrarErro('Escreva seu e-mail primeiro, e eu mando o link.');
    $('entrada-email').focus();
    return;
  }

  const botao = $('esqueci-senha');
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  $('erro-entrada').hidden = true;

  try {
    await servidor.pedirNovaSenha(email);
    const aviso = $('aviso-entrada');
    aviso.textContent = `Se existe conta com ${email}, o link para criar uma senha nova já está a caminho. Confira também a caixa de spam.`;
    aviso.hidden = false;
  } catch (erro) {
    mostrarErro(erro.message);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Esqueci minha senha';
  }
}

async function salvarNovaSenha(evento) {
  evento.preventDefault();
  const senha = $('nova-senha').value;
  const confirma = $('nova-senha-confirma').value;
  const erro = $('erro-nova-senha');
  const botao = $('botao-nova-senha');

  if (senha.length < 6) {
    erro.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
    erro.hidden = false;
    return;
  }
  if (senha !== confirma) {
    erro.textContent = 'As duas não bateram. Digite de novo.';
    erro.hidden = false;
    $('nova-senha-confirma').value = '';
    $('nova-senha-confirma').focus();
    return;
  }

  botao.disabled = true;
  botao.textContent = 'Salvando…';
  erro.hidden = true;

  try {
    await servidor.definirNovaSenha(senha);
    $('nova-senha').value = '';
    $('nova-senha-confirma').value = '';
    recado('Senha trocada. Bem-vindo de volta.');
    aoTrocarDeEstado(await entrarNoModoServidor());
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar senha';
  }
}

/**
 * Conta nova e aparelho com histórico: oferece levar tudo para a conta.
 *
 * Só oferece quando a conta está de fato vazia. Se já houver dados no
 * servidor, mandar os do aparelho por cima apagaria o que está lá — e o
 * servidor é a verdade quando os dois existem.
 */
async function talvezLevarDadosDoAparelho(daquiDeDentro) {
  if (!daquiDeDentro || !daquiDeDentro.contas || !daquiDeDentro.contas.length) return;
  if (dados.obter().contas.length) return;

  const quantos = daquiDeDentro.lancamentos.length;
  const pergunta = quantos
    ? `Este aparelho tem ${quantos} lançamento${quantos > 1 ? 's' : ''} que ainda não estão na sua conta. Levar tudo para ela agora?`
    : 'Levar os bancos cadastrados neste aparelho para a sua conta?';

  if (!confirm(pergunta)) return;

  const resultado = dados.importarJSON(JSON.stringify(daquiDeDentro));
  recado(resultado.ok ? 'Tudo levado para a sua conta.' : resultado.erro);
}

export async function sair() {
  await servidor.sair();
  perfil = null;
  dados.sairModoServidor();
  dados.carregar(); // volta a enxergar o que existe sem conta neste aparelho
  aoTrocarDeEstado(dados.obter().configurado ? 'local' : 'deslogado');
}

/* ========================= bloco dos Ajustes ============================ */

export function pintarAjustes() {
  const temConta = dados.modoAtual() === 'servidor';
  const usuario = servidor.usuarioAtual();

  $('entrar-na-conta').hidden = temConta || !temServidor();
  $('sair-da-conta').hidden = !temConta;

  if (temConta && usuario) {
    $('estado-conta').textContent = ehDono()
      ? `Entrou como ${usuario.email}. Você administra esta Caderneta.`
      : `Entrou como ${usuario.email}. Seus lançamentos acompanham você em qualquer aparelho.`;
  } else if (temServidor()) {
    $('estado-conta').textContent = 'Você está usando sem conta: os lançamentos ficam só neste aparelho e não vão para outro.';
  } else {
    $('estado-conta').textContent = 'Este app está funcionando sem servidor: tudo fica neste aparelho.';
  }

  $('bloco-aprovacoes').hidden = !ehDono();
  if (ehDono()) carregarPerfis();
}

async function carregarPerfis() {
  let lista;
  try {
    lista = await servidor.listarPerfis();
  } catch (erro) {
    trocar($('lista-perfis'), el('p', { class: 'ajuda', texto: erro.message }));
    return;
  }

  if (!lista.length) {
    trocar($('lista-perfis'), el('p', { class: 'ajuda', texto: 'Ninguém se cadastrou ainda.' }));
    return;
  }

  // Quem está esperando vem primeiro: é a única linha que pede ação.
  const ordem = { pendente: 0, aprovado: 1, bloqueado: 2 };
  lista.sort((a, b) => (ordem[a.status] ?? 3) - (ordem[b.status] ?? 3));

  trocar($('lista-perfis'), lista.map((p) => linhaDePerfil(p)));
}

function linhaDePerfil(p) {
  const eu = servidor.usuarioAtual() && p.id === servidor.usuarioAtual().id;

  const acoes = [];
  if (!eu) {
    if (p.status !== 'aprovado') {
      acoes.push(el('button', {
        class: 'botao botao--principal botao--miudo',
        type: 'button',
        texto: 'Liberar',
        onclick: () => mudarStatus(p, 'aprovado'),
      }));
    }
    if (p.status !== 'bloqueado') {
      acoes.push(el('button', {
        class: 'botao botao--perigo botao--miudo',
        type: 'button',
        texto: p.status === 'aprovado' ? 'Bloquear' : 'Recusar',
        onclick: () => mudarStatus(p, 'bloqueado'),
      }));
    }
  }

  return el('div', { class: 'perfil' }, [
    el('div', {}, [
      el('p', { class: 'perfil__nome' }, [
        p.nome || 'Sem nome',
        el('span', { class: `selo selo--${p.status}`, texto: p.status }),
        p.papel === 'dono' ? el('span', { class: 'selo selo--dono', texto: 'dono' }) : null,
      ]),
      el('p', { class: 'perfil__email', texto: p.email || '' }),
    ]),
    el('div', { class: 'perfil__acoes' }, acoes),
  ]);
}

async function mudarStatus(p, status) {
  const verbo = status === 'aprovado' ? 'Liberar' : 'Bloquear';
  if (!confirm(`${verbo} o acesso de ${p.email}?`)) return;

  try {
    await servidor.definirStatus(p.id, status);
    recado(status === 'aprovado' ? 'Acesso liberado.' : 'Acesso bloqueado.');
    carregarPerfis();
  } catch (erro) {
    recado(erro.message);
  }
}
