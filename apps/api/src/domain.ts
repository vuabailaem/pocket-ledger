import { z } from 'zod';
import { parse } from 'csv-parse/sync';
export const categories = ['food','transport','shopping','bills','health','entertainment','salary','other','transfer'] as const;
export const money = z.number().int().min(-2000000000).max(2000000000);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + 'T00:00:00Z'); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === v; }, 'Invalid date');
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const transactionSchema = z.object({ accountId: z.string().uuid(), amount: money.refine(v=>v!==0), date: dateSchema, category:z.enum(categories), note:z.string().max(500).default('') }).strict();
export const accountSchema = z.object({name:z.string().trim().min(1).max(80),openingBalance:money.default(0),bankNumber:z.string().regex(/^\d{4,30}$/).optional()}).strict();
export const budgetSchema = z.object({month:monthSchema,category:z.enum(categories),amount:money.refine(v=>v>0)}).strict();
export const transferSchema = z.object({from:z.string().uuid(),to:z.string().uuid(),amount:money.refine(v=>v>0),date:dateSchema,note:z.string().max(500).default('')}).strict().refine(v=>v.from!==v.to,'Select different accounts');
export type Entry = { amount:number; date:string; category:string; transferId?:string|null };
export function summarize(entries:Entry[], month:string) {
  const rows=entries.filter(t=>t.date.startsWith(month)&&!t.transferId&&t.category!=='transfer');
  const income=rows.reduce((a,t)=>a+Math.max(t.amount,0),0);
  const expense=rows.reduce((a,t)=>a+Math.max(-t.amount,0),0);
  const byCategory:Record<string,number>={};
  for(const t of rows) if(t.amount<0) byCategory[t.category]=(byCategory[t.category]||0)-t.amount;
  return {income,expense,net:income-expense,byCategory};
}
export function parseStatement(csv:string, accountId:string) {
  const rows = parse(csv,{columns:true,bom:true,skip_empty_lines:true,trim:true, max_record_size:10000}) as Record<string,string>[];
  if(!rows.length||rows.length>2000) throw new Error('CSV must contain 1–2000 rows');
  const seen=new Set<string>();
  return rows.map((row,i)=> {
    if(!row.reference||row.reference.length>100) throw new Error(`Row ${i+2}: unique reference required`);
    if(seen.has(row.reference)) throw new Error(`Row ${i+2}: duplicate reference`);
    seen.add(row.reference);
    if(!/^-?\d+$/.test(row.amount||'')) throw new Error(`Row ${i+2}: amount must be signed whole VND`);
    return {...transactionSchema.parse({accountId,amount:Number(row.amount),date:row.date,category:row.category||'other',note:row.note||''}),source:'csv',externalId:`csv:${accountId}:${row.reference}`};
  });
}
export const sepaySchema=z.object({id:z.number().int().positive(),accountNumber:z.string().min(1),transferType:z.enum(['in','out']),transferAmount:money.refine(v=>v>0),transactionDate:z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),content:z.string().max(500).optional(),description:z.string().max(500).optional()});
export function normalizeSepay(body:unknown,accountId:string) {
 const v=sepaySchema.parse(body);
 return {...transactionSchema.parse({accountId,amount:v.transferType==='in'?v.transferAmount:-v.transferAmount,date:v.transactionDate.slice(0,10),category:'other',note:v.content||v.description||''}),source:'sepay',externalId:`sepay:${v.id}`};
}
