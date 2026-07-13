import type { PropsWithChildren } from "react";

import { PptGeneratorBootstrap } from "@/ppt_generator/bootstrap";

type PptGeneratorScreenProps = PropsWithChildren<{
  tone?: "default" | "wide";
  bleed?: "default" | "full";
  contentWidth?: "default" | "wide" | "full";
  contentInset?: "default" | "none";
  contentClassName?: string;
  bootstrapBlocking?: boolean;
}>;

export function PptGeneratorScreen({
  children,
  tone = "default",
  bleed = "default",
  contentWidth = "default",
  contentInset = "default",
  contentClassName = "",
  bootstrapBlocking = true,
}: PptGeneratorScreenProps) {
  const widthClassName =
    contentWidth === "full"
      ? "w-full max-w-none"
      : contentWidth === "wide" || tone === "wide"
        ? "w-full max-w-[min(100%,1760px)]"
        : "w-full max-w-[min(100%,1560px)]";
  const screenClassName =
    bleed === "full"
      ? "w-full min-h-[calc(100dvh-var(--nav-height,60px))] bg-[radial-gradient(circle_at_top_left,rgba(227,246,237,0.98),rgba(237,248,242,0.99)_34%,rgba(244,250,247,1)_100%)]"
      : contentInset === "none"
        ? "mx-auto flex w-full flex-col"
        : "mx-auto flex w-full flex-col px-3 pb-6 pt-4 sm:px-4 lg:px-6";

  return (
    <PptGeneratorBootstrap blocking={bootstrapBlocking}>
      <section className={`ppt-generator-screen ${screenClassName} ${contentClassName}`.trim()}>
        <div className={`${widthClassName} mx-auto flex w-full flex-1 flex-col`}>
          {children}
        </div>
      </section>
    </PptGeneratorBootstrap>
  );
}


