import client from '../api/client';

export const teacherApi = {
    getCourses: () => client.get('/teacher/courses').then(r => r.data),
    getAssignments: (courseId) => client.get(`/teacher/assignments/${courseId}`).then(r => r.data),
    getSubmissions: (assignmentId) => client.get(`/teacher/submissions/${assignmentId}`).then(r => r.data),
    getSubmissionDetail: (submissionId) => client.get(`/teacher/submission/${submissionId}`).then(r => r.data),
    saveAnnotation: (submissionId, annotation) => client.post('/teacher/annotations', { submissionId, annotation }).then(r => r.data),
    deleteAnnotation: (submissionId, annotationId) => client.delete(`/teacher/annotations/${annotationId}`, { params: { submissionId } }).then(r => r.data),
    finalizeAnnotations: (submissionId, annotations) => client.post(`/teacher/submission/${submissionId}/annotations/finalize`, { submissionId, annotations }).then(r => r.data),
    saveScore: (submissionId, payload) => client.post(`/teacher/submission/${submissionId}/score`, payload).then(r => r.data),
};

export const cozeApi = {
    analyzeSubmission: (submissionId) => client.post('/ai/analyze', { submissionId }).then(r => r.data),
    debugRag: (submissionId, selectedText, options = {}) =>
        client.post('/ai/rag/debug', {
            submissionId,
            selectedText,
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),
    askFeedback: (submissionId, selectedText, assignment, rubric, messages = [], options = {}) =>
        client.post('/ai/feedback', {
            submissionId,
            selectedText,
            assignment,
            rubric,
            messages,
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),
    suggestAnnotation: (submissionId, selectedText, assignment, rubric, messages = [], options = {}) =>
        client.post('/ai/annotate', {
            submissionId,
            selectedText,
            assignment,
            rubric,
            messages,
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),
};
