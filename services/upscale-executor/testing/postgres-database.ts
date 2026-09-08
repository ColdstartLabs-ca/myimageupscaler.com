import { Pool, types } from 'pg';
import type {
  IExecutorDatabase,
  IExecutorDatabaseQuery,
  IExecutorRpcResult,
  IExecutorStorageClient,
} from '../index';

function identifier(value: string): string {
  if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error('Invalid fixture SQL identifier');
  return `"${value}"`;
}
const serializable = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Transport adapter only: every ledger mutation executes the real migration RPC. */
export function createPostgresDatabase(
  connectionString: string,
  transportOrigin: string
): IExecutorDatabase & { close(): Promise<void> } {
  if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:/.test(connectionString))
    throw new Error('Fixture requires isolated loopback PostgreSQL');
  const pool = new Pool({
    connectionString,
    max: 24,
    statement_timeout: 20_000,
    types: {
      getTypeParser: oid =>
        oid === 20 ? (value: string) => Number(value) : types.getTypeParser(oid),
    },
  });
  const storage: IExecutorStorageClient = {
    from: () => ({
      createSignedUrl: async path => ({
        data: { signedUrl: `https://storage.test/objects/${encodeURIComponent(path)}` },
        error: null,
      }),
      upload: async (path, body, options) => {
        const response = await fetch(`${transportOrigin}/objects/${encodeURIComponent(path)}`, {
          method: 'PUT',
          body,
          ...{ duplex: 'half' },
          headers: { 'content-type': options.contentType, 'x-upsert': String(options.upsert) },
        });
        return {
          data: null,
          error: response.ok ? null : { message: `Storage HTTP ${response.status}` },
        };
      },
      list: async (path, options) => {
        const response = await fetch(
          `${transportOrigin}/metadata/${encodeURIComponent(`${path}/${options?.search}`)}`
        );
        return { data: response.status === 404 ? [] : [await response.json()], error: null };
      },
    }),
  };
  return {
    storage,
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<IExecutorRpcResult<T>> {
      try {
        const entries = Object.entries(args);
        const result = await pool.query(
          `SELECT * FROM public.${identifier(name)}(${entries.map(([key], i) => `${identifier(key)} => $${i + 1}`).join(',')})`,
          entries.map(([, value]) => value)
        );
        const scalar = result.fields.length === 1 && result.fields[0].name === name;
        return {
          data: serializable(scalar ? result.rows[0]?.[name] : result.rows) as T,
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error: { message: error instanceof Error ? error.message : String(error) },
        };
      }
    },
    from(table: string): IExecutorDatabaseQuery {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let order = '';
      let limit = 0;
      let columns = '*';
      const query: IExecutorDatabaseQuery = {
        select(selection = '*') {
          columns = selection === '*' ? '*' : selection.split(',').map(identifier).join(',');
          return query;
        },
        eq(column, value) {
          values.push(value);
          conditions.push(`${identifier(column)} = $${values.length}`);
          return query;
        },
        in(column, value) {
          values.push(value);
          conditions.push(`${identifier(column)} = ANY($${values.length})`);
          return query;
        },
        order(column, options) {
          order = ` ORDER BY ${identifier(column)} ${options?.ascending === false ? 'DESC' : 'ASC'}`;
          return query;
        },
        limit(count) {
          limit = count;
          return query;
        },
        async maybeSingle<T>() {
          try {
            const result = await pool.query(
              `SELECT ${columns} FROM public.${identifier(table)}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}${order}${limit ? ` LIMIT ${Number(limit)}` : ''}`,
              values
            );
            if (result.rows.length > 1) throw new Error('Expected at most one row');
            return { data: serializable(result.rows[0] ?? null) as T | null, error: null };
          } catch (error) {
            return {
              data: null,
              error: { message: error instanceof Error ? error.message : String(error) },
            };
          }
        },
      };
      return query;
    },
    close: () => pool.end(),
  };
}
