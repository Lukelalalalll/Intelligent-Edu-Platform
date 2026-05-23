import { describe, it, expect, beforeEach } from 'vitest';
import { useAdminStore } from '../adminStore';

describe('adminStore', () => {
  beforeEach(() => {
    useAdminStore.setState({
      apiKeys: [],
      llmEntries: [],
      stats: null,
      isLoading: false,
      error: null,
      filters: {
        searchQuery: '',
        statusFilter: '',
        providerFilter: '',
        setSearchQuery: useAdminStore.getState().filters.setSearchQuery,
        setStatusFilter: useAdminStore.getState().filters.setStatusFilter,
        setProviderFilter: useAdminStore.getState().filters.setProviderFilter,
      },
    });
  });

  describe('apiKeys management', () => {
    it('starts with empty apiKeys', () => {
      expect(useAdminStore.getState().apiKeys).toEqual([]);
    });

    it('setApiKeys replaces the list', () => {
      const keys = [{ id: '1', key: 'sk-test', name: 'Test', provider: 'openai', created_at: '2024-01-01' }];
      useAdminStore.getState().setApiKeys(keys);
      expect(useAdminStore.getState().apiKeys).toHaveLength(1);
      expect(useAdminStore.getState().apiKeys[0].id).toBe('1');
    });

    it('addApiKey appends to the list', () => {
      useAdminStore.getState().addApiKey({ id: '1', key: 'sk-test1', name: 'Key1', provider: 'openai', created_at: '2024-01-01' });
      useAdminStore.getState().addApiKey({ id: '2', key: 'sk-test2', name: 'Key2', provider: 'anthropic', created_at: '2024-01-02' });
      expect(useAdminStore.getState().apiKeys).toHaveLength(2);
    });

    it('removeApiKey deletes by id', () => {
      useAdminStore.getState().setApiKeys([
        { id: '1', key: 'sk-1', name: 'K1', provider: 'openai', created_at: '2024-01-01' },
        { id: '2', key: 'sk-2', name: 'K2', provider: 'openai', created_at: '2024-01-02' },
      ]);
      useAdminStore.getState().removeApiKey('1');
      const keys = useAdminStore.getState().apiKeys;
      expect(keys).toHaveLength(1);
      expect(keys[0].id).toBe('2');
    });
  });

  describe('loading and error state', () => {
    it('setLoading toggles loading', () => {
      useAdminStore.getState().setLoading(true);
      expect(useAdminStore.getState().isLoading).toBe(true);
      useAdminStore.getState().setLoading(false);
      expect(useAdminStore.getState().isLoading).toBe(false);
    });

    it('setError sets and clears error', () => {
      useAdminStore.getState().setError('Something went wrong');
      expect(useAdminStore.getState().error).toBe('Something went wrong');
      useAdminStore.getState().setError(null);
      expect(useAdminStore.getState().error).toBeNull();
    });
  });

  describe('filters', () => {
    it('setSearchQuery updates search', () => {
      useAdminStore.getState().filters.setSearchQuery('gpt-4');
      expect(useAdminStore.getState().filters.searchQuery).toBe('gpt-4');
    });

    it('setStatusFilter updates status', () => {
      useAdminStore.getState().filters.setStatusFilter('error');
      expect(useAdminStore.getState().filters.statusFilter).toBe('error');
    });

    it('setProviderFilter updates provider', () => {
      useAdminStore.getState().filters.setProviderFilter('openai');
      expect(useAdminStore.getState().filters.providerFilter).toBe('openai');
    });
  });

  describe('llmEntries', () => {
    it('setLLMEntries replaces entries', () => {
      const entries = [{
        id: '1', timestamp: '2024-01-01T00:00:00Z', model: 'gpt-4',
        provider: 'openai', tokens_in: 100, tokens_out: 50, cost: 0.01,
        latency_ms: 200, status: 'success' as const,
      }];
      useAdminStore.getState().setLLMEntries(entries);
      expect(useAdminStore.getState().llmEntries).toHaveLength(1);
      expect(useAdminStore.getState().llmEntries[0].model).toBe('gpt-4');
    });
  });

  describe('stats', () => {
    it('setStats stores admin stats', () => {
      const stats = { totalUsers: 42, totalCourses: 7, activeApiKeys: 3 };
      useAdminStore.getState().setStats(stats);
      expect(useAdminStore.getState().stats?.totalUsers).toBe(42);
    });
  });
});