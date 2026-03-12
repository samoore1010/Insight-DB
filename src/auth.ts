// Authentication types and context
import { createContext, useContext } from "react";

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "viewer";
  allowedRegions: string[]; // empty = all regions
  location: string; // "executive" or a department name
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export interface AuthContextType {
  auth: AuthState;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  users: User[];
  refreshUsers: () => Promise<void>;
  createUser: (username: string, password: string, displayName: string, role: "admin" | "viewer", allowedRegions: string[]) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, updates: { displayName?: string; role?: "admin" | "viewer"; allowedRegions?: string[]; password?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
