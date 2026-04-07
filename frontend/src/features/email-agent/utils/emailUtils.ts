export function formatShortDate(dateStr: string): string {
    if (!dateStr || dateStr === '-') return '-';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
        const parts = dateStr.split(' ');
        if (parts.length > 2) return parts.slice(1, 3).join(' ');
        return dateStr.slice(0, 10);
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatFullDate(dateStr: string): string {
    if (!dateStr || dateStr === '-') return '-';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export const URGENCY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    high:   { bg: '#fdecea', color: '#b71c1c', label: 'Urgent' },
    medium: { bg: '#fff3e0', color: '#e65100', label: 'Medium' },
    low:    { bg: '#e8f5e9', color: '#2e7d32', label: 'Low' },
};

export const CATEGORY_LABELS: Record<string, string> = {
    assignment:        'Assignment',
    grade_inquiry:     'Grade Inquiry',
    course_logistics:  'Course Logistics',
    administrative:    'Admin',
    personal:          'Personal',
    other:             'Other',
};

export function extractSenderName(from: string): string {
    if (!from) return '-';
    return from.split('<')[0].replaceAll('"', '').trim() || from;
}
