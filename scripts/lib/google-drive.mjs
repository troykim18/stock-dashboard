import crypto from 'node:crypto';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function getPrivateKey() {
  return (process.env.GDRIVE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

export function hasGoogleDriveConfig() {
  return Boolean(process.env.GDRIVE_CLIENT_EMAIL && getPrivateKey() && process.env.GDRIVE_FOLDER_ID);
}

async function getAccessToken() {
  const email = process.env.GDRIVE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();
  if (!email || !privateKey) throw new Error('Missing GDRIVE_CLIENT_EMAIL or GDRIVE_PRIVATE_KEY');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: DRIVE_SCOPE,
    aud: DRIVE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const r = await fetch(DRIVE_TOKEN_URL, { method: 'POST', body });
  const data = await r.json();
  if (!r.ok) throw new Error(`Google token failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function driveFetch(url, options = {}) {
  const token = await getAccessToken();
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`Google Drive ${r.status}: ${text}`);
  return data;
}

async function findFile(name, folderId) {
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `'${folderId}' in parents`,
    'trashed=false'
  ].join(' and ');
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)`;
  const data = await driveFetch(url);
  return data.files?.[0] || null;
}

export async function uploadTextFileToDrive({ name, text, mimeType = 'text/csv' }) {
  if (!hasGoogleDriveConfig()) return { skipped: true, reason: 'missing Google Drive secrets' };
  const folderId = process.env.GDRIVE_FOLDER_ID;
  const existing = await findFile(name, folderId);
  const boundary = `codex-${Date.now()}`;
  const metadata = existing ? { name } : { name, parents: [folderId] };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}; charset=UTF-8`,
    '',
    text,
    `--${boundary}--`,
    ''
  ].join('\r\n');

  const url = existing
    ? `${DRIVE_UPLOAD_URL}/${existing.id}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name`;
  const method = existing ? 'PATCH' : 'POST';
  const data = await driveFetch(url, {
    method,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  return { skipped: false, id: data.id || existing.id, name };
}
