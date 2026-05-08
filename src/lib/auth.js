// DataShadow Auth — Pure JS, no npm dependencies needed
// Uses Supabase REST API + chrome.identity directly

const SUPABASE_URL = 'https://hayotpzqanmjpacmbwvd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhheW90cHpxYW5tanBhY21id3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDYyODAsImV4cCI6MjA5MzgyMjI4MH0.G4hLJ80XO_9oOIyZizP4-weLApSOlk4KgmywL1oWiDw';

export async function loginWithGoogle() {
  // This URL is stable for this extension (based on extension ID)
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (redirectedTo) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!redirectedTo) {
        return reject(new Error('No redirect URL received'));
      }

      try {
        // Supabase returns tokens in the URL hash: #access_token=...&refresh_token=...
        const hashStr = redirectedTo.includes('#') ? redirectedTo.split('#')[1] : redirectedTo.split('?')[1];
        const params = new URLSearchParams(hashStr);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (!accessToken) throw new Error('No access token in redirect');

        // Fetch user details from Supabase using the access token
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY
          }
        });
        const user = await res.json();

        // Save session to chrome.storage
        await chrome.storage.local.set({
          supabaseToken: accessToken,
          supabaseRefreshToken: refreshToken,
          supabaseUser: user
        });

        resolve(user);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function getCurrentUser() {
  const data = await chrome.storage.local.get(['supabaseUser', 'supabaseToken']);
  if (!data.supabaseToken || !data.supabaseUser) return null;
  return data.supabaseUser;
}

export async function logout() {
  await chrome.storage.local.remove(['supabaseToken', 'supabaseRefreshToken', 'supabaseUser']);
}

// Helper: make authenticated requests to Supabase REST API
export async function supabaseFetch(path, options = {}) {
  const { supabaseToken } = await chrome.storage.local.get('supabaseToken');
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${supabaseToken || SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation',
      ...(options.headers || {})
    }
  });
}
