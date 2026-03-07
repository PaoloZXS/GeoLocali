const http = require('http');

// credentials to test - make sure user exists
const data = JSON.stringify({username:'test@example.com',password:'Passw0rd!'});

// perform login and retain cookie then request session info
const loginOptions={
  hostname:'localhost',port:3000,path:'/api/login',method:'POST',
  headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}
};

const req=http.request(loginOptions,res=>{
  console.log('login status',res.statusCode);
  let cookies = res.headers['set-cookie'];
  res.setEncoding('utf8');
  let body='';
  res.on('data',c=>body+=c);
  res.on('end',()=>{
    console.log('login body',body);
    if (cookies && cookies.length) {
      // take first cookie (session)
      const cookieHeader = cookies.map(c=>c.split(';')[0]).join('; ');
      // now request session endpoint
      const sessOptions = {
        hostname:'localhost',port:3000,path:'/api/session',method:'GET',
        headers:{'Cookie': cookieHeader}
      };
      const req2 = http.request(sessOptions, res2 => {
        console.log('session status', res2.statusCode);
        res2.setEncoding('utf8');
        let b2 = '';
        res2.on('data', c=>b2+=c);
        res2.on('end', () => {
          console.log('session body', b2);
        });
      });
      req2.on('error', e=>console.error('session request error', e));
      req2.end();
    }
  });
});
req.on('error',e=>console.error('problem',e));
req.write(data);
req.end();
