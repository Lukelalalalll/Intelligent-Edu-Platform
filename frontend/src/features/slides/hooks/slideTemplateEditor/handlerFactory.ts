import { toast } from 'sonner';
import client from '../../../../api/client';
import { slidesDeliveryApi, type DeliveryArtifactType } from '../../api/slidesApi';
import { persistSchema, sanitizeBullets, updateSchemaSlide } from './schemaUtils';

type FactoryParams = {
  pptSchema: any;
  currentSlideIndex: number;
  setSelectedTheme: (value: string | null | ((prev: string | null) => string | null)) => void;
  setPptSchema: (schema: any | ((prev: any) => any)) => void;
  setCurrentSlideIndex: (index: number) => void;
  setIsGenerating: (value: boolean) => void;
  setErrorMsg: (value: string) => void;
  setDeliveryLoading: (value: boolean) => void;
  setDeliveryError: (value: string) => void;
  setDeliveryArtifacts: (value: any) => void;
  setDeliveryJobId: (value: string) => void;
  setDeliveryActiveTabState: (value: DeliveryArtifactType) => void;
  deliveryJobId: string;
  deliveryArtifacts: Partial<Record<DeliveryArtifactType, unknown>>;
  setError: (message: string) => void;
};

async function fetchDeliveryArtifact(
  jobId: string,
  tab: DeliveryArtifactType,
  setDeliveryLoading: (value: boolean) => void,
  setDeliveryError: (value: string) => void,
  setDeliveryArtifacts: (value: any) => void,
): Promise<void> {
  setDeliveryLoading(true);
  setDeliveryError('');
  try {
    const res = await slidesDeliveryApi.getArtifact(jobId, tab);
    setDeliveryArtifacts((prev: any) => ({ ...prev, [tab]: res.data }));
  } catch (err: any) {
    const msg = err?.response?.data?.detail || err?.message || 'Failed to load delivery artifact.';
    setDeliveryError(msg);
    toast.error(msg);
  } finally {
    setDeliveryLoading(false);
  }
}

