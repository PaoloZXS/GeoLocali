const fs = require('fs');
const path = require('path');
const fetch = (typeof global.fetch === 'function') ? global.fetch : require('node-fetch');
const sharp = require('sharp');
const cfg = require('./config');

async function getToken() {
  return process.env.DROPBOX_TOKEN || cfg.DROPBOX_TOKEN;
}

// resize/quality reduction using sharp until size <= maxBytes
async function ensureMaxSize(localPath, maxBytes) {
  let buf = fs.readFileSync(localPath);
  let img = sharp(buf);
  let metadata = await img.metadata();

  // attempt quality reduction and scaling iteratively
  let quality = 90;
  let width = metadata.width;
  let height = metadata.height;
  let out;

  while (true) {
    out = await img
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.length <= maxBytes) break;
    if (quality > 20) {
      quality -= 10;
      continue;
    }
    // reduce dimensions by 10%
    width = Math.floor(width * 0.9);
    height = Math.floor(height * 0.9);
    img = sharp(buf).resize(width, height);
    quality = 90; // reset quality for new size
  }

  fs.writeFileSync(localPath, out);
  return out;
}

async function upload(localPath, dropboxName) {
  const token = await getToken();
  if (!token) throw new Error('no Dropbox token available');

  // if file is an image and >500KB, try to shrink it
  const stats = fs.statSync(localPath);
  let content;
  if (stats.size > 500000) {
    try {
      content = await ensureMaxSize(localPath, 500000);
      console.log('resized/processed image; final size', content.length, 'bytes');
    } catch (e) {
      console.warn('could not resize image:', e.message);
      content = fs.readFileSync(localPath);
    }
  } else {
    content = fs.readFileSync(localPath);
  }

  const name = dropboxName || path.basename(localPath);
  const dropPath = '/geoPhoto/' + name;

  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: dropPath,
        mode: 'add',
        autorename: true,
        mute: false
      })
    },
    body: content
  });

  const data = await res.json();
  if (!res.ok) throw new Error('upload failed: ' + JSON.stringify(data));
  console.log('uploaded', data.path_display);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('provide a local file path');
    process.exit(1);
  }
  upload(args[0]).catch(e => console.error('error', e.message));
}
