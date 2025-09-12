
'use client';
import { create } from 'zustand';

type User = { id:number; email:string; roles:string[]; tenant_id:number };
type AuthState = {
  user: User | null;
  accessToken: string | null;
  setSession: (u:User|null, t:string|null)=>void;
  clear: ()=>void;
};

export const useAuthStore = create<AuthState>((set)=>({
  user: null,
  accessToken: null,
  setSession: (user, token)=> set({ user, accessToken: token }),
  clear: ()=> set({ user:null, accessToken:null }),
}));