export function createSlideTemplateHandlers({
  pptSchema,
  currentSlideIndex,
  setSelectedTheme,
  setPptSchema,
  setCurrentSlideIndex,
  setIsGenerating,
  setErrorMsg,
  setDeliveryLoading,
  setDeliveryError,
  setDeliveryArtifacts,
  setDeliveryJobId,
  setDeliveryActiveTabState,
  deliveryJobId,
  deliveryArtifacts,
  setError,
}: FactoryParams) {
  return {
    selectTheme: (name: string) => {
      setSelectedTheme(name);
      setPptSchema((prev: any) => {
        if (!prev) return prev;
        const updated = { ...prev, theme: name };
        localStorage.setItem('ppt_schema', JSON.stringify(updated));
        return updated;
      });
    },
    setCurrentSlideIndex,
    selectLayout: (layout: any) => {
      if (!pptSchema) return;
      const newSchema = updateSchemaSlide(pptSchema, currentSlideIndex, (s) => ({
        ...s,
        layout: { name: layout.name, placeholders: layout.placeholders },
      }));
      persistSchema(setPptSchema as any, newSchema);
    },
    updateCurrentSlide: (patch: any) => {
      if (!pptSchema) return;
      const newSchema = updateSchemaSlide(pptSchema, currentSlideIndex, (s) => ({ ...s, ...patch }));
      persistSchema(setPptSchema as any, newSchema);
    },
    updateCurrentSlideBullet: (bulletIndex: number, value: string) => {
      if (!pptSchema) return;
      const current = pptSchema.slides[currentSlideIndex] || {};
      const currentBullets = Array.isArray(current.content) ? [...current.content] : [];
      currentBullets[bulletIndex] = value;
      const bullets = sanitizeBullets(currentBullets);
      const newSchema = updateSchemaSlide(pptSchema, currentSlideIndex, (s) => ({ ...s, content: bullets }));
      persistSchema(setPptSchema as any, newSchema);
    },
    addCurrentSlideBullet: () => {
      if (!pptSchema) return;
      const current = pptSchema.slides[currentSlideIndex] || {};
      const currentBullets = Array.isArray(current.content) ? [...current.content] : [];
      currentBullets.push('New bullet point');
      const newSchema = updateSchemaSlide(pptSchema, currentSlideIndex, (s) => ({ ...s, content: currentBullets }));
      persistSchema(setPptSchema as any, newSchema);
    },
    removeCurrentSlideBullet: (bulletIndex: number) => {
      if (!pptSchema) return;
      const current = pptSchema.slides[currentSlideIndex] || {};
      const currentBullets = Array.isArray(current.content) ? [...current.content] : [];
      const next = currentBullets.filter((_: unknown, idx: number) => idx !== bulletIndex);
      const newSchema = updateSchemaSlide(pptSchema, currentSlideIndex, (s) => ({ ...s, content: next }));
      persistSchema(setPptSchema as any, newSchema);
    },
    reorderCurrentSlideBullets: (fromIndex: number, toIndex: number) => {
      if (!pptSchema) return;
      const current = pptSchema.slides[currentSlideIndex] || {};
      const currentBullets = Array.isArray(current.content) ? [...current.content] : [];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= currentBullets.length || toIndex >= currentBullets.length) {
        return;
      }
      const [moved] = currentBullets.splice(fromIndex, 1);
      currentBullets.splice(toIndex, 0, moved);
      const newSchema = updateSchemaSlide(pptSchema, currentSlideIndex, (s) => ({ ...s, content: currentBullets }));
      persistSchema(setPptSchema as any, newSchema);
    },
    applyLayoutToAll: () => {
      if (!pptSchema) return;
      const currentLayout = pptSchema.slides[currentSlideIndex]?.layout;
      if (!currentLayout) {
        setError('Select a layout first!');
        return;
      }
      const newSchema = {
        ...pptSchema,
        slides: pptSchema.slides.map((s: any) => ({ ...s, layout: currentLayout })),
      };
      persistSchema(setPptSchema as any, newSchema);
      toast.success('Applied current layout to all slides.');
    },
    generatePpt: async () => {
      if (!pptSchema) return;
      setIsGenerating(true);
      setErrorMsg('');
      const loadingToast = toast.loading('Generating PowerPoint...');
      try {
        const res = await client.post('/slides/generate_ppt', { ppt_schema: pptSchema });
        if (res.data.status === 'success') {
          const fileRes = await client.get(res.data.download_url, { responseType: 'blob' });
          const url = window.URL.createObjectURL(new Blob([fileRes.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', 'presentation.pptx');
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
          toast.success('PowerPoint generated successfully.');
        }
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || 'Generation failed');
      } finally {
        toast.dismiss(loadingToast);
        setIsGenerating(false);
      }
    },
    generateDeliveryPack: async () => {
      if (!pptSchema) {
        const msg = 'No PPT schema found. Please generate slides first.';
        setDeliveryError(msg);
        toast.error(msg);
        return;
      }

      setDeliveryLoading(true);
      setDeliveryError('');
      setDeliveryArtifacts({});
      const loadingToast = toast.loading('Generating delivery pack...');
      try {
        const title = (pptSchema.presentation_title || 'Lesson Delivery Pack') as string;
        const jobRes = await slidesDeliveryApi.createJob({
          title,
          ppt_schema: pptSchema,
          script_style: 'classroom',
          locale: 'en',
        });

        setDeliveryJobId(jobRes.job_id);
        setDeliveryActiveTabState('agenda');
        const agendaRes = await slidesDeliveryApi.getArtifact(jobRes.job_id, 'agenda');
        setDeliveryArtifacts({ agenda: agendaRes.data });
        toast.success('Delivery pack is ready.');
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err?.message || 'Failed to generate delivery pack.';
        setDeliveryError(msg);
        toast.error(msg);
      } finally {
        toast.dismiss(loadingToast);
        setDeliveryLoading(false);
      }
    },
    setDeliveryActiveTab: async (tab: DeliveryArtifactType) => {
      setDeliveryActiveTabState(tab);
      if (!deliveryJobId || deliveryArtifacts[tab]) {
        return;
      }
      await fetchDeliveryArtifact(deliveryJobId, tab, setDeliveryLoading, setDeliveryError, setDeliveryArtifacts);
    },
  };
}
