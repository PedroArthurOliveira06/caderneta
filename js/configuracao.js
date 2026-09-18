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
  chaveAnon: '',
};

export function temServidor() {
  return Boolean(SUPABASE.url && SUPABASE.chaveAnon);
}
