import React from 'react';
import Home from '../Home';

export default function HomePage() {
    const config = {
        urls: {
            sub1: '/slides/md-processor',
            sub2: '/questions',
            sub4: '/diagram',
            sub5: '/study-notes',
            mailbox: '/mailbox',
            publishHomework: '/publish-homework',
            aiInteract: '/ai-interaction',
            knowledgeBase: '/knowledge-base',
            videoGen: '/video-gen',
        }
    };

    return <Home config={config} />;
}
