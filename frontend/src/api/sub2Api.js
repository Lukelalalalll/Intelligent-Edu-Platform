/**
 * Sub2 (Question Generator) API client layer.
 * Centralizes all sub2 backend calls with consistent error handling.
 */
import client from './client';

export async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await client.post('/sub2/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
}

export async function extractQuestions({ taskId, pageNumbers, prompt }) {
    const res = await client.post('/sub2/extract_questions', {
        task_id: taskId,
        page_numbers: pageNumbers,
        prompt,
    });
    return res.data;
}

export async function generateQuestions(payload) {
    const res = await client.post('/sub2/generate_questions', payload);
    return res.data;
}

export async function exportQuestions(taskId) {
    const params = taskId ? { task_id: taskId } : {};
    const res = await client.post('/sub2/export_questions', {}, { params, responseType: 'blob' });
    return res.data;
}

export async function uploadScreenshot({ image, chapterNumber, subChapterNumber, exerciseNumber }) {
    const res = await client.post('/sub2/upload_screenshot', {
        image,
        chapter_number: chapterNumber,
        sub_chapter_number: subChapterNumber,
        exercise_number: exerciseNumber,
    });
    return res.data;
}

export async function getGenerationHistory(page = 1, pageSize = 10) {
    const res = await client.get('/sub2/generation_history', { params: { page, page_size: pageSize } });
    return res.data;
}

export async function getGenerationDetail(historyId) {
    const res = await client.get(`/sub2/generation_history/${historyId}`);
    return res.data;
}
