import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useDispatch } from "react-redux";
import {
  aiConfigApi,
  type AIConfigResponse,
} from "@/features/ai-config/api/aiConfigApi";
import { useI18n } from "@/shared/i18n";
import { setCanChangeKeys, setLLMConfig } from "@/store/slices/userConfig";
import { LLMConfig } from "@/types/llm_config";
import {
  applyPptGeneratorProviderOverride,
  resolvePptGeneratorProviderOverride,
} from "@/ppt_generator/providerOverride";

const CONFIGURED_SENTINEL = "__configured__";

type PptGeneratorHostConfig = {
  aiConfig: AIConfigResponse;
  llmConfig: LLMConfig;
};

let cachedConfig: PptGeneratorHostConfig | null = null;
let cachedLoad: Promise<PptGeneratorHostConfig> | null = null;

const mapHostAiConfigToPptGenerator = async (): Promise<PptGeneratorHostConfig> => {
  const hostConfig = await aiConfigApi.get();
  const hasOpenAi = !!hostConfig.openai.api_key_set;
  const hasDeepSeek = !!hostConfig.deepseek.api_key_set;

  const llmConfig: LLMConfig = {
    LLM: hasOpenAi ? "openai" : hasDeepSeek ? "deepseek" : "openai",
    OPENAI_MODEL: hostConfig.openai.model || "gpt-5.5",
    OPENAI_API_KEY: hasOpenAi ? CONFIGURED_SENTINEL : "",
    DEEPSEEK_MODEL: hostConfig.deepseek.model || "deepseek-v4-pro",
    DEEPSEEK_API_KEY: hasDeepSeek ? CONFIGURED_SENTINEL : "",
    DEEPSEEK_BASE_URL: hostConfig.deepseek.base_url || "https://api.deepseek.com",
    DISABLE_IMAGE_GENERATION: !hasOpenAi,
    IMAGE_PROVIDER: hasOpenAi ? "gpt-image-1.5" : undefined,
    WEB_GROUNDING: false,
    WEB_SEARCH_PROVIDER: "auto",
  };

  return {
    aiConfig: hostConfig,
    llmConfig,
  };
};

const loadPptGeneratorConfig = async () => {
  if (cachedConfig) {
    return cachedConfig;
  }
  if (!cachedLoad) {
    cachedLoad = mapHostAiConfigToPptGenerator().then((config) => {
      cachedConfig = config;
      return config;
    });
  }
  return cachedLoad;
};

type PptGeneratorBootstrapProps = PropsWithChildren<{
  blocking?: boolean;
}>;

export function PptGeneratorBootstrap({
  children,
  blocking = true,
}: PptGeneratorBootstrapProps) {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const [ready, setReady] = useState<boolean>(!blocking || !!cachedConfig);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const hostConfig = await loadPptGeneratorConfig();
        if (!active) {
          return;
        }
        const providerOverride = resolvePptGeneratorProviderOverride(
          hostConfig.aiConfig
        );
        const llmConfig = applyPptGeneratorProviderOverride(
          hostConfig.llmConfig,
          providerOverride
        );
        dispatch(setLLMConfig(llmConfig));
        dispatch(setCanChangeKeys(false));
      } catch (error) {
        console.error("Failed to load host AI config for PPT Generator:", error);
        if (!active) {
          return;
        }
        dispatch(setCanChangeKeys(false));
      } finally {
        if (active && blocking) {
          setReady(true);
        }
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, [dispatch]);

  const loadingView = useMemo(
    () => (
      <div className="min-h-[calc(100dvh-var(--nav-height,60px)-8rem)] w-full bg-[radial-gradient(circle_at_top_left,_rgba(224,245,235,0.98),_rgba(239,248,243,0.99)_34%,_rgba(246,251,248,1)_100%)] px-3 py-4 sm:px-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-4">
          <div className="rounded-[28px] bg-[linear-gradient(135deg,rgba(0,123,85,0.96)_0%,rgba(9,97,70,0.94)_56%,rgba(17,124,90,0.96)_100%)] px-7 py-8 shadow-[0_24px_48px_-18px_rgba(0,123,85,0.28)]">
            <div className="h-5 w-52 animate-pulse rounded-full bg-white/25" />
            <div className="mt-4 h-3.5 w-[min(520px,82%)] animate-pulse rounded-full bg-white/20" />
          </div>
          <div className="mx-auto flex w-fit max-w-full gap-2 rounded-full border border-white/75 bg-white/80 p-3 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.18)]">
            <div className="h-10 w-28 animate-pulse rounded-full bg-slate-200/70" />
            <div className="h-10 w-28 animate-pulse rounded-full bg-slate-200/70" />
            <div className="h-10 w-28 animate-pulse rounded-full bg-slate-200/70" />
          </div>
          <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-white/80 bg-white/82 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.22)] backdrop-blur-xl">
            <div className="flex items-center gap-3 text-[#0b6b4b]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-semibold">{t("ppt_generator.loading")}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    [t]
  );

  if (blocking && !ready) {
    return loadingView;
  }

  return <>{children}</>;
}


