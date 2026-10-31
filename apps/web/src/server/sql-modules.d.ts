/** `.sql` files import as text in the Workers bundle (see `rules` in wrangler.jsonc). */
declare module "*.sql" {
  const sql: string;
  export default sql;
}
