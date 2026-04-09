import React from 'react';
import { Navigate } from 'react-router-dom';
import AdminFileCenterPage from '../features/admin-file-center';

export default function AdminFileCenterEntry() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = user?.role === 'admin';

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    return <AdminFileCenterPage />;
}
