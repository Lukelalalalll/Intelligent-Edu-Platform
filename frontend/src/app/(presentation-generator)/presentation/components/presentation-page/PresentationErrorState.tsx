import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useI18n } from "@/shared/i18n";

export type PresentationErrorStateProps = {
  onRefresh: () => void;
  onGoToUpload: () => void;
};

const PresentationErrorState = ({
  onRefresh,
  onGoToUpload,
}: PresentationErrorStateProps) => {
  const { t } = useI18n();

  return (
    <div className="flex min-h-[calc(100dvh-var(--nav-height,60px)-8rem)] flex-col items-center justify-center bg-gray-100 font-syne">
      <div
        className="flex flex-col items-center rounded-lg border border-red-300 bg-white px-6 py-8 text-red-700 shadow-lg"
        role="alert"
      >
        <AlertCircle className="mb-4 h-16 w-16 text-red-500" />
        <h2 className="mb-2 text-xl font-semibold">{t("ppt_generator.presentation.error.title")}</h2>
        <p className="mb-4 text-center">
          {t("ppt_generator.presentation.error.body")}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={onRefresh}>{t("ppt_generator.presentation.error.refresh")}</Button>
          <Button onClick={onGoToUpload}>{t("ppt_generator.presentation.error.upload")}</Button>
        </div>
      </div>
    </div>
  );
};

export default PresentationErrorState;

