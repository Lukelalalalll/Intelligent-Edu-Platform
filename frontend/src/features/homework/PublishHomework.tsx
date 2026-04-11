import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import client from '../../api/client';
import styles from './styles/publishHomework.module.css';

export default function PublishHomework() {
    const navigate = useNavigate();
    const [courses, setCourses] = useState<any[]>([]);
    const [loadingCourses, setLoadingCourses] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        course_id: '',
        title: '',
        description: '',
        deadline: '',
        required_file_types: [] as string[]
    });

    const fileTypeOptions = [
        { label: 'PDF Document', value: '.pdf', icon: 'fa-solid fa-file-pdf', color: '#ff5252' },
        { label: 'Word Document', value: '.docx', icon: 'fa-solid fa-file-word', color: '#007aff' },
        { label: 'Excel Spreadsheet', value: '.xlsx', icon: 'fa-solid fa-file-excel', color: '#4caf50' },
        { label: 'PowerPoint', value: '.pptx', icon: 'fa-solid fa-file-powerpoint', color: '#ff9800' },
        { label: 'Image', value: '.jpg', icon: 'fa-solid fa-image', color: '#2196f3' },
        { label: 'Markdown', value: '.md', icon: 'fa-brands fa-markdown', color: '#607d8b' }
    ];

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const res = await client.get('/teacher/v2/courses');
                if (res.data?.courses) {
                    setCourses(res.data.courses);
                    if (res.data.courses.length > 0) {
                        setFormData(prev => ({ ...prev, course_id: res.data.courses[0].id }));
                    }
                }
            } catch (error) {
                console.error('Failed to fetch courses:', error);
                toast.error('Failed to load courses');
            } finally {
                setLoadingCourses(false);
            }
        };
        fetchCourses();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (value: string) => {
        setFormData(prev => {
            const types = [...prev.required_file_types];
            if (types.includes(value)) {
                return { ...prev, required_file_types: types.filter(t => t !== value) };
            } else {
                return { ...prev, required_file_types: [...types, value] };
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.course_id || !formData.title || !formData.deadline) {
            toast.error('Please fill in all required fields');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                course_id: formData.course_id,
                title: formData.title,
                description: formData.description,
                deadline: new Date(formData.deadline).toISOString(),
                required_file_types: formData.required_file_types.length > 0 ? formData.required_file_types : ['*']
            };

            await client.post('/v2/homeworks/', payload);
            toast.success('Homework published successfully!');
            navigate('/');
        } catch (error: any) {
            console.error('Failed to publish homework:', error);
            toast.error(error.response?.data?.detail || 'Failed to publish homework');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="container">
            <WelcomeBanner
                title={<><i className="fas fa-bullhorn" aria-hidden="true" style={{color: 'var(--primary-color)'}}></i> Publish Homework</>}
                subtitle="Create assignments and set submission constraints for your courses."
                className={styles.pageHeader}
                as="header"
            />

            <div className={styles.mainCard}>
                <h2 className={styles.cardTitle}>
                    <i className="fa-solid fa-pen-nib"></i> Assignment Details
                </h2>
                
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Select Course <span style={{color: 'var(--error-color)'}}>*</span></label>
                            <select 
                                name="course_id" 
                                value={formData.course_id} 
                                onChange={handleChange} 
                                className={styles.select}
                                disabled={loadingCourses}
                                required
                            >
                                {loadingCourses && <option value="">Loading courses...</option>}
                                {!loadingCourses && courses.length === 0 && <option value="">No courses available</option>}
                                {!loadingCourses && courses.map(course => (
                                    <option key={course.id} value={course.id}>
                                        {course.courseName || course.name || course.courseCode || course.id}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Deadline <span style={{color: 'var(--error-color)'}}>*</span></label>
                            <input 
                                type="datetime-local" 
                                name="deadline" 
                                value={formData.deadline} 
                                onChange={handleChange} 
                                className={styles.input}
                                required
                            />
                        </div>

                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            <label className={styles.label}>Homework Title <span style={{color: 'var(--error-color)'}}>*</span></label>
                            <input 
                                type="text" 
                                name="title" 
                                value={formData.title} 
                                onChange={handleChange} 
                                placeholder="e.g. Chapter 4 Reading Questions"
                                className={styles.input}
                                required
                            />
                        </div>

                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            <label className={styles.label}>Description & Instructions</label>
                            <textarea 
                                name="description" 
                                value={formData.description} 
                                onChange={handleChange} 
                                placeholder="Detailed instructions for the students..."
                                className={styles.textarea}
                            />
                        </div>

                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            <label className={styles.label}>Required File Formats</label>
                            <div className={styles.helpText}>Specify which types of files students can upload. Leave empty to allow any format.</div>
                            <div className={styles.checkboxContainer}>
                                {fileTypeOptions.map(option => {
                                    const isChecked = formData.required_file_types.includes(option.value);
                                    return (
                                        <label 
                                            key={option.value} 
                                            className={`${styles.checkboxCard} ${isChecked ? styles.checked : ''}`}
                                            onClick={(e) => {
                                                // prevent double fire from label click
                                                e.preventDefault();
                                                handleCheckboxChange(option.value);
                                            }}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={isChecked}
                                                readOnly
                                            />
                                            <i className={option.icon} style={{ color: option.color }}></i>
                                            {option.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className={styles.actionFooter}>
                        <button type="button" className={styles.btnSecondary} onClick={() => navigate('/')}>
                            Cancel
                        </button>
                        <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                            {submitting ? (
                                <><i className="fa-solid fa-spinner fa-spin"></i> Publishing...</>
                            ) : (
                                <><i className="fa-solid fa-paper-plane"></i> Publish Assignment</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
