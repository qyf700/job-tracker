import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"下一站 · 求职投递管理器",description:"把每一次投递，变成清晰的下一步。"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>;}
