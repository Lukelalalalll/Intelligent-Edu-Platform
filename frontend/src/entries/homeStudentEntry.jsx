import React, { useState, useEffect, useRef } from 'react';
import HomeStudentPage from '../pages/HomeStudent';

export default function HomeStudentEntry() {
    // 1. 获取登录用户信息
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const username = user.username || 'Student';

    // 2. 作业模块状态
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedCourse, setSelectedCourse] = useState('Select Course');
    const [uploadedFiles, setUploadedFiles] = useState({});

    // 3. AI 聊天模块状态
    const [messages, setMessages] = useState([
        { id: 1, sender: 'ai', text: `Hello ${username}! I am your AI Assistant. Do you have any questions about your courses or assignments today?` }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const chatMessagesRef = useRef(null);

    // 自动滚动到最新消息
    useEffect(() => {
        if (chatMessagesRef.current) {
            chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // 全屏时禁止底层滚动
    useEffect(() => {
        document.body.style.overflow = isFullscreen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isFullscreen]);

    // --- 事件处理函数 ---
    const handlers = {
        handleCourseSelect: (courseName, shortCode) => {
            setSelectedCourse(shortCode);
            setCurrentStep(2);
        },
        handleFileUpload: (e, assignmentName) => {
            const file = e.target.files[0];
            if (file) {
                setUploadedFiles(prev => ({ ...prev, [assignmentName]: file.name }));
            }
        },
        handleBackToCourses: () => {
            setCurrentStep(1);
            setSelectedCourse('Select Course');
        },
        handleInputResize: (e) => {
            setChatInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) + 'px';
        },
        handleSendMessage: () => {
            if (!chatInput.trim()) return;
            const text = chatInput;
            setChatInput('');

            // 恢复文本框高度
            const textarea = document.querySelector(`.${styles?.geminiInput || 'geminiInput'}`);
            if (textarea) textarea.style.height = 'auto';

            setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text }]);
            setIsTyping(true);

            // 模拟 AI 回复 (未来可替换为实际 API 调用)
            setTimeout(() => {
                setIsTyping(false);
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    sender: 'ai',
                    text: `I am analyzing your course materials regarding: '${text}'. This is a simulated response.`
                }]);
            }, 1500);
        },
        handleKeyDown: (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlers.handleSendMessage();
            }
        },
        toggleFullscreen: () => setIsFullscreen(!isFullscreen)
    };

    const states = {
        username, currentStep, selectedCourse, uploadedFiles,
        messages, chatInput, isTyping, isFullscreen, chatMessagesRef
    };

    return <HomeStudentPage {...states} handlers={handlers} />;
}