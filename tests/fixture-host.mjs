// Deterministic MSP host for transport tests. Never calls a model or edits files.
import { createInterface } from 'node:readline';
import { EXPECTED_SCHEMA_FINGERPRINT } from '@muse-code/sdk';
let cursor=0;const sessionId='test-session';const session={sessionId,status:'idle',turnCount:0,path:'/fixture/session.jsonl',createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z',workspaceRoot:process.cwd(),providerId:'muse',modelId:'fixture-model',forkedFrom:null,activeTurnId:null};
const write=message=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
const event=(method,params)=>write({method,params:{sessionId,viewCursor:`fixture:${++cursor}`, ...params}});
const reply=(req,result)=>write({id:req.id,result});
const item=(id,kind,status,text='',revision=1)=>({itemId:id,kind,status,text,revision,turnId:'test-turn'});
let receipt=null;
const cli=createInterface({input:process.stdin});
cli.on('line',line=>{
  const req=JSON.parse(line);const p=req.params||{};
  if(req.method==='initialize')return reply(req,{serverInfo:{name:'fixture-muse',version:'test'},userAgent:'fixture',museHome:'/fixture',platformFamily:process.platform==='win32'?'windows':'unix',platformOs:process.platform,schema:{version:1,fingerprint:EXPECTED_SCHEMA_FINGERPRINT},grantedCapabilities:['userShell'],experimentalApi:false,sessionDurability:'durable'});
  if(!req.method){receipt=req.result;return;}
  if(req.method==='initialized')return;
  if(req.method==='session/start'){session.workspaceRoot=p.workspaceRoot;event('session/started',{session});return reply(req,{session,viewCursor:''});}
  if(req.method==='session/resume')return reply(req,{session,viewCursor:'fixture:0',history:{mode:'inline',items:[item('old-message','agentMessage','completed','Restored history.')],snapshot:null}});
  if(req.method==='session/list')return reply(req,{sessions:[session],nextCursor:null});
  if(req.method==='model/list')return reply(req,{models:[{modelId:'fixture-model',displayLabel:'Fixture model',providerId:'muse',isActive:true,isDefault:true}],providerId:'muse',profileId:null,source:'fixture'});
  if(req.method==='turn/start'){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(p.commandId))throw new Error('Expected SDK-minted UUIDv7 command ID.');
    reply(req,{status:'accepted',disposition:'started',startedNewTurn:true,turnId:'test-turn'});
    setTimeout(()=>{
      event('turn/started',{turnId:'test-turn'});
      event('item/started',{item:item('user-1','userMessage','completed',p.input[0].text)});
      event('item/started',{item:item('agent-1','agentMessage','inProgress')});
      event('item/delta',{itemId:'agent-1',field:'text',delta:'Streamed '});
      event('item/delta',{itemId:'agent-1',field:'text',delta:'answer.'});
      const approval={approvalId:'approval-1',availableChoices:[{choiceId:'allow-once',label:'Allow once',decision:'allow',scope:'once'},{choiceId:'deny',label:'Deny',decision:'deny',scope:'once'}],currentRequirementId:{approvalId:'approval-1',sourceIndex:0},itemId:'tool-1',judgeEscalated:false,protectedWrite:false,rawArgs:'{"command":"echo fixture"}',sourceRange:{},subject:{kind:'shell',command:'echo fixture'},taskId:'task-1',toolCallId:'call-1',toolName:'shell',turnId:'test-turn'};
      event('approval/requested',approval);
      write({id:700,method:'approval/request',params:{...approval,sessionId,viewCursor:`fixture:${cursor}`}});
    },20);return;
  }
  if(req.method==='approval/decide'){
    if(p.requirementId?.sourceIndex!==0)throw new Error('Missing current approval stage.');
    reply(req,{approvalId:p.approvalId,terminal:true});
    event('approval/resolved',{approvalId:p.approvalId,decision:p.choiceId==='deny'?'deny':'allow',resolvedBy:'user',policyResult:'allow',itemId:'tool-1',turnId:'test-turn',sourceRange:{},stageEvidence:[]});
    event('item/completed',{item:item('agent-1','agentMessage','completed','Authoritative final answer.',2)});
    event('turn/completed',{turnId:'test-turn',outcome:{status:'completed'}});return;
  }
  if(req.method==='session/read')return reply(req,{session,receipt,history:{mode:'inline',items:[],snapshot:null},pendingRequests:[],viewCursor:`fixture:${cursor}`});
  if(req.method==='turn/cancel'){reply(req,{status:'accepted'});event('session/statusChanged',{status:'idle'});return;}
  reply(req,{});
});
cli.on('close',()=>process.exit(0));
