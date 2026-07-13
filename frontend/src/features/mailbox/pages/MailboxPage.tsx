import React, { useState } from 'react';
import WelcomeBanner from '@/shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import { useAuthStore } from '@/shared/store/useAuthStore';
import { useMailboxData } from '../hooks/useMailboxData';
import { useMailboxFilters } from '../hooks/useMailboxFilters';
import MailboxStepper from '../components/MailboxStepper';
import DegreeStep from '../components/DegreeStep';
import CourseStep from '../components/CourseStep';
import AssignmentStep from '../components/AssignmentStep';
import SubmissionsStep from '../components/SubmissionsStep';
import type { MailboxSelections } from '../types';
import styles from '../styles/mailbox.module.css';

export default function MailboxPage() {
    const isEntranceActive = usePageEntrance();
    const storeUser = useAuthStore((s) => s.user);

    const [currentStep, setCurrentStep] = useState(1);
    const [selections, setSelections] = useState<MailboxSelections>({ degree: '', course: '', assignment: '' });
    const [searchQuery, setSearchQuery] = useState('');

    const setSelection = (key: keyof MailboxSelections, value: string, nextStep: number) => {
        setSelections(prev => ({ ...prev, [key]: value }));
        setCurrentStep(nextStep);
        setSearchQuery('');
    };

    const {
        courses, assignments, submissions, loading,
        handleSelectDegree, handleSelectCourse, handleSelectAssignment,
    } = useMailboxData({ currentStep, selections, setStep: setCurrentStep, setSelection });

    const { filteredCourses, filteredSubmissions, degreePending } = useMailboxFilters({
        courses,
        submissions,
        selectedDegree: selections.degree,
        searchQuery,
    });

    return (
        <div className={`container ${entranceStyles.pageEntrance} ${isEntranceActive ? entranceStyles.pageEntranceActive : ''}`}>
            <WelcomeBanner
                className={styles.mailboxBanner}
                title={<><i className="fas fa-inbox"></i> Grading Mailbox</>}
                subtitle={<>Welcome to the intelligent grading workspace, <strong>{storeUser?.username || 'Professor'}</strong>.</>}
                variant="workspace"
            />

            <div className={styles.mailboxContainer}>
                <MailboxStepper
                    currentStep={currentStep}
                    selections={selections}
                    onStepClick={setCurrentStep}
                />

                <div className={styles.stepView}>
                    {currentStep === 1 && (
                        <DegreeStep
                            degreePending={degreePending}
                            onSelect={handleSelectDegree}
                        />
                    )}
                    {currentStep === 2 && (
                        <CourseStep
                            loading={loading}
                            courses={filteredCourses}
                            onSelect={handleSelectCourse}
                        />
                    )}
                    {currentStep === 3 && (
                        <AssignmentStep
                            loading={loading}
                            assignments={assignments}
                            onSelect={handleSelectAssignment}
                        />
                    )}
                    {currentStep === 4 && (
                        <SubmissionsStep
                            loading={loading}
                            submissions={filteredSubmissions}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
