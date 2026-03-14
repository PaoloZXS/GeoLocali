// Simple Express server to serve the HTML page for geolocation
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");

// diagnostic startup log so we can see if the module even loads on Vercel
console.log("server.js loaded, NODE_ENV=", process.env.NODE_ENV);
console.log("environment vars", {
  DB_URL: process.env.DB_URL,
  DB_TOKEN: process.env.DB_TOKEN,
  JWT_SECRET: process.env.JWT_SECRET ? "***" : undefined
});

// database client (Turso/LibSQL)
const { createClient } = require("@libsql/client");

// load values from environment but allow a local config.js for development
let DB_URL = process.env.DB_URL;
let DB_TOKEN = process.env.DB_TOKEN;
// try to load optional config.js just once; on Vercel it will usually be absent
let cfg = {};
try {
  cfg = require("./config");
  if (!DB_URL && cfg.DB_URL) DB_URL = cfg.DB_URL;
  if (!DB_TOKEN && cfg.DB_TOKEN) DB_TOKEN = cfg.DB_TOKEN;
} catch (e) {
  // config.js not present or failed to load – that's fine in production
  console.log("config.js not loaded; using environment variables only");
}

const app = express();
const PORT = process.env.PORT || 3000;

// export app for serverless deployments
module.exports = app;

// if run directly, start the server (useful for local development)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log("Server listening on port", PORT);
  });
}

// filesystem module (used elsewhere for config/credentials)
const fs = require("fs");

// parse JSON bodies (increase limit for image uploads)
app.use(express.json({ limit: "50mb" }));

// simple request logger for debugging
app.use((req, res, next) => {
  const codes = req.path.split("").map((ch) => ch.charCodeAt(0));
  console.log(
    "[" + process.pid + "] incoming",
    req.method,
    req.path,
    "codes",
    codes,
    "ctype",
    req.headers["content-type"],
    "body",
    req.body
  );
  try {
    fs.appendFileSync(
      path.join(__dirname, "req-log.txt"),
      `${new Date().toISOString()} pid=${process.pid} ${req.method} ${req.path} codes=${codes} ctype=${req.headers["content-type"]} body=${JSON.stringify(req.body)}\n`
    );
  } catch (e) {
    console.error("req log write failed", e);
  }
  next();
});

// parse urlencoded bodies so we can handle form POSTs
app.use(express.urlencoded({ extended: true }));

// If an incoming request is prefixed with /public/, rewrite it to match
// the static assets directory. This lets pages reference assets via
// /public/... (as some older HTML templates do) while still serving from
// the same public folder.
app.use((req, res, next) => {
  if (req.path.startsWith("/public/")) {
    req.url = req.url.replace(/^\/public/, "");
  }
  next();
});

// serve static assets (CSS, JS, images, etc.) from the public folder
// this ensures requests like "/login/style.css" return the actual file
// instead of falling through to a 404 HTML response, which triggers the
// MIME‑type nosniff error in the browser.
app.use(express.static(path.join(__dirname, "public")));

// explicit fallbacks for common PWA assets (some hosts may not serve static
// files as expected when all routes are rewritten to the same entrypoint)
app.get(["/offline.js", "/sw.js"], (req, res) => {
  const file = path.join(__dirname, "public", req.path.replace(/\//g, ""));
  res.sendFile(file);
});

// multer for handling multipart/form-data uploads (used by /upload-photo)
const multer = require("multer");
const uploadMiddleware = multer({ storage: multer.memoryStorage() });

// fetch helper for reverse-geocoding (Node 18+ has built-in fetch).  use
// whichever is available so the code works on older node versions too.
const fetch =
  typeof global.fetch === "function" ? global.fetch : require("node-fetch");

// image resizing helper (used when uploading photos)
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.warn(
    "sharp module not available; images will not be resized. run `npm install sharp` to enable."
  );
}

// resize/compress an image buffer so that it does not exceed roughly 500KB
// preserves aspect ratio and attempts quality reduction when possible
async function ensureMaxImageSize(buffer) {
  const maxBytes = 500 * 1024;
  if (!sharp || buffer.length <= maxBytes) return buffer;

  const meta = await sharp(buffer).metadata();
  const format = (meta.format || "").toLowerCase();
  let out = buffer;
  let quality = 80;

  // try reducing quality first (only for formats that support it)
  if (["jpeg", "jpg", "webp"].includes(format)) {
    while (out.length > maxBytes && quality >= 30) {
      out = await sharp(buffer).toFormat(format, { quality }).toBuffer();
      quality -= 10;
    }
    if (out.length <= maxBytes) {
      console.log("ensureMaxImageSize: compressed by quality to", out.length);
      return out;
    }
  }

  // if still too large, scale dimensions down keeping aspect ratio
  if (meta.width && meta.height) {
    const scale = Math.sqrt(maxBytes / out.length);
    const width = Math.max(1, Math.floor(meta.width * scale));
    const height = Math.max(1, Math.floor(meta.height * scale));
    console.log(
      "ensureMaxImageSize: resizing from",
      meta.width,
      "x",
      meta.height,
      "to",
      width,
      "x",
      height,
      "with quality",
      quality
    );
    let t = sharp(buffer).resize({ width, height, fit: "inside" });
    if (["jpeg", "jpg", "webp"].includes(format)) {
      t = t.toFormat(format, { quality });
    }
    out = await t.toBuffer();
  }
  console.log("ensureMaxImageSize: final size", out.length);
  return out;
}

// JWT helpers (no stateful sessions)
function signToken(uid) {
  const secret = process.env.JWT_SECRET || cfg.JWT_SECRET;
  return jwt.sign({ uid }, secret, { expiresIn: "7d" });
}
function verifyTokenHeader(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const secret = process.env.JWT_SECRET || cfg.JWT_SECRET;
    return jwt.verify(token, secret);
  } catch (e) {
    return null;
  }
}

// initialize connection to remote DB
const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

// ensure tables exist (and perform lightweight migrations)
const createTableSql = `
CREATE TABLE IF NOT EXISTS tblocali (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  address TEXT,
  name TEXT,
  type TEXT,
  civic TEXT,
  city TEXT,
  closingDay TEXT
);
`;
db.execute(createTableSql)
  .then(() => console.log("Ensured tblocali table exists"))
  .catch((err) => console.error("Error creating tblocali table:", err));

// photos table; we add dropbox_path so we can generate fresh temp links later
const createPhotosSql = `
CREATE TABLE IF NOT EXISTS tblocali_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locale_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  dropbox_path TEXT    -- path within Dropbox (e.g. /geoPhoto/filename)
);
`;

