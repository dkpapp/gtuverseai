import { cookies } from 'next/headers';
export async function userId(create=false):Promise<string|null>{const jar=await cookies(); let id=jar.get('gtu_session')?.value; if(!id && create){id=crypto.randomUUID(); jar.set('gtu_session',id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*365});} return id??null;}
