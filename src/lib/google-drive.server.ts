/**
 * Minimal Google Drive client for the autopilot archive.
 *
 * Auth runs through the Lovable connector gateway (Google Drive connector) —
 * the user's own Google account via OAuth. No service account: service
 * accounts have no personal Drive storage quota (uploads 403).
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive";

function gatewayHeaders(): HeadersInit {
  const lov = process.env.LOVABLE_API_KEY;
  const key = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lov || !key) throw new Error("Google Drive connector is not linked (missing gateway keys)");
  return { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key };
}

export function driveConnectorConfigured(): boolean {
  return Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_DRIVE_API_KEY);
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
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(gatewayHeaders())) headers.set(k, v);
  const res = await fetch(`${GATEWAY_URL}${path}`, { ...init, headers });
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
      `/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { method: "GET" },
    )
  ).json()) as { files?: Array<{ id: string }> };
  if (found.files?.length) return found.files[0].id;

  const created = (await (
    await driveFetch(`/drive/v3/files?supportsAllDrives=true&fields=id`, {
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

  const res = await driveFetch(
    "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const json = (await res.json()) as { id: string; webViewLink?: string };
  return { id: json.id, webViewLink: json.webViewLink ?? null };
}