// make sure we add column if it's missing (ALTER TABLE ADD COLUMN is idempotent)
db.execute(createPhotosSql)
  .then(() => console.log("Ensured tblocali_photos table exists"))
  .catch((err) => console.error("Error creating tblocali_photos table:", err));

// after table creation, try adding column just in case older version exists
db.execute("ALTER TABLE tblocali_photos ADD COLUMN dropbox_path TEXT;")
  .then(() => console.log("Added dropbox_path column (or already existed)"))
  .catch((e) => {
    /* sqlite throws error if column exists; ignore */
    if (!/duplicate column name/i.test(e.message))
      console.warn("add column error", e.message);
  });

// user registration table
const createUserSql = `
CREATE TABLE IF NOT EXISTS user (
  uid TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
`;
db.execute(createUserSql)
  .then(() => console.log("Ensured user table exists"))
  .catch((err) => console.error("Error creating user table:", err));

// add name column if not present (SQLite will error if exists)
const alterUserSql = `ALTER TABLE user ADD COLUMN name TEXT;`;
db.execute(alterUserSql)
  .then(() => console.log("Ensured name column in user table"))
  .catch((err) => {
    // ignore error if column already exists
    if (!/duplicate column/i.test(err.message))
      console.error("Error adding name column:", err);
  });

// add approved flag default 0 for new registrations
const alterApprovedSql = `ALTER TABLE user ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;`;
db.execute(alterApprovedSql)
  .then(() => console.log("Ensured approved column in user table"))
  .catch((err) => {
    if (!/duplicate column/i.test(err.message))
      console.error("Error adding approved column:", err);
  });

// add any missing columns for tblocali (ignore errors if already exist)
const addCols = [
  "ALTER TABLE tblocali ADD COLUMN name TEXT",
  "ALTER TABLE tblocali ADD COLUMN type TEXT",
  "ALTER TABLE tblocali ADD COLUMN civic TEXT",
  "ALTER TABLE tblocali ADD COLUMN city TEXT",
  "ALTER TABLE tblocali ADD COLUMN closingDay TEXT"
];
addCols.forEach((sql) => {
  db.execute(sql).catch((err) => {
    if (!/duplicate column/i.test(err.message))
      console.error("Error adding column to tblocali", err);
  });
});

// debug: log current tblocali columns
db.execute("PRAGMA table_info('tblocali')")
  .then((r) => console.log("tblocali schema:", r.rows))
  .catch((err) => console.error("Error fetching tblocali schema", err));

// ------------------------------------------------------------------
// helper used by both startup logic and an explicit endpoint
async function reverseGeocode(lat, lon) {
  if (lat == null || lon == null) return null;

  // cfg variable was loaded at startup; fall back to env if absent
  const liq = process.env.LOCATIONIQ_KEY || cfg.LOCATIONIQ_KEY;
  const ocg = process.env.OPENCAGE_KEY || cfg.OPENCAGE_KEY;

  // 1. LocationIQ if configured
  if (liq) {
    const url =
      `https://us1.locationiq.com/v1/reverse.php?key=${encodeURIComponent(liq)}` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        return d.address || null;
      } else {
        console.error("locationiq HTTP", r.status, r.statusText);
        const txt = await r.text();
        console.error("  body:", txt.substring(0, 200));
      }
    } catch (e) {
      console.error("locationiq error", e.message);
    }
    // fallthrough
  }

  // 2. OpenCage (with/site public key)
  const publicOpenCageKey = "edbf0421af0f4e19882ac0d0aa9d0d71";
  const ocgKey = ocg || publicOpenCageKey;
  if (ocgKey) {
    const url =
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(lat + " " + lon)}` +
      `&key=${encodeURIComponent(ocgKey)}&no_annotations=1&language=it`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        if (d.status && d.status.code === 200 && d.results && d.results.length)
          return d.results[0].components || d.results[0].formatted || null;
      } else {
        console.error("opencage HTTP", r.status, r.statusText);
        const txt = await r.text();
        console.error("  body:", txt.substring(0, 200));
      }
    } catch (e) {
      console.error("opencage error", e.message);
    }
    // fallthrough
  }

  // 3. fallback to Nominatim
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "geolocate-app/1.0 (you@example.com)" }
    });
    if (!res.ok) {
      console.error("reverse geocode HTTP", res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    return data.address || null;
  } catch (e) {
    console.error("reverse geocode error", e.message);
    return null;
  }
}

// ----------------------------------------------------------
// Google Photos helper (no longer used; Google integration removed)
// const {google} = require('googleapis');
// const GP_CRED_PATH = path.resolve(__dirname, '../client_secret_369651616048-19hf799h4q6ch26duqompkn3kk8d0dke.apps.googleusercontent.com.json');
// const GP_TOKEN_PATH = path.resolve(__dirname, 'token.json');
// let googlePhotosClient = null;

// ------------------------------------------------------------------
// Dropbox helper: we prefer using a refresh token (long‑lived) and
// exchanging it for access tokens automatically.  The only values you
// need to configure are:
//   DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN
// optionally DROPBOX_TOKEN for quick manual overrides.
//
// A helper script (dropbox_refresh.js) is provided to obtain the
// refresh token once by authorizing the app in your browser.

let dropboxAccessToken = null;
let dropboxTokenExpiry = 0; // epoch ms

async function refreshDropboxToken() {
  // use previously-loaded cfg object
  const key = process.env.DROPBOX_APP_KEY || cfg.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET || cfg.DROPBOX_APP_SECRET;
  const refresh =
    process.env.DROPBOX_REFRESH_TOKEN || cfg.DROPBOX_REFRESH_TOKEN;
  if (!key || !secret || !refresh) {
    console.log(
      "Dropbox refresh flow not configured; falling back to static DROPBOX_TOKEN"
    );
    return;
  }
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refresh);
  params.append("client_id", key);
  params.append("client_secret", secret);

  const r = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error("refresh token request failed: " + txt);
  }
  const d = await r.json();
  dropboxAccessToken = d.access_token;
  dropboxTokenExpiry = Date.now() + (d.expires_in - 60) * 1000;
  console.log(
    "refreshed Dropbox access token, expires in",
    d.expires_in,
    "seconds"
  );
}

async function getDropboxAccessToken() {
  if (dropboxAccessToken && Date.now() < dropboxTokenExpiry) {
    return dropboxAccessToken;
  }
  await refreshDropboxToken();
  // if refresh flow failed, fall back to static token
  return process.env.DROPBOX_TOKEN || cfg.DROPBOX_TOKEN;
}

async function checkDropboxToken() {
  try {
    const token = await getDropboxAccessToken();
    if (!token) {
      console.log("no Dropbox token available, uploads will be local");
      return;
    }
    const tlog = token.length > 10 ? token.slice(0, 8) + "..." : token;
    console.log(`Dropbox token in use (prefix ${tlog})`);
    const r = await fetch(
      "https://api.dropboxapi.com/2/users/get_current_account",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
        // no body at all: Dropbox expects an empty POST (not even a JSON null)
      }
    );
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(txt);
    }
    const info = await r.json();
    console.log("Dropbox token valid for account:", info.email);
  } catch (e) {
    console.error("Dropbox token check failed:", e.message);
  }
}

checkDropboxToken();

// --- convenience endpoints to obtain a Dropbox refresh token ---
// visit /dropbox-auth in your browser to start the flow; after
// approving the app you'll be redirected back to /dropbox-callback
// which will display the JSON response containing the refresh token.
app.get("/dropbox-auth", (req, res) => {
  // cfg already loaded
  const key = process.env.DROPBOX_APP_KEY || cfg.DROPBOX_APP_KEY;
  if (!key) return res.status(500).send("Dropbox app key not configured");
  const redirect = `${req.protocol}://${req.get("host")}/dropbox-callback`;
  const url =
    `https://www.dropbox.com/oauth2/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(key)}` +
    `&token_access_type=offline` +
    `&redirect_uri=${encodeURIComponent(redirect)}`;
  console.log("dropbox-auth redirect to", url, "(redirect uri", redirect, ")");
  // if user wants to inspect instead of automatically redirect, add ?debug=1
  if (req.query.debug === "1") {
    return res.send(`<p>redirect url: <a href="${url}">${url}</a></p>`);
  }
  res.redirect(url);
});

