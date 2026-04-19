// Highlighter.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import styles from './styles/highlighter.module.css';
import ReaderSection from './components/ReaderSection';
import HighlightsPanel from './components/HighlightsPanel';
import { log } from '@/shared/utils/logger';
import { injectHighlightsIntoHtml } from './utils/highlightUtils';
import WelcomeBanner from '../../../../shared/components/WelcomeBanner';
import useTextHighlighter from './hooks/useTextHighlighter';

export default function Highlighter({
    loading, sections, currentSectionIndex, currentSectionTitle,
    isRenderedView, htmlContent, highlights, statusMsg,
    markdownViewRef,
    showSection, toggleView, saveHighlights, removeHighlight,
    onHighlightCreated,
    classifyHighlights, classifying,
    categoryFilter, setCategoryFilter,
    removeByCategoryOrConfidence
}) {
    // 用 ref 追踪最新 highlights，避免 useEffect 依赖 highlights 导致无限重渲染
    const highlightsRef = useRef(highlights);
    useEffect(() => { highlightsRef.current = highlights; }, [highlights]);

    const textLength = htmlContent ? htmlContent.replace(/<[^>]+>/g, '').length : 0;
    const readTime = Math.max(1, Math.ceil(textLength / 250));

    // 核心：用数据驱动方式注入高亮后再设置 innerHTML
    useEffect(() => {
        if (!loading && isRenderedView && markdownViewRef.current) {
            const currentHighlights = (highlightsRef.current || []).filter(
                h => h.sectionTitle === currentSectionTitle
            );
            const injectedHtml = injectHighlightsIntoHtml(htmlContent, currentHighlights);
            markdownViewRef.current.innerHTML = injectedHtml;
        }
    }, [htmlContent, isRenderedView, loading, markdownViewRef, currentSectionTitle]);

    // 当 highlights 数组变化时（新增/删除），重新注入当前 Section 的高亮
    useEffect(() => {
        if (!loading && isRenderedView && markdownViewRef.current && htmlContent) {
            const currentHighlights = (highlights || []).filter(
                h => h.sectionTitle === currentSectionTitle
            );
            const injectedHtml = injectHighlightsIntoHtml(htmlContent, currentHighlights);
            markdownViewRef.current.innerHTML = injectedHtml;
        }
    }, [highlights, currentSectionTitle, loading, isRenderedView, markdownViewRef, htmlContent]);

    useEffect(() => {
        return () => {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    // ======== 统一高亮删除（只更新 state，DOM 由 useEffect 自动重渲染） ========
    const handleLocalRemoveHighlight = useCallback((id) => {
        // 先播放淡出动画
        if (markdownViewRef.current) {
            const els = markdownViewRef.current.querySelectorAll(`span.highlighted[data-id="${id}"]`);
            els.forEach(el => el.classList.add('un-highlighting'));
        }
        // 400ms 后从 state 移除（触发 useEffect 重渲染 DOM）
        setTimeout(() => {
            removeHighlight(id);
        }, 400);
    }, [removeHighlight, markdownViewRef]);

    // ======== 统一的高亮创建逻辑 ========
    const handleMouseUp = useTextHighlighter({
        isRenderedView,
        markdownViewRef,
        currentSectionTitle,
        onHighlightCreated
    });

    // ======== 增强工具函数 ========
    const scrollToHighlight = useCallback((id) => {
        if (!markdownViewRef.current || !isRenderedView) return;
        const el = markdownViewRef.current.querySelector(`span.highlighted[data-id="${id}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.animate([
                { boxShadow: '0 0 0 0px rgba(0, 184, 217, 0)' },
                { boxShadow: '0 0 0 10px rgba(0, 184, 217, 0.4)' },
                { boxShadow: '0 0 0 0px rgba(0, 184, 217, 0)' }
            ], { duration: 1500 });
        }
    }, [isRenderedView, markdownViewRef]);

    const exportHighlights = useCallback(() => {
        if (!highlights || highlights.length === 0) return;
        const grouped = highlights.reduce((acc, curr) => {
            (acc[curr.sectionTitle] = acc[curr.sectionTitle] || []).push(curr.text);
            return acc;
        }, {});
        let content = `# Learning Notes - ${new Date().toLocaleDateString()}\n\n`;
        for (const [sec, texts] of Object.entries(grouped)) {
            content += `## Section: ${sec}\n${(texts as string[]).map(t => `> ${t}`).join('\n\n')}\n\n`;
        }
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Highlights_Notes.md`;
        a.click();
    }, [highlights]);

    return (
        <div className="container">
            <style>{`
                .stats-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 1.5rem; flex-wrap: wrap; }
                .stats-tag {
                    display: inline-flex; align-items: center; gap: 6px;
                    background: rgba(0, 123, 85, 0.04); color: var(--primary-color);
                    padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 700;
                    border: 1px solid rgba(0, 123, 85, 0.1);
                }
                .search-box-container { position: relative; margin-bottom: 16px; width: 100%; }
                .search-box-icon { 
                    position: absolute; left: 16px; top: 50%; 
                    transform: translateY(-50%); color: #00B8D9; 
                    z-index: 5; pointer-events: none; 
                }
                .search-box-input {
                    width: 100%; 
                    padding: 12px 16px 12px 48px !important;
                    border-radius: 10px; border: 1.5px solid rgba(0, 184, 217, 0.1);
                    background: #fcfcfc; font-size: 0.9rem; transition: all 0.3s;
                }
                .search-box-input:focus { border-color: #00B8D9; background: #fff; box-shadow: 0 4px 12px rgba(0, 184, 217, 0.08); outline: none; }
                .item-actions { display: flex; gap: 6px; }
                .tool-btn {
                    width: 30px; height: 30px; border-radius: 6px; border: none; background: #f5f5f5;
                    color: #777; cursor: pointer; display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s;
                }
                .tool-btn:hover { background: #00B8D9; color: #fff; transform: translateY(-2px); }
            `}</style>

            <WelcomeBanner
                title="Markdown Highlighter"
                subtitle="Read, highlight, and manage key concepts from your documents"
            />

            <div className={styles.workspaceGrid}>
                <ReaderSection
                    loading={loading}
                    sections={sections}
                    currentSectionIndex={currentSectionIndex}
                    currentSectionTitle={currentSectionTitle}
                    isRenderedView={isRenderedView}
                    htmlContent={htmlContent}
                    textLength={textLength}
                    readTime={readTime}
                    markdownViewRef={markdownViewRef}
                    showSection={showSection}
                    toggleView={toggleView}
                    handleMouseUp={handleMouseUp}
                />

                <HighlightsPanel
                    statusMsg={statusMsg}
                    saveHighlights={saveHighlights}
                    exportHighlights={exportHighlights}
                    scrollToHighlight={scrollToHighlight}
                    handleLocalRemoveHighlight={handleLocalRemoveHighlight}
                    classifyHighlights={classifyHighlights}
                    classifying={classifying}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={setCategoryFilter}
                    removeByCategoryOrConfidence={removeByCategoryOrConfidence}
                    highlights={highlights}
                />
            </div>
        </div>
    );
}