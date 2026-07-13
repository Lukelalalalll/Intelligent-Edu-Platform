import styles from '../../styles/profile.module.css';
import type { ProfileCourseItem, ProfileTranslator } from './types';

interface ProfileCoursesSectionProps {
    title: string;
    subtitle: string;
    profileCourses: ProfileCourseItem[];
    isCoursesLoading: boolean;
    t: ProfileTranslator;
}

export function ProfileCoursesSection({
    title,
    subtitle,
    profileCourses,
    isCoursesLoading,
    t,
}: ProfileCoursesSectionProps) {
    return (
        <div className={styles.profileCoursesCard}>
            <div className={styles.cardHeader}>
                <h3><i className="fas fa-book-open"></i> {title}</h3>
                <p className={styles.editSubtitle}>{subtitle}</p>
            </div>

            <div className={styles.cardScrollArea}>
                {isCoursesLoading ? (
                    <div className={styles.courseState}>{t('profile.loadingCourses')}</div>
                ) : profileCourses.length ? (
                    <div className={styles.courseList}>
                        {profileCourses.map((course) => (
                            <div className={styles.courseItem} key={course.courseId || course.id}>
                                <div className={styles.courseMainInfo}>
                                    <div className={styles.courseCode}>{course.courseId || course.id}</div>
                                    <div className={styles.courseName}>{course.name}</div>
                                </div>
                                <div className={styles.courseMeta}>
                                    <span>{course.degreeLevel || t('profile.notAvailable')}</span>
                                    <span>{course.semester || t('profile.notAvailable')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.courseState}>{t('profile.noCourses')}</div>
                )}
            </div>
        </div>
    );
}