app.get("/dropbox-callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("missing code");
  const key = process.env.DROPBOX_APP_KEY || cfg.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET || cfg.DROPBOX_APP_SECRET;
  if (!key || !secret)
    return res.status(500).send("app key/secret not configured");
  const params = new URLSearchParams();
  params.append("code", code);
  params.append("grant_type", "authorization_code");
  params.append("client_id", key);
  params.append("client_secret", secret);
  // include redirect_uri to match the one used during authorization
  const redirect = `${req.protocol}://${req.get("host")}/dropbox-callback`;
  params.append("redirect_uri", redirect);
  console.log("exchanging code with redirect_uri", redirect);

  try {
    const r = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    const data = await r.json();
    let extra = "";
    if (data.refresh_token) {
      try {
        const cfgPath = path.resolve(__dirname, "config.js");
        let cfgText = fs.readFileSync(cfgPath, "utf8");
        const replaced = cfgText.replace(
          /DROPBOX_REFRESH_TOKEN:\s*(?:process\.env\.DROPBOX_REFRESH_TOKEN\s*\|\|\s*)?['"][^'"]*['"]/,
          `DROPBOX_REFRESH_TOKEN: '${data.refresh_token}'`
        );
        if (replaced !== cfgText) {
          fs.writeFileSync(cfgPath, replaced);
          console.log("wrote refresh token to config.js");
          extra = "\n<p><strong>refresh token saved to config.js</strong></p>";
        }
      } catch (e) {
        console.error("failed to write refresh token:", e);
      }
    }
    res.send(`<pre>${JSON.stringify(data, null, 2)}</pre>${extra}`);
  } catch (err) {
    res.status(500).send("request failed: " + err.message);
  }
});

async function uploadToDropbox(buffer, filename) {
  // get a (possibly freshly refreshed) access token
  const token = await getDropboxAccessToken();
  if (!token) throw new Error("Dropbox token missing");
  console.log("uploadToDropbox using token prefix", token.slice(0, 8));

  // always place uploaded assets inside "geoPhoto" folder in Dropbox
  const dropboxPath = "/geoPhoto/" + filename;
  console.log("uploadToDropbox will write to", dropboxPath);

  // upload file
  let r = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: dropboxPath,
        mode: "overwrite",
        autorename: false,
        mute: true
      })
    },
    body: buffer
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error("dropbox upload failed: " + r.status + " " + txt);
  }
  const info = await r.json();

  // attempt to create a permanent shared link; if that fails we will still have
  // info.path_lower which we store in the database so we can generate a fresh
  // temporary link later.
  try {
    r = await fetch(
      "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: info.path_lower })
      }
    );
    if (!r.ok) {
      const txt = await r.text();
      throw new Error("dropbox link failed: " + r.status + " " + txt);
    }
    const linkInfo = await r.json();
    return linkInfo.url.replace("?dl=0", "?raw=1");
  } catch (linkErr) {
    console.warn(
      "create_shared_link failed, falling back to temporary link:",
      linkErr.message
    );
    const r2 = await fetch(
      "https://api.dropboxapi.com/2/files/get_temporary_link",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: info.path_lower })
      }
    );
    if (!r2.ok) {
      const txt = await r2.text();
      throw new Error(
        "temporary link failed: " +
          r2.status +
          " " +
          txt +
          " (original error: " +
          linkErr.message +
          ")"
      );
    }
    const tmpInfo = await r2.json();
    return tmpInfo.link;
  }
}

function initGooglePhotos() {
  try {
    const creds = JSON.parse(fs.readFileSync(GP_CRED_PATH, "utf8"));
    const { client_id, client_secret, redirect_uris } = creds.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );
    if (fs.existsSync(GP_TOKEN_PATH)) {
      oAuth2Client.setCredentials(
        JSON.parse(fs.readFileSync(GP_TOKEN_PATH, "utf8"))
      );
      googlePhotosClient = google.photoslibrary({
        version: "v1",
        auth: oAuth2Client
      });
      console.log("Google Photos client initialized");
    } else {
      console.warn(
        "Google Photos token file missing; please run upload_photos.js to authorize"
      );
    }
  } catch (e) {
    console.warn("Unable to initialize Google Photos client:", e.message);
  }
}

async function uploadToGooglePhotos(buffer, filename) {
  if (!googlePhotosClient)
    throw new Error("Google Photos client not configured");
  // upload raw bytes
  const res1 = await googlePhotosClient.mediaItems.upload({
    requestBody: {},
    media: { body: buffer }
  });
  const uploadToken = res1.data;
  if (!uploadToken) throw new Error("upload token missing");
  const res2 = await googlePhotosClient.mediaItems.create({
    requestBody: {
      newMediaItem: {
        description: filename,
        simpleMediaItem: { uploadToken }
      }
    }
  });
  return res2.data.newMediaItem; // contains id/productUrl
}

// ----------------------------------------------------------

// simple test query at startup
db.execute("SELECT 1 as val")
  .then((r) => console.log("Database connected, test query result:", r.rows))
  .catch((err) => console.error("Database connection error:", err));

