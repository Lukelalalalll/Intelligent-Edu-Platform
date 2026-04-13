import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import client from '../../../../../api/client';
import { type DeliveryArtifactType } from '../../../api/slidesApi';
import { createSlideTemplateHandlers } from './slideTemplateEditor/handlerFactory';
import { initializeTemplateEditorData } from './slideTemplateEditor/initUtils';

type SlideTemplateState = {
  themes: any[];
  selectedTheme: string | null;
  pptSchema: any;
  currentSlideIndex: number;
  layouts: any[];
  isGenerating: boolean;
  errorMsg: string;
  isLoadingSchema: boolean;
  deliveryJobId: string;
  deliveryActiveTab: DeliveryArtifactType;
  deliveryLoading: boolean;
  deliveryError: string;
  deliveryArtifacts: Partial<Record<DeliveryArtifactType, unknown>>;
};

export function useSlideTemplateEditor() {
  const [themes, setThemes] = useState<any[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [pptSchema, setPptSchema] = useState<any>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [layouts, setLayouts] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);
  const [deliveryJobId, setDeliveryJobId] = useState('');
  const [deliveryActiveTab, setDeliveryActiveTab] = useState<DeliveryArtifactType>('agenda');
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [deliveryArtifacts, setDeliveryArtifacts] = useState<Partial<Record<DeliveryArtifactType, unknown>>>({});

  const setError = (message: string) => {
    setErrorMsg(message);
    if (message) toast.error(message);
  };

  useEffect(() => {
    const init = async () => {
      setErrorMsg('');
      try {
        const { schema, initialTheme, themes: fetchedThemes, error } = await initializeTemplateEditorData();

        if (error) {
          setError(error);
        }

        if (schema) {
          setPptSchema(schema);
        }

        setThemes(fetchedThemes);
        if (initialTheme) {
          setSelectedTheme(initialTheme);
        }
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || 'Failed to initialize PPT template page.');
      } finally {
        setIsLoadingSchema(false);
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (!selectedTheme) return;

    client
      .get(`/slides/get_placeholders/${selectedTheme}`)
      .then((res) => {
        const placeholders = Array.isArray(res.data) ? res.data : [];
        const filtered = placeholders.filter((l: any) => !['Title', 'Catalogue', 'Ending'].includes(l.name));
        setLayouts(filtered);
      })
      .catch((err: any) => {
        setLayouts([]);
        setError(err?.response?.data?.detail || err?.message || 'Failed to load layouts for selected theme.');
      });
  }, [selectedTheme]);

  const handlers = useMemo(
    () =>
      createSlideTemplateHandlers({
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
        setDeliveryActiveTabState: setDeliveryActiveTab,
        deliveryJobId,
        deliveryArtifacts,
        setError,
      }),
    [currentSlideIndex, deliveryArtifacts, deliveryJobId, pptSchema],
  );

  const states: SlideTemplateState = {
    themes,
    selectedTheme,
    pptSchema,
    currentSlideIndex,
    layouts,
    isGenerating,
    errorMsg,
    isLoadingSchema,
    deliveryJobId,
    deliveryActiveTab,
    deliveryLoading,
    deliveryError,
    deliveryArtifacts,
  };

  return { states, handlers };
}
