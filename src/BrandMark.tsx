// Original vector mark, inspired by Muse's handwritten M and blue palette.
export function BrandMark({small=false,className=''}:{small?:boolean;className?:string}) {
  return <svg className={`mark ${small?'small':''} ${className}`} viewBox="0 0 100 88" fill="none" aria-hidden="true">
    <path d="M12 37C19 23 28 10 35 10C40 10 29 52 27 72C35 61 53 13 61 14C68 15 51 57 52 73C59 63 74 26 81 27C87 28 70 65 74 73C79 77 86 65 92 54" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
