// frontend/src/pages/sub2/QuestionGenerator.jsx
import React from 'react';
import Step1Upload from './components/Step1Upload';
import Step2Extract from './components/Step2Extract';
import Step3Generate from './components/Step3Generate';

export default function QuestionGenerator({ states, handlers }) {
    return (
        <div className="container">
            <div className="page-header">
                <h1>Intelligent Question Extraction and Generation</h1>
                <p className="subtitle">Extract question content from PDF and intelligently generate new practice exercises</p>
            </div>

            {/* Step 1: File Upload */}
            <Step1Upload states={states} handlers={handlers} />

            {/* Step 2: Content Extraction */}
            <Step2Extract states={states} handlers={handlers} />

            {/* Step 3: Question Generation */}
            <Step3Generate states={states} handlers={handlers} />
        </div>
    );
}