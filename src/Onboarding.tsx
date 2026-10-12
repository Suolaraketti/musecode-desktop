import { ArrowRight, Check, Copy, FolderOpen, Globe, Loader2, Settings2, ShieldCheck, WandSparkles } from 'lucide-react';
import type { SetupState } from './types';
import { BrandMark } from './BrandMark';
import './onboarding.css';
type Props={state:SetupState;needsProject:boolean;onStart:()=>void;onCancel:()=>void;onBrowser:()=>void;onProject:()=>void;onSettings:()=>void;onPreview:()=>void};
export function Onboarding({state,needsProject,onStart,onCancel,onBrowser,onProject,onSettings,onPreview}:Props){
  const working=['checking','preparing','connecting'].includes(state.phase);
  const waiting=state.phase==='waiting';const failed=state.phase==='error';
  return <main className="onboarding" aria-label="Get started with MuseCode">
    <div className="onboarding-top"><span>YOUR IDEAS, WITH ROOM TO GROW</span><button onClick={onSettings}><Settings2 size={15}/>Settings</button></div>
    <section className="onboarding-card">
      <BrandMark className="onboarding-symbol"/>
      <div className="onboarding-step">{needsProject?<><Check size={13}/>Account connected</>:<><span className="status-dot"/>A familiar home for Muse</>}</div>
      <h1>{needsProject?'Make yourself at home.':waiting?'A moment with Meta.':working?'Getting things ready.':'Big ideas start here.'}</h1>
      <p className="onboarding-description">{needsProject?'Choose the project you want to work on. Muse will meet you there.':waiting?'Finish signing in in your browser. We’ll bring you back to your workspace automatically.':working?state.message:'Sign in with your Meta account and start building. We’ll take care of getting everything ready.'}</p>
      {waiting?<div className="sign-in-waiting"><span>Confirm this code on Meta’s sign-in page</span><button className="verification-code" title="Copy verification code" onClick={()=>void navigator.clipboard.writeText(state.userCode||'')}>{state.userCode}<Copy size={16}/></button><div className="waiting-indicator" role="status"><Loader2 size={15} className="spin"/>Waiting for Meta</div><button className="primary-button onboarding-primary" onClick={onBrowser}><Globe size={16}/>Continue in browser<ArrowRight size={17}/></button><button className="text-button" onClick={onCancel}>Cancel sign-in</button></div>:
        needsProject?<button className="primary-button onboarding-primary" onClick={onProject}><FolderOpen size={18}/>Open a project<ArrowRight size={18}/></button>:
        <><button className="primary-button onboarding-primary" disabled={working} onClick={onStart}>{working?<Loader2 size={19} className="spin"/>:<Globe size={18}/>} {working?state.phase==='preparing'?'Preparing your workspace…':'Just a moment…':failed?'Try again':'Sign in with Meta'}{!working&&<ArrowRight size={18}/>}</button>{working&&state.phase==='preparing'&&<button className="text-button" onClick={onCancel}>Cancel setup</button>}</>}
      {failed&&<p className="onboarding-error" role="alert">{state.message}</p>}
      <div className="onboarding-trust"><ShieldCheck size={15}/><span>Your sign-in stays with Meta. Your project stays on your machine.</span></div>
      <div className="onboarding-steps"><div className={needsProject?'complete':'current'}><span>{needsProject?<Check size={12}/>:1}</span>Connect your account</div><span className="step-line"/><div className={needsProject?'current':''}><span>2</span>Choose a project</div><span className="step-line"/><div><span>3</span>Make something</div></div>
    </section>
    <div className="onboarding-bottom"><span>An independent, open source home for Muse Code.</span><button onClick={onPreview}><WandSparkles size={14}/>Take a look around<ArrowRight size={13}/></button></div>
  </main>;
}
