import { spawnMspConnection, Session, readSessionDurability } from '@muse-code/sdk';

const reads = new Set(['session/list','session/read','model/list','skill/list','hook/list','plugin/list','task/list','usage/read','approval/listPending','item/readOutput','view/page','account/read','account/loginStart','account/loginCancel','account/logout']);
const commands = new Set(['session/start','session/resume','session/fork','session/rename','session/setModel','session/compact','turn/start','turn/cancel','approval/decide','userInput/answer','userInput/clarify','userInput/cancel','session/userShell']);
export class MuseRuntime {
  constructor(emit) { this.emit=emit; this.sessions=new Map(); this.rows=new Map(); this.history=new Map(); this.serial=0; }
  async connect(binary, cwd, args=['serve'], env=process.env) {
    await this.disconnect(); const generation=++this.serial;
    const handshake=spawnMspConnection({ command: binary, args, cwd, env: { ...env }, shutdownTimeoutMs: 3000,
      onStderr: chunk => { if (generation===this.serial) this.emit({type:'diagnostic',text:chunk}); } });
    this.starting=handshake.child;
    let timer;
    try {
      this.host=await Promise.race([
        handshake.initialize({clientInfo:{name:'musecode_desktop',title:'MuseCode',version:'0.2.0'},capabilities:{experimentalApi:true,requestedCapabilities:['userShell','sessionListStream'],userInputDialogs:true}}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Muse did not answer within 20 seconds. Check the binary path and CLI version.')),20000);})
      ]);
    } catch(error) { await handshake.child.close().catch(()=>{}); throw error; }
    finally { clearTimeout(timer);if(this.starting===handshake.child)this.starting=null; }
    const host=this.host;
    if(generation!==this.serial){await host.child.close();this.host=null;throw new Error('Connection cancelled.');}
    host.connection.onNotification(frame => { if(generation===this.serial) this.notification(frame); });
    host.connection.onServerRequest(async request => {
      if (!['approval/request','userInput/request'].includes(request.method)) throw new Error('Unsupported agent request.');
      this.notification({method:request.method==='approval/request'?'approval/requested':'userInput/requested',params:request.params});
      return {};
    });
    host.connection.onProtocolError(error => this.emit({type:'error',text:`Protocol error: ${error.message}`}));
    host.connection.closed.then(()=>{if(generation===this.serial&&this.host===host){this.host=null;for(const session of this.sessions.values())session.hostExited({kind:'transportEof'});this.emit({type:'disconnected',exit:{kind:'transportEof'}});void host.child.close().catch(()=>{});}});
    host.child.exit.then(exit=>{if(generation===this.serial && this.host===host){this.host=null; for(const session of this.sessions.values()) session.hostExited(exit); this.emit({type:'disconnected',exit});}}).catch(error=>this.emit({type:'error',text:error.message}));
    const info=host.initializeResult;
    this.emit({type:'connected',info,warning:host.fingerprintWarning}); return info;
  }
  requireHost() { if(!this.host) throw new Error('Connect to Muse Code in Settings first.'); return this.host; }
  async request(method, params={}) {
    if(!reads.has(method)) throw new Error('Unsupported read operation.');
    return this.requireHost().connection.request(method,params);
  }
  async account() {
    const updateRequired=()=>Object.assign(new Error('Muse needs an update to support in-app sign-in.'),{code:'MUSE_UPDATE_REQUIRED'});
    if(!this.requireHost().initializeResult.experimentalApi)throw updateRequired();
    try{return await this.request('account/read',{});}catch(error){if(error.kind==='methodNotFound')throw updateRequired();throw error;}
  }
  async command(method, params) {
    if(!commands.has(method)) throw new Error('Unsupported command.');
    // Let the SDK own UUIDv7 command IDs and retry identity. Do not retry user turns automatically.
    return this.requireHost().connection.command(method,params,{maxAttempts:1});
  }
  session(id) {
    if(!this.sessions.has(id)) {
      const host=this.requireHost();
      this.sessions.set(id,new Session({sessionId:id,durability:readSessionDurability(host.initializeResult),connection:host.connection}));
    }
    return this.sessions.get(id);
  }
  notification(frame) {
    const p=frame.params||{}; const id=p.sessionId||p.session?.sessionId;
    if(id && this.host) {
      if(p.session) this.rows.set(id,p.session);
      const session=this.session(id);
      try { const outcome=session.apply(frame); void outcome.io; }
      catch(error) { this.emit({type:'error',text:`Could not apply agent event: ${error.message}`}); }
      if(frame.method==='session/statusChanged') this.rows.set(id,{...this.rows.get(id),status:p.status});
      if(frame.method==='turn/started') this.rows.set(id,{...this.rows.get(id),status:'running',activeTurnId:p.turnId});
      if(frame.method==='turn/completed') this.rows.set(id,{...this.rows.get(id),status:'idle',activeTurnId:null});
      if(frame.method==='session/nameChanged') this.rows.set(id,{...this.rows.get(id),name:p.name});
      if(frame.method==='session/modelChanged') this.rows.set(id,{...this.rows.get(id),modelId:p.model?.modelId||p.modelId});
      this.emit({type:'session',...this.snapshot(id)});
    }
    this.emit({type:'notification',...frame});
  }
  snapshot(id) {
    const s=this.sessions.get(id); const items=new Map((this.history.get(id)||[]).map(i=>[i.itemId,i]));
    for(const original of s?.fold.items.list()||[]) {
      const item={...original};
      // The SDK retains full revisions and delta accumulators separately. Only
      // provisional fields use deltas; completed revisions are authoritative.
      if(item.status==='inProgress')for(const field of ['text','visibleOutput']) {
        const accumulated=s.fold.items.accumulated(item.itemId,field);
        if(accumulated!==undefined)item[field]=accumulated;
      }
      items.set(item.itemId,item);
    }
    return {sessionId:id,row:this.rows.get(id),items:[...items.values()],approvals:s?.fold.pendingApprovals()||[],questions:s?.fold.pendingUserInputs()||[]};
  }
  async acquire(method,params) {
    const result=await this.command(method,params); const id=result.session.sessionId;
    this.rows.set(id,result.session); this.session(id);
    if(result.history?.items) this.history.set(id,result.history.items);
    else if(result.history?.snapshot?.state?.items) this.history.set(id,result.history.snapshot.state.items);
    if (result.history?.mode==='none' && result.history.noneReason!=='excluded') this.emit({type:'error',text:'The agent could not provide this session’s older history. New events will still appear.'});
    this.emit({type:'session',...this.snapshot(id)}); return result.session;
  }
  async approve(id,approvalId,choiceId) {
    const held=this.session(id).fold.pendingApprovals().find(a=>a.approvalId===approvalId);
    if(!held) throw new Error('This approval is no longer pending.');
    const p={...held.requested,...held.latestUpdate};
    if(!p.availableChoices.some(c=>c.choiceId===choiceId)) throw new Error('The agent did not offer that choice.');
    return this.command('approval/decide',{sessionId:id,approvalId,choiceId,requirementId:p.currentRequirementId});
  }
  async disconnect() {
    ++this.serial; const host=this.host,starting=this.starting; this.host=null;this.starting=null;
    this.sessions.clear(); this.rows.clear(); this.history.clear();
    if(starting)await starting.close().catch(()=>{});
    if(host) await host.child.close();
  }
}
