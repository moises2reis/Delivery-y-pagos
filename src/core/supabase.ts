import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://htxzsefmejercvwlarfl.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0eHpzZWZtZWplcmN2d2xhcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzE2NjIsImV4cCI6MjEwNDgwNzY2Mn0.oxjaY99j5dvFWfOPiXSVCigc1MKKLxTXMjNB1m_IxVw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const DEFAULT_MAPS_FUNCTION = env.VITE_SUPABASE_MAPS_FUNCTION || 'Logica_maps';
export const DEFAULT_MAPS_RESOLVER_URL = env.VITE_MAPS_RESOLVER_URL || `${supabaseUrl}/functions/v1/Logica_maps`;

export function getMapsResolverUrl(): string {
  try {
    const saved = localStorage.getItem('maps_resolver_url');
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return DEFAULT_MAPS_RESOLVER_URL;
}

export function saveMapsResolverUrl(url: string) {
  try {
    if (url && url.trim()) {
      localStorage.setItem('maps_resolver_url', url.trim());
    } else {
      localStorage.removeItem('maps_resolver_url');
    }
  } catch {}
}
