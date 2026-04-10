import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import PptTemplatePage from '../../features/slides/pages/PptTemplatePage';
import {
    slidesDeliveryApi,
    type DeliveryArtifactType,
} from '../../api/slidesDeliveryApi';

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
    const [deliveryJobId, setDeliveryJobId] = useState('');
    const [deliveryActiveTab, setDeliveryActiveTab] = useState<DeliveryArtifactType>('agenda');
    const [deliveryLoading, setDeliveryLoading] = useState(false);
    const [deliveryError, setDeliveryError] = useState('');
    const [deliveryArtifacts, setDeliveryArtifacts] = useState<Partial<Record<DeliveryArtifactType, unknown>>>({});

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
                const res = await client.get('/slides/get_themes');
                const fetchedThemes = Array.isArray(res.data) ? res.data : [];
                setThemes(fetchedThemes);

                if (fetchedThemes.length > 0) {
                    setSelectedTheme((prev) => prev || fetchedThemes[0]?.name || null);
                }
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
            client.get(`/slides/get_placeholders/${selectedTheme}`).then(res => {
                const placeholders = Array.isArray(res.data) ? res.data : [];
                const filtered = placeholders.filter(l => !['Title', 'Catalogue', 'Ending'].includes(l.name));
                setLayouts(filtered);
            }).catch(err => {
                setLayouts([]);
                setErrorMsg(err?.response?.data?.detail || err?.message || 'Failed to load layouts for selected theme.');
            });
        }
    }, [selectedTheme]);

    const fetchDeliveryArtifact = async (jobId: string, tab: DeliveryArtifactType) => {
        setDeliveryLoading(true);
        setDeliveryError('');
        try {
            const res = await slidesDeliveryApi.getArtifact(jobId, tab);
            setDeliveryArtifacts((prev) => ({
                ...prev,
                [tab]: res.data,
            }));
        } catch (err) {
            setDeliveryError(err?.response?.data?.detail || err?.message || 'Failed to load delivery artifact.');
        } finally {
            setDeliveryLoading(false);
        }
    };

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
            const newSchema = {
                ...pptSchema,
                slides: pptSchema.slides.map((s, i) =>
                    i === currentSlideIndex
                        ? { ...s, layout: { name: layout.name, placeholders: layout.placeholders } }
                        : s
                )
            };
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        updateCurrentSlide: (patch) => {
            const newSchema = {
                ...pptSchema,
                slides: pptSchema.slides.map((s, i) =>
                    i === currentSlideIndex
                        ? { ...s, ...patch }
                        : s
                )
            };
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        updateCurrentSlideBullet: (bulletIndex, value) => {
            const current = pptSchema.slides[currentSlideIndex] || {};
            const currentBullets = Array.isArray(current.content) ? [...current.content] : [];
            currentBullets[bulletIndex] = value;
            const bullets = currentBullets.map((b) => String(b || '').trim()).filter((b) => b.length > 0);
            const newSchema = {
                ...pptSchema,
                slides: pptSchema.slides.map((s, i) => i === currentSlideIndex ? { ...s, content: bullets } : s),
            };
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        addCurrentSlideBullet: () => {
            const current = pptSchema.slides[currentSlideIndex] || {};
            const currentBullets = Array.isArray(current.content) ? [...current.content] : [];
            currentBullets.push('New bullet point');
            const newSchema = {
                ...pptSchema,
                slides: pptSchema.slides.map((s, i) => i === currentSlideIndex ? { ...s, content: currentBullets } : s),
            };
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        removeCurrentSlideBullet: (bulletIndex) => {
            const current = pptSchema.slides[currentSlideIndex] || {};
            const currentBullets = Array.isArray(current.content) ? [...current.content] : [];
            const next = currentBullets.filter((_, idx) => idx !== bulletIndex);
            const newSchema = {
                ...pptSchema,
                slides: pptSchema.slides.map((s, i) => i === currentSlideIndex ? { ...s, content: next } : s),
            };
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        reorderCurrentSlideBullets: (fromIndex, toIndex) => {
            const current = pptSchema.slides[currentSlideIndex] || {};
            const currentBullets = Array.isArray(current.content) ? [...current.content] : [];
            if (fromIndex < 0 || toIndex < 0 || fromIndex >= currentBullets.length || toIndex >= currentBullets.length) {
                return;
            }
            const [moved] = currentBullets.splice(fromIndex, 1);
            currentBullets.splice(toIndex, 0, moved);
            const newSchema = {
                ...pptSchema,
                slides: pptSchema.slides.map((s, i) => i === currentSlideIndex ? { ...s, content: currentBullets } : s),
            };
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        applyLayoutToAll: () => {
            const currentLayout = pptSchema.slides[currentSlideIndex]?.layout;
            if (!currentLayout) {
                setErrorMsg('Select a layout first!');
                setTimeout(() => setErrorMsg(''), 3000);
                return;
            }
            const newSchema = {
                ...pptSchema,
                slides: pptSchema.slides.map(s => ({ ...s, layout: currentLayout }))
            };
            setPptSchema(newSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(newSchema));
        },
        generatePpt: async () => {
            setIsGenerating(true);
            setErrorMsg('');
            try {
                const res = await client.post('/slides/generate_ppt', { ppt_schema: pptSchema });
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
        },
        generateDeliveryPack: async () => {
            if (!pptSchema) {
                setDeliveryError('No PPT schema found. Please generate slides first.');
                return;
            }

            setDeliveryLoading(true);
            setDeliveryError('');
            setDeliveryArtifacts({});
            try {
                const title = (pptSchema.presentation_title || 'Lesson Delivery Pack') as string;
                const jobRes = await slidesDeliveryApi.createJob({
                    title,
                    ppt_schema: pptSchema,
                    script_style: 'classroom',
                    locale: 'en',
                });

                setDeliveryJobId(jobRes.job_id);
                setDeliveryActiveTab('agenda');
                const agendaRes = await slidesDeliveryApi.getArtifact(jobRes.job_id, 'agenda');
                setDeliveryArtifacts({ agenda: agendaRes.data });
            } catch (err) {
                setDeliveryError(err?.response?.data?.detail || err?.message || 'Failed to generate delivery pack.');
            } finally {
                setDeliveryLoading(false);
            }
        },
        setDeliveryActiveTab: async (tab: DeliveryArtifactType) => {
            setDeliveryActiveTab(tab);
            if (!deliveryJobId || deliveryArtifacts[tab]) {
                return;
            }
            await fetchDeliveryArtifact(deliveryJobId, tab);
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
                <button className="btn btn-primary" onClick={() => navigate('/slides/specify')}>
                    Back to Specify
                </button>
            </div>
        );
    }

    return <PptTemplatePage
        states={{
            themes,
            selectedTheme,
            pptSchema,
            currentSlideIndex,
            layouts,
            isGenerating,
            errorMsg,
            deliveryJobId,
            deliveryActiveTab,
            deliveryLoading,
            deliveryError,
            deliveryArtifacts,
        }}
        handlers={handlers}
    />;
}