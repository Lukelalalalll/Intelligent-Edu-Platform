import { create } from 'zustand';

export interface AdminStats {
  totalUsers: number;
  totalCourses: number;
  activeApiKeys: number;
  [key: string]: unknown;
}

export interface ApiKeyRecord {
  id: string;
  key: string;
  name: string;
  provider: string;
  created_at: string;
  usage?: number;
}

export interface LLMMonitorEntry {
  id: string;
  timestamp: string;
  model: string;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  latency_ms: number;
  status: 'success' | 'error';
  error_message?: string;
}

interface AdminFilterState {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  providerFilter: string;
  setProviderFilter: (p: string) => void;
}

interface AdminStore {
  // API Keys
  apiKeys: ApiKeyRecord[];
  setApiKeys: (keys: ApiKeyRecord[]) => void;
  addApiKey: (key: ApiKeyRecord) => void;
  removeApiKey: (id: string) => void;

  // LLM Monitor
  llmEntries: LLMMonitorEntry[];
  setLLMEntries: (entries: LLMMonitorEntry[]) => void;

  // Stats
  stats: AdminStats | null;
  setStats: (stats: AdminStats) => void;

  // Loading & Error
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Filters
  filters: AdminFilterState;
}

export const useAdminStore = create<AdminStore>((set) => ({
  apiKeys: [],
  setApiKeys: (keys) => set({ apiKeys: keys }),
  addApiKey: (key) => set((state) => ({ apiKeys: [...state.apiKeys, key] })),
  removeApiKey: (id) => set((state) => ({ apiKeys: state.apiKeys.filter((k) => k.id !== id) })),

  llmEntries: [],
  setLLMEntries: (entries) => set({ llmEntries: entries }),

  stats: null,
  setStats: (stats) => set({ stats }),

  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
  error: null,
  setError: (error) => set({ error }),

  filters: {
    searchQuery: '',
    setSearchQuery: (q: string) =>
      set((state) => ({ filters: { ...state.filters, searchQuery: q } })),
    statusFilter: '',
    setStatusFilter: (s: string) =>
      set((state) => ({ filters: { ...state.filters, statusFilter: s } })),
    providerFilter: '',
    setProviderFilter: (p: string) =>
      set((state) => ({ filters: { ...state.filters, providerFilter: p } })),
  },
}));