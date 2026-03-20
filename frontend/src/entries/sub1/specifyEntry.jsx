import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import SpecifyPage from '../../pages/sub1/Specify';

export default function SpecifyEntry() {
    const navigate = useNavigate();

    // --- State: Data ---
    const [highlightsData, setHighlightsData] = useState([]);
    const [currentTables, setCurrentTables] = useState([]);
    const [currentFilename, setCurrentFilename] = useState('');
    const [tablesBySection, setTablesBySection] = useState({});

    // --- State: Form ---
    const [formState, setFormState] = useState({
        numOfBullets: 3,
        wordsEachBullet: 15,
        selectedTables: [],
        generateTalkingScript: false,
        scriptStyle: 'academic',
        presentationTitle: '',
        generateWordDocument: true
    });

    // --- State: UI ---
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [results, setResults] = useState(null);
    const [talkingScriptResult, setTalkingScriptResult] = useState(null);

    // 1. 初始化数据
    useEffect(() => {
        const storedHighlights = JSON.parse(localStorage.getItem('highlightsData') || '[]');
        const storedTables = JSON.parse(localStorage.getItem('currentTables') || '[]');
        let storedFilename = localStorage.getItem('currentFilename') || '';

        // 处理存进去带引号的情况
        if (storedFilename.startsWith('"') && storedFilename.endsWith('"')) {
            storedFilename = storedFilename.slice(1, -1);
        }

        setHighlightsData(storedHighlights);
        setCurrentTables(storedTables);
        setCurrentFilename(storedFilename);

        setFormState(prev => ({
            ...prev,
            presentationTitle: storedFilename ? storedFilename.replace(/\.[^/.]+$/, "") + " - Script" : ''
        }));

        // 分组表格数据
        if (storedTables.length > 0 && storedHighlights.length > 0) {
            const selectedSections = new Set(storedHighlights.map(s => s.sectionTitle));
            const grouped = {};
            storedTables.forEach(t => {
                if (selectedSections.has(t.section_title)) {
                    if (!grouped[t.section_title]) grouped[t.section_title] = [];
                    grouped[t.section_title].push(t);
                }
            });
            setTablesBySection(grouped);
        }
    }, []);

    // 2. 表格复选框逻辑
    const handleCheckboxChange = (tableIndex) => {
        setFormState(prev => {
            const selected = prev.selectedTables;
            if (selected.includes(tableIndex)) {
                return { ...prev, selectedTables: selected.filter(id => id !== tableIndex) };
            } else {
                return { ...prev, selectedTables: [...selected, tableIndex] };
            }
        });
    };

    // 3. 构建发送给 PPT 的 Schema
    const createPptSchema = (slideResults) => {
        const fileNameWithoutExt = currentFilename ? currentFilename.replace(/\.[^/.]+$/, "") : "Presentation";
        const currentDate = new Date().toISOString().split('T')[0];

        // 匹配选中的表格数据
        const fullSelectedTables = [];
        formState.selectedTables.forEach(idx => {
            const tableData = currentTables.find(t => t.index === idx);
            if (tableData) fullSelectedTables.push(tableData);
        });

        const slidesWithTables = slideResults.map(slide => {
            const matchingTables = fullSelectedTables.filter(t => {
                const sTitle = slide.title.replace(/\s+/g, '');
                const tTitle = t.section_title.replace(/\s+/g, '');
                return sTitle.length > tTitle.length ? sTitle.includes(tTitle) : tTitle.includes(sTitle);
            });

            return {
                title: slide.title,
                content: slide.bullets || slide.content || [],
                slide_number: slide.slide_number || 0,
                latex: slide.latex || [],
                chart_type: slide.chart_type || '',
                chart_reasoning: slide.chart_reasoning || [],
                tables: matchingTables.map(t => ({ index: t.index, data: t.table }))
            };
        });

        return {
            presentation_title: fileNameWithoutExt,
            slides: slidesWithTables,
            metadata: { author: "", date: currentDate, description: "" }
        };
    };

    // 4. 表单提交 (生成幻灯片及脚本)
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);

        try {
            // 第一步：调用 summarize 生成幻灯片内容
            const sumRes = await client.post('/sub1/summarize', {
                highlights: highlightsData,
                num_of_bullets: Number(formState.numOfBullets),
                words_each_bullet: Number(formState.wordsEachBullet)
            });

            const slideResults = sumRes.data.results;

            // 保存 Schema 供后续 PPT 渲染页使用
            const pptSchema = createPptSchema(slideResults);
            localStorage.setItem('ppt_schema', JSON.stringify(pptSchema));

            // 第二步：如果勾选了生成脚本，则继续请求
            if (formState.generateTalkingScript) {
                const scriptRes = await client.post('/sub1/generate_talking_script', {
                    slides_results: slideResults,
                    script_style: formState.scriptStyle,
                    presentation_title: formState.presentationTitle,
                    generate_word: formState.generateWordDocument
                });
                setTalkingScriptResult(scriptRes.data);
            }

            setResults(slideResults);
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (error) {
            setErrorMsg(error.response?.data?.message || error.message || 'Generation failed');
        } finally {
            setLoading(false);
        }
    };

    const handleProceed = () => {
        navigate('/sub1/ppt-template'); // 跳转到最后一步
    };



    const handleDownloadScript = async (e, downloadUrl, filename) => {
        e.preventDefault();
        try {
            // 🌟 核心：使用封装好的 client 发起请求，确保带上 JWT Cookie
            const response = await client.get(downloadUrl, {
                responseType: 'blob', // 🌟 必须指定为二进制流
            });

            // 像旧项目 JS 那样，创建一个临时的 URL 并触发下载
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url); // 清理内存
        } catch (error) {
            console.error("Download failed:", error);
            alert("Failed to download script. Please try again.");
        }
    };

    return <SpecifyPage
        highlightsData={highlightsData}
        tablesBySection={tablesBySection}
        formState={formState}
        setFormState={setFormState}
        handleCheckboxChange={handleCheckboxChange}
        handleSubmit={handleSubmit}
        loading={loading}
        errorMsg={errorMsg}
        results={results}
        talkingScriptResult={talkingScriptResult}
        handleProceed={handleProceed}
        handleDownloadScript={handleDownloadScript}
    />;
}