import { supabase } from './supabase.js';

/**
 * Handles the Google OAuth flow using Chrome's identity API
 * and signs the user into Supabase using the received ID token.
 */
export async function loginWithGoogle() {
  return new Promise((resolve, reject) => {
    // 1. Launch Web Auth Flow using Chrome Identity
    chrome.identity.getAuthToken({ interactive: true }, async function(token) {
      if (chrome.runtime.lastError) {
        console.error('[DataShadow Auth] Auth error:', chrome.runtime.lastError.message);
        return reject(chrome.runtime.lastError);
      }

      try {
        // 2. We need the ID token to sign in to Supabase.
        // We fetch the user's info using the access token to get their email/id.
        // But for Supabase, we ideally need the ID token.
        // Let's use Supabase's signInWithIdToken by fetching the user's details first.
        
        // Fetch user info from Google
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const userData = await response.json();

        // Check if there is an existing session in local storage
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            // Since we can't easily extract the ID token via getAuthToken directly in MV3 without a custom flow,
            // we will use the access token to sign up/in using a custom mechanism if needed, 
            // OR use the launchWebAuthFlow pointing to Supabase directly.

            // The better way in MV3 is often to let Supabase handle the OAuth flow via chrome.identity.launchWebAuthFlow
            const authUrl = `${supabase.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${chrome.identity.getRedirectURL()}`;
            
            chrome.identity.launchWebAuthFlow({
              url: authUrl,
              interactive: true
            }, async (redirectUrl) => {
              if (chrome.runtime.lastError || !redirectUrl) {
                return reject(chrome.runtime.lastError);
              }

              // Extract access token and refresh token from the redirect URL hash
              const url = new URL(redirectUrl.replace('#', '?'));
              const accessToken = url.searchParams.get('access_token');
              const refreshToken = url.searchParams.get('refresh_token');

              if (accessToken && refreshToken) {
                const { data, error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken
                });
                
                if (error) throw error;
                resolve(data.user);
              } else {
                reject(new Error('No tokens in redirect URL'));
              }
            });
        } else {
            resolve(session.user);
        }
      } catch (error) {
        console.error('[DataShadow Auth] Supabase sign-in error:', error);
        reject(error);
      }
    });
  });
}

/**
 * Gets the currently logged-in user from Supabase.
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Logs the user out.
 */
export async function logout() {
  await supabase.auth.signOut();
  return new Promise((resolve) => {
    chrome.identity.clearAllCachedAuthTokens(() => resolve());
  });
}