// export utility functions so they can be used in standalone scripts
// (attach them to the Express app instead of replacing module.exports)
app.getDropboxAccessToken = getDropboxAccessToken;
app.refreshDropboxToken = refreshDropboxToken;

// module.exports stays as the Express `app` defined near the top of this file
// so other modules (including the root wrapper and the Vercel entrypoint) can
// require() the app directly.

// log any request to /save-location (and /api/save-location) for debugging
app.all(["/save-location", "/api/save-location"], (req, res, next) => {
  console.log("received", req.method, "on", req.path);
  next();
});

// route to save a location into tblocali
app.post(["/save-location", "/api/save-location"], async (req, res) => {
  console.log("save-location body:", req.body);
  let {
    id,
    latitude,
    longitude,
    address,
    name,
    type,
    civic,
    city,
    closingDay
  } = req.body;
  if (latitude == null || longitude == null) {
    return res.status(400).json({ error: "latitude and longitude required" });
  }
  latitude = parseFloat(latitude);
  longitude = parseFloat(longitude);

  try {
    if (id !== undefined && id !== null && id !== "") {
      console.log("update branch triggered, id:", id);
      // update existing record
      await db.execute(
        "UPDATE tblocali SET latitude = ?, longitude = ?, address = ?, name = ?, type = ?, civic = ?, city = ?, closingDay = ? WHERE id = ?",
        [
          latitude,
          longitude,
          address || null,
          name || null,
          type || null,
          civic || null,
          city || null,
          closingDay || null,
          id
        ]
      );
      const respObj = { success: true, id };
      console.log("save-location update response:", respObj);
      res.setHeader("Content-Type", "application/json");
      return res.send(JSON.stringify(respObj));
    }

    // check for an existing identical record (by coords or address)
    const existing = await db.execute(
      "SELECT id FROM tblocali WHERE (latitude = ? AND longitude = ?) OR (address = ?)",
      [latitude, longitude, address || ""]
    );
    if (existing.rows.length) {
      // return existing id instead of inserting duplicate
      let existingId = String(existing.rows[0].id);
      res.setHeader("Content-Type", "application/json");
      return res.send(
        JSON.stringify({ success: true, id: existingId, duplicate: true })
      );
    }

    const result = await db.execute(
      "INSERT INTO tblocali (latitude, longitude, address, name, type, civic, city, closingDay) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        latitude,
        longitude,
        address || null,
        name || null,
        type || null,
        civic || null,
        city || null,
        closingDay || null
      ]
    );
    // convert lastInsertRowid to string to avoid any serialization issues
    let newId = String(result.lastInsertRowid);
    const resp = { success: true, id: newId };
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(resp));
  } catch (err) {
    console.error("save-location error", err);
    res.status(500).json({ error: err.message });
  }
});

