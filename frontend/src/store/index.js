import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '../services/api';

// ─── AUTH STORE ────────────────────────────────────────────────────────────
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authAPI.login({ email, password });
          const { user, accessToken, refreshToken } = data.data;
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
          set({ user, accessToken, refreshToken, isLoading: false });
          return { success: true };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, message: err.response?.data?.message || 'Login failed' };
        }
      },

      logout: async () => {
        try { await authAPI.logout(); } catch {}
        localStorage.clear();
        set({ user: null, accessToken: null, refreshToken: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await authAPI.getMe();
          set({ user: data.data });
        } catch { get().logout(); }
      },

      isAdmin: () => get().user?.role === 'admin',
      isStaff: () => ['admin', 'staff'].includes(get().user?.role),
      canEdit: () => ['admin', 'staff'].includes(get().user?.role),
    }),
    { name: 'auth-store', partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }) }
  )
);

// ─── UI STORE ──────────────────────────────────────────────────────────────
export const useUIStore = create((set) => ({
  sidebarOpen: true,
  activePage: 'dashboard',
  theme: 'dark',

  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setPage: (page) => set({ activePage: page }),
}));
