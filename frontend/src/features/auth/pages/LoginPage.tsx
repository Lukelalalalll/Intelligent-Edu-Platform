import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import Login from '../components/Login';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // Form state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // UI state
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Form submission logic
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
            // Call the backend /login endpoint
            const response = await client.post('/login', {
                username,
                password
            });

            // Login succeeded — store the returned user info in localStorage
            const userData = response.data.user;
            localStorage.setItem('user', JSON.stringify(userData));

            // Redirect back to the pre-login page if present, otherwise go to home or student home
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
            // Capture the backend error message
            const errorDetail = error.response?.data?.detail || error.response?.data?.message || 'Login failed';
            setErrorMsg(errorDetail);
            setIsLoading(false);
        }
    };

    // Bundle state and handlers to pass down to the page layer
    const pageProps = {
        username, setUsername, password, setPassword, showPassword, setShowPassword,
        errorMsg, setErrorMsg, successMsg, setSuccessMsg, isLoading, handleLogin
    };

    return <Login {...pageProps} />;
}