// endpoint to upload a photo for a locale
// new multipart/form-data handler (replaces older JSON method)
app.post(
  ["/upload-photo", "/api/upload-photo"],
  uploadMiddleware.single("photo"),
  async (req, res) => {
    try {
      const localeId = req.body.locale_id;
      if (!localeId || !req.file) {
        return res
          .status(400)
          .json({ error: "locale_id and photo file required" });
      }
      // enforce max 6 photos per locale
      try {
        const cntRes = await db.execute(
          "SELECT COUNT(*) AS cnt FROM tblocali_photos WHERE locale_id = ?",
          [localeId]
        );
        const cnt = cntRes.rows && cntRes.rows[0] && cntRes.rows[0].cnt;
        if (cnt >= 6) {
          return res.status(400).json({
            error: "Limite foto raggiunto",
            details: "Non più di 6 immagini per locale"
          });
        }
      } catch (cErr) {
        console.warn("could not determine existing photo count", cErr);
      }
      const filename = req.file.originalname;
      let buffer = req.file.buffer;
      console.log("upload-photo received image buffer length", buffer.length);
      try {
        const before = buffer.length;
        buffer = await ensureMaxImageSize(buffer);
        console.log("resize result: before=", before, "after=", buffer.length);
      } catch (resizeErr) {
        console.warn(
          "image resize failed, continuing with original buffer:",
          resizeErr.message
        );
      }
      let url;
      try {
        url = await uploadToDropbox(buffer, filename);
      } catch (dbErr) {
        console.error("dropbox upload error", dbErr.stack || dbErr);
        return res
          .status(500)
          .json({ error: "Dropbox upload failed", details: dbErr.message });
      }
      const dropboxPath = "/geoPhoto/" + filename;
      const result = await db.execute(
        "INSERT INTO tblocali_photos (locale_id, url, dropbox_path) VALUES (?, ?, ?)",
        [localeId, url, dropboxPath]
      );
      // lastInsertRowid holds new row id
      const insertId = result.lastInsertRowid
        ? String(result.lastInsertRowid)
        : null;
      console.log("upload-photo inserted id", insertId, "raw result", result);
      return res.json({ success: true, url, id: insertId });
    } catch (err) {
      console.error("/upload-photo error", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// simple check endpoint
app.get("/ping", (req, res) => res.send("pong"));

// QR code generator page for easy PWA install
// visitors can scan this from a phone to open the app URL
app.get("/qr", (req, res) => {
  const fullUrl = req.protocol + "://" + req.get("host") + "/";
  const qrSrc =
    "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" +
    encodeURIComponent(fullUrl);
  // simple mobile install instructions vary by platform
  const instructions = `
    <p style="margin-top:20px;font-size:0.9em;color:#333;">
      Quando apri questo link sul telefono:
      <ul style="text-align:left;display:inline-block;">
        <li>su Android/Chrome: premi menu ⋮ e scegli "Aggiungi a schermata Home"</li>
        <li>su iPhone/Safari: tocca <span style="font-weight:bold;">Condividi</span> e poi "Aggiungi a Home"</li>
      </ul>
    </p>`;
  res.send(`
    <!DOCTYPE html>
    <html><head><title>QR PWA</title></head><body style="font-family:sans-serif;text-align:center;">
    <h1>Scan to open PWA</h1>
    <p>Apri questa pagina sul telefono e scansiona il codice:</p>
    <img src="${qrSrc}" alt="QR code" />
    <p><a href="${fullUrl}">${fullUrl}</a></p>
    ${instructions}
    </body></html>
  `);
});

// return photo info for a given locale_id
// changed to return array of {id,url} so the client can refer to an individual
// photo (for deletion).  temporary links are generated in parallel as before.
// alias for compatibility: some clients use /api/photos while older code used /photos
app.get(["/photos", "/api/photos"], async (req, res) => {
  const localeId = req.query.locale_id;
  console.log("/photos called, locale_id=", localeId);
  if (!localeId) {
    return res.status(400).json({ error: "locale_id required" });
  }
  try {
    // only return photo rows that have something to show (url or dropbox_path)
    const result = await db.execute(
      "SELECT id, url, dropbox_path FROM tblocali_photos WHERE locale_id = ? AND ((url IS NOT NULL AND url <> '') OR (dropbox_path IS NOT NULL AND dropbox_path <> ''))",
      [localeId]
    );
    const rows = result.rows;
    const token = await getDropboxAccessToken();
    const promises = rows.map(async (r) => {
      let finalUrl = r.url;
      if (r.dropbox_path) {
        try {
          const r2 = await fetch(
            "https://api.dropboxapi.com/2/files/get_temporary_link",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ path: r.dropbox_path })
            }
          );
          if (r2.ok) {
            const info = await r2.json();
            finalUrl = info.link;
            db.execute("UPDATE tblocali_photos SET url = ? WHERE id = ?", [
              info.link,
              r.id
            ]).catch(() => {});
          }
        } catch (e) {
          console.warn("error refreshing temporary link", e.message);
        }
      }
      return { id: r.id, url: finalUrl };
    });
    const out = await Promise.all(promises);
    res.json(out);
  } catch (err) {
    console.error("/photos error", err);
    res.status(500).json({ error: err.message });
  }
});

// debug endpoint showing every photo record (includes locale name if available)
// useful when you don't want to drop into SQL manually
app.get("/all-photos", async (req, res) => {
  try {
    const result = await db.execute(
      `SELECT p.id, p.locale_id, l.name AS locale_name, p.url
       FROM tblocali_photos p
       LEFT JOIN tblocali l ON l.id = p.locale_id
       ORDER BY p.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("/all-photos error", err);
    res.status(500).json({ error: err.message });
  }
});

// migration helper: try to recover dropbox_path for any photo rows that
// lack it by querying Dropbox for metadata using the stored URL.  this
// requires the app to have the 'sharing.read' scope; if not, the request will
// log a warning and return an error message.  you can hit this URL from the
// browser or curl once after enabling scopes.
app.get("/migrate-photos", async (req, res) => {
  try {
    const result = await db.execute(
      "SELECT id, url, locale_id FROM tblocali_photos WHERE dropbox_path IS NULL"
    );
    const rows = result.rows;
    const updated = [];
    if (rows.length === 0) {
      return res.json({ success: true, tried: 0, updated });
    }

    const token = await getDropboxAccessToken();
    let usedMeta = true;

    console.log("migrate-photos: processing", rows.length, "rows");
    for (const r of rows) {
      console.log("migrate-photos row", r.id);
      try {
        const r2 = await fetch(
          "https://api.dropboxapi.com/2/sharing/get_shared_link_metadata",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ url: r.url })
          }
        );
        if (r2.ok) {
          const meta = await r2.json();
          if (meta.path_lower) {
            await db.execute(
              "UPDATE tblocali_photos SET dropbox_path = ? WHERE id = ?",
              [meta.path_lower, r.id]
            );
            updated.push({ id: r.id, path: meta.path_lower });
            console.log("migrate-photos updated", r.id, "->", meta.path_lower);
          }
          continue;
        }
        const txt = await r2.text();
        console.warn("migration metadata failed for row", r.id, txt);
        // if we get a permissions error assume we don't have sharing.read
        if (/sharing\.read/.test(txt) || /sharing\.write/.test(txt)) {
          usedMeta = false;
          break;
        }
      } catch (e) {
        console.warn("migrate row error", r.id, e.message);
        if (e.message && /sharing\.read/.test(e.message)) {
          usedMeta = false;
          break;
        }
      }
    }

    if (!usedMeta) {
      console.log("migrate-photos: falling back to heuristic path assignment");
      // group rows by locale
      const byLocale = {};
      for (const r of rows) {
        if (!byLocale[r.locale_id]) byLocale[r.locale_id] = [];
        byLocale[r.locale_id].push(r.id);
      }
      // list all files in folder
      const listRes = await fetch(
        "https://api.dropboxapi.com/2/files/list_folder",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ path: "/geoPhoto" })
        }
      );
      const listJson = await listRes.json();
      let entries = (listJson.entries || []).map((e) => ({
        path: e.path_lower,
        time: e.server_modified
      }));
      // sort by modified descending
      entries.sort((a, b) => new Date(b.time) - new Date(a.time));
      let idx = 0;
      for (const localeId of Object.keys(byLocale)) {
        const ids = byLocale[localeId];
        for (let i = 0; i < ids.length && idx < entries.length; i++, idx++) {
          const rowId = ids[i];
          const path = entries[idx].path;
          await db.execute(
            "UPDATE tblocali_photos SET dropbox_path = ? WHERE id = ?",
            [path, rowId]
          );
          // also update URL to a fresh temporary link
          const r2 = await fetch(
            "https://api.dropboxapi.com/2/files/get_temporary_link",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ path })
            }
          );
          if (r2.ok) {
            const info = await r2.json();
            await db.execute(
              "UPDATE tblocali_photos SET url = ? WHERE id = ?",
              [info.link, rowId]
            );
            updated.push({ id: rowId, path, guessed: true });
            console.log("migrate-photos heuristic updated", rowId, "->", path);
          }
        }
      }
    }

    res.json({ success: true, tried: rows.length, updated });
  } catch (e) {
    console.error("migrate-photos error", e);
    res.status(500).json({ error: e.message });
  }
});

// delete a single photo by id (also remove from Dropbox if possible)
// delete a photo by id
// alias path added so that client can call /api/delete-photo
app.post(["/delete-photo", "/api/delete-photo"], async (req, res) => {
  const { photo_id } = req.body;
  if (!photo_id) return res.status(400).json({ error: "photo_id required" });
  try {
    // fetch path and url for cleanup
    const r = await db.execute(
      "SELECT dropbox_path FROM tblocali_photos WHERE id = ?",
      [photo_id]
    );
    if (r.rows.length) {
      const path = r.rows[0].dropbox_path;
      if (path) {
        try {
          const token = await getDropboxAccessToken();
          await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ path })
          });
        } catch (e) {
          console.warn("failed to delete file from Dropbox", e.message);
        }
      }
    }
    await db.execute("DELETE FROM tblocali_photos WHERE id = ?", [photo_id]);
    res.json({ success: true });
  } catch (e) {
    console.error("/delete-photo error", e);
    res.status(500).json({ error: e.message });
  }
});

// route to delete a location by id
app.post(["/delete-location", "/api/delete-location"], async (req, res) => {
  console.log("delete-location body:", req.body);
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "id required" });
  }
  try {
    // first fetch any photos so we can optionally clean up Dropbox
    const photosRes = await db.execute(
      "SELECT id, dropbox_path FROM tblocali_photos WHERE locale_id = ?",
      [id]
    );
    const photos = photosRes.rows || [];
    const token = await getDropboxAccessToken();

    // attempt to delete each file from Dropbox if we have a path and token
    await Promise.all(
      photos.map(async (p) => {
        if (token && p.dropbox_path) {
          try {
            await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ path: p.dropbox_path })
            });
          } catch (e) {
            console.warn(
              "unable to delete dropbox file",
              p.dropbox_path,
              e.message
            );
          }
        }
      })
    );

    // remove photo records from database
    await db.execute("DELETE FROM tblocali_photos WHERE locale_id = ?", [id]);
    // now delete the locale itself
    await db.execute("DELETE FROM tblocali WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("delete-location error", err);
    res.status(500).json({ error: err.message });
  }
});

// route that returns all saved locations (send every column present in the table)
// support both /locations and /api/locations (clients may use either)
app.get(["/locations", "/api/locations"], async (req, res) => {
  try {
    // using SELECT * makes the endpoint resilient to schema changes
    const result = await db.execute("SELECT * FROM tblocali");
    res.json(result.rows);
  } catch (err) {
    console.error("/locations error", err);
    res.status(500).json({ error: err.message });
  }
});

// allow CRUD on locations via /api/locations for compatibility with the API wrapper
app.post(["/locations", "/api/locations"], async (req, res) => {
  // this duplicates /save-location behavior but makes /api/locations usable
  let {
    id,
    latitude,
    longitude,
    address,
    name,
    type,
    civic,
    city,
    closingDay
  } = req.body;
  if (latitude == null || longitude == null) {
    return res.status(400).json({ error: "latitude and longitude required" });
  }
  latitude = parseFloat(latitude);
  longitude = parseFloat(longitude);

  try {
    if (id !== undefined && id !== null && id !== "") {
      // update existing record
      await db.execute(
        "UPDATE tblocali SET latitude = ?, longitude = ?, address = ?, name = ?, type = ?, civic = ?, city = ?, closingDay = ? WHERE id = ?",
        [
          latitude,
          longitude,
          address || null,
          name || null,
          type || null,
          civic || null,
          city || null,
          closingDay || null,
          id
        ]
      );
      return res.json({ success: true, id });
    }

    // check for an existing identical record (by coords or address)
    const existing = await db.execute(
      "SELECT id FROM tblocali WHERE (latitude = ? AND longitude = ?) OR (address = ?)",
      [latitude, longitude, address || ""]
    );
    if (existing.rows.length) {
      const existingId = String(existing.rows[0].id);
      return res.json({ success: true, id: existingId, duplicate: true });
    }

    const result = await db.execute(
      "INSERT INTO tblocali (latitude, longitude, address, name, type, civic, city, closingDay) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        latitude,
        longitude,
        address || null,
        name || null,
        type || null,
        civic || null,
        city || null,
        closingDay || null
      ]
    );
    const newId = String(result.lastInsertRowid);
    return res.json({ success: true, id: newId });
  } catch (err) {
    console.error("/api/locations error", err);
    res.status(500).json({ error: err.message });
  }
});

// update a location by id (used by the API wrapper for PUT /api/locations/:id)
app.put(["/locations/:id", "/api/locations/:id"], async (req, res) => {
  const localeId = req.params.id;
  const updateData = req.body;
  try {
    const setClause = Object.keys(updateData)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = [...Object.values(updateData), localeId];

    await db.execute(`UPDATE tblocali SET ${setClause} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (e) {
    console.error("/api/locations/:id error", e);
    res.status(500).json({ error: e.message });
  }
});

// route that performs a single reverse-geocode lookup (does not modify DB)
app.get("/reverse-geocode", async (req, res) => {
  const { lat, lon } = req.query;
  if (lat == null || lon == null) {
    return res
      .status(400)
      .json({ error: "lat and lon query parameters required" });
  }
  try {
    const addr = await reverseGeocode(lat, lon);
    if (!addr) return res.status(500).json({ error: "reverse geocode failed" });
    const response = {
      address: addr.road || addr.pedestrian || "",
      civic: addr.house_number || "",
      city: addr.city || addr.town || addr.village || ""
    };
    res.json(response);
  } catch (err) {
    console.error("/reverse-geocode error", err);
    res.status(500).json({ error: err.message });
  }
});

// global error handler (JSON responses)
app.use((err, req, res, next) => {
  console.error("Unhandled error", err);
  if (res.headersSent) return next(err);
  if (
    err.type === "entity.too.large" ||
    (err instanceof SyntaxError && err.message.includes("body"))
  ) {
    return res.status(413).json({ error: "Payload too large" });
  }
  res.status(500).json({ error: err.message || "internal error" });
});

// login endpoint
app.post("/api/login", async (req, res) => {
  const { username: rawUsername, password } = req.body;
  const username = rawUsername && rawUsername.toLowerCase();
  if (!username || !password) {
    return res.status(400).json({ error: "Username e password richiesti" });
  }
  try {
    // also retrieve name and approved flag to show later
    const result = await db.execute(
      "SELECT uid, password_hash, name, approved FROM user WHERE username = ?",
      [username]
    );
    if (!result.rows.length) {
      return res.status(400).json({ error: "Credenziali non valide" });
    }
    const { uid, password_hash, name, approved } = result.rows[0];
    if (approved === 0) {
      return res
        .status(403)
        .json({ error: "Account in attesa di approvazione" });
    }
    const bcrypt = require("bcryptjs");
    const match = await bcrypt.compare(password, password_hash);
    if (!match) {
      return res.status(400).json({ error: "Credenziali non valide" });
    }
    // issue JWT token instead of session
    const token = signToken(uid);
    res.json({ success: true, token });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ error: err.message });
  }
});

// registration endpoint (API path to avoid static conflict)
app.post("/api/register", async (req, res) => {
  const { name, username: rawUsername, password } = req.body;
  const username = rawUsername && rawUsername.toLowerCase();
  if (!name || !username || !password) {
    return res.status(400).json({ error: "Tutti i campi sono obbligatori" });
  }
  // password strength
  const pwdRegex = /^(?=.*[0-9])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!pwdRegex.test(password)) {
    return res.status(400).json({ error: "Password debole" });
  }
  // simple email format check
  const emailRegex = /^[\w.-]+@[\w.-]+\.[A-Za-z]{2,}$/;
  if (!emailRegex.test(username)) {
    return res.status(400).json({ error: "Formato email non valido" });
  }
  try {
    // check if username already exists
    const existing = await db.execute(
      "SELECT uid FROM user WHERE username = ?",
      [username]
    );
    if (existing.rows.length) {
      return res.status(400).json({ error: "Username già registrato" });
    }
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash(password, 10);
    const uid = require("crypto").randomBytes(16).toString("hex");
    await db.execute(
      "INSERT INTO user (uid, username, password_hash, name, approved) VALUES (?, ?, ?, ?, ?)",
      [uid, username, hash, name, 0]
    );
    res.json({ success: true, uid });
  } catch (err) {
    console.error("register error", err);
    res.status(500).json({ error: err.message });
  }
});

