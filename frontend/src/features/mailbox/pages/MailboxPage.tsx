import React, { useState } from 'react';
import MailboxPage from '../Mailbox';

export default function MailboxPageContainer() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const [currentStep, setCurrentStep] = useState(1);
    const [selections, setSelections] = useState({
        degree: '',
        course: '',
        assignment: ''
    });

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
