/* =========================================================================
   Formatação e conversão. Duas regras que valem para o app inteiro:

   1. Dinheiro é SEMPRE um inteiro em centavos. Nunca float. 1,99 é 199.
      Ponto flutuante erra em soma de dinheiro (0.1 + 0.2 = 0.30000000000000004)
      e num app de gastos isso vira centavo perdido no fechamento do mês.

   2. Data é SEMPRE a string 'AAAA-MM-DD'. Nunca objeto Date cru guardado.
      `new Date('2026-09-17')` é lido como UTC e, no fuso do Brasil (-03),
      volta como dia 16. Ordenar e comparar string ISO já funciona.
   ========================================================================= */

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtSimples = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 12345 -> "R$ 123,45" */
export function moeda(centavos) {
  return fmtMoeda.format((centavos || 0) / 100);
}

/** 12345 -> "123,45" (sem o R$, para tabelas onde o símbolo já foi dito) */
export function valor(centavos) {
  return fmtSimples.format((centavos || 0) / 100);
}

/** 12345 -> "+123,45" | -12345 -> "−123,45" (menos tipográfico, alinha melhor) */
export function comSinal(centavos) {
  const n = centavos || 0;
  return (n < 0 ? '−' : '+') + fmtSimples.format(Math.abs(n) / 100);
}

/**
 * Texto digitado -> centavos. Aceita "12,50", "12.50", "1.234,56", "1234".
 * Regra: se houver vírgula, ela é o separador decimal e pontos são milhar.
 * Se houver só ponto, o último ponto é decimal quando sobram 1-2 dígitos.
 */
export function paraCentavos(texto) {
  if (typeof texto === 'number') return Math.round(texto * 100);
  let t = String(texto || '').trim().replace(/[^\d.,-]/g, '');
  if (!t) return 0;
  const negativo = t.startsWith('-');
  t = t.replace(/-/g, '');

  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = t.split('.');
    if (partes.length > 1 && partes[partes.length - 1].length <= 2) {
      t = partes.slice(0, -1).join('') + '.' + partes[partes.length - 1];
    } else {
      t = partes.join('');
    }
  }
  const n = Math.round(parseFloat(t) * 100);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

/**
 * "Alimentação" -> "alimentacao". Acento e maiúscula não podem atrapalhar
 * quem digita com pressa, nem no lançamento escrito nem na busca.
 *
 * Mora aqui, no arquivo mais de baixo, porque três lugares precisam dela e
 * três cópias da mesma regra é como uma delas envelhece sozinha.
 */
export function simplificar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/* ------------------------------ datas ---------------------------------- */

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Data de hoje no fuso local, como 'AAAA-MM-DD'. */
export function hojeISO() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** 'AAAA-MM-DD' -> Date local (sem o desvio de fuso do parser nativo). */
export function paraData(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

/** '2026-09-17' -> '17 de setembro' */
export function dataLonga(iso) {
  const [, m, d] = String(iso).split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/** '2026-09-17' -> '17/09' */
export function dataCurta(iso) {
  const [, m, d] = String(iso).split('-');
  return `${d}/${m}`;
}

const comMaiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** '2026-09-17' -> 'Qui' */
export function diaDaSemana(iso) {
  return comMaiuscula(DIAS[paraData(iso).getDay()]);
}

/**
 * (2026, 9) -> 'Setembro de 2026'
 *
 * Em português o certo é mês com letra minúscula no meio de uma frase — e é
 * assim que `dataLonga` escreve. Aqui é diferente: este texto é o TÍTULO da
 * tela, e título começa com maiúscula.
 */
export function mesPorExtenso(ano, mes) {
  return comMaiuscula(`${MESES[mes - 1]} de ${ano}`);
}

/** (9) -> 'Set' */
export function mesCurto(mes) {
  return comMaiuscula(MESES_CURTO[mes - 1]);
}

/** '2026-09-17' -> '2026-09' */
export function chaveMes(iso) {
  return String(iso).slice(0, 7);
}

/** Primeiro e último dia do mês, como ISO. */
export function limitesDoMes(ano, mes) {
  const ultimo = new Date(ano, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');
  return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/** Quantos dias faltam de `de` até `ate`. Negativo quer dizer que já passou. */
export function diasEntre(de, ate) {
  const um = paraData(de).getTime();
  const outro = paraData(ate).getTime();
  return Math.round((outro - um) / 86400000);
}

/** Mesma data, N dias à frente (ou atrás, com número negativo). */
export function somarDias(iso, quantidade) {
  const [ano, mes, dia] = String(iso).split('-').map(Number);
  const d = new Date(ano, mes - 1, dia + quantidade);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Mesma data, N meses à frente. Dia que não existe no mês de destino cai no
 * último dia dele: 31/01 + 1 mês é 28/02, não 03/03. É o que os bancos fazem
 * com parcela, e o que o `new Date(ano, mes, 31)` do JavaScript NÃO faz
 * sozinho — ele transborda para o mês seguinte.
 */
export function somarMeses(iso, quantidade) {
  const [ano, mes, dia] = String(iso).split('-').map(Number);
  const total = ano * 12 + (mes - 1) + quantidade;
  const anoNovo = Math.floor(total / 12);
  const mesNovo = (total % 12) + 1;
  const ultimoDia = new Date(anoNovo, mesNovo, 0).getDate();
  const diaNovo = Math.min(dia, ultimoDia);
  return [
    anoNovo,
    String(mesNovo).padStart(2, '0'),
    String(diaNovo).padStart(2, '0'),
  ].join('-');
}

/**
 * Divide um valor em N parcelas sem perder nem inventar centavo: o resto da
 * divisão vai todo na primeira, como as lojas fazem. 100,00 em 3x vira
 * 33,34 + 33,33 + 33,33 — e a soma continua sendo exatamente 100,00.
 */
export function dividirEmParcelas(centavos, quantidade) {
  const base = Math.floor(centavos / quantidade);
  const resto = centavos - base * quantidade;
  return Array.from({ length: quantidade }, (_, i) => (i === 0 ? base + resto : base));
}

/** Avança ou volta meses preservando o par {ano, mes}. */
export function deslocarMes(ano, mes, passo) {
  const total = ano * 12 + (mes - 1) + passo;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}