// forgot-password: generate new random password and return it (insecure but simple)
app.post("/api/forgot-password", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Email required" });
  try {
    const r = await db.execute("SELECT uid FROM user WHERE username = ?", [
      username.toLowerCase()
    ]);
    if (!r.rows.length) return res.status(400).json({ error: "Unknown email" });
    const uid = r.rows[0].uid;
    const newPwd = Math.random().toString(36).slice(-8) + "A1"; // quick password
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash(newPwd, 10);
    await db.execute("UPDATE user SET password_hash = ? WHERE uid = ?", [
      hash,
      uid
    ]);
    res.json({ success: true, newPassword: newPwd });
  } catch (err) {
    console.error("forgot-password error", err);
    res.status(500).json({ error: err.message });
  }
});

// example route that runs a simple query
app.get("/dbtest", async (req, res) => {
  try {
    const result = await db.execute("SELECT current_timestamp as now");
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// return current session info
app.get("/api/session", async (req, res) => {
  const payload = verifyTokenHeader(req);
  if (!payload || !payload.uid) {
    return res.json({ loggedIn: false });
  }
  try {
    const result = await db.execute(
      "SELECT name, username, approved FROM user WHERE uid = ?",
      [payload.uid]
    );
    if (!result.rows.length) {
      return res.json({ loggedIn: false });
    }
    const user = result.rows[0];
    if (!user.approved) {
      return res.json({ loggedIn: false, pending: true });
    }
    const isAdmin = user.username === "paolo.giorsetti@codarini.com";
    res.json({
      loggedIn: true,
      uid: payload.uid,
      name: user.name,
      admin: isAdmin
    });
  } catch (err) {
    console.error("session lookup error", err);
    res.json({ loggedIn: false });
  }
});

// helper to ensure the current user is an administrator
async function ensureAdmin(req, res) {
  const payload = verifyTokenHeader(req);
  if (!payload || !payload.uid) {
    res.status(401).json({ error: "not logged in" });
    return false;
  }
  try {
    const r = await db.execute("SELECT username FROM user WHERE uid = ?", [
      payload.uid
    ]);
    if (
      r.rows.length &&
      r.rows[0].username === "paolo.giorsetti@codarini.com"
    ) {
      return true;
    }
  } catch (e) {
    console.error("ensureAdmin db error", e);
  }
  res.status(403).json({ error: "not admin" });
  return false;
}

// dynamic admin page (GET) and form handler (POST)
// The HTML is no longer protected server‑side because normal browser
// navigations do not include a Bearer token.  The front‑end itself will
// call /api/session and /pending-users etc and redirect if the user is
// not logged in or not an admin.
async function adminHandler(req, res) {
  console.log("adminHandler invoked for", req.method, req.path);
  // serve static page; front-end script will fetch pending users
  res.sendFile(path.join(__dirname, "public", "admin", "admin.html"));
}

app.get("/admin", adminHandler);
app.get("/admin/", adminHandler);

// (admin-test is no longer needed but keep it for backward compatibility)
app.get("/admin-test", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "admin.html"));
});

