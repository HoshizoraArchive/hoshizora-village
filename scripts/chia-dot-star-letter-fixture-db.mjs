// In-process PGlite bridge for the endpoint harness. No URL, fetch, or secrets.
// RPC types come from the installed SQL catalog, including smallint/timestamptz.
export function fixtureClient(pg) {
  const identifier = (value) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('invalid_fixture_identifier');
    return `"${value}"`;
  };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.params = []; this.orders = []; }
    select(columns, options = {}) { this.columns = columns.split(','); this.options = options; return this; }
    filter(column, op, value) { this.params.push(value); this.filters.push(`${identifier(column)} ${op} $${this.params.length}`); return this; }
    eq(column, value) { return this.filter(column, '=', value); }
    lte(column, value) { return this.filter(column, '<=', value); }
    gte(column, value) { return this.filter(column, '>=', value); }
    is(column, value) { if (value !== null) throw new Error('fixture_only_supports_null'); this.filters.push(`${identifier(column)} is null`); return this; }
    in(column, values) {
      const slots = values.map((value) => { this.params.push(value); return `$${this.params.length}`; });
      this.filters.push(`${identifier(column)} in (${slots.join(',')})`); return this;
    }
    or(expression) {
      // Only the exact two-direction UUID block query used by the snapshot.
      const match = /^and\(blocker_id.eq.([a-f0-9-]{36}),blocked_id.eq.([a-f0-9-]{36})\),and\(blocker_id.eq.([a-f0-9-]{36}),blocked_id.eq.([a-f0-9-]{36})\)$/.exec(expression);
      if (!match || match[1] !== match[4] || match[2] !== match[3]) throw new Error('invalid_fixture_block_query');
      const start = this.params.length;
      this.params.push(match[1], match[2]);
      this.filters.push(`((blocker_id=$${start + 1} and blocked_id=$${start + 2}) or (blocker_id=$${start + 2} and blocked_id=$${start + 1}))`); return this;
    }
    order(column, { ascending = true } = {}) { this.orders.push(`${identifier(column)} ${ascending ? 'asc' : 'desc'}`); return this; }
    limit(value) { if (!Number.isInteger(value)) throw new Error('invalid_fixture_limit'); this.rowLimit = value; return this; }
    maybeSingle() { this.single = true; return this; }
    async execute() {
      try {
        // Match PostgREST's timestamp strings without dropping microseconds.
        const columns = this.options.head ? 'count(*)::int as count' : this.columns.map((column) => /_at$/.test(column) ? `${identifier(column)}::text as ${identifier(column)}` : identifier(column)).join(',');
        const result = await pg.query(`select ${columns} from public.${identifier(this.table)}${this.filters.length ? ` where ${this.filters.join(' and ')}` : ''}${this.orders.length ? ` order by ${this.orders.join(',')}` : ''}${this.rowLimit ? ` limit ${this.rowLimit}` : ''}`, this.params);
        return this.options.head ? { data: null, count: result.rows[0].count, error: null } : { data: this.single ? result.rows[0] ?? null : result.rows, error: null };
      } catch (error) { return { data: null, error }; }
    }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  return {
    from: (table) => new Query(table),
    async rpc(name, args) {
      try {
        const definitions = await pg.query(`select p.proargnames as names,
          array(select format_type(t,null) from unnest(p.proargtypes) t) as types,
          p.proretset as returns_set
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname=$1 and p.pronargs=$2`, [name, Object.keys(args).length]);
        const definition = definitions.rows.find(({ names }) => Object.keys(args).every((key) => names.includes(key)));
        if (!definition) throw new Error(`fixture_rpc_signature_mismatch:${name}`);
        const keys = Object.keys(args);
        const params = keys.map((key) => args[key]);
        const call = `public.${identifier(name)}(${keys.map((key, i) => `${identifier(key)} => $${i + 1}::${definition.types[definition.names.indexOf(key)]}`).join(',')})`;
        // Exercise the service_role ACL, never the superuser's EXECUTE bypass.
        await pg.exec('set role service_role');
        try {
          const result = await pg.query(definition.returns_set ? `select * from ${call}` : `select ${call} as value`, params);
          return { data: definition.returns_set ? result.rows : result.rows[0].value, error: null };
        } finally { await pg.exec('reset role'); }
      } catch (error) { return { data: null, error }; }
    },
  };
}
