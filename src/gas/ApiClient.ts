/**
 * Authenticated client for the Vaquill backend.
 *
 * Server-side UrlFetch (exempt from CORS) carrying the user's Supabase bearer
 * from AuthService. Targets NON-streaming JSON endpoints only, because Apps
 * Script's UrlFetch is blocking and cannot consume Server-Sent Events. This is
 * the sole path for all of the add-on's AI features (there is no local model
 * fallback); auth or backend failures surface to the user.
 */

// A clear, user-facing message for an account/session that could not be
// established. The sidebar surfaces this verbatim.
// Built dynamically so it can name the Google account in use, which helps
// multi-account users who signed up under a different identity.
function noAccountMessage() {
  var g = globalThis as any;
  var email = '';
  try {
    email = g.getGoogleEmail ? g.getGoogleEmail() : '';
  } catch (e) {
    email = '';
  }
  var who = email ? 'the Google account ' + email : 'this Google account';
  return 'No Vaquill account is linked to ' + who + '. Sign up at vaquill.ai with this email, then reopen the add-on.';
}

/**
 * Calls a backend JSON endpoint with the signed-in user's bearer token.
 * Retries once after re-authenticating on a 401. Auth/quota failures are
 * translated into plain-language messages (no raw HTTP text).
 */
function callBackend(path, method, body) {
  var g = globalThis as any;

  var buildOptions = function (token) {
    var options = {
      method: (method || 'get').toLowerCase(),
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Timezone': Session.getScriptTimeZone() || 'UTC'
      },
      muteHttpExceptions: true
    };
    if (body !== undefined && body !== null) {
      options.payload = JSON.stringify(body);
    }
    return options;
  };

  // Establish a Vaquill session. Translate the "no account" and other sign-in
  // failures into plain language so the user knows what to do.
  var token;
  try {
    token = g.getAccessToken();
  } catch (authError) {
    var m = authError && authError.message ? authError.message : String(authError);
    if (m.indexOf('NO_ACCOUNT') !== -1) {
      throw new Error(noAccountMessage());
    }
    throw new Error('Could not sign in to Vaquill. ' + m);
  }

  var url = g.getBackendUrl() + path;

  // muteHttpExceptions handles HTTP status codes, but a DNS/connection failure
  // still throws; translate that into a plain-language message.
  var doFetch = function (opts) {
    try {
      return UrlFetchApp.fetch(url, opts);
    } catch (networkError) {
      throw new Error('Could not reach Vaquill. Check your connection and try again.');
    }
  };

  var response = doFetch(buildOptions(token));
  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code === 401) {
    // The cached token may have been revoked; drop it and re-mint once.
    g.signOut();
    try {
      token = g.getAccessToken();
    } catch (reauthError) {
      var rm = reauthError && reauthError.message ? reauthError.message : String(reauthError);
      if (rm.indexOf('NO_ACCOUNT') !== -1) {
        throw new Error(noAccountMessage());
      }
      throw new Error('Your Vaquill session expired and could not be renewed. ' + rm);
    }
    response = doFetch(buildOptions(token));
    code = response.getResponseCode();
    text = response.getContentText();
  }

  // Retry once on a transient upstream error (backend cold start, proxy hiccup).
  if (code === 502 || code === 503 || code === 504) {
    Utilities.sleep(1200);
    response = doFetch(buildOptions(token));
    code = response.getResponseCode();
    text = response.getContentText();
  }

  if (code === 401 || code === 403) {
    throw new Error('Your Vaquill session is not valid. Please reopen the add-on.');
  }
  if (code === 502 || code === 503 || code === 504) {
    throw new Error('Vaquill is temporarily unavailable. Please try again in a moment.');
  }
  if (code === 402) {
    throw new Error('You have reached your Vaquill usage limit for this plan.');
  }
  if (code === 429) {
    throw new Error('Too many requests. Please wait a moment and try again.');
  }
  if (code < 200 || code >= 300) {
    var detail = '';
    try {
      var parsed = JSON.parse(text);
      detail = parsed && parsed.detail ? ' ' + parsed.detail : '';
    } catch (e) {
      detail = '';
    }
    throw new Error('Vaquill could not complete this request (' + code + ').' + detail);
  }

  return text ? JSON.parse(text) : null;
}

// ============================================
// Exports for GAS
// ============================================

(globalThis as any).callBackend = callBackend;
