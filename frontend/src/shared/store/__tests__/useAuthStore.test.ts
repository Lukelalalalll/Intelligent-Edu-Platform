import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SESSION_CHECK_INTERVAL, useAuthStore, type User } from '../useAuthStore';

const mockUser: User = {
  id: 'user-1',
  username: 'alice',
  email: 'alice@example.com',
  role: 'student',
};

const mockUser2: User = {
  id: 'user-2',
  username: 'bob',
  email: 'bob@example.com',
  role: 'admin',
};

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      status: 'unknown',
      isSessionLoading: false,
      lastValidatedAt: 0,
    });
  });

  it('initial user is null', () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('starts with unknown auth status', () => {
    expect(useAuthStore.getState().status).toBe('unknown');
    expect(useAuthStore.getState().isSessionLoading).toBe(false);
  });

  describe('login', () => {
    it('sets the user data', () => {
      useAuthStore.getState().login(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().status).toBe('authenticated');
      expect(useAuthStore.getState().isSessionLoading).toBe(false);
    });

    it('replaces previous user entirely (no stale data)', () => {
      useAuthStore.getState().login(mockUser);
      useAuthStore.getState().login(mockUser2);
      expect(useAuthStore.getState().user).toEqual(mockUser2);
      expect(useAuthStore.getState().user?.id).toBe('user-2');
      expect(useAuthStore.getState().user?.username).toBe('bob');
    });

    it('stores a validation timestamp', () => {
      const validatedAt = Date.now() - SESSION_CHECK_INTERVAL;
      useAuthStore.getState().login(mockUser, { validatedAt });
      expect(useAuthStore.getState().lastValidatedAt).toBe(validatedAt);
    });
  });

  describe('logout', () => {
    it('clears user to null', () => {
      useAuthStore.getState().login(mockUser);
      expect(useAuthStore.getState().user).not.toBeNull();
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().status).toBe('anonymous');
      expect(useAuthStore.getState().isSessionLoading).toBe(false);
    });
  });

  describe('updateProfile', () => {
    it('updates partial fields on existing user', () => {
      useAuthStore.getState().login(mockUser);
      useAuthStore.getState().updateProfile({ username: 'alice_updated' });
      expect(useAuthStore.getState().user?.username).toBe('alice_updated');
      expect(useAuthStore.getState().user?.email).toBe('alice@example.com');
    });

    it('is a no-op when user is null', () => {
      useAuthStore.getState().updateProfile({ username: 'nobody' });
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('session lifecycle helpers', () => {
    it('marks the store as loading during a session check', () => {
      useAuthStore.getState().beginSessionCheck();
      expect(useAuthStore.getState().isSessionLoading).toBe(true);
      expect(useAuthStore.getState().status).toBe('unknown');
    });

    it('completes a session check with an authenticated user', () => {
      const validatedAt = Date.now();
      useAuthStore.getState().beginSessionCheck();
      useAuthStore.getState().completeSessionCheck(mockUser, { validatedAt });
      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().status).toBe('authenticated');
      expect(useAuthStore.getState().isSessionLoading).toBe(false);
      expect(useAuthStore.getState().lastValidatedAt).toBe(validatedAt);
    });

    it('completes a session check with no user', () => {
      useAuthStore.getState().login(mockUser);
      useAuthStore.getState().beginSessionCheck();
      useAuthStore.getState().completeSessionCheck(null);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().status).toBe('anonymous');
      expect(useAuthStore.getState().isSessionLoading).toBe(false);
    });
  });

  it('does not persist user data to localStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

    useAuthStore.getState().login(mockUser);
    useAuthStore.getState().updateProfile({ username: 'updated' });
    useAuthStore.getState().logout();
    useAuthStore.getState().login(mockUser2);

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });
});
