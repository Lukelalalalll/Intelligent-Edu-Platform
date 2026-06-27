"use client";

import React from 'react';
import { ArrowUpRight, Plus, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { useI18n } from '@/shared/i18n';
import { trackEvent, MixpanelEvent } from '@/utils/mixpanel';

type CreateCustomTemplateProps = {
    className?: string;
    variant?: 'default' | 'workspace';
};

export default function CreateCustomTemplate({
    className,
    variant = 'default',
}: CreateCustomTemplateProps) {
    const { t } = useI18n();
    const router = useRouter();
    const isWorkspace = variant === 'workspace';

    return (
        <button
            type="button"
            onClick={() => {
                trackEvent(MixpanelEvent.Templates_Build_Template_Clicked);
                router.push('/custom-template');
            }}
            className={cn(
                'group w-full text-left transition-all duration-200',
                isWorkspace && 'h-full',
                className,
            )}
        >
            <div
                className={cn(
                    'w-full overflow-hidden rounded-[22px] border bg-white',
                    isWorkspace
                        ? 'flex h-full flex-col border-[rgba(15,23,42,0.08)] shadow-[0_16px_28px_-24px_rgba(15,23,42,0.42)] transition-all duration-200 group-hover:-translate-y-[1px] group-hover:shadow-[0_22px_42px_-26px_rgba(0,123,85,0.26)]'
                        : 'cursor-pointer border-[#EDEEEF]',
                )}
            >
                <div
                    className={cn(
                        'relative flex items-center justify-center overflow-hidden',
                        isWorkspace ? 'h-[230px] px-5 pb-5 pt-5' : 'h-[215px]',
                    )}
                >
                    <img src="/card_bg.svg" alt="" className="absolute left-0 top-0 z-[1] h-full w-full object-cover" />
                    <div
                        className={cn(
                            'relative z-[4] flex items-center justify-center rounded-full',
                            isWorkspace
                                ? 'h-12 w-12 border border-white/80 bg-white/90 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.3)]'
                                : 'h-[36px] w-[36px] bg-[#7A5AF8]',
                        )}
                        style={isWorkspace ? undefined : {
                            background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.20) 0%, rgba(0, 0, 0, 0.20) 100%), #FFF',
                        }}
                    >
                        <div
                            className={cn(
                                'flex items-center justify-center rounded-full bg-white',
                                isWorkspace ? 'h-9 w-9' : 'h-[26px] w-[26px]',
                            )}
                        >
                            <Plus className={cn('w-4 h-4', isWorkspace ? 'text-[#0b6b4b]' : 'text-[#A2A0A1]')} />
                        </div>
                    </div>
                    {isWorkspace ? (
                        <span className="absolute left-4 top-3.5 z-40 inline-flex items-center rounded-full bg-[#0f172a] px-3 py-1 text-xs font-semibold text-white">
                            {t('presenton.templates.createCustom.badge')}
                        </span>
                    ) : null}
                </div>

                <div
                    className={cn(
                        'relative z-40 overflow-hidden border-t bg-white',
                        isWorkspace
                            ? 'flex min-h-[118px] flex-1 items-start justify-between gap-4 border-[rgba(15,23,42,0.08)] px-6 py-5'
                            : 'flex items-center gap-4 border-[#EDEEEF] px-5 py-4',
                    )}
                >
                    <div className="flex min-w-0 items-center gap-4">
                        <div
                            className={cn(
                                'flex items-center justify-center rounded-lg',
                                isWorkspace ? 'h-11 w-11 bg-[rgba(0,123,85,0.12)]' : 'h-[45px] w-[45px] bg-[#7A5AF8] p-2',
                            )}
                        >
                            <Sparkles className={cn('w-5 h-5', isWorkspace ? 'text-[#0b6b4b]' : 'text-white')} />
                        </div>
                        <div className="min-w-0">
                            <h4 className={cn('font-semibold', isWorkspace ? 'text-base text-[#111827]' : 'text-sm text-[#191919]')}>
                                {t('presenton.templates.createCustom.title')}
                            </h4>
                            <p
                                className={cn(
                                    'items-center gap-2',
                                    isWorkspace ? 'mt-1 text-sm font-medium leading-6 text-[#667085]' : 'flex text-sm font-medium text-[#808080]',
                                )}
                            >
                                {isWorkspace
                                    ? t('presenton.templates.createCustom.bodyWorkspace')
                                    : t('presenton.templates.createCustom.bodyDefault')}
                            </p>
                        </div>
                    </div>

                    {isWorkspace ? (
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-[#667085] transition-colors duration-200 group-hover:text-[#0b6b4b]" />
                    ) : null}
                </div>
            </div>
        </button>
    );
}
