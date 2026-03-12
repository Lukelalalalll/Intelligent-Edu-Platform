import React, { useState, useEffect, useRef, useCallback } from 'react';
import AIInteract from '../pages/AIInteract'; // 确保路径对应你的 UI 组件

export default function AIInteractEntry() {
    const [sessions, setSessions] = useState(() => {
        const saved = localStorage.getItem('hku_ai_sessions');
        return saved ? JSON.parse(saved) : [];
    });
    const [currentSessionId, setCurrentSessionId] = useState(() => {
        return localStorage.getItem('hku_ai_current_id') || null;
    });
    const [inputText, setInputText] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [modalConfig, setModalConfig] = useState({ show: false, sessionId: null });
    const [toastVisible, setToastVisible] = useState(false);

    const chatMessagesRef = useRef(null);
    const inputRef = useRef(null);

    // 自动滚动到底部
    useEffect(() => {
        if (chatMessagesRef.current) {
            chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
    }, [sessions]);

    useEffect(() => {
        if (sessions.length === 0) createNewSession(true);
        else if (!currentSessionId || !sessions.find(s => s.id === currentSessionId)) {
            setCurrentSessionId(sessions[0].id);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('hku_ai_sessions', JSON.stringify(sessions));
        localStorage.setItem('hku_ai_current_id', currentSessionId);
    }, [sessions, currentSessionId]);

    const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];

    const createNewSession = (switchImmediately = true, forceId = null) => {
        if (forceId) { setCurrentSessionId(forceId); return; }
        const newSession = {
            id: 'session_' + Date.now(),
            title: 'New Conversation',
            messages: [{ role: "system", content: "You are a helpful academic AI assistant for HKU." }]
        };
        setSessions(prev => [newSession, ...prev]);
        if (switchImmediately) setCurrentSessionId(newSession.id);
    };

    const deleteSession = (e, id) => { e.stopPropagation(); setModalConfig({ show: true, sessionId: id }); };

    const confirmDelete = () => {
        const idToDelete = modalConfig.sessionId;
        const newSessions = sessions.filter(s => s.id !== idToDelete);
        if (newSessions.length === 0) createNewSession(true);
        else {
            setSessions(newSessions);
            if (currentSessionId === idToDelete) setCurrentSessionId(newSessions[0].id);
        }
        setModalConfig({ show: false, sessionId: null });
    };

    const handleSend = async () => {
        // 🚨 修复：防止双重触发（回车+点击）导致状态错乱
        if (isTyping) return;

        let targetId = currentSessionId;
        if (!targetId && sessions.length > 0) {
            targetId = sessions[0].id;
            setCurrentSessionId(targetId);
        }

        if (!inputText.trim() || !targetId) return;

        const textToSend = inputText.trim();
        setInputText("");
        if (inputRef.current) inputRef.current.style.height = 'auto';
        setIsTyping(true);

        // 🚨 修复：将“用户消息”和“AI占位符”在同一次 State 更新中完成，杜绝闭包陷阱
        setSessions(prev => prev.map(s => {
            if (s.id === targetId) {
                let newTitle = s.title;
                if (s.messages.length <= 1) newTitle = textToSend.length > 20 ? textToSend.substring(0, 20) + '...' : textToSend;
                const newMessages = [...s.messages, { role: "user", content: textToSend }, { role: "assistant", content: "" }];
                return { ...s, title: newTitle, messages: newMessages };
            }
            return s;
        }));

        try {
            const currentSess = sessions.find(s => s.id === targetId);
            const messagesForAPI = currentSess ? [...currentSess.messages, { role: "user", content: textToSend }] : [];

            const response = await fetch('http://localhost:5009/api/ai/chat', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: messagesForAPI.filter(m => m.role !== 'system' || messagesForAPI.length < 5) })
            });

            if (!response.ok) {
                setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...s.messages.slice(0,-1), { role: "assistant", content: `API Error: ${response.status}` }] } : s));
                setIsTyping(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let aiFullResponse = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const dataStr = trimmed.replace('data: ', '');
                    if (dataStr === '[DONE]') continue;

                    try {
                        const dataObj = JSON.parse(dataStr);
                        if (dataObj.error) aiFullResponse += `\n\n**[Error]**: ${dataObj.error}`;
                        else if (dataObj.choices?.[0]?.delta?.content !== undefined) {
                            aiFullResponse += dataObj.choices[0].delta.content;
                        }

                        // 每次收到字就安全更新
                        setSessions(prevSessions => prevSessions.map(s => {
                            if (s.id !== targetId) return s;
                            const newMsgs = [...s.messages];
                            newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], content: aiFullResponse };
                            return { ...s, messages: newMsgs };
                        }));
                    } catch (e) { /* ignore parse error */ }
                }
            }
        } catch (error) {
            setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...s.messages.slice(0,-1), { role: "assistant", content: `Network Error: ${error.message}` }] } : s));
        } finally {
            setIsTyping(false);
        }
    };

    const handleInput = (e) => {
        setInputText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const showToast = useCallback(() => { setToastVisible(true); setTimeout(() => setToastVisible(false), 2500); }, []);

    const copyToClipboard = useCallback((text, buttonEl = null) => {
        navigator.clipboard.writeText(text).then(showToast).catch(() => {
            const textArea = document.createElement("textarea");
            textArea.value = text; document.body.appendChild(textArea); textArea.select();
            document.execCommand("copy"); document.body.removeChild(textArea); showToast();
        });
        if (buttonEl) {
            const originalHtml = buttonEl.innerHTML;
            buttonEl.innerHTML = `<i class="fas fa-check" style="color:#27c93f;"></i> Copied!`;
            setTimeout(() => { if (buttonEl) buttonEl.innerHTML = originalHtml; }, 2000);
        }
    }, [showToast]);

    const handleChatAreaClick = useCallback((e) => {
        const copyBtn = e.target.closest('.js-code-copy-btn');
        if (copyBtn) copyToClipboard(decodeURIComponent(copyBtn.getAttribute('data-code')), copyBtn);
    }, [copyToClipboard]);

    const pageProps = {
        sessions, currentSessionId, inputText, isTyping, modalConfig, toastVisible,
        chatMessagesRef, inputRef, createNewSession, deleteSession, confirmDelete,
        setModalConfig, handleInput, handleKeyDown, handleSend, copyToClipboard, handleChatAreaClick
    };

    return <AIInteract {...pageProps} />;
}