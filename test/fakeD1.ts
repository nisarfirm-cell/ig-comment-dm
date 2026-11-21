// Minimal D1 stand-in on Node's built-in SQLite, so tests run the real SQL from src/store.ts.
import { DatabaseSync } from "node:sqlite";

class Stmt {
  private args: unknown[] = [];
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...args: unknown[]) {
    this.args = args.map((a) => (a === undefined ? null : typeof a === "boolean" ? Number(a) : a));
    return this;
  }
  private prep() {
    return this.db.prepare(this.sql);
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.prep().get(...(this.args as any[])) as any;
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }
  async all<T>() {
    return { results: this.prep().all(...(this.args as any[])) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.prep().run(...(this.args as any[]));
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;
}
