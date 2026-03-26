import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import PptTemplatePage from '../../pages/sub1/PptTemplate';

export default function PptTemplateEntry() {
    const navigate = useNavigate();
    const [themes, setThemes] = useState([]);
    const [selectedTheme, setSelectedTheme] = useState(null);
    const [pptSchema, setPptSchema] = useState(null);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [layouts, setLayouts] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoadingSchema, setIsLoadingSchema] = useState(true);

    // 1. 初始化加载 Schema
    useEffect(() => {
        const init = async () => {
            setErrorMsg('');
            try {
                const saved = localStorage.getItem('ppt_schema');
                if (saved) {
                    const schema = JSON.parse(saved);
                    if (!schema || !Array.isArray(schema.slides) || schema.slides.length === 0) {
                        setErrorMsg('No valid slide schema found. Please finish previous steps first.');
                    } else {
                        // 确保每个 slide 都有 original_text (从 highlights 或 chapterData 补齐)
                        const chapterData = JSON.parse(localStorage.getItem('chapterData') || '[]');
                        schema.slides = schema.slides.map(slide => ({
                            ...slide,
                            original_text: chapterData.find(c => c.sectionTitle === slide.title)?.text || ''
                        }));
                        setPptSchema(schema);
                        if (schema.theme) setSelectedTheme(schema.theme);
                    }
                } else {
                    setErrorMsg('No PPT schema found. Please generate content first.');
                }

                // 获取主题
                const res = await client.get('/sub1/get_themes');
                const fetchedThemes = Array.isArray(res.data) ? res.data : [];
                setThemes(fetchedThemes);
            } catch (err) {
                setErrorMsg(err?.response?.data?.detail || err?.message || 'Failed to initialize PPT template page.');
            } finally {
                setIsLoadingSchema(false);
            }
        };

        init();
    }, []);

    // 2. 当主题改变，拉取对应的 Layouts
    useEffect(() => {
        if (selectedTheme) {
            client.get(`/sub1/get_placeholders/${selectedTheme}`).then(res => {
                const placeholders = Array.isArray(res.data) ? res.data : [];
                const filtered = placeholders.filter(l => !['Title', 'Catalogue', 'Ending'].includes(l.name));
                setLayouts(filtered);
            }).catch(err => {
                setLayouts([]);
                setErrorMsg(err?.response?.data?.detail || err?.message || 'Failed to load layouts for selected theme.');
            });
        }
    }, [selectedTheme]);

    const handlers = {
        selectTheme: (name) => {
            setSelectedTheme(name);
            setPptSchema(prev => {
                if (!prev) return prev;
                const updated = { ...prev, theme: name };
                localStorage.setItem('ppt_schema', JSON.stringify(updated));
                return updated;
            });
        },
        setCurrentSlideIndex,
        selectLayout: (layout) => {
            const newSchema = { ...pptSchema };
            newSchema.slides[currentSlideIndex].layout = { name: layout.name, placeholders: layout.placeholders };
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        applyLayoutToAll: () => {
            const currentLayout = pptSchema.slides[currentSlideIndex].layout;
            if (!currentLayout) return alert("Select a layout first!");
            const newSchema = { ...pptSchema };
            newSchema.slides.forEach(s => s.layout = currentLayout);
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        generatePpt: async () => {
            setIsGenerating(true);
            setErrorMsg('');
            try {
                const res = await client.post('/sub1/generate_ppt', { ppt_schema: pptSchema });
                if (res.data.status === 'success') {
                    // 触发下载
                    const fileRes = await client.get(res.data.download_url, { responseType: 'blob' });
                    const url = window.URL.createObjectURL(new Blob([fileRes.data]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', 'presentation.pptx');
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                }
            } catch (err) {
                setErrorMsg(err?.response?.data?.detail || err?.message || 'Generation failed');
            } finally {
                setIsGenerating(false);
            }
        }
    };

    if (isLoadingSchema) return <div>Loading Data...</div>;

    if (!pptSchema) {
        return (
            <div className="container" style={{ paddingTop: '2rem' }}>
                <div className="alert alert-warning">
                    <strong>PPT schema is missing.</strong>
                    <div style={{ marginTop: '0.5rem' }}>{errorMsg || 'Please generate slides in previous steps before entering this page.'}</div>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/sub1/specify')}>
                    Back to Specify
                </button>
            </div>
        );
    }

    return <PptTemplatePage
        states={{ themes, selectedTheme, pptSchema, currentSlideIndex, layouts, isGenerating, errorMsg }}
        handlers={handlers}
    />;
}