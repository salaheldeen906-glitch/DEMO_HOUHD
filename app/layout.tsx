import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'عُهدة | تجربة العهد والمصروفات',description:'مساحة تجريبية عربية مشتركة للعهد والمصروفات والتسويات',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
