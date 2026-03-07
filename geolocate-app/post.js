const http = require('http');
const data = JSON.stringify({latitude:33,longitude:44,address:'debug'});
const options={
  hostname:'localhost',port:3000,path:'/save-location',method:'POST',
  headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}
};
const req=http.request(options,res=>{
  console.log('status',res.statusCode);
  res.setEncoding('utf8');
  let body='';res.on('data',c=>body+=c);
  res.on('end',()=>{console.log('body',body);});
});
req.on('error',e=>console.error('problem',e));
req.write(data);
req.end();
