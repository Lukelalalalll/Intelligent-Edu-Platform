"use client";

import { useRouter } from "next/navigation";

import PresentationHeaderTitle from "./PresentationHeaderTitle";

type PresentationHeaderInfoProps = {
  presentationId: string;
};

const PresentationHeaderInfo = ({
  presentationId,
}: PresentationHeaderInfoProps) => {
  const router = useRouter();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        onClick={() => {
          router.push("/dashboard");
        }}
        src="/logo-with-bg.png"
        alt=""
        className="h-10 w-10 cursor-pointer object-contain"
      />
      <PresentationHeaderTitle presentationId={presentationId} />
    </div>
  );
};

export default PresentationHeaderInfo;
