// node-fetch may export the function directly or as .default depending on resolution context
const _nf = require('node-fetch');
const fetch = (_nf && typeof _nf === 'function') ? _nf : (_nf && _nf.default) ? _nf.default : null;
if (!fetch) throw new Error('unable to load fetch');
(async () => {
  try {
    const login = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username: 'paolo.giorsetti@codarini.com', password: '123456Z@' }),
    });
    console.log('login status', login.status);
    const cookies = login.headers.raw()['set-cookie'];
    console.log('cookies', cookies);
    const cookie = cookies && cookies.map(c => c.split(';')[0]).join('; ');
    const resp = await fetch('http://localhost:3000/approved-users', { headers: { cookie } });
    console.log('approved status', resp.status);
    const txt = await resp.text();
    console.log('body', txt);

    // try revoking one user if list non-empty
    if (txt && txt.startsWith('[')) {
      const arr = JSON.parse(txt);
      if (arr.length) {
        console.log('revoking first user', arr[0].uid);
        const r2 = await fetch('http://localhost:3000/revoke-user', {
          method:'POST', headers:{'Content-Type':'application/json', cookie},
          body: JSON.stringify({uid:arr[0].uid})
        });
        console.log('revoke status', r2.status, await r2.text());
      }
    }
  } catch (e) {
    console.error(e);
  }
})();