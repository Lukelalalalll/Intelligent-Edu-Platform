import React from 'react';
import { useNavigate } from 'react-router-dom';
import QuickProcessView from './QuickProcessView';
import { useQuickProcess } from './hooks/useQuickProcess';

export default function QuickProcessPage() {
    const navigate = useNavigate();
    const { states, handlers } = useQuickProcess(navigate);
    return <QuickProcessView {...states} {...handlers} />;
}
