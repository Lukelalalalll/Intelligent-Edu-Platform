import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore, type User } from '../useAuthStore';

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
    useAuthStore.setState({ user: null });
  });

  it('initial user is null', () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  describe('login', () => {
    it('sets the user data', () => {
      useAuthStore.getState().login(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it('replaces previous user entirely (no stale data)', () => {
      useAuthStore.getState().login(mockUser);
      useAuthStore.getState().login(mockUser2);
      expect(useAuthStore.getState().user).toEqual(mockUser2);
      expect(useAuthStore.getState().user?.id).toBe('user-2');
      expect(useAuthStore.getState().user?.username).toBe('bob');
    });
  });

  describe('logout', () => {
    it('clears user to null', () => {
      useAuthStore.getState().login(mockUser);
      expect(useAuthStore.getState().user).not.toBeNull();
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().user).toBeNull();
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
