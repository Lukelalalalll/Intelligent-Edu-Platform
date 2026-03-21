import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import client from '../../api/client';
import QuickProcessPage from '../../pages/sub1/QuickProcess';

export default function QuickProcessEntry() {
    const navigate = useNavigate();
    const [contentLoading, setContentLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [sections, setSections] = useState([]);
    const [currentFilename, setCurrentFilename] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const [formState, setFormState] = useState({
        totalPages: 0,
        numOfBullets: 3,
        wordsEachBullet: 15,
        generateTalkingScript: false,
        scriptStyle: 'academic',
        presentationTitle: '',
        generateWordDocument: true
    });

    const [results, setResults] = useState(null);
    const [talkingScriptResult, setTalkingScriptResult] = useState(null);

    useEffect(() => {
        const fetchContent = async () => {
            const filename = localStorage.getItem('combinedFilename');
            if (!filename) { navigate('/sub1/md-processor'); return; }
            setCurrentFilename(filename);

            try {
                const res = await client.get(`/sub1/download/${filename}`, { responseType: 'text' });
                // 使用 marked 解析 HTML 以便在左侧预览
                const html = marked.parse(res.data);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');

                const parsed = Array.from(headings).map((h) => {
                    let content = '';
                    let curr = h.nextElementSibling;
                    while (curr && !['H1','H2','H3','H4','H5','H6'].includes(curr.tagName)) {
                        content += curr.outerHTML;
                        curr = curr.nextElementSibling;
                    }
                    return { title: h.textContent, content };
                });

                setSections(parsed);
                setFormState(prev => ({
                    ...prev,
                    totalPages: parsed.length,
                    presentationTitle: filename.replace(/\.[^/.]+$/, "") + " - Script"
                }));
            } catch { setErrorMsg('Failed to load content'); }
            finally { setContentLoading(false); }
        };
        fetchContent();
    }, [navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formState.totalPages < sections.length || formState.totalPages > sections.length * 3) {
            setErrorMsg(`Invalid page count. Must be between ${sections.length} and ${sections.length * 3}.`);
            return;
        }

        setLoading(true); setErrorMsg('');
        try {
            // 调用后端全自动总结接口
            const res = await client.post('/sub1/summarize_in_chapters', {
                chapterData: sections.map(s => ({ sectionTitle: s.title, text: s.content })),
                total_pages: Number(formState.totalPages),
                num_of_bullets: Number(formState.numOfBullets),
                words_each_bullet: Number(formState.wordsEachBullet)
            });

            if (res.data.status === 'success') {
                const slideResults = res.data.results;
                setResults(slideResults);

                // 保存 Schema
                const schema = {
                    presentation_title: currentFilename.replace(/\.[^/.]+$/, ""),
                    slides: slideResults.map(s => ({ ...s, content: s.content || [], tables: [] })),
                    metadata: { date: new Date().toISOString().split('T')[0] }
                };
                localStorage.setItem('ppt_schema', JSON.stringify(schema));

                if (formState.generateTalkingScript) {
                    const scriptRes = await client.post('/sub1/generate_talking_script', {
                        slides_results: slideResults,
                        script_style: formState.scriptStyle,
                        presentation_title: formState.presentationTitle,
                        generate_word: true
                    });
                    setTalkingScriptResult(scriptRes.data);
                }
            }
        } catch { setErrorMsg('Generation failed'); }
        finally { setLoading(false); }
    };

    const handleDownloadScript = async (e, url, name) => {
        e.preventDefault();
        const res = await client.get(url, { responseType: 'blob' });
        const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = blobUrl; link.setAttribute('download', name);
        document.body.appendChild(link); link.click(); link.remove();
    };

    return <QuickProcessPage
        loading={loading} contentLoading={contentLoading} sections={sections}
        formState={formState} setFormState={setFormState}
        maxAllowedPages={sections.length * 3} totalChapters={sections.length}
        errorMsg={errorMsg} results={results} talkingScriptResult={talkingScriptResult}
        handleSubmit={handleSubmit} handleProceed={() => navigate('/sub1/ppt-template')}
        handleDownloadScript={handleDownloadScript}
    />;
}