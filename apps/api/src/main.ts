import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ArgumentsHost, Body, Catch, Controller, Delete, ExceptionFilter, Get, HttpException, Injectable, Module, Param, Patch, Post, Query, Req, UseGuards, CanActivate, ExecutionContext, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Request, Response, json } from 'express';
import helmet from 'helmet';
import { ZodError, z } from 'zod';
import { accountSchema,budgetSchema,transactionSchema,transferSchema,monthSchema,parseStatement,sepaySchema,normalizeSepay,summarize } from './domain';
function secretEqual(a:string,b:string) {const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
@Injectable()
class OwnerGuard implements CanActivate {
 canActivate(ctx:ExecutionContext) {const r=ctx.switchToHttp().getRequest<Request>(); if(!secretEqual(r.headers.authorization||'',`Bearer ${process.env.OWNER_TOKEN}`))throw new UnauthorizedException();return true;}
}
@Injectable()
class DB extends PrismaClient {}
@Catch()
class Errors implements ExceptionFilter {
 catch(e:unknown, host:ArgumentsHost) {
  const res=host.switchToHttp().getResponse<Response>();
  if(e instanceof ZodError) return res.status(400).json({message:'Invalid input',details:e.issues.map(x=>({path:x.path,message:x.message}))});
  if(e instanceof HttpException) return res.status(e.getStatus()).json({message:e.message});
  if(e instanceof Prisma.PrismaClientKnownRequestError) return res.status(e.code==='P2025'?404:409).json({message:'Record not found or conflicting data'});
  console.error(e instanceof Error?e.name:'Unexpected error');
  return res.status(500).json({message:'Request failed'});
 }
}
@Controller('api')
@UseGuards(OwnerGuard)
class FinanceController {
 constructor(private db:DB){}
 @Get('snapshot') async snapshot(@Query('month') month:string) {
  monthSchema.parse(month);
  const [accounts,transactions,budgets]=await this.db.$transaction([this.db.account.findMany({orderBy:{name:'asc'}}),this.db.transaction.findMany({orderBy:[{date:'desc'},{createdAt:'desc'}]}),this.db.budget.findMany({where:{month}})]);
  return {accounts:accounts.map(a=>({...a,balance:a.openingBalance+transactions.filter(t=>t.accountId===a.id).reduce((v,t)=>v+t.amount,0)})),transactions:transactions.filter(t=>t.date.startsWith(month)),budgets,summary:summarize(transactions,month),bank:{provider:'sepay',configured:!!process.env.SEPAY_WEBHOOK_KEY,linkedAccounts:accounts.filter(a=>a.bankNumber).length,lastReceived:transactions.find(t=>t.source==='sepay')?.createdAt??null}};
 }
 @Post('accounts') account(@Body() b:unknown){return this.db.account.create({data:accountSchema.parse(b)});}
 @Post('transactions') transaction(@Body() b:unknown){return this.db.transaction.create({data:transactionSchema.parse(b)});}
 @Patch('transactions/:id') async edit(@Param('id') id:string,@Body() b:unknown){
  z.string().uuid().parse(id);const old=await this.db.transaction.findUniqueOrThrow({where:{id}});
  if(old.transferId) throw new BadRequestException('Delete the transfer pair and create a new transfer');
  if(old.source!=='manual'){const data=z.object({category:transactionSchema.shape.category,note:z.string().max(500)}).strict().parse(b);return this.db.transaction.update({where:{id},data});}
  return this.db.transaction.update({where:{id},data:transactionSchema.parse(b)});
 }
 @Delete('transactions/:id') async remove(@Param('id') id:string){
  z.string().uuid().parse(id); const old=await this.db.transaction.findUniqueOrThrow({where:{id}});
  if(old.source!=='manual')throw new BadRequestException('Imported records cannot be deleted; edit category or note');
  await this.db.transaction.deleteMany({where:old.transferId?{transferId:old.transferId}:{id}});return {success:true};
 }
 @Post('transfers') transfer(@Body() b:unknown){const v=transferSchema.parse(b),transferId=randomUUID();return this.db.$transaction([this.db.transaction.create({data:{accountId:v.from,amount:-v.amount,date:v.date,note:v.note,category:'transfer',transferId}}),this.db.transaction.create({data:{accountId:v.to,amount:v.amount,date:v.date,note:v.note,category:'transfer',transferId}})]);}
 @Post('budgets') budget(@Body() b:unknown){const v=budgetSchema.parse(b);return this.db.budget.upsert({where:{month_category:{month:v.month,category:v.category}},create:v,update:{amount:v.amount}});}
 @Delete('budgets/:id') deleteBudget(@Param('id') id:string){z.string().uuid().parse(id);return this.db.budget.delete({where:{id}});}
 @Post('imports/csv') async csv(@Body() b:unknown){
  const v=z.object({accountId:z.string().uuid(),csv:z.string().max(1000000)}).strict().parse(b);
  let rows;try{rows=parseStatement(v.csv,v.accountId);}catch(e){throw new BadRequestException(e instanceof Error?e.message:'Invalid CSV');}
  await this.db.account.findUniqueOrThrow({where:{id:v.accountId}});
  const result=await this.db.transaction.createMany({data:rows,skipDuplicates:true});return {imported:result.count,skipped:rows.length-result.count};
 }
 @Get('export') async exportData(){const [accounts,transactions,budgets]=await this.db.$transaction([this.db.account.findMany(),this.db.transaction.findMany(),this.db.budget.findMany()]);return {version:1,exportedAt:new Date().toISOString(),accounts,transactions,budgets};}
}
@Controller()
class PublicController {
 constructor(private db:DB){}
 @Get('health') async health(){await this.db.$queryRaw`SELECT 1`;return {status:'ok'};}
 @Post('webhooks/sepay') async webhook(@Req() req:Request,@Body() b:unknown){
  const key=process.env.SEPAY_WEBHOOK_KEY;
  if(!key||!secretEqual(req.headers.authorization||'',`Apikey ${key}`))throw new UnauthorizedException();
  const v=sepaySchema.parse(b);const account=await this.db.account.findUnique({where:{bankNumber:v.accountNumber}});
  if(!account)throw new BadRequestException('Unmapped bank account');
  const data=normalizeSepay(v,account.id);
  await this.db.transaction.upsert({where:{externalId:data.externalId},create:data,update:{}});
  return {success:true};
 }
}
@Module({controllers:[FinanceController,PublicController],providers:[DB,OwnerGuard]})
class AppModule{}
async function bootstrap(){
 if(!process.env.OWNER_TOKEN||process.env.OWNER_TOKEN.length<32)throw new Error('OWNER_TOKEN must contain at least 32 characters');
 if(process.env.SEPAY_WEBHOOK_KEY&&process.env.SEPAY_WEBHOOK_KEY.length<32)throw new Error('SEPAY_WEBHOOK_KEY must contain at least 32 characters');
 const app=await NestFactory.create(AppModule,{bodyParser:false,logger:['error','warn','log']});
 app.use(json({limit:'2mb'}));app.use(helmet());app.useGlobalFilters(new Errors());app.enableShutdownHooks();
 const db=app.get(DB);await db.$connect();
 await app.listen(Number(process.env.PORT||3000),'0.0.0.0');
}
bootstrap().catch(e=>{console.error(e.message);process.exit(1)});
