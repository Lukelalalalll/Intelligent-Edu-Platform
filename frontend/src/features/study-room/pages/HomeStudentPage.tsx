import React, { useState } from 'react';
import HomeStudentPage from '../HomeStudent';

export default function HomeStudentPageContainer() {
    // 1. 获取登录用户信息
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const username = user.username || 'Student';

    // 2. 作业模块状态
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedCourse, setSelectedCourse] = useState('Select Course');
    const [uploadedFiles, setUploadedFiles] = useState({});

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
        }
    };

    const states = {
        username, currentStep, selectedCourse, uploadedFiles
    };

    return <HomeStudentPage {...states} handlers={handlers} />;
}
