import type { Metadata } from 'next';
import Link from 'next/link';
import 'katex/dist/katex.min.css';
import './globals.css';
export const metadata:Metadata={title:'GTUverse — Study smarter',description:'Turn your notes into meaningful practice.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><header className="nav"><Link href="/" className="brand"><span className="brand-mark">✳</span> gtuverse<span className="brand-dot">.</span></Link><nav><Link href="/">Create quiz</Link><Link href="/dashboard">My dashboard</Link></nav><Link href="/#create" className="nav-cta">Start studying <span>↗</span></Link></header>{children}<footer><Link href="/" className="brand"><span className="brand-mark">✳</span> gtuverse<span className="brand-dot">.</span></Link><span>Made for the way you learn.</span><span>© GTUverse</span></footer></body></html>;}