app.post("/admin", async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const { action, uid } = req.body;
  if (!action || !uid) return res.status(400).send("bad");
  try {
    if (action === "approve") {
      await db.execute("UPDATE user SET approved = 1 WHERE uid = ?", [uid]);
    } else if (action === "reject") {
      await db.execute("DELETE FROM user WHERE uid = ?", [uid]);
    }
    return res.redirect("/admin");
  } catch (e) {
    console.error("admin POST error", e);
    res.status(500).send("error");
  }
});

// return list of users waiting for approval (only for admin)

app.post("/approve-user", async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "uid required" });
  try {
    await db.execute("UPDATE user SET approved = 1 WHERE uid = ?", [uid]);
    res.json({ success: true });
  } catch (e) {
    console.error("approve-user error", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/reject-user", async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "uid required" });
  try {
    await db.execute("DELETE FROM user WHERE uid = ?", [uid]);
    res.json({ success: true });
  } catch (e) {
    console.error("reject-user error", e);
    res.status(500).json({ error: e.message });
  }
});

// revoke authorization (move back to pending)
app.post(["/revoke-user", "/api/revoke-user"], async (req, res) => {
  console.log(
    "/revoke-user handler invoked",
    req.method,
    req.path,
    "body",
    req.body
  );
  if (!(await ensureAdmin(req, res))) return;
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "uid required" });
  try {
    await db.execute("UPDATE user SET approved = 0 WHERE uid = ?", [uid]);
    res.json({ success: true });
  } catch (e) {
    console.error("revoke-user error", e);
    res.status(500).json({ error: e.message });
  }
});

// approve a user by uid
app.post("/api/approve-user", async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "uid required" });
  try {
    await db.execute("UPDATE user SET approved = 1 WHERE uid = ?", [uid]);
    res.json({ success: true });
  } catch (e) {
    console.error("approve-user error", e);
    res.status(500).json({ error: e.message });
  }
});

// reject a user by deleting the record
app.post("/api/reject-user", async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "uid required" });
  try {
    await db.execute("DELETE FROM user WHERE uid = ?", [uid]);
    res.json({ success: true });
  } catch (e) {
    console.error("reject-user error", e);
    res.status(500).json({ error: e.message });
  }
});

