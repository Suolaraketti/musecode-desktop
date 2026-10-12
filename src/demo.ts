import type { Snapshot } from './types';
export const demoSnapshot:Snapshot={
  sessionId:'interface-preview',row:{sessionId:'interface-preview',name:'A little less friction',workspaceRoot:'musecode',modelId:'Interface preview',status:'idle'},approvals:[],questions:[],items:[
    {itemId:'demo-user',kind:'userMessage',status:'completed',revision:1,text:'Make the project onboarding feel welcoming. Keep the next step clear, and let people explore before connecting an agent.'},
    {itemId:'demo-think',kind:'reasoning',status:'completed',revision:1,text:'An empty workspace should help someone get started without asking them to understand the underlying agent protocol.'},
    {itemId:'demo-tool1',kind:'toolCall',status:'completed',revision:1,tool:'read_file',args:'{"path":"src/onboarding.tsx"}',visibleOutput:'Example tool call · no files were read in this preview.'},
    {itemId:'demo-tool2',kind:'toolCall',status:'completed',revision:1,tool:'apply_patch',args:'{"path":"src/onboarding.tsx"}',visibleOutput:'Example tool call · no files were changed in this preview.'},
    {itemId:'demo-answer',kind:'agentMessage',status:'completed',revision:1,text:'Here’s what a conversation in MuseCode looks like.\n\nYou can follow the work without losing the conversation:\n\n- **Activity** shows the agent’s tool calls and reasoning.\n- **Changes** lets you inspect the actual Git diff.\n- **Approvals** appear here when the agent needs a decision.\n\nWhen you’re ready, open a project and connect your installed Muse Code agent.\n\n> This is an interface preview. No model was called and no files were changed.'}
  ]
};
