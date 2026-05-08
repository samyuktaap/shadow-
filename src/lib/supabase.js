import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hayotpzqanmjpacmbwvd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhheW90cHpxYW5tanBhY21id3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDYyODAsImV4cCI6MjA5MzgyMjI4MH0.G4hLJ80XO_9oOIyZizP4-weLApSOlk4KgmywL1oWiDw';

// We initialize the client but wait to pass the access token
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // In chrome extensions, we want to handle our own storage and token management
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});
