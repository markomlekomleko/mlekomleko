// The domain uses positional SQLite/D1 parameters. Only SQL text is adapted;
// values always remain separate driver parameters.
export function postgresSql(sql) {
  let parameter = 0;
  // Tokenize quoted strings/identifiers and comments before replacing markers.
  return sql.replace(/\bdatetime\('now', '-30 days'\)|\bdate\('now'\)|\bjson_extract\([a-z_][a-z_0-9.]*, '\$\.[a-z_][a-z_0-9]*'\)|'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$([a-zA-Z_][a-zA-Z_0-9]*|)\$[\s\S]*?\$\1\$|\?/gi,
    token => {
      if (token === '?') return `$${++parameter}`;
      if (token === "date('now')") return "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD')";
      if (token === "datetime('now', '-30 days')") return "to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '30 days', 'YYYY-MM-DD HH24:MI:SS')";
      const json = /^json_extract\(([^,]+), '\$\.([^']+)'\)$/i.exec(token);
      return json ? `(${json[1]}::jsonb ->> '${json[2]}')` : token;
    });
}
