import { useEffect, useState } from 'react';

import client from '@/shared/api/client';

import type { ProfileCourseItem } from '../components/profile/types';

export function useProfileCoursesData() {
    const [profileCourses, setProfileCourses] = useState<ProfileCourseItem[]>([]);
    const [courseSemester, setCourseSemester] = useState('');
    const [isCoursesLoading, setIsCoursesLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadProfileCourses = async () => {
            try {
                setIsCoursesLoading(true);
                const response = await client.get('/profile/courses');
                if (!isMounted) {
                    return;
                }

                setProfileCourses(Array.isArray(response.data?.courses) ? response.data.courses : []);
                setCourseSemester(response.data?.semester || '');
            } catch {
                if (!isMounted) {
                    return;
                }

                setProfileCourses([]);
            } finally {
                if (isMounted) {
                    setIsCoursesLoading(false);
                }
            }
        };

        void loadProfileCourses();

        return () => {
            isMounted = false;
        };
    }, []);

    return {
        profileCourses,
        courseSemester,
        isCoursesLoading,
    };
}
