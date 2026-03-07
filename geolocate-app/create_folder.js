// simple script to create a folder in Dropbox using the current config token
const fetch = (typeof global.fetch === 'function') ? global.fetch : require('node-fetch');
const cfg = require('./config');

async function getToken() {
  return process.env.DROPBOX_TOKEN || cfg.DROPBOX_TOKEN;
}

async function createFolder(folderPath) {
  const token = await getToken();
  if (!token) throw new Error('no Dropbox token available');
  const res = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({path: folderPath, autorename: false})
  });
  const data = await res.json();
  if (!res.ok) throw new Error('failed: ' + JSON.stringify(data));
  console.log('created folder', data);
}

createFolder('/geoPhoto').catch(e=>{
  console.error('error', e.message);
});
