import type { Concept } from "@bya/shared";
import { runAdPrompt } from "../pipelines/ad-prompt.js";
import { runRender } from "../pipelines/render.js";
import { saveAdPrompt, persistRenderedAd, updateBatchItem, finalizeBatchIfDone } from "./supabase.js";
import { loadConfig } from "../config/index.js";

const MAX_CONCURRENCY = 3;

export type BatchWorkItem = {
  itemId: string;
  concept: Concept;
  brandExtraction: unknown;
  referenceAdImage: string;
  logoImage: string;
  productAsset?: string;
};

export type RunBatchArgs = {
  batchId: string;
  userId: string;
  brandExtractionId: string | null;
  items: BatchWorkItem[];
};

/** Fire-and-forget. Runs each item through Stage 2 -> render -> persist with a concurrency
 *  cap; one item's failure is recorded on its row and never aborts the others. */
export async function runBatch(args: RunBatchArgs): Promise<void> {
  const queue = [...args.items];
  const take = async (): Promise<void> => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      await processItem(args, item);
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(MAX_CONCURRENCY, queue.length); i++) workers.push(take());
  // finalize even if a worker rejects unexpectedly (e.g. updateBatchItem throws while
  // recording a failure), so the job never gets stuck in 'running'.
  try {
    await Promise.all(workers);
  } finally {
    await finalizeBatchIfDone(args.batchId);
  }
}

async function processItem(args: RunBatchArgs, item: BatchWorkItem): Promise<void> {
  try {
    await updateBatchItem(item.itemId, { status: "running" });
    const adPrompt = await runAdPrompt({
      brandExtraction: item.brandExtraction,
      referenceAdImage: item.referenceAdImage,
      logoImage: item.logoImage,
      productAsset: item.productAsset,
      userDirection: item.concept,
    });
    const { id: adPromptId } = await saveAdPrompt({
      userId: args.userId,
      brandExtractionId: args.brandExtractionId,
      variant: item.productAsset ? "w_asset" : "no_asset",
      adPrompt,
      userDirection: item.concept,
      model: loadConfig().stage2Model,
    });
    const rendered = await runRender({
      adPrompt,
      referenceAdImage: item.referenceAdImage,
      logoImage: item.logoImage,
      productAsset: item.productAsset,
    });
    const saved = await persistRenderedAd({
      userId: args.userId,
      imageUrl: rendered.imageUrl,
      prompt: JSON.stringify(adPrompt.ad_prompt ?? adPrompt ?? {}),
      aspectRatio: rendered.aspectRatio,
      resolution: rendered.resolution,
      adPromptId,
    });
    await updateBatchItem(item.itemId, { status: "done", generatedAdId: saved.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updateBatchItem(item.itemId, { status: "error", error: message });
  }
}
