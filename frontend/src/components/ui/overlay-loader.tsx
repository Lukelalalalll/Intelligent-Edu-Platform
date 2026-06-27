import { cn } from "@/lib/utils";
import { ProgressBar } from "./progress-bar";
import { useEffect, useState } from "react";

interface OverlayLoaderProps {
  text?: string;
  className?: string;
  show: boolean;
  showProgress?: boolean;
  duration?: number;
  extra_info?: string;
  onProgressComplete?: () => void;
}

export const OverlayLoader = ({
  text,
  className,
  show,
  showProgress = false,
  duration = 10,
  onProgressComplete,
  extra_info,
}: OverlayLoaderProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [show]);

  if (!show) return null;

  return (
    <div
      style={{
        zIndex: 1000,
      }}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.42)] px-4 backdrop-blur-[4px] transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0"
      )}
    >
      <div
        className={cn(
          "relative flex min-h-[347px] min-w-[280px] flex-col items-center justify-center overflow-hidden rounded-[32px] border border-white/70 bg-[rgba(255,255,255,0.92)] px-8 pb-10 pt-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
          "sm:min-w-[447px] transition-all duration-300 ease-out",
          isVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2",
          className
        )}
      >
        <div className="flex shrink-0 items-center justify-center" role="status" aria-label="Loading">
          <span className="overlay-loader-spinner">
            <span className="overlay-loader-orbit overlay-loader-orbit-primary" />
            <span className="overlay-loader-orbit overlay-loader-orbit-secondary" />
            <span className="overlay-loader-core" />
          </span>
        </div>
        {showProgress ? (
          <div className="w-full space-y-6 pt-6">
            <ProgressBar duration={duration} onComplete={onProgressComplete} />
            {text && (
              <div className="space-y-1.5">
                <p className="text-center text-[15px] font-semibold text-[#191919]">
                  {text}
                </p>
                {extra_info && (
                  <p className="text-center text-[13px] leading-6 text-[#4B5563]">
                    {extra_info}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="text-center text-[15px] font-semibold text-[#191919]">
              {text}
            </p>
            {extra_info && (
              <p className="text-center text-[13px] leading-6 text-[#4B5563]">
                {extra_info}
              </p>
            )}
          </>
        )}
        <svg
          className="absolute left-0 bottom-0"
          xmlns="http://www.w3.org/2000/svg"
          width="447"
          height="277"
          viewBox="0 0 447 277"
          fill="none"
        >
          <g filter="url(#filter0_d_4852_6112)">
            <path
              d="M674.5 748.5C668.101 804.091 669 808.5 657.5 832L639 887.5C627 972.5 668.5 1143.5 785 1158.5C984.755 1184.22 877.602 926.811 837.653 808.716C843.652 768.181 841.852 633.973 786.657 421.42C717.663 155.729 278.698 139.89 18.7199 302.37C-241.259 464.851 -399.894 486.766 -478.239 422.953C-544.734 368.793 -537.234 154.707 -464.24 75L-757.716 82.1532C-760.716 183.831 -739.218 390.764 -726.719 430.617C-715.665 465.864 -652.725 581.857 -516.736 619.156C-390.988 653.646 -209.56 584.814 -169.765 572.66C-136.5 562.5 97.7134 443.561 210.704 380.545C699.164 216.532 682.499 679.012 674.5 748.5Z"
              fill="url(#paint0_radial_4852_6112)"
              shapeRendering="crispEdges"
            />
          </g>
          <defs>
            <filter
              id="filter0_d_4852_6112"
              x="-833"
              y="0"
              width="1810.32"
              height="1235.29"
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feColorMatrix
                in="SourceAlpha"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                result="hardAlpha"
              />
              <feOffset />
              <feGaussianBlur stdDeviation="37.5" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.784314 0 0 0 0 0.901961 0 0 0 0 0.85098 0 0 0 1 0"
              />
              <feBlend
                mode="normal"
                in2="BackgroundImageFix"
                result="effect1_dropShadow_4852_6112"
              />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="effect1_dropShadow_4852_6112"
                result="shape"
              />
            </filter>
            <radialGradient
              id="paint0_radial_4852_6112"
              cx="0"
              cy="0"
              r="1"
              gradientTransform="matrix(-987.419 -112.408 219.823 -2016.77 351.693 300.327)"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#C8E6D9" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>
      </div>

      <style>{`
        .overlay-loader-spinner {
          position: relative;
          width: 72px;
          height: 72px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .overlay-loader-orbit {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 3px solid transparent;
          animation: overlay-loader-spin 1.35s linear infinite;
        }

        .overlay-loader-orbit-primary {
          border-top-color: #007b55;
          border-right-color: rgba(0, 123, 85, 0.38);
        }

        .overlay-loader-orbit-secondary {
          inset: 10px;
          border-bottom-color: #35b37e;
          border-left-color: rgba(11, 107, 75, 0.24);
          animation-direction: reverse;
          animation-duration: 1.1s;
        }

        .overlay-loader-core {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #007b55 0%, #35b37e 100%);
          box-shadow: 0 0 0 10px rgba(0, 123, 85, 0.08);
          animation: overlay-loader-pulse 1.6s ease-in-out infinite;
        }

        @keyframes overlay-loader-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes overlay-loader-pulse {
          0%, 100% {
            transform: scale(0.92);
            box-shadow: 0 0 0 10px rgba(0, 123, 85, 0.08);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 0 16px rgba(0, 123, 85, 0.05);
          }
        }
      `}</style>
    </div>
  );
};
