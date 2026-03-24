import React, { useState, useEffect } from 'react';
import client from '../../api/client';
import PptTemplatePage from '../../pages/sub1/PptTemplate';

export default function PptTemplateEntry() {
    const [themes, setThemes] = useState([]);
    const [selectedTheme, setSelectedTheme] = useState(null);
    const [pptSchema, setPptSchema] = useState(null);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [layouts, setLayouts] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);

    // 1. 初始化加载 Schema
    useEffect(() => {
        const saved = localStorage.getItem('ppt_schema');
        if (saved) {
            const schema = JSON.parse(saved);
            // 确保每个 slide 都有 original_text (从 highlights 或 chapterData 补齐)
            const chapterData = JSON.parse(localStorage.getItem('chapterData') || '[]');
            schema.slides = schema.slides.map(slide => ({
                ...slide,
                original_text: chapterData.find(c => c.sectionTitle === slide.title)?.text || ''
            }));
            setPptSchema(schema);
        }

        // 获取主题
        client.get('/sub1/get_themes').then(res => setThemes(res.data));
    }, []);

    // 2. 当主题改变，拉取对应的 Layouts
    useEffect(() => {
        if (selectedTheme) {
            client.get(`/sub1/get_placeholders/${selectedTheme}`).then(res => {
                const filtered = res.data.filter(l => !['Title', 'Catalogue', 'Ending'].includes(l.name));
                setLayouts(filtered);
            });
        }
    }, [selectedTheme]);

    const handlers = {
        selectTheme: (name) => {
            setSelectedTheme(name);
            setPptSchema(prev => ({ ...prev, theme: name }));
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
            try {
                const res = await client.post('/sub1/process-ppt', { ppt_schema: pptSchema });
                if (res.data.status === 'success') {
                    // 触发下载
                    const fileRes = await client.get(res.data.download_url, { responseType: 'blob' });
                    const url = window.URL.createObjectURL(new Blob([fileRes.data]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', 'presentation.pptx');
                    link.click();
                }
            } catch (e) {
                alert("Generation failed");
            } finally {
                setIsGenerating(false);
            }
        }
    };

    if (!pptSchema) return <div>Loading Data...</div>;

    return <PptTemplatePage
        states={{ themes, selectedTheme, pptSchema, currentSlideIndex, layouts, isGenerating }}
        handlers={handlers}
    />;
}