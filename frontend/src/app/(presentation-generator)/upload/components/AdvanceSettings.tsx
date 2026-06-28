import ToolTip from '@/components/ToolTip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SlidersHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/shared/i18n';
import { PresentationConfig, ToneType, VerbosityType } from '../type';

interface ConfigurationSelectsProps {
    config: PresentationConfig;
    onConfigChange: (key: keyof PresentationConfig, value: any) => void;
}

const toggleClassName =
    'h-[22px] w-[36px] border-0 bg-[#D8E4DD] data-[state=checked]:bg-[#007B55]';

const AdvanceSettings = ({ config, onConfigChange }: ConfigurationSelectsProps) => {
    const { t } = useI18n();
    const [openAdvanced, setOpenAdvanced] = useState(false);

    const [advancedDraft, setAdvancedDraft] = useState({
        tone: config.tone,
        verbosity: config.verbosity,
        instructions: config.instructions,
        includeTableOfContents: config.includeTableOfContents,
        includeTitleSlide: config.includeTitleSlide,
    });

    const syncDraftFromConfig = () => {
        setAdvancedDraft({
            tone: config.tone,
            verbosity: config.verbosity,
            instructions: config.instructions,
            includeTableOfContents: config.includeTableOfContents,
            includeTitleSlide: config.includeTitleSlide,
        });
    };

    const handleOpenAdvanced = () => {
        syncDraftFromConfig();
        setOpenAdvanced(true);
    };

    const handleCloseAdvanced = () => {
        setOpenAdvanced(false);
    };

    const handleSaveAdvanced = () => {
        onConfigChange('tone', advancedDraft.tone);
        onConfigChange('verbosity', advancedDraft.verbosity);
        onConfigChange('instructions', advancedDraft.instructions);
        onConfigChange('includeTableOfContents', advancedDraft.includeTableOfContents);
        onConfigChange('includeTitleSlide', advancedDraft.includeTitleSlide);
        handleCloseAdvanced();
    };

    useEffect(() => {
        if (!openAdvanced) {
            return;
        }

        const previousOverflow = document.body.style.overflow;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleCloseAdvanced();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [openAdvanced]);

    const advancedDialog =
        typeof document !== 'undefined'
            ? createPortal(
                <AnimatePresence>
                    {openAdvanced && (
                        <motion.div
                            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[4px]"
                            onClick={(event) => {
                                if (event.target === event.currentTarget) {
                                    handleCloseAdvanced();
                                }
                            }}
                            role="presentation"
                            data-testid="advanced-settings-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <motion.div
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="advanced-settings-title"
                                aria-describedby="advanced-settings-subtitle"
                                className="w-full max-w-[520px] rounded-[var(--radius-lg)] bg-white p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] sm:p-10"
                                onClick={(event) => event.stopPropagation()}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            >
                                <div className="mb-[25px] flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <h3 id="advanced-settings-title" className="text-[1.4rem] font-bold text-[#333]">
                                            {t("ppt_generator.upload.advanced.title")}
                                        </h3>
                                        <p id="advanced-settings-subtitle" className="mt-1 text-sm leading-6 text-[#888]">
                                            {t("ppt_generator.upload.advanced.subtitle")}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCloseAdvanced}
                                        aria-label={t("ppt_generator.upload.advanced.close")}
                                        className="border-none bg-transparent p-0 text-[1.5rem] text-[#ccc] transition-colors duration-200 hover:text-[#333]"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div>
                                    <div className="mb-5">
                                        <label
                                            htmlFor="advanced-instructions"
                                            className="mb-2 block text-left text-[0.85rem] font-semibold text-[#555]"
                                        >
                                            {t("ppt_generator.upload.advanced.instructions.label")}
                                        </label>
                                        <Textarea
                                            id="advanced-instructions"
                                            value={advancedDraft.instructions}
                                            autoFocus={true}
                                            rows={4}
                                            onChange={(event) =>
                                                setAdvancedDraft((prev) => ({ ...prev, instructions: event.target.value }))
                                            }
                                            placeholder={t("ppt_generator.upload.advanced.instructions.placeholder")}
                                            className="min-h-[112px] w-full resize-none rounded-[var(--radius-md)] border-2 border-[#f0f0f0] bg-[#f9f9f9] px-4 py-3 text-[0.95rem] text-[#333] shadow-none outline-none transition-all duration-200 placeholder:text-[#999] focus-visible:border-[var(--primary-color)] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[rgba(0,123,85,0.1)] focus-visible:ring-offset-0"
                                        />
                                    </div>

                                    <div className="mb-5">
                                        <label className="mb-2 block text-left text-[0.85rem] font-semibold text-[#555]">
                                            {t("ppt_generator.upload.advanced.tone")}
                                        </label>
                                        <Select
                                            value={advancedDraft.tone}
                                            onValueChange={(value) =>
                                                setAdvancedDraft((prev) => ({ ...prev, tone: value as ToneType }))
                                            }
                                        >
                                            <SelectTrigger className="h-auto w-full rounded-[var(--radius-md)] border-2 border-[#f0f0f0] bg-[#f9f9f9] px-4 py-3 text-[0.95rem] font-normal capitalize text-[#333] shadow-none outline-none transition-all duration-200 focus:ring-0 focus-visible:border-[var(--primary-color)] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[rgba(0,123,85,0.1)] focus-visible:ring-offset-0">
                                                <SelectValue placeholder={t("ppt_generator.upload.advanced.tone.placeholder")} />
                                            </SelectTrigger>
                                            <SelectContent className="z-[120]">
                                                {Object.values(ToneType).map((tone) => (
                                                    <SelectItem key={tone} value={tone} className="text-sm font-medium capitalize">
                                                        {tone}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="mb-5">
                                        <label className="mb-2 block text-left text-[0.85rem] font-semibold text-[#555]">
                                            {t("ppt_generator.upload.advanced.verbosity")}
                                        </label>
                                        <Select
                                            value={advancedDraft.verbosity}
                                            onValueChange={(value) =>
                                                setAdvancedDraft((prev) => ({ ...prev, verbosity: value as VerbosityType }))
                                            }
                                        >
                                            <SelectTrigger className="h-auto w-full rounded-[var(--radius-md)] border-2 border-[#f0f0f0] bg-[#f9f9f9] px-4 py-3 text-[0.95rem] font-normal capitalize text-[#333] shadow-none outline-none transition-all duration-200 focus:ring-0 focus-visible:border-[var(--primary-color)] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[rgba(0,123,85,0.1)] focus-visible:ring-offset-0">
                                                <SelectValue placeholder={t("ppt_generator.upload.advanced.verbosity.placeholder")} />
                                            </SelectTrigger>
                                            <SelectContent className="z-[120]">
                                                {Object.values(VerbosityType).map((verbosity) => (
                                                    <SelectItem key={verbosity} value={verbosity} className="text-sm font-medium capitalize">
                                                        {verbosity}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="mb-5 flex items-center justify-between gap-4 rounded-[var(--radius-md)] border-2 border-[#f0f0f0] bg-[#f9f9f9] px-4 py-3">
                                        <label className="text-left text-[0.85rem] font-semibold text-[#555]">
                                            {t("ppt_generator.upload.advanced.includeToc")}
                                        </label>
                                        <Switch
                                            checked={advancedDraft.includeTableOfContents}
                                            onCheckedChange={(checked) =>
                                                setAdvancedDraft((prev) => ({ ...prev, includeTableOfContents: checked }))
                                            }
                                            className={toggleClassName}
                                        />
                                    </div>

                                    <div className="mb-0 flex items-center justify-between gap-4 rounded-[var(--radius-md)] border-2 border-[#f0f0f0] bg-[#f9f9f9] px-4 py-3">
                                        <label className="text-left text-[0.85rem] font-semibold text-[#555]">
                                            {t("ppt_generator.upload.advanced.includeTitle")}
                                        </label>
                                        <Switch
                                            checked={advancedDraft.includeTitleSlide}
                                            onCheckedChange={(checked) =>
                                                setAdvancedDraft((prev) => ({ ...prev, includeTitleSlide: checked }))
                                            }
                                            className={toggleClassName}
                                        />
                                    </div>

                                    <div className="mt-[30px] flex justify-end gap-3">
                                        <button
                                            type="button"
                                            className="cursor-pointer rounded-[10px] border-none bg-[#f0f0f0] px-5 py-2.5 font-semibold text-[#666] transition-colors duration-200 hover:bg-[#e0e0e0]"
                                            onClick={handleCloseAdvanced}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            className="cursor-pointer rounded-[10px] border-none bg-[var(--primary-color)] px-6 py-2.5 font-semibold text-white shadow-[0_4px_12px_rgba(0,123,85,0.2)] transition-all duration-200 hover:bg-[#006644] hover:-translate-y-px"
                                            onClick={handleSaveAdvanced}
                                        >
                                            {t("ppt_generator.upload.advanced.save")}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )
            : null;

    return (
        <>
            <div className="ml-auto">
                <ToolTip content={t("ppt_generator.upload.advanced.tooltip")}>
                    <button
                        aria-label={t("ppt_generator.upload.advanced.tooltip")}
                        title={t("ppt_generator.upload.advanced.tooltip")}
                        type="button"
                        onClick={handleOpenAdvanced}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(0,123,85,0.16)] bg-white/92 px-4 text-[#1C1C27] shadow-sm transition hover:bg-[#F7F7FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,123,85,0.18)]"
                        data-testid="advanced-settings-button"
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5 text-[#007B55]" aria-hidden="true" />
                        <span className="text-sm font-semibold leading-none">
                            {t("ppt_generator.upload.advanced.title")}
                        </span>
                    </button>
                </ToolTip>
            </div>
            {advancedDialog}
        </>
    );
};

export default AdvanceSettings;

