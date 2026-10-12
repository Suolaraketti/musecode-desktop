import path from 'node:path';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

export const signedIn = account => account?.credentialRequired===false || ['accountLogin','apiKey','envKey'].includes(account?.state);
export function loginUrl(value) {
  const url=new URL(value);
  if(url.protocol!=='https:' || !['auth.meta.com','meta.ai','www.meta.ai','dev.meta.ai','facebook.com','www.facebook.com'].includes(url.hostname) || url.username || url.password)
    throw new Error('Muse returned an unexpected sign-in address. Update Muse and try again.');
  return url.href;
}
const isFile=async p=>{try{return (await stat(p)).isFile();}catch{return false;}};
export async function resolveBinary({explicit='',managed='',bundled='',env=process.env,platform=process.platform}={}) {
  if(explicit && await isFile(explicit))return explicit;
  const name=platform==='win32'?'muse.exe':'muse';
  for(const folder of [bundled,managed,platform==='win32'&&env.LOCALAPPDATA?path.join(env.LOCALAPPDATA,'Programs','muse'):''].filter(Boolean)) {
    try{
      const version=(await readFile(path.join(folder,'.muse-version'),'utf8')).trim();
      if(/^\d+\.\d+\.\d+-R\d+(\.\d+)?$/.test(version)){
        const active=path.join(folder,`muse-bin-${version}${platform==='win32'?'.exe':''}`);
        if(await isFile(active))return active;
      }
    }catch{}
    if(await isFile(path.join(folder,name)))return path.join(folder,name);
  }
  for(const folder of (env.PATH||'').split(path.delimiter).filter(Boolean)) {
    const candidate=path.join(folder,name);if(await isFile(candidate))return candidate;
  }
  // Common Unix installer locations need not be present in the GUI's PATH.
  if(platform!=='win32' && env.USERPROFILE===undefined && env.HOME){for(const folder of ['.local/bin','.muse/bin']){
    const candidate=path.join(env.HOME,folder,name);if(await isFile(candidate))return candidate;
  }}
  return '';
}

