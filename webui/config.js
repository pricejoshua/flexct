// Supabase configuration
// Replace these with your actual Supabase project credentials
const SUPABASE_CONFIG = {
  url: 'https://jxzloxjlvzpmyduucjoq.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4emxveGpsdnpwbXlkdXVjam9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNjUxNzIsImV4cCI6MjA3NDg0MTE3Mn0.H4wuPUl3QpnGtSBGTrdpSx-WN7qQbtsID76bbqixCN4'
};

// Initialize Supabase client
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Make globally available for non-module scripts
window.supabaseClient = supabase;
window.SUPABASE_CONFIG = SUPABASE_CONFIG;

// Export for ES6 modules
export { supabase, SUPABASE_CONFIG };
