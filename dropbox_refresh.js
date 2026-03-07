// Helper script to exchange an OAuth2 authorization code for
// a Dropbox refresh token.  Run this on the command line after
// visiting the authorization URL described below.
//
// Usage:
//   node dropbox_refresh.js <appKey> <appSecret> <code> [redirectUri]
//
// Example:
//   node dropbox_refresh.js YOUR_KEY YOUR_SECRET 1234567890 
//
// The script prints a JSON blob with access_token, refresh_token, expires_in,
// etc.  You only need to save the refresh_token in config.js.

// prefer built-in fetch when running on Node 18+; otherwise dynamically import node-fetch v3
let fetch;
if (typeof global.fetch === 'function') {
  fetch = global.fetch;
} else {
  fetch = (...args) => import('node-fetch').then(m => m.default(...args));
}

const [,, appKey, appSecret, code, redirectUriArg=''] = process.argv;
if (!appKey || !appSecret || !code) {
  console.error('usage: node dropbox_refresh.js <appKey> <appSecret> <code> [redirectUri]');
  process.exit(1);
}

// if caller doesn't supply a redirect URI, assume localhost callback; this
// must match the URI used to generate the authorization code above (the
// same value that /dropbox-auth uses).
const redirectUri = redirectUriArg || 'http://localhost:3000/dropbox-callback';
if (redirectUriArg === '') {
  console.log('No redirect uri provided; defaulting to', redirectUri);
}
(async() => {
  try {
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    if (redirectUri) params.append('redirect_uri', redirectUri);

    const res = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${appKey}:${appSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    const data = await res.json();
    console.log('response from Dropbox:', JSON.stringify(data, null, 2));
    if (data.refresh_token) {
      // automatically write to config.js if possible
      try {
        const cfgPath = path.resolve(__dirname, 'config.js');
        let cfgText = fs.readFileSync(cfgPath, 'utf8');
        const replaced = cfgText.replace(
          /DROPBOX_REFRESH_TOKEN:\s*(?:process\.env\.DROPBOX_REFRESH_TOKEN\s*\|\|\s*)?['"][^'"]*['"]/,
          `DROPBOX_REFRESH_TOKEN: '${data.refresh_token}'`
        );
        if (replaced !== cfgText) {
          fs.writeFileSync(cfgPath, replaced);
          console.log('wrote refresh token to config.js');
        } else {
          console.log('refresh token not written (pattern not found in config.js)');
        }
      } catch (e) {
        console.error('failed writing refresh token:', e.message);
      }
      console.log('\nUse the refresh_token value in config.js (DROPBOX_REFRESH_TOKEN)');
    }
  } catch (e) {
    console.error('request failed', e);
  }
})();
