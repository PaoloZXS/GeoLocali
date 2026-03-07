// upload_photos.js
//
// Upload all images in a given directory to Google Photos and print their
// resulting product URLs.  Requires credentials file (from Google Cloud
// console) named `client_secret.json` in the current directory and will
// store OAuth tokens in `token.json`.
//
// Usage:
//   node upload_photos.js /path/to/folder
//
// After the first run the script will output a URL; open it in a browser
// and paste the authorization code back into the terminal.  The token will
// then be cached and subsequent invocations will run without interaction.

const fs = require('fs');
const path = require('path');
const {google} = require('googleapis');
const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');

const SCOPES = ['https://www.googleapis.com/auth/photoslibrary'];
const CRED_PATH = path.resolve(__dirname, '../client_secret_369651616048-19hf799h4q6ch26duqompkn3kk8d0dke.apps.googleusercontent.com.json');
const TOKEN_PATH = path.resolve(__dirname, 'token.json');

function authorize() {
    const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
    const {client_id, client_secret, redirect_uris} = creds.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    if (fs.existsSync(TOKEN_PATH)) {
        oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
        return oAuth2Client;
    }
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    return new Promise((resolve, reject) => {
        process.stdout.write('Enter the code from that page here: ');
        process.stdin.once('data', code => {
            code = code.toString().trim();
            oAuth2Client.getToken(code, (err, token) => {
                if (err) return reject(err);
                oAuth2Client.setCredentials(token);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
                console.log('Token stored to', TOKEN_PATH);
                resolve(oAuth2Client);
            });
        });
    });
}

async function uploadFile(auth, filePath) {
    const photos = google.photoslibrary({version: 'v1', auth});
    const media = fs.createReadStream(filePath);
    // upload raw bytes
    const res1 = await photos.mediaItems.upload({
        requestBody: {},
        media: {body: media},
    });
    const uploadToken = res1.data;
    if (!uploadToken) throw new Error('upload token missing');
    const res2 = await photos.mediaItems.create({
        requestBody: {
            newMediaItem: {
                description: path.basename(filePath),
                simpleMediaItem: {uploadToken}
            }
        }
    });
    return res2.data.newMediaItem;
}

async function main() {
    const dir = process.argv[2];
    if (!dir) {
        console.error('Usage: node upload_photos.js /path/to/folder');
        process.exit(1);
    }
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        console.error('Not a directory:', dir);
        process.exit(1);
    }
    const auth = await authorize();
    const db = createClient({url:DB_URL, authToken:DB_TOKEN});
    const files = fs.readdirSync(dir).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    });
    for (const file of files) {
        const filePath = path.join(dir, file);
        process.stdout.write('Uploading ' + file + ' ... ');
        // extract locale id from filename prefix (e.g. 123_name.jpg)
        const m = file.match(/^(\d+)_/);
        const localeId = m ? parseInt(m[1], 10) : null;
        try {
            const item = await uploadFile(auth, filePath);
            console.log('done, id=', item.id);
            console.log('      url=', item.productUrl);
            if (localeId) {
                await db.execute(
                    'INSERT INTO tblocali_photos (locale_id, url) VALUES (?, ?)',
                    [localeId, item.productUrl]
                );
                console.log('      saved to tblocali_photos for locale', localeId);
            }
        } catch (e) {
            console.error('error', e.message);
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});