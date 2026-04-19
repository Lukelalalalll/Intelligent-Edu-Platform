import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import Login from '../components/Login';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // 表单状态
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // UI 状态
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // 表单提交逻辑
    const handleLogin = async (e) => {
        e.preventDefault();

        if (!username.trim() || !password.trim()) {
            setErrorMsg('Please fill in all fields.');
            return;
        }

        if (!navigator.onLine) {
            setErrorMsg('No internet connection. Please check your network and try again.');
            return;
        }

        setIsLoading(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            // 调用后端的 /login 接口
            const response = await client.post('/login', {
                username,
                password
            });

            // 登录成功，将返回的用户信息存储到 localStorage
            const userData = response.data.user;
            localStorage.setItem('user', JSON.stringify(userData));

            // 判断是否需要跳转回登录前的页面，否则跳转到主页或学生主页
            const searchParams = new URLSearchParams(location.search);
            const nextUrl = searchParams.get('next');

            if (nextUrl) {
                navigate(nextUrl);
            } else if (userData.role === 'student') {
                navigate('/home_student');
            } else {
                navigate('/');
            }

        } catch (error) {
            // 捕获后端的报错信息
            const errorDetail = error.response?.data?.detail || error.response?.data?.message || 'Login failed';
            setErrorMsg(errorDetail);
            setIsLoading(false);
        }
    };

    // 把状态和函数打包传给页面层
    const pageProps = {
        username, setUsername, password, setPassword, showPassword, setShowPassword,
        errorMsg, setErrorMsg, successMsg, setSuccessMsg, isLoading, handleLogin
    };

    return <Login {...pageProps} />;
}
