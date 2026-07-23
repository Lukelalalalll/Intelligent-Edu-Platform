"use client";
import React from "react";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useCookieConsent } from "@/shared/privacy/CookieConsentContext";
import { Link } from "react-router-dom";
import { useI18n } from "@/shared/i18n";

const PrivacySettings = () => {
  const { t } = useI18n();
  const {
    analyticsEnabled,
    consentState,
    isPreferencesOpen,
    isResolved,
    isSaving,
    openPreferences,
    savePreferences,
  } = useCookieConsent();

  if (!isResolved) {
    return (
      <div className="w-full bg-[#F9F8F8] p-7 rounded-[20px] flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-5 h-5 animate-spin text-[#5146E5]" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="bg-[#F9F8F8] p-7 rounded-[20px]">
        <h4 className="text-sm font-semibold text-[#191919] mb-1">
          {t('privacy.settings.title')}
        </h4>
        <p className="text-xs text-[#6B7280] mb-6 leading-relaxed max-w-lg">
          {t('privacy.settings.description')}
        </p>

        <div className="flex items-center justify-between gap-4 rounded-[10px] bg-white border border-[#EDEEEF] p-4">
          <div>
            <label
              htmlFor="tracking-toggle"
              className="text-sm font-medium text-[#191919] cursor-pointer select-none block"
            >
              {t('privacy.settings.toggleLabel')}
            </label>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {consentState === "pending"
                ? t('privacy.settings.pending')
                : analyticsEnabled
                  ? t('privacy.settings.enabled')
                  : t('privacy.settings.disabled')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSaving && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9CA3AF]" />
            )}
            <Switch
              id="tracking-toggle"
              checked={analyticsEnabled}
              onCheckedChange={(checked) => void savePreferences(checked)}
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#6B7280]">
          <button
            type="button"
            className="font-medium text-[#5146E5] hover:underline"
            onClick={openPreferences}
          >
            {isPreferencesOpen ? t('privacy.settings.openPreferencesActive') : t('privacy.settings.openPreferences')}
          </button>
          <Link to="/cookie-policy" className="font-medium text-[#5146E5] hover:underline">
            {t('privacy.settings.readPolicy')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;