// Background sync endpoint - process offline operations
app.post("/api/sync", async (req, res) => {
  const payload = verifyTokenHeader(req);
  if (!payload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { operations = [] } = req.body;
  console.log(
    "[SYNC] Processing",
    operations.length,
    "offline operations from user",
    payload.uid
  );

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (const operation of operations) {
    try {
      const { url, method, body, timestamp, id } = operation;
      console.log("[SYNC] Processing operation", id, method, url);

      // Check if operation is too old (skip if older than 7 days)
      if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) {
        results.push({
          id,
          success: false,
          error: "Operation expired (older than 7 days)"
        });
        failureCount++;
        continue;
      }

      // Parse the body
      let parsedBody = null;
      if (body) {
        try {
          parsedBody = typeof body === "string" ? JSON.parse(body) : body;
        } catch (e) {
          console.warn("[SYNC] Could not parse body for operation", id);
          parsedBody = body;
        }
      }

      let operationSuccess = false;
      let operationResult = null;
      let operationError = null;

      // Route based on URL and method
      if (url.includes("/locations") && method === "POST") {
        // Create location
        try {
          const locData = {
            name: parsedBody.name,
            type: parsedBody.type,
            lat: parsedBody.lat,
            lon: parsedBody.lon,
            address: parsedBody.address || "",
            civic: parsedBody.civic || "",
            city: parsedBody.city || "",
            closing_day: parsedBody.closing_day || "",
            uid: payload.uid,
            approved: 0
          };

          const result = await db.execute(
            "INSERT INTO tblocali (name, type, lat, lon, address, civic, city, closing_day, uid, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              locData.name,
              locData.type,
              locData.lat,
              locData.lon,
              locData.address,
              locData.civic,
              locData.city,
              locData.closing_day,
              locData.uid,
              locData.approved
            ]
          );

          operationSuccess = true;
          operationResult = {
            message: "Location created",
            changes: result.rows_affected
          };
        } catch (e) {
          operationError = e.message;
        }
      } else if (url.includes("/locations/") && method === "PUT") {
        // Update location
        try {
          const localeId = url.split("/").pop();
          const updateData = parsedBody;

          const setClause = Object.keys(updateData)
            .map((key, idx) => `${key} = ?`)
            .join(", ");
          const values = [...Object.values(updateData), localeId];

          await db.execute(
            `UPDATE tblocali SET ${setClause} WHERE id = ?`,
            values
          );

          operationSuccess = true;
          operationResult = { message: "Location updated" };
        } catch (e) {
          operationError = e.message;
        }
      } else if (url.includes("/delete-photo") && method === "POST") {
        // Delete photo
        try {
          const { photo_id } = parsedBody;

          // Get photo info for Dropbox cleanup
          const photoRes = await db.execute(
            "SELECT dropbox_path FROM tblocali_photos WHERE id = ?",
            [photo_id]
          );
          const photo = photoRes.rows?.[0];

          // Delete from Dropbox if path exists
          if (photo?.dropbox_path) {
            const token = await getDropboxAccessToken();
            if (token) {
              await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ path: photo.dropbox_path })
              }).catch((e) =>
                console.warn("[SYNC] Dropbox delete failed:", e.message)
              );
            }
          }

          // Delete from database
          await db.execute("DELETE FROM tblocali_photos WHERE id = ?", [
            photo_id
          ]);

          operationSuccess = true;
          operationResult = { message: "Photo deleted" };
        } catch (e) {
          operationError = e.message;
        }
      } else {
        operationError = "Unknown or unsupported operation";
      }

      results.push({
        id,
        success: operationSuccess,
        result: operationResult,
        error: operationError
      });

      if (operationSuccess) {
        successCount++;
      } else {
        failureCount++;
      }
    } catch (e) {
      console.error("[SYNC] Unexpected error processing operation:", e);
      results.push({
        id: operation.id,
        success: false,
        error: "Unexpected error: " + e.message
      });
      failureCount++;
    }
  }

  console.log(
    "[SYNC] Completed:",
    successCount,
    "successful,",
    failureCount,
    "failed"
  );
  res.json({
    success: true,
    processed: operations.length,
    successCount,
    failureCount,
    results
  });
});

// serve login page at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login", "login.html"));
});

// return list of users waiting for approval (admin only)
app.get(["/pending-users", "/api/pending-users"], async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  try {
    const result = await db.execute(
      "SELECT uid, name, username FROM user WHERE approved = 0"
    );
    res.json(result.rows);
  } catch (e) {
    console.error("/pending-users error", e);
    res.status(500).json({ error: e.message });
  }
});

// return list of already approved users (admin only)
app.get("/approved-users", async (req, res) => {
  const payload = verifyTokenHeader(req);
  console.log("/approved-users called, token payload", payload);
  if (!(await ensureAdmin(req, res))) return;
  try {
    const result = await db.execute(
      "SELECT uid, name, username FROM user WHERE approved = 1"
    );
    console.log("/approved-users returning rows", result.rows.length);
    res.json(result.rows);
  } catch (e) {
    console.error("/approved-users error", e);
    res.status(500).json({ error: e.message });
  }
});

// protect default page (client handles token check; server side redirect removed)
app.get("/default/default.html", (req, res, next) => {
  // we cannot reliably check JWT on serverless static asset; front-end will guard
  next();
});

// debug: list routes shortly after server starts
setTimeout(() => {
  console.log("--- registered routes debug ---");
  console.log("app keys", Object.keys(app));
  if (app && app.router) {
    console.log("app.router keys", Object.keys(app.router));
    if (app.router.stack) {
      console.log("router.stack length", app.router.stack.length);
      app.router.stack.forEach((mw, idx) => {
        console.log("router.stack[" + idx + "] keys", Object.keys(mw));
        if (mw.route) {
          console.log(
            "  route path",
            mw.route.path,
            "methods",
            mw.route.methods
          );
        }
        if (mw.name) {
          console.log("  middleware name", mw.name);
        }
      });
    }
  } else {
    console.log("no app.router present");
  }
  console.log("-------------------------");
}, 100);

app.listen(PORT, () => {
  console.log(
    `Server listening on http://localhost:${PORT} (pid ${process.pid})`
  );

  // list registered GET routes for debugging
  if (app && app.router && app.router.stack) {
    console.log("DEBUG: registered GET routes:");
    app.router.stack.forEach((layer) => {
      if (layer.route && layer.route.methods && layer.route.methods.get) {
        console.log("  -", layer.route.path);
      }
    });
    // inspect pending-users layer details
    const pendingLayer = app.router.stack.find(
      (l) => l.route && l.route.path === "/pending-users"
    );
    if (pendingLayer) {
      console.log("pending layer keys", Object.keys(pendingLayer));
      if (pendingLayer.regexp) {
        console.log("pending layer regexp", pendingLayer.regexp);
        console.log(
          "test pending matches /pending-users",
          pendingLayer.regexp.test("/pending-users")
        );
        console.log(
          "test pending matches /pending-users/",
          "/pending-users/".match(pendingLayer.regexp)
        );
      }
      if (pendingLayer.matchers) {
        console.log("pending matchers", pendingLayer.matchers);
        // try using matcher function if available
        try {
          const m = pendingLayer.matchers[0];
          console.log("matcher function result", m("/pending-users"));
        } catch (e) {
          console.error("matcher call error", e);
        }
      }
    }
  }
});
