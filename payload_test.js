(async function(){
  // generate a large JPEG buffer so server resizing logic is exercised
  let imgBuf;
  try {
    const sharp = require('sharp');
    // create random noise image to ensure the JPEG is fairly large
    const width = 3000;
    const height = 3000;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = Math.floor(Math.random() * 256);
    }
    imgBuf = await sharp(raw, {raw:{width, height, channels:3}})
                .jpeg({ quality: 100 })
                .toBuffer();
    console.log('created test image, size=', imgBuf.length);
  } catch(err) {
    console.error('could not generate image (sharp missing?). using dummy buffer', err.message);
    imgBuf = Buffer.alloc(600*1024,'a');
  }
  const form = new FormData();
  form.append('locale_id', 1);
  form.append('photo', new Blob([imgBuf], {type:'image/jpeg'}), 'test.jpg');
  try {
    const r = await fetch('http://localhost:3000/upload-photo',{
      method:'POST',
      body: form
    });
    console.log('status',r.status);
    console.log(await r.text());
  } catch(e){ console.error('err', e); }
})();