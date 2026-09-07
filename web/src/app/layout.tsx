import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "和不同 · 你是那个答主",
  description:
    "同一张卡，三个人三种结果；同一张卡，两个年代两种结果。三个人来问你同一件事，你手里有四张真实高赞回答做成的卡，只能给出三张。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
