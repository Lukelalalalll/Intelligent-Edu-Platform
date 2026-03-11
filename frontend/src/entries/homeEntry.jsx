import React, { useState, useEffect } from 'react';
import Home from '../pages/Home';

export default function HomeEntry() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // 在前后端分离项目中，我们通过检查 localStorage 来判断用户是否登录
        const user = localStorage.getItem('user');
        if (user) {
            setIsAuthenticated(true);
        }
    }, []);

    // 统一定义跳转路由（这里的路径对应 App.jsx 中的配置）
    const config = {
        isAuthenticated: isAuthenticated,
        urls: {
            login: '/login',
            aiInteract: '/ai-interaction',
            mailbox: '/mailbox',
            sub1: '/sub1/md-processor',
            sub3: '/sub3',
            sub4: '/sub4',
            sub5: '/sub5'
        }
    };

    return <Home config={config} />;
}