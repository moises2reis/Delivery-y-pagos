import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://htxzsefmejercvwlarfl.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0eHpzZWZtZWplcmN2d2xhcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzE2NjIsImV4cCI6MjEwNDgwNzY2Mn0.oxjaY99j5dvFWfOPiXSVCigc1MKKLxTXMjNB1m_IxVw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
