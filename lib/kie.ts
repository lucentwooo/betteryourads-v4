// Upload a base64 image to KIE and return a public URL it can fetch (temp, 3 days).
// Ported from server.js kieUploadBase64. Server-only.
export async function kieUploadBase64(apiKey: string, base64Data: string, fileName: string): Promise<string> {
  // The base64-upload service is hosted on kieai.redpandaai.co — api.kie.ai 404s for this path.
  const r = await fetch("https://kieai.redpandaai.co/api/file-base64-upload", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ base64Data, uploadPath: "images/ad-stage3", fileName }),
  });
  let data: { data?: { downloadUrl?: string }; msg?: string; message?: string } | null;
  try { data = await r.json(); } catch { data = null; }
  const url = data && data.data && data.data.downloadUrl;
  if (!r.ok || !url) {
    throw new Error("image upload failed: " + ((data && (data.msg || data.message)) || "HTTP " + r.status));
  }
  return url;
}