export class RuntimeInstaller {
  constructor({directory,emit=()=>{},fetcher=fetch,spawnProcess=spawn,platform=process.platform,env=process.env}){
    this.directory=path.resolve(directory);if(this.directory===path.parse(this.directory).root)throw new Error('Choose an app-owned runtime directory.');this.emit=emit;this.fetcher=fetcher;this.spawnProcess=spawnProcess;this.platform=platform;this.env=env;
  }
  async ensure({update=false}={}) {
    if(this.operation)return this.operation;
    this.operation=this.install(update).finally(()=>{this.operation=null;});return this.operation;
  }
  async install(update) {
    const existing=await resolveBinary({managed:this.directory,env:{},platform:this.platform});
    if(existing&&!update)return existing;
    if(this.platform!=='win32')throw new Error('Automatic setup is currently available on Windows. You can connect an existing Muse installation in Advanced settings.');
    await mkdir(this.directory,{recursive:true});
    const controller=new AbortController();this.controller=controller;
    try{
      this.emit({phase:'preparing',message:update?'Updating Muse in the background…':'Preparing MuseCode for you…'});
      const response=await this.fetcher('https://dev.meta.ai/install.ps1',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]),redirect:'error'});
      if(!response.ok)throw new Error('Muse could not be downloaded right now. Check your connection and try again.');
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>1024*1024)throw new Error('The Muse installer could not be verified. Try again later.');
      const expected=response.headers.get('x-content-sha256');
      if(expected && createHash('sha256').update(bytes).digest('hex')!==expected.toLowerCase())throw new Error('The Muse installer could not be verified. Try again later.');
      const script=path.join(this.directory,'install-muse.ps1');await writeFile(script,bytes);
      const systemRoot=this.env.SystemRoot||this.env.SYSTEMROOT||'C:\\Windows';
      const command=path.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
      // Windows env names are case-insensitive. Duplicate spellings can make
      // Node discard our override and leave PowerShell's standard modules out.
      const childEnv=Object.fromEntries(Object.entries(this.env).map(([key,value])=>[key.toUpperCase(),value]));
      Object.assign(childEnv,{PSMODULEPATH:[path.join(systemRoot,'System32','WindowsPowerShell','v1.0','Modules'),childEnv.PSMODULEPATH].filter(Boolean).join(';'),MUSE_INSTALL_DIR:this.directory,MUSE_NO_MODIFY_PATH:'1',MUSE_LOGIN:'0',MUSE_UPGRADE_MODE:'1',MUSE_LAUNCHER_URL:'https://api.meta.ai/muse-launcher.ps1'});
      const child=this.spawnProcess(command,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{
        windowsHide:true,stdio:['ignore','pipe','pipe'],env:childEnv
      });this.child=child;
      let evidence='';const drain=chunk=>{evidence=(evidence+chunk.toString()).slice(-16000);};child.stdout.on('data',drain);child.stderr.on('data',drain);
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{this.stopChild();reject(new Error('Muse setup took longer than expected. Try again.'));},180000);
        const onAbort=()=>{this.stopChild();reject(new Error('Setup cancelled.'));};controller.signal.addEventListener('abort',onAbort,{once:true});
        const finish=fn=>value=>{clearTimeout(timeout);controller.signal.removeEventListener('abort',onAbort);fn(value);};
        child.once('error',finish(()=>reject(new Error('Muse setup could not start. Try again.'))));
        child.once('close',finish(code=>{
          if(code===0)resolve();else reject(new Error(/403|employees|refused/i.test(evidence)?'Meta could not provide Muse for this installation. Check your account’s access or try again later.':/401|sign.in|rejected/i.test(evidence)?'Meta could not authorize the Muse download. Try again after checking your account access.':'Muse setup could not finish. Check your connection and try again.'));
        }));
      });
      const binary=await resolveBinary({managed:this.directory,env:{},platform:this.platform});
      if(!binary)throw new Error('Muse setup finished without a usable runtime. Try again.');return binary;
    }finally{this.controller=null;this.child=null;}
  }
  stopChild(){
    if(!this.child)return;
    if(this.platform==='win32'&&this.child.pid){const taskkill=path.join(this.env.SystemRoot||this.env.SYSTEMROOT||'C:\\Windows','System32','taskkill.exe');const kill=this.spawnProcess(taskkill,['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>this.child?.kill());}
    else this.child.kill();
  }
  cancel(){this.controller?.abort();this.stopChild();}
}

export class SetupController {
  constructor({runtime,installer,settings,save,emit,openBrowser,discover,reconnectDelays=[500,1500,4000]}){
    Object.assign(this,{runtime,installer,settings,save,emit,openBrowser,discover});
    this.reconnectDelays=reconnectDelays;this.recoveryEpoch=0;
    this.state={phase:'checking',message:'Getting your workspace ready…'};
    this.attempt=0;
  }
  set(next){this.state={...next};this.emit({type:'setup',...this.state});return this.state;}
  initialize(){
    if(this.initialization)return this.initialization;
    this.initialization=(async()=>{
      try{
        const binary=await this.discover();
        if(!binary || this.settings.autoConnect===false)return this.set({phase:'welcome',message:'Sign in to start making things with Muse.'});
        this.settings.binary=binary;await this.connect();
      }catch{return this.set({phase:'welcome',message:'Sign in to start making things with Muse.'});}
      return this.state;
    })();return this.initialization;
  }
  start(){
    if(this.operation)return this.operation;
    if(this.state.phase==='waiting')return Promise.resolve(this.state);
    const attempt=++this.attempt;
    this.operation=(async()=>{
      try{
        await this.initialize();
        let binary=await this.discover();
        if(!binary){this.set({phase:'preparing',message:'Preparing MuseCode for you…'});binary=await this.installer.ensure();}
        if(attempt!==this.attempt)return this.state;
        this.settings.binary=binary;await this.save();
        try{if(!this.runtime.host)await this.connect();else await this.acceptAccount(await this.runtime.account());}
        catch(error){
          if(error.code!=='MUSE_UPDATE_REQUIRED')throw error;
          this.set({phase:'preparing',message:'Getting the latest Muse ready for you…'});
          this.settings.binary=await this.installer.ensure({update:true});await this.save();
          if(attempt!==this.attempt)return this.state;await this.connect();
        }
        if(this.state.phase==='ready')return this.state;
        this.set({phase:'connecting',message:'Opening secure Meta sign-in…'});
        const result=await this.runtime.request('account/loginStart',{type:'deviceCode'});
        if(!result.verificationUrl||!result.userCode)throw new Error('Meta sign-in could not be started. Try again.');
        // Never put account credentials or native diagnostic output in UI state.
        const url=loginUrl(result.verificationUrl);
        this.set({phase:'waiting',message:'Finish signing in with Meta in your browser.',verificationUrl:url,userCode:result.userCode});
        try{await this.openBrowser(url);}catch{this.set({...this.state,message:'Open the sign-in page below to continue with Meta.'});}
        return this.state;
      }catch(error){return attempt!==this.attempt?this.state:this.set({phase:'error',message:error.message});}
    })().finally(()=>{this.operation=null;});return this.operation;
  }
  async connect(){
    this.set({phase:'connecting',message:'Connecting your account…'});
    await this.runtime.connect(this.settings.binary);
    await this.acceptAccount(await this.runtime.account());
  }
  async acceptAccount(account){
    if(signedIn(account)){
      this.settings.autoConnect=true;await this.save();
      const state=this.set({phase:'ready',message:'You’re connected.',account:{state:account.state,label:account.label}});
      void this.updateInBackground();return state;
    }
    return this.set({phase:'welcome',message:'Sign in to start making things with Muse.'});
  }
  async notification(event){
    if(event.type==='disconnected'){
      if(!this.stopping){if(this.state.phase==='ready'&&this.settings.autoConnect)void this.recover();else this.set({phase:'error',message:'Connection interrupted. Try again to pick up where you left off.'});}
      return;
    }
    if(event.type!=='notification')return;
    if(event.method==='account/changed')await this.acceptAccount(event.params);
    if(event.method==='account/loginCompleted' && event.params.outcome!=='granted'){
      const messages={denied:'Sign-in wasn’t approved. You can try again.',expired:'Your sign-in link expired. Start again to get a new one.',cancelled:'Sign-in cancelled.',failed:'Meta sign-in could not finish. Try again.'};
      this.set({phase:event.params.outcome==='cancelled'?'welcome':'error',message:messages[event.params.outcome]||'Sign-in could not finish. Try again.'});
    }
    if(event.method==='turn/completed' && event.params.error?.kind==='authRequired')this.set({phase:'welcome',message:'Your Meta sign-in needs refreshing. Sign in again to continue your conversation.'});
  }
  async updateInBackground(){
    if(this.updating || !this.settings.binary?.startsWith(this.installer.directory+path.sep) || Date.now()-(this.settings.lastUpdateCheck||0)<86400000)return;
    this.updating=true;this.settings.lastUpdateCheck=Date.now();
    try{await this.save();const binary=await this.installer.ensure({update:true});this.settings.binary=binary;await this.save();this.emit({type:'maintenance',message:'Muse is up to date.'});}
    catch{this.emit({type:'maintenance',message:'Muse will check for updates again later.'});}
    finally{this.updating=false;}
  }
  async recover(){
    if(this.recovering)return this.recovering;
    const epoch=this.recoveryEpoch;
    this.set({phase:'connecting',message:'Reconnecting your workspace…'});
    this.recovering=(async()=>{
      for(const delay of this.reconnectDelays){
        await new Promise(resolve=>setTimeout(resolve,delay));
        if(this.stopping||epoch!==this.recoveryEpoch)return;
        try{await this.connect();return;}catch{}
      }
      if(epoch===this.recoveryEpoch)this.set({phase:'error',message:'We couldn’t reconnect. Your saved work is still here. Try again when you’re ready.'});
    })().finally(()=>{this.recovering=null;});return this.recovering;
  }
  async cancel(){++this.attempt;this.stopping=true;try{this.installer.cancel();if(this.runtime.host)await this.runtime.request('account/loginCancel',{});this.set({phase:'welcome',message:'Sign in whenever you’re ready.'});}finally{this.stopping=false;}}
  async disconnect(){++this.recoveryEpoch;this.stopping=true;try{this.settings.autoConnect=false;await this.save();await this.runtime.disconnect();this.set({phase:'welcome',message:'You’re disconnected. Your saved work is still here.'});}finally{this.stopping=false;}}
}
