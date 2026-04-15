// lib/tl.js
//
// Tiny TimelinesAI API client. Always UTF-8 bytes, Bearer auth, no
// trailing slashes. Writes JSON bodies to a temp-memory Buffer (not a
// file) to avoid the Git Bash / non-UTF-8 locale corruption trap that
// bites inline curl -d on Windows.

const BASE = "https://app.timelines.ai/integrations/api";

async function request(path, { method = "GET", body } = {}) {
  const url = `${BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${process.env.TIMELINES_AI_API_KEY}`,
  };

  let bodyBytes;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyBytes = Buffer.from(JSON.stringify(body), "utf-8");
  }

  const res = await fetch(url, { method, headers, body: bodyBytes });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TL ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

export const tlGet = (path) => request(path);
export const tlPost = (path, body) => request(path, { method: "POST", body });
export const tlPatch = (path, body) => request(path, { method: "PATCH", body });
