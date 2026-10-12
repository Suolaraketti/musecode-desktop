// Deterministic MSP host for transport tests. Never calls a model or edits files.
import { createInterface } from 'node:readline';
import { EXPECTED_SCHEMA_FINGERPRINT } from '@muse-code/sdk';
import { existsSync, writeFileSync } from 'node:fs';
let cursor=0;const sessionId='test-session';
const saved=process.env.MUSECODE_FIXTURE_SESSION&&existsSync(process.env.MUSECODE_FIXTURE_SESSION)?JSON.parse((await import('node:fs')).readFileSync(process.env.MUSECODE_FIXTURE_SESSION,'utf8')):null;
let history=saved?.history||[];
const session={sessionId,status:'idle',turnCount:0,path:'/fixture/session.jsonl',createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z',workspaceRoot:process.cwd(),providerId:'muse',modelId:'fixture-model',forkedFrom:null,activeTurnId:null,...saved?.session};
const persist=()=>{if(process.env.MUSECODE_FIXTURE_SESSION)writeFileSync(process.env.MUSECODE_FIXTURE_SESSION,JSON.stringify({session,history}));};
const write=message=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
const event=(method,params)=>write({method,params:{sessionId,viewCursor:`fixture:${++cursor}`, ...params}});
const reply=(req,result)=>write({id:req.id,result});
const item=(id,kind,status,text='',revision=1)=>({itemId:id,kind,status,text,revision,turnId:'test-turn'});
let receipt=null;
const cli=createInterface({input:process.stdin});
cli.on('line',line=>{
  const req=JSON.parse(line);const p=req.params||{};
  if(req.method==='initialize'){
    if(process.env.MUSECODE_FIXTURE_STALL_INITIALIZE)return;
    if(!/^[a-z0-9_]+$/.test(p.clientInfo.name))throw new Error('Invalid MSP client identifier.');
    return reply(req,{serverInfo:{name:'fixture-muse',version:'test'},userAgent:'fixture',museHome:'/fixture',platformFamily:process.platform==='win32'?'windows':'unix',platformOs:process.platform,schema:{version:1,fingerprint:EXPECTED_SCHEMA_FINGERPRINT},grantedCapabilities:['userShell'],experimentalApi:!!p.capabilities?.experimentalApi,sessionDurability:'durable'});
  }
  if(!req.method){receipt=req.result;return;}
  if(req.method==='initialized')return;
  if(req.method==='account/read')return reply(req,{state:process.env.MUSECODE_FIXTURE_AUTH&&existsSync(process.env.MUSECODE_FIXTURE_AUTH)?'accountLogin':'loggedOut',credentialRequired:true,label:process.env.MUSECODE_FIXTURE_AUTH&&existsSync(process.env.MUSECODE_FIXTURE_AUTH)?'Muse test account':undefined});
  if(req.method==='account/loginStart'){
    if(p.type!=='deviceCode')throw new Error('Expected native device-code login.');
    reply(req,{verificationUrl:'https://auth.meta.com/device?code=FIXTURE',userCode:'TEST-CODE'});
    setTimeout(()=>{
      if(process.env.MUSECODE_FIXTURE_AUTH)writeFileSync(process.env.MUSECODE_FIXTURE_AUTH,'test-authenticated');
      write({method:'account/loginCompleted',params:{outcome:'granted'}});
      write({method:'account/changed',params:{state:'accountLogin',credentialRequired:true,label:'Muse test account'}});
    },Number(process.env.MUSECODE_FIXTURE_DELAY)||250);return;
  }
  if(req.method==='account/loginCancel'){reply(req,{cancelled:true});write({method:'account/loginCompleted',params:{outcome:'cancelled'}});return;}
  if(req.method==='usage/read')return reply(req,{usage:{observedAtMs:Date.parse('2026-10-12T20:00:00Z'),tier:'fixture',window:{usedPercent:25,windowDurationMins:300,resetsAtMs:Date.parse('2026-10-13T01:00:00Z')},weekly:{usedPercent:18,resetsAtMs:Date.parse('2026-10-19T00:00:00Z')}}});
  if(req.method==='session/start'){session.workspaceRoot=p.workspaceRoot;if(p.approvalMode)session.approvalMode={mode:p.approvalMode,source:'startup',lastCommandId:null};history=[];persist();event('session/started',{session});return reply(req,{session,viewCursor:''});}
  if(req.method==='session/setApprovalMode'){
    if(p.mode===process.env.MUSECODE_FIXTURE_DENY_APPROVAL_MODE)return write({id:req.id,error:{code:-32000,message:'Approval mode was rejected by the host.',data:{kind:'invalidParams'}}});
    session.approvalMode={mode:p.mode,source:'approvalReconfigure',lastCommandId:p.commandId||null};persist();event('session/approvalModeChanged',{mode:p.mode,source:'approvalReconfigure',commandId:p.commandId||'',clientName:'musecode_desktop'});return reply(req,{commandId:p.commandId,status:'accepted',applyOutcome:'completed',effectiveMode:session.approvalMode});
  }
  if(req.method==='session/resume')return reply(req,{session,viewCursor:'fixture:0',history:{mode:'inline',items:history.length?history:[item('old-message','agentMessage','completed','Restored history.')],snapshot:null}});
  if(req.method==='session/list')return reply(req,{sessions:[session],nextCursor:null});
  if(req.method==='model/list')return reply(req,{models:[{modelId:'fixture-model',displayLabel:'Fixture model',providerId:'muse',isActive:true,isDefault:true}],providerId:'muse',profileId:null,source:'fixture'});
  if(req.method==='turn/start'){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(p.commandId))throw new Error('Expected SDK-minted UUIDv7 command ID.');
    reply(req,{status:'accepted',disposition:'started',startedNewTurn:true,turnId:'test-turn'});
    setTimeout(()=>{
      event('turn/started',{turnId:'test-turn'});
      const user=item('user-1','userMessage','completed',p.input[0].text);history.push(user);persist();event('item/started',{item:user});
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
    const answer=item('agent-1','agentMessage','completed','Authoritative final answer.',2);history.push(answer);persist();event('item/completed',{item:answer});
    if(process.env.MUSECODE_FIXTURE_NOTICES){
      for(const backgroundItem of [{...item('reminder-1','reminderChild','completed'),reminderAgentId:'test-reminder',generationId:1,fallbackText:'Reminder finished.'},{...item('background-1','subagent','completed'),label:'Background agent',finalSummary:'Background task finished.'},{...item('workflow-1','workflow','completed'),label:'Workflow',finalSummary:'Workflow finished.'}]){history.push(backgroundItem);event('item/completed',{item:backgroundItem});}persist();
    }
    event('turn/completed',{turnId:'test-turn',outcome:{status:'completed'}});return;
  }
  if(req.method==='session/read')return reply(req,{session,receipt,history:{mode:'inline',items:[],snapshot:null},pendingRequests:[],viewCursor:`fixture:${cursor}`});
  if(req.method==='turn/cancel'){reply(req,{status:'accepted'});event('session/statusChanged',{status:'idle'});return;}
  reply(req,{});
});
cli.on('close',()=>process.exit(0));
