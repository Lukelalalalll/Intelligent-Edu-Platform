import React from 'react';
import Home from '../features/home/Home';

export default function HomeEntry() {
    // 不再需要判断 isAuthenticated，因为能进这个组件必定已登录
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