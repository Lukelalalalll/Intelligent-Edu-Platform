import React from 'react';
import Home from '../pages/Home';

export default function HomeEntry() {
    // 不再需要判断 isAuthenticated，因为能进这个组件必定已登录
    const config = {
        urls: {
            sub1: '/sub1/md-processor',
            sub3: '/sub3',
            sub4: '/sub4',
            sub5: '/sub5',
            mailbox: '/mailbox',
            aiInteract: '/ai-interaction'
        }
    };

    return <Home config={config} />;
}