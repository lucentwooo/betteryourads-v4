import { z } from "zod";

export const ColorCount = z.object({ hex: z.string(), count: z.number() });

export const MeasuredSiteData = z.object({
  title: z.string(),
  description: z.string(),
  colors: z.object({
    text: z.array(ColorCount),
    background: z.array(ColorCount),
    border: z.array(ColorCount),
    accent_cta: z.array(ColorCount),
  }),
  cssColorVariables: z.record(z.string(), z.string()),
  fonts: z.object({
    body: z.string().nullable(),
    heading: z.string().nullable(),
    button: z.string().nullable(),
  }),
  logos: z.array(z.string()),
  text: z.string(),
  finalUrl: z.string().optional(),
});

export type MeasuredSiteData = z.infer<typeof MeasuredSiteData>;
