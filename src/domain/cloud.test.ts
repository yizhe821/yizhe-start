import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { emptyData } from './model';
import { CloudConflict, cloudError, parseCloudDocument } from './cloud';

describe('cloud documents', () => {
  it('validates cloud payloads and revisions before displaying data', () => {
    expect(parseCloudDocument({ payload: emptyData(), revision: 2 })).toEqual({ data: emptyData(), revision: 2 });
    expect(() => parseCloudDocument({ payload: emptyData(), revision: 0 })).toThrow();
    expect(() => parseCloudDocument({ payload: { schemaVersion: 2 }, revision: 1 })).toThrow();
    expect(cloudError({ code: '40001' })).toBeInstanceOf(CloudConflict);
    expect(cloudError({ code: 'PGRST205' }).message).toContain('初始化');
  });
});

describe('isolated PostgreSQL migration and permissions', () => {
  const db = new PGlite();
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  let migration: string;
  beforeAll(async () => {
    migration = await readFile(new URL('../../supabase/yizhestart_init.sql', import.meta.url), 'utf8');
    // These Auth stubs and unrelated objects exist ONLY inside this test database.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      create table public.other_project_data (id integer primary key, content text);
      insert into public.other_project_data values (1, 'keep me');
      create function public.other_project_function() returns text language sql as $$ select 'unchanged'::text $$;
    `);
    await db.exec(migration);
  }, 30000);
  afterAll(async () => { await db.close(); });
  async function identity(id: string, role = 'authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec(`set role ${role}`);
  }
  const save = (revision: number, title: string) => db.query<{ revision: number }>(
    'select revision from public.yizhestart_save_document($1::jsonb, $2)',
    [JSON.stringify({ ...emptyData(), nodes: [{ id: 'one', kind: 'folder', title, parentId: null, order: 0 }] }), revision],
  );
  it('allows authenticated owners to save atomically and rejects stale writes', async () => {
    await identity(a);
    expect((await save(0, 'A')).rows[0].revision).toBe(1);
    expect((await save(1, 'updated A')).rows[0].revision).toBe(2);
    await expect(save(1, 'stale A')).rejects.toMatchObject({ code: '40001' });
    await expect(save(0, 'duplicate A')).rejects.toMatchObject({ code: '40001' });
    const result = await db.query<{ payload: { nodes: { title: string }[] } }>('select payload from public.yizhestart_documents');
    expect(result.rows[0].payload.nodes[0].title).toBe('updated A');
  });
  it('isolates accounts and prevents writes that bypass the save function', async () => {
    await identity(b);
    expect((await db.query('select * from public.yizhestart_documents')).rows).toEqual([]);
    expect((await save(0, 'B')).rows[0].revision).toBe(1);
    expect((await db.query<{ user_id: string }>('select user_id from public.yizhestart_documents')).rows).toEqual([{ user_id: b }]);
    await expect(db.exec("update public.yizhestart_documents set revision = 99")).rejects.toMatchObject({ code: '42501' });
    await expect(db.exec('delete from public.yizhestart_documents')).rejects.toMatchObject({ code: '42501' });
    await expect(db.exec(`insert into public.yizhestart_documents(user_id, payload) values ('${a}', '{}')`)).rejects.toMatchObject({ code: '42501' });
  });
  it('rejects anonymous and missing-identity access and invalid documents', async () => {
    await identity('', 'anon');
    await expect(db.exec('select * from public.yizhestart_documents')).rejects.toMatchObject({ code: '42501' });
    await expect(save(0, 'anon')).rejects.toMatchObject({ code: '42501' });
    await identity('');
    await expect(save(0, 'no identity')).rejects.toMatchObject({ code: '42501' });
    await identity(b);
    await expect(db.query("select * from public.yizhestart_save_document('{}', 1)")).rejects.toMatchObject({ code: '23514' });
    await expect(save(-1, 'invalid revision')).rejects.toMatchObject({ code: '22023' });
  });
  it('fails safely on re-run and preserves existing data and functions', async () => {
    await db.exec('reset role');
    await expect(db.exec(migration)).rejects.toMatchObject({ code: '42P07' });
    await db.exec('rollback');
    expect((await db.query('select * from public.other_project_data')).rows).toEqual([{ id: 1, content: 'keep me' }]);
    expect((await db.query<{ result: string }>('select public.other_project_function() as result')).rows[0].result).toBe('unchanged');
    expect((await db.query('select * from public.yizhestart_documents')).rows).toHaveLength(2);
  });
});
