import { getCloudflareContext } from '@opennextjs/cloudflare';
export async function env():Promise<Env> { return (await getCloudflareContext({async:true})).env as unknown as Env; }
export async function first<T>(db:D1Database, sql:string, ...args:unknown[]):Promise<T|null> { return db.prepare(sql).bind(...args).first<T>(); }
export async function all<T>(db:D1Database, sql:string, ...args:unknown[]):Promise<T[]> { return (await db.prepare(sql).bind(...args).all<T>()).results; }
