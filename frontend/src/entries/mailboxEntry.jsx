import React, { useState } from 'react';
import MailboxPage from '../pages/Mailbox';

export default function MailboxEntry() {
    // 获取当前登录用户
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    // 向导状态机
    const [currentStep, setCurrentStep] = useState(1);

    // 保存用户的选择路径
    const [selections, setSelections] = useState({
        degree: '',
        course: '',
        assignment: ''
    });

    // 核心跳转函数：记录选择并推入下一步
    const handleSelection = (key, value, nextStep) => {
        setSelections(prev => ({ ...prev, [key]: value }));
        setCurrentStep(nextStep);
    };

    return (
        <MailboxPage
            currentStep={currentStep}
            selections={selections}
            setStep={setCurrentStep}
            setSelection={handleSelection}
            user={user}
        />
    );
}