/* =========================================================================
   Endereço do servidor da Caderneta (Supabase).

   Sobre a chave estar aqui, à vista, num repositório público: é assim mesmo.
   A chave `anon` é feita para ficar no navegador de quem usa o app — ela só
   diz "sou o aplicativo da Caderneta", não dá permissão nenhuma sozinha.
   Quem decide o que cada pessoa pode ver são as regras do banco, em
   db/esquema.sql, que rodam no servidor e não dependem do que o navegador
   diga.

   A chave que NUNCA pode aparecer aqui é a `service_role`: essa ignora todas
   as regras. Ela fica só no painel do Supabase.

   Com `URL` vazia, o app funciona sozinho no aparelho, sem conta e sem
   internet — é o modo em que ele nasceu.
   ========================================================================= */

export const SUPABASE = {
  url: 'https://sbelyvcsbilsgpzlecuw.supabase.co',

  // Painel do Supabase -> Project Settings -> API Keys -> chave "anon public".
  // É um texto longo, começando com "eyJ".
  chaveAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZWx5dmNzYmlsc2dwemxlY3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjgyMTEsImV4cCI6MjEwNTMwNDIxMX0.jF_tCUglTBDyL6k63y_-QqXMaoLT9q_Vzjcc4YG61QE',
};

/* Escrita por `npm run versao` a cada publicação. Aparece no rodapé dos
   Ajustes, para dar como conferir se o celular já pegou a versão nova. */
export const VERSAO_APP = '18/09/2026, 14:13';

export function temServidor() {
  return Boolean(SUPABASE.url && SUPABASE.chaveAnon);
}
