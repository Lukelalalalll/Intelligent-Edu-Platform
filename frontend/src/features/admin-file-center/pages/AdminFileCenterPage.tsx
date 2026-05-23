import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/useAuthStore';
import { AdminFileCenterPage } from '../index';

export default function AdminFileCenter() {
    const storeUser = useAuthStore((s) => s.user);
    const isAdmin = storeUser?.role === 'admin';

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    return <AdminFileCenterPage />;
}
