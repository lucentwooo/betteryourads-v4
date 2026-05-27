import { KieError } from "../lib/errors.js";

const UPLOAD_URL = "https://kieai.redpandaai.co/api/file-base64-upload";
const CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const RECORD_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";

function apiKey(): string {
  const k = process.env.KIE_API_KEY;
  if (!k) throw new KieError("KIE_API_KEY is not set.");
  return k;
}

/** KIE wants raw base64, not a data URL. */
function rawBase64(s: string): string {
  const m = String(s).match(/^data:[^;]+;base64,(.*)$/s);
  return m ? m[1] : s;
}

type KieResponse = { code?: number; msg?: string; message?: string; data?: unknown };

async function asJson(res: Response): Promise<KieResponse | null> {
  return (await res.json().catch(() => null)) as KieResponse | null;
}

export async function uploadBase64(image: string, fileName: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data: rawBase64(image), uploadPath: "images/ad-stage3", fileName }),
    });
  } catch (e) {
    throw new KieError(e instanceof Error ? e.message : String(e));
  }
  const data = await asJson(res);
  const url = (data?.data as { downloadUrl?: string } | undefined)?.downloadUrl;
  if (!res.ok || !url) throw new KieError(`image upload failed: ${data?.msg ?? data?.message ?? "HTTP " + res.status}`);
  return url;
}

export type CreateTaskArgs = {
  model: string;
  prompt: string;
  inputUrls: string[];
  aspectRatio: string;
  resolution: string;
};

export async function createTask(args: CreateTaskArgs): Promise<string> {
  let res: Response;
  try {
    res = await fetch(CREATE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        input: {
          prompt: String(args.prompt).slice(0, 20000),
          input_urls: args.inputUrls,
          aspect_ratio: args.aspectRatio,
          resolution: args.resolution,
        },
      }),
    });
  } catch (e) {
    throw new KieError(e instanceof Error ? e.message : String(e));
  }
  const data = await asJson(res);
  const taskId = (data?.data as { taskId?: string } | undefined)?.taskId;
  if (!res.ok || data?.code !== 200 || !taskId) {
    throw new KieError(`createTask failed: ${data?.msg ?? data?.message ?? "HTTP " + res.status}`);
  }
  return taskId;
}

export type TaskResult = { state: string; progress?: number; urls: string[]; failMsg: string };

export async function pollResult(taskId: string): Promise<TaskResult> {
  let res: Response;
  try {
    res = await fetch(`${RECORD_URL}?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
  } catch (e) {
    throw new KieError(e instanceof Error ? e.message : String(e));
  }
  const data = await asJson(res);
  if (!res.ok || data?.code !== 200) {
    throw new KieError(`recordInfo failed: ${data?.msg ?? data?.message ?? "HTTP " + res.status}`);
  }
  const d = (data?.data ?? {}) as {
    state?: string;
    progress?: number;
    resultJson?: string;
    failMsg?: string;
    failCode?: string;
  };
  let urls: string[] = [];
  if (d.resultJson) {
    try {
      const p = JSON.parse(d.resultJson) as { resultUrls?: string[]; result_urls?: string[] };
      urls = p.resultUrls ?? p.result_urls ?? [];
    } catch {
      /* leave urls empty */
    }
  }
  return { state: d.state ?? "", progress: d.progress, urls, failMsg: d.failMsg ?? d.failCode ?? "" };
}
