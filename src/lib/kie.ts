import { env } from "@/lib/env";

export async function kieUploadBase64(
  base64Data: string,
  fileName: string,
): Promise<string> {
  const r = await fetch("https://kieai.redpandaai.co/api/file-base64-upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.kieKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ base64Data, uploadPath: "images/ad", fileName }),
  });
  const data = await r.json().catch(() => null);
  const url = data?.data?.downloadUrl;
  if (!r.ok || !url)
    throw new Error(`image upload failed: ${data?.msg ?? r.status}`);
  return url;
}

export async function kieCreateTask(
  prompt: string,
  inputUrls: string[],
  aspect_ratio: string,
  resolution: string,
): Promise<string> {
  if (aspect_ratio === "1:1" && resolution === "4K") resolution = "2K";
  const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.kieKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.kieModel(),
      input: {
        prompt: prompt.slice(0, 20000),
        input_urls: inputUrls,
        aspect_ratio,
        resolution,
      },
    }),
  });
  const data = await r.json().catch(() => null);
  const taskId = data?.data?.taskId;
  if (!r.ok || data?.code !== 200 || !taskId)
    throw new Error(`KIE createTask: ${data?.msg ?? r.status}`);
  return taskId;
}

export async function kiePoll(
  taskId: string,
): Promise<{ state: string; urls: string[]; failMsg?: string }> {
  const r = await fetch(
    `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    {
      headers: { Authorization: `Bearer ${env.kieKey()}` },
    },
  );
  const data = await r.json().catch(() => null);
  if (!r.ok || data?.code !== 200)
    throw new Error(`KIE recordInfo: ${data?.msg ?? r.status}`);
  const d = data.data ?? {};
  let urls: string[] = [];
  if (d.resultJson) {
    try {
      const p = JSON.parse(d.resultJson);
      urls = p.resultUrls ?? p.result_urls ?? [];
    } catch {}
  }
  return {
    state: String(d.state ?? ""),
    urls,
    failMsg: d.failMsg ?? d.failCode,
  };
}
