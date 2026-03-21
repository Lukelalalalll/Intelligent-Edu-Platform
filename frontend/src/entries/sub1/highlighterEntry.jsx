// frontend/src/entries/sub1/highlighterEntry.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import client from '../../api/client';
import HighlighterPage from '../../pages/sub1/Highlighter';

export default function HighlighterEntry() {
    const navigate = useNavigate();
    const markdownViewRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [statusMsg, setStatusMsg] = useState('');

    const [currentFilename, setCurrentFilename] = useState('');
    const [sections, setSections] = useState([]);
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [isRenderedView, setIsRenderedView] = useState(true);
    const [htmlContent, setHtmlContent] = useState('');

    const [highlights, setHighlights] = useState([]);
    const highlightIdCounter = useRef(0);

    // 1. 初始化拉取数据
    useEffect(() => {
        const fetchFile = async () => {
            const combinedFilename = localStorage.getItem('combinedFilename');
            if (!combinedFilename) {
                setErrorMsg('No combined file found.');
                setLoading(false);
                return;
            }

            try {
                const response = await client.get(`/sub1/download/${combinedFilename}`, {
                    responseType: 'text'
                });

                console.log("DEBUG: Raw file data received:", response.data);

                const markdown = response.data;
                if (!markdown || markdown.length === 0) {
                    throw new Error("File content is empty");
                }

                setCurrentFilename(combinedFilename);
                const parsedSections = parseSections(markdown);
                console.log("DEBUG: Parsed sections count:", parsedSections.length);

                if (parsedSections.length > 0) {
                    setSections(parsedSections);
                    setErrorMsg('');
                    renderContent(parsedSections[0], isRenderedView);
                } else {
                    setErrorMsg("Could not parse any sections. Please check MD format.");
                }
            } catch (error) {
                console.error("Fetch Error:", error);
                setErrorMsg('Error loading file: ' + error.message);
            } finally {
                setLoading(false);
            }
        };
        fetchFile();
    }, []);


    const parseSections = (markdown) => {
        if (!markdown) return [];

        // 🌟 只认后端给的强分隔符
        const rawChunks = String(markdown).split('===SECTION_BREAK===');

        return rawChunks.map(chunk => {
            const lines = chunk.trim().split(/\r?\n/);
            if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) return null;

            // 第一行是我们手动塞的标题，去掉可能存在的 #
            const title = lines[0].replace(/^#+\s*/, '').trim();
            // 剩下的全部作为正文内容
            const content = lines.slice(1).join('\n').trim();

            return { title, content };
        }).filter(item => item !== null);
    };

    // 3. 渲染内容
    const renderContent = (section, rendered) => {
        if (!section) return;
        if (rendered) {
            const rawHtml = marked.parse(section.content || "");
            const cleanHtml = DOMPurify.sanitize(rawHtml);
            setHtmlContent(cleanHtml);
        } else {
            setHtmlContent(section.content);
        }
        setTimeout(applyHighlights, 100);
    };

    const showSection = (index) => {
        setCurrentSectionIndex(index);
        renderContent(sections[index], isRenderedView);
    };

    const toggleView = () => {
        const newView = !isRenderedView;
        setIsRenderedView(newView);
        renderContent(sections[currentSectionIndex], newView);
    };

    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection();
        if (selection.isCollapsed || !markdownViewRef.current) return;
        const selectedText = selection.toString().trim();
        if (selectedText.length === 0) return;
        const range = selection.getRangeAt(0);
        const existingHighlights = markdownViewRef.current.querySelectorAll('.highlighted');
        for (let i = 0; i < existingHighlights.length; i++) {
            if (range.intersectsNode(existingHighlights[i])) {
                selection.removeAllRanges();
                return;
            }
        }
        const id = 'highlight-' + highlightIdCounter.current++;
        let rootNode = range.commonAncestorContainer;
        if (rootNode.nodeType === Node.TEXT_NODE) rootNode = rootNode.parentNode;
        try {
            const treeWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
            });
            const textNodes = [];
            let currentNode = treeWalker.nextNode();
            while (currentNode) { textNodes.push(currentNode); currentNode = treeWalker.nextNode(); }
            if (textNodes.length === 0) { selection.removeAllRanges(); return; }
            textNodes.forEach(textNode => {
                let startOffset = 0;
                let endOffset = textNode.nodeValue.length;
                if (textNode === range.startContainer) startOffset = range.startOffset;
                if (textNode === range.endContainer) endOffset = range.endOffset;
                if (startOffset === endOffset) return;
                const extractedText = textNode.nodeValue.substring(startOffset, endOffset);
                if (extractedText.trim().length === 0 && textNodes.length > 1) return;
                const span = document.createElement('span');
                span.className = 'highlighted';
                span.dataset.id = id;
                span.textContent = extractedText;
                span.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeHighlight(id);
                });
                const subRange = document.createRange();
                subRange.setStart(textNode, startOffset);
                subRange.setEnd(textNode, endOffset);
                subRange.deleteContents();
                subRange.insertNode(span);
            });
            const currentTitle = sections[currentSectionIndex]?.title || 'Unknown Section';
            setHighlights(prev => [...prev, { id, text: selectedText, sectionTitle: currentTitle }]);
        } catch (e) {
            console.warn('Highlight failed:', e);
        }
        selection.removeAllRanges();
    }, [sections, currentSectionIndex]);

    useEffect(() => {
        const view = markdownViewRef.current;
        if (view) {
            view.addEventListener('mouseup', handleTextSelection);
            return () => view.removeEventListener('mouseup', handleTextSelection);
        }
    }, [handleTextSelection, htmlContent]);

    const removeHighlight = (id) => {
        if (!markdownViewRef.current) return;
        const els = markdownViewRef.current.querySelectorAll(`.highlighted[data-id="${id}"]`);
        els.forEach(el => el.classList.add('un-highlighting'));
        setTimeout(() => {
            els.forEach(el => {
                if (el.parentNode) {
                    const textNode = document.createTextNode(el.textContent);
                    el.parentNode.replaceChild(textNode, el);
                }
            });
            markdownViewRef.current.normalize();
        }, 400);
        setHighlights(prev => prev.filter(h => h.id !== id));
    };

    const applyHighlights = () => {
        if (!markdownViewRef.current) return;
        const existingHighlights = markdownViewRef.current.querySelectorAll('.highlighted');
        existingHighlights.forEach(el => {
            const textNode = document.createTextNode(el.textContent);
            el.parentNode.replaceChild(textNode, el);
        });
        if (existingHighlights.length > 0) markdownViewRef.current.normalize();
    };

    const saveHighlights = async () => {
        if (highlights.length === 0) {
            setStatusMsg('No highlights to save');
            setTimeout(() => setStatusMsg(''), 2000);
            return;
        }
        const organizedData = sections.map(sec => ({
            sectionTitle: sec.title,
            highlights: highlights.filter(h => h.sectionTitle === sec.title).map(h => ({ text: h.text, id: h.id }))
        })).filter(sec => sec.highlights.length > 0);
        try {
            await client.post('/sub1/save_highlights', {
                filename: currentFilename,
                highlights: organizedData
            });
            setStatusMsg('Highlights saved successfully!');
            localStorage.setItem('highlightsData', JSON.stringify(organizedData));
            setTimeout(() => navigate('/sub1/specify'), 1000);
        } catch (error) {
            setStatusMsg('Error saving highlights: ' + error.message);
            setTimeout(() => setStatusMsg(''), 2000);
        }
    };

    const currentSectionTitle = sections[currentSectionIndex]?.title || 'Unknown Section';

    return <HighlighterPage
        loading={loading} errorMsg={errorMsg} sections={sections}
        currentSectionIndex={currentSectionIndex} currentSectionTitle={currentSectionTitle}
        isRenderedView={isRenderedView} htmlContent={htmlContent}
        highlights={highlights} statusMsg={statusMsg}
        markdownViewRef={markdownViewRef}
        showSection={showSection} toggleView={toggleView}
        saveHighlights={saveHighlights} removeHighlight={removeHighlight}
    />;
}