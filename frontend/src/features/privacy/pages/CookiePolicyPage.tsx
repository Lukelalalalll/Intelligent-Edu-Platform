import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Cookie, Lock, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/shared/i18n';

const cardClassName = 'rounded-[8px] border border-[#E5E7EB] bg-white p-5 shadow-sm';

export default function CookiePolicyPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-[calc(100dvh-var(--nav-height,60px))] bg-[#F8FAFC] px-4 py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#5146E5] hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('privacy.policy.back')}
          </Link>
        </div>

        <section className={`${cardClassName} space-y-4`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-[8px] bg-[#EEF2FF] p-2 text-[#5146E5]">
              <Cookie className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-[#111827]">{t('privacy.policy.title')}</h1>
              <p className="max-w-3xl text-sm leading-7 text-[#4B5563]">
                {t('privacy.policy.introPrimary')}
              </p>
              <p className="text-sm leading-7 text-[#4B5563]">
                {t('privacy.policy.introSecondary')}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className={`${cardClassName} space-y-3`}>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#111827]" />
              <h2 className="text-lg font-semibold text-[#111827]">{t('privacy.policy.essentialTitle')}</h2>
            </div>
            <p className="text-sm leading-7 text-[#4B5563]">
              {t('privacy.policy.essentialDescription')}
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#4B5563]">
              <li>{t('privacy.policy.essentialItemAuth')}</li>
              <li>{t('privacy.policy.essentialItemCsrf')}</li>
              <li>{t('privacy.policy.essentialItemExport')}</li>
            </ul>
          </article>

          <article className={`${cardClassName} space-y-3`}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#111827]" />
              <h2 className="text-lg font-semibold text-[#111827]">{t('privacy.policy.analyticsTitle')}</h2>
            </div>
            <p className="text-sm leading-7 text-[#4B5563]">
              {t('privacy.policy.analyticsDescription')}
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#4B5563]">
              <li>{t('privacy.policy.analyticsItemMixpanel')}</li>
              <li>{t('privacy.policy.analyticsItemNoEvents')}</li>
              <li>{t('privacy.policy.analyticsItemWithdraw')}</li>
            </ul>
          </article>
        </section>

        <section className={`${cardClassName} space-y-3`}>
          <h2 className="text-lg font-semibold text-[#111827]">{t('privacy.policy.functionalTitle')}</h2>
          <p className="text-sm leading-7 text-[#4B5563]">
            {t('privacy.policy.functionalDescriptionPrimary')}
          </p>
          <p className="text-sm leading-7 text-[#4B5563]">
            {t('privacy.policy.functionalDescriptionSecondary')}
          </p>
        </section>
      </div>
    </div>
  );
}
