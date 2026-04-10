import client from './client';
import type { AIProvider } from '../shared/aiProvider';

export type DeliveryArtifactType = 'agenda' | 'speaker_notes' | 'in_class_questions' | 'homework_suggestions';

export interface SlidesDeliveryPayload {
    provider?: AIProvider;
    title: string;
    ppt_schema: Record<string, unknown>;
    script_style?: string;
    locale?: string;
}

export interface SlidesDeliveryPreview {
    agenda_count: number;
    speaker_notes_count: number;
    in_class_questions_count: number;
    homework_count: number;
}

export interface SlidesDeliveryJobResponse {
    success: boolean;
    job_id: string;
    status: string;
    slides_count: number;
    artifacts_preview: SlidesDeliveryPreview;
}

export interface SlidesDeliveryJob {
    job_id: string;
    title: string;
    status: string;
    locale: string;
    script_style: string;
    slides_count: number;
    created_at?: string;
    updated_at?: string;
}

export interface SlidesArtifactResponse<T = unknown> {
    success: boolean;
    job_id: string;
    artifact_type: DeliveryArtifactType;
    data: T;
}

export const slidesDeliveryApi = {
    createJob: async (payload: SlidesDeliveryPayload): Promise<SlidesDeliveryJobResponse> => {
        const res = await client.post('/slides/delivery/jobs', payload);
        return res.data;
    },

    getJob: async (jobId: string): Promise<{ success: boolean; job: SlidesDeliveryJob }> => {
        const res = await client.get(`/slides/delivery/jobs/${jobId}`);
        return res.data;
    },

    getArtifact: async <T = unknown>(jobId: string, artifactType: DeliveryArtifactType): Promise<SlidesArtifactResponse<T>> => {
        const res = await client.get(`/slides/delivery/jobs/${jobId}/artifact/${artifactType}`);
        return res.data;
    },
};
