import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function PresentonLegacyRedirectPage() {
    const location = useLocation();
    const target = location.pathname.endsWith('/workspace')
        ? '/slides/presenton/presentation'
        : '/slides/presenton';

    return <Navigate to={target} replace />;
}
