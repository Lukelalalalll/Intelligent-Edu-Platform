import React from 'react';
import HighlighterView from './HighlighterView';
import { useHighlighter } from './hooks/useHighlighter';

export default function HighlighterPage() {
    const { states, handlers } = useHighlighter();
    return <HighlighterView {...states} {...handlers} />;
}
