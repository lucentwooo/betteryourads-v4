import { Router } from "express";
import { BrandExtraction } from "@bya/shared";
import { runBrand } from "../pipelines/brand.js";
import { runCustomerResearch } from "../pipelines/customer-research.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { saveBrandExtraction } from "../services/supabase.js";

export const brandRouter = Router();

// Content sections an agent group is expected to produce. schema_version and source_map are
// pipeline/bookkeeping fields, and external_voc is produced by the VOC research pass (not the
// extraction agents), so they're all excluded from the partial check.
const EXPECTED_SECTIONS = Object.keys(BrandExtraction.shape).filter(
  (k) => k !== "schema_version" && k !== "source_map" && k !== "external_voc",
);

brandRouter.post("/brand", requireApprovedUser, async (req, res) => {
  try {
    const url = req.body?.url ?? "";
    const measuredSiteData = req.body?.measuredSiteData;
    const brandExtraction = await runBrand({ url, measuredSiteData });

    // Voice-of-customer pass: lazy (only when absent — always true at fresh creation) and
    // best-effort, so a research failure never blocks brand creation. Persisted inside the
    // analysis blob so the concept board reads it as facts.customer_voice.
    if (!brandExtraction.external_voc) {
      const voc = await runCustomerResearch(brandExtraction);
      if (voc) brandExtraction.external_voc = voc;
    }

    const { id } = await saveBrandExtraction({
      userId: req.user!.id,
      url,
      brandExtraction,
      measuredSiteData,
    });
    const missing = EXPECTED_SECTIONS.filter((k) => brandExtraction[k] === undefined);
    const partialAnalysis = missing.length > 0 ? { missing } : null;
    res.json({ id, brandExtraction, partialAnalysis });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
