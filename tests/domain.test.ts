import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSepay,parseStatement,summarize,dateSchema,transferSchema,transactionSchema} from '../apps/api/src/domain';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
test('summary excludes internal transfers and other months',()=>{
 assert.deepEqual(summarize([{amount:1000,date:'2026-09-01',category:'salary'},{amount:-200,date:'2026-09-02',category:'food'},{amount:-400,date:'2026-09-02',category:'transfer',transferId:'x'},{amount:400,date:'2026-09-02',category:'transfer',transferId:'x'},{amount:-900,date:'2026-08-02',category:'food'}],'2026-09'),{income:1000,expense:200,net:800,byCategory:{food:200}});
});
test('CSV handles BOM, quoted commas and stable idempotency keys',()=>{
 const csv='\uFEFFreference,date,amount,category,note\nR1,2026-09-01,-120000,food,"Coffee, lunch"';
 const rows=parseStatement(csv,a);assert.equal(rows[0].note,'Coffee, lunch');assert.equal(rows[0].externalId,`csv:${a}:R1`);assert.deepEqual(rows,parseStatement(csv,a));
});
test('CSV refuses duplicate references and decimal currency',()=>{
 assert.throws(()=>parseStatement('reference,date,amount\nx,2026-09-01,-1\nx,2026-09-02,-2',a));
 assert.throws(()=>parseStatement('reference,date,amount\nx,2026-09-01,1.5',a));
});
test('invalid calendar dates rejected',()=>{assert.equal(dateSchema.safeParse('2026-02-30').success,false);assert.equal(dateSchema.safeParse('2024-02-29').success,true)});
test('SePay outflow sign, local date and id normalized',()=>{
 const tx=normalizeSepay({id:31,accountNumber:'123456',transferType:'out',transferAmount:250000,transactionDate:'2026-09-11 23:30:00',content:'Dinner'},a);assert.equal(tx.amount,-250000);assert.equal(tx.date,'2026-09-11');assert.equal(tx.externalId,'sepay:31');
});
test('SePay invalid direction is never treated as income',()=>{assert.throws(()=>normalizeSepay({id:31,accountNumber:'123456',transferType:'unknown',transferAmount:1,transactionDate:'2026-09-11 12:30:00'},a))});
test('transfers reject same source/destination',()=>{assert.equal(transferSchema.safeParse({from:a,to:a,amount:100,date:'2026-09-11'}).success,false);assert.equal(transferSchema.safeParse({from:a,to:b,amount:100,date:'2026-09-11'}).success,true)});
test('client cannot inject source into manual entries',()=>{assert.equal(transactionSchema.safeParse({accountId:a,amount:100,date:'2026-09-11',category:'salary',source:'sepay'}).success,false)});
test('reclassified imported bank transfers excluded from spending',()=>{assert.deepEqual(summarize([{amount:-200,date:'2026-09-01',category:'transfer'},{amount:200,date:'2026-09-01',category:'transfer'}],'2026-09'),{income:0,expense:0,net:0,byCategory:{}})});
