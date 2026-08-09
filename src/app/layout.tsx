import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "烬天 · 本地小说阅读器",
  description: "在浏览器中本地解析 DOCX 的长篇小说阅读器",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
