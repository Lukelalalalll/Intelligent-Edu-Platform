import { ArrowRight, PartyPopper } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect } from 'react'
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import confetti from 'canvas-confetti';
import { useCookieConsent } from '@/shared/privacy/CookieConsentContext';
import { useI18n } from '@/shared/i18n';

const CONFETTI_COLORS = ['#ff00c5', '#f3ff00', '#9500d0', '#00d2f2', '#00ea9b', '#ff7f36'];

function fireRealisticConfetti() {
    confetti({
        particleCount: 300,
        spread: 360,
        origin: { x: 0.5, y: 0.5 },
        colors: CONFETTI_COLORS,
        startVelocity: 60,
        scalar: 1.8,
        gravity: 0.6,
        ticks: 300,
        decay: 0.93,
        zIndex: 9999,
    });
}

const FinalStep = () => {
    const { t } = useI18n();
    const router = useRouter()
    const pathname = usePathname()
    const { analyticsEnabled, consentState, openPreferences } = useCookieConsent();

    useEffect(() => {
        fireRealisticConfetti();
        trackEvent(MixpanelEvent.Onboarding_Step_Viewed, {
            step_name: "finish",
            step_number: 4,
        });
        trackEvent(MixpanelEvent.Onboarding_Completed);
    }, []);

    const handleGoToDashboard = () => {
        trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/dashboard" });
        router.push('/dashboard')
    }
    const handleGoToUpload = () => {
        trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/upload" });
        router.push('/upload')
    }
    return (
        <div className='fixed top-0 left-0 w-full h-full flex flex-col items-center justify-center'>
            <div className='flex flex-col items-center justify-center'>

                <img src="/final_onboarding.png" alt="PPT Generator" className='w-[118px] h-[98px]  object-contain' />
                <h1 className='text-black text-[30px] font-normal font-unbounded py-2.5'>Welcome on board!</h1>
                <p className='text-[#000000CC] text-xl font-normal font-syne'>You’re all set. Let’s create your first presentation.</p>

                <div className='flex items-center gap-3 mt-8 px-5 py-3.5 rounded-[10px] border border-[#EDEEEF] bg-white'>
                    <div className='flex-1'>
                        <div>
                            <p className='text-sm font-medium text-[#191919] font-syne'>{t('privacy.onboarding.title')}</p>
                            <p className='text-[11px] text-[#9CA3AF] font-syne leading-tight mt-0.5'>
                                {consentState === 'pending'
                                    ? t('privacy.onboarding.pending')
                                    : analyticsEnabled
                                        ? t('privacy.onboarding.enabled')
                                        : t('privacy.onboarding.disabled')}
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={openPreferences}
                        className='rounded-[999px] border border-[#D9D6FE] px-4 py-2 text-sm font-medium text-[#5146E5] hover:bg-[#F4F3FF]'
                    >
                        {t('privacy.onboarding.manage')}
                    </button>
                    </div>

                <button onClick={handleGoToUpload} className='bg-[#7C51F8] px-[23px] mt-8 py-[15px]  rounded-[70px] text-white text-lg font-syne font-semibold'>My First Presentation 🚀</button>
                <button onClick={fireRealisticConfetti} className='mt-3 flex items-center gap-1.5 text-sm text-[#7A5AF8] font-syne font-medium hover:underline'>
                    <PartyPopper className='w-4 h-4' /> Celebrate again!
                </button>
            </div>
            <button onClick={handleGoToDashboard} className='absolute uppercase bottom-20 text-[#7A5AF8] flex items-center gap-2 right-10  text-xs font-normal font-syne'>Go to your dashboard <ArrowRight className='w-4 h-4 text-[#7A5AF8]' /></button>
        </div>
    )
}

export default FinalStep
