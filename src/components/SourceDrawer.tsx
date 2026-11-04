'use client';
import { LatexText } from './LatexText';
export function SourceDrawer({quote,section,onClose}:{quote:string;section:string;onClose:()=>void}){return <div className="overlay" onClick={onClose}><aside className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={onClose} aria-label="Close source">×</button><span className="eyebrow">SOURCE MATERIAL</span><h2>Go back to the source.</h2><p className="muted">{section||'Document excerpt'}</p><blockquote><LatexText text={quote}/></blockquote></aside></div>;}
