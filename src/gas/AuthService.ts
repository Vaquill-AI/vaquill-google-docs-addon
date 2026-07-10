/**
 * Add-on authentication against the Vaquill backend.
 *
 * Uses Apps Script's server-side Google identity token
 * (ScriptApp.getIdentityToken) to obtain a Vaquill (Supabase) session from the
 * backend's /api/v1/auth/google-addon-exchange endpoint. The session is cached
 * per user in UserProperties (never DocumentProperties, which would leak to
 * collaborators) and re-minted from a fresh identity token when it nears
 * expiry, so no Supabase refresh token or anon key ever lives in the add-on.
 *
 * Requires the `openid` OAuth scope in appsscript.json.
 */

var DEFAULT_BACKEND_URL = 'https://api.vaquill.ai';
var SESSION_KEY = 'vaquill_session';
var EXCHANGE_PATH = '/api/v1/auth/google-addon-exchange';
var TOKEN_SKEW_MS = 60 * 1000;

/** The Google account email the add-on is running as, or '' if unavailable. */
function getGoogleEmail() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

/** Base URL of the Vaquill backend (override with a BACKEND_URL script property). */
function getBackendUrl() {
  var url = PropertiesService.getScriptProperties().getProperty('BACKEND_URL');
  return (url || DEFAULT_BACKEND_URL).replace(/\/$/, '');
}

/**
 * Exchanges a fresh Google identity token for a Vaquill session and caches it.
 * Throws 'NO_ACCOUNT' when the Google email has no Vaquill account.
 */
function exchangeIdentityForSession() {
  var identityToken = ScriptApp.getIdentityToken();
  if (!identityToken) {
    throw new Error('Could not obtain a Google identity token. Ensure the openid scope is granted.');
  }

  var response;
  try {
    response = UrlFetchApp.fetch(getBackendUrl() + EXCHANGE_PATH, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ identityToken: identityToken }),
      muteHttpExceptions: true
    });
  } catch (networkError) {
    throw new Error('Could not reach Vaquill to sign in. Check your connection and try again.');
  }

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code === 404) {
    throw new Error('NO_ACCOUNT');
  }
  if (code === 503) {
    throw new Error('Vaquill add-on sign-in is not configured on the server yet.');
  }
  if (code !== 200) {
    throw new Error('Sign-in failed (' + code + '): ' + body);
  }

  var data = JSON.parse(body);
  if (!data || !data.accessToken) {
    throw new Error('Sign-in did not return a valid Vaquill session.');
  }
  // expiresAt is a unix-seconds timestamp when present; fall back to ~55 min.
  var expiresAtMs = data.expiresAt ? data.expiresAt * 1000 : Date.now() + 55 * 60 * 1000;
  var session = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    email: data.email,
    expiresAtMs: expiresAtMs
  };
  PropertiesService.getUserProperties().setProperty(SESSION_KEY, JSON.stringify(session));
  return session;
}

function getStoredSession() {
  var raw = PropertiesService.getUserProperties().getProperty(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Returns a valid Supabase access token, re-minting from identity if needed. */
function getAccessToken() {
  var session = getStoredSession();
  if (
    session &&
    session.accessToken &&
    session.expiresAtMs &&
    session.expiresAtMs - TOKEN_SKEW_MS > Date.now()
  ) {
    return session.accessToken;
  }
  return exchangeIdentityForSession().accessToken;
}

/**
 * Extracts the organization_id from the cached Supabase access token's claims.
 * Returns '' for personal workspaces or when no session exists.
 */
function getOrganizationId() {
  const session = getStoredSession();
  const token = session && session.accessToken ? session.accessToken : '';
  if (!token) return '';
  try {
    const parts = token.split('.');
    if (parts.length < 2) return '';
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payloadJson = Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
    const payload = JSON.parse(payloadJson);
    const appMeta = payload.app_metadata || {};
    return appMeta.organization_id || '';
  } catch (e) {
    return '';
  }
}

/** Returns the signed-in Vaquill account email, or '' if unavailable. */
function getAccountEmail() {
  var session = getStoredSession();
  if (session && session.email) {
    return session.email;
  }
  try {
    return exchangeIdentityForSession().email;
  } catch (e) {
    return '';
  }
}

/**
 * Returns the auth status for the sidebar. Distinguishes a missing Vaquill
 * account (needsSignup) from other failures so the UI can guide the user.
 */
function getAuthStatus() {
  try {
    var email = exchangeIdentityForSession().email;
    return { signedIn: true, email: email, needsSignup: false };
  } catch (e) {
    var message = e && e.message ? e.message : String(e);
    if (message.indexOf('NO_ACCOUNT') !== -1) {
      // Surface the Google account in use so multi-account users understand
      // which identity has no matching Vaquill account.
      return { signedIn: false, email: getGoogleEmail(), needsSignup: true };
    }
    return { signedIn: false, email: '', needsSignup: false, error: message };
  }
}

function signOut() {
  PropertiesService.getUserProperties().deleteProperty(SESSION_KEY);
  return { signedOut: true };
}

// ============================================
// Exports for GAS
// ============================================

(globalThis as any).getBackendUrl = getBackendUrl;
(globalThis as any).getGoogleEmail = getGoogleEmail;
(globalThis as any).getAccessToken = getAccessToken;
(globalThis as any).getOrganizationId = getOrganizationId;
(globalThis as any).getAccountEmail = getAccountEmail;
(globalThis as any).getAuthStatus = getAuthStatus;
(globalThis as any).signOut = signOut;
