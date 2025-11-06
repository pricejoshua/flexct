// Shared Authentication Module

import { supabase } from '../config.js';

/**
 * Get current user session
 */
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/**
 * Sign up with email and password
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

/**
 * Sign out current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Handle auth form submission (tries sign in, falls back to sign up)
 */
export async function handleAuth(email, password) {
  try {
    return await signIn(email, password);
  } catch (error) {
    if (error.message.includes('Invalid login credentials')) {
      return await signUp(email, password);
    }
    throw error;
  }
}
