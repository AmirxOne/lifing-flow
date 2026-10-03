"use client";

import { create } from "zustand";
import { api } from "@/lib/api";

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  avatarEmoji: string | null;
  onboardingDone: boolean;
  householdId: string | null;
  household: { id: string; name: string; avatarEmoji: string; partner: { id: string; fullName: string; avatarEmoji: string | null } | null } | null;
  isSystemAdmin: boolean;
}

interface AuthState {
  me: MeResponse | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  me: null,
  loaded: false,
  refresh: async () => {
    try {
      const me = await api<MeResponse>("/api/auth/me");
      set({ me, loaded: true });
    } catch {
      set({ me: null, loaded: true });
    }
  },
  logout: async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      set({ me: null, loaded: true });
      window.location.href = "/login";
    }
  },
}));
