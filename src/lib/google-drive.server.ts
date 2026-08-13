/**
 * Minimal Google Drive client for the autopilot archive.
 *
 * Auth uses a service-account JWT (RS256, signed with Web Crypto) so it works
 * headless in the Worker runtime — no OAuth redirect, no refresh tokens.
 * The user shares their Drive folder with the service account's email.
 */

type ServiceAccount = { client_email: string; private_key: string };

function b64url(input: ArrayBuffer | string) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

function readServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Service account JSON is missing client_email / private_key");
  }
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
}

export function getServiceAccountEmail(): string | null {
  try {
    return readServiceAccount().client_email;
  } catch {
    return null;
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const sa = readServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/** Accepts a folder link or a bare folder id. */
export function extractDriveFolderId(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) ?? s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(s) ? s : null;
}

async function driveFetch(path: string, init: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Drive ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** Find (or create) a subfolder by name inside the parent folder. */
export async function ensureFolder(parentId: string, name: string): Promise<string> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const found = (await (
    await driveFetch(
      `/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { method: "GET" },
    )
  ).json()) as { files?: Array<{ id: string }> };
  if (found.files?.length) return found.files[0].id;

  const created = (await (
    await driveFetch(`/files?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    })
  ).json()) as { id: string };
  return created.id;
}

/** Multipart upload of an mp4 into a folder. Returns file id + shareable link. */
export async function uploadMp4(
  folderId: string,
  filename: string,
  bytes: Uint8Array,
): Promise<{ id: string; webViewLink: string | null }> {
  const token = await getAccessToken();
  const boundary = `rf${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: filename, parents: [folderId] });
  const pre = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
  );
  const post = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { id: string; webViewLink?: string };
  return { id: json.id, webViewLink: json.webViewLink ?? null };
}
