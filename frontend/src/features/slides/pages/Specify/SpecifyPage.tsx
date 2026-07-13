import React from 'react';
import { useNavigate } from 'react-router-dom';
import SpecifyView from './SpecifyView';
import { useSpecify } from './hooks/useSpecify';

export default function SpecifyPage() {
    const navigate = useNavigate();
    const { states, handlers } = useSpecify(navigate);
    return <SpecifyView {...states} {...handlers} />;
}
