import { z } from "zod";

/** Optional trimmed string where an empty form field means "not provided". */
export const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );
