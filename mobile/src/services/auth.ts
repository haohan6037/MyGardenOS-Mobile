import AsyncStorage from '@react-native-async-storage/async-storage';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'auth_access_token';

async function request<T>(path: string, token?: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export type AuthUser = { id: number; email: string; username: string; gender: string; address: string; is_active: boolean };

export type AuthSession = { access_token: string; user: AuthUser };

export const auth = {
  requestCode: (email: string) =>
    request<{ status: string; expires_in_seconds: number; delivered: boolean; debug_code?: string; delivery_error?: string }>('/auth/email/request-code', undefined, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyCode: (email: string, code: string) =>
    request<{ verified: boolean; next_step: string; verify_token: string }>('/auth/email/verify-code', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  setPassword: (verify_token: string, password: string) =>
    request<AuthSession>('/auth/password/set', undefined, {
      method: 'POST',
      body: JSON.stringify({ verify_token, password }),
    }),

  verifyPassword: (verify_token: string, password: string) =>
    request<AuthSession>('/auth/password/verify', undefined, {
      method: 'POST',
      body: JSON.stringify({ verify_token, password }),
    }),

  getMe: (token: string) =>
    request<{ user: AuthUser }>('/auth/me', token),

  saveToken: async (token: string) => {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  },

  getToken: async () => {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  clearToken: async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
  },
};
