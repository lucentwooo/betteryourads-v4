/** Pull JSON out of a model reply that may be wrapped in ```json ... ``` fences. */
export function stripFences(s: string): string {
  const m = String(s).match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}

/** Strip JS-style comments and trailing commas WITHOUT touching string literals. */
export function sanitizeJsonish(s: string): string {
  let out = "";
  let i = 0;
  const n = s.length;
  let inStr = false;
  let quote = "";
  while (i < n) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += s[i + 1] || "";
        i += 2;
        continue;
      }
      if (c === quote) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      i += 2;
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Parse JSON tolerantly: strip fences; retry after sanitizing; else grab the outermost {…}. */
export function parseJsonLoose(s: string): unknown {
  const cleaned = stripFences(s);
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const sanitized = sanitizeJsonish(cleaned);
  try {
    return JSON.parse(sanitized);
  } catch {
    /* fall through */
  }
  const a = sanitized.indexOf("{");
  const b = sanitized.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(sanitized.slice(a, b + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error("no JSON object found in response");
}
