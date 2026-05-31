'use client';

/*
 * BYAApp — the BetterYourAds single-page app, ported into a real React client
 * module (TypeScript, bundled). This is a faithful 1:1 port of app.html's inline
 * SPA: the same `state` machine, the same render/wire functions, the same markup
 * strings / CSS classes / inline styles / Lucide-style icons, the same delegated
 * data-nav / data-action handlers, the same dropzones, and the same localStorage
 * keys. styles/tokens.css + styles/app.css (loaded by app/layout.tsx in app.html's
 * order) style it identically.
 *
 * It imports lib/client/auth (Auth) and lib/client/pipeline (BYA) — the TS ports
 * of auth.js and bya-pipeline.js — and lib/prompts indirectly through them. There
 * is NO <Script src> of any legacy .js; this module runs inside the app bundle.
 *
 * Why HTML strings + a single host node instead of JSX-per-screen: the legacy app
 * builds ~1000 lines of bespoke inline-styled markup through string concatenation
 * and an icon() helper. Reproducing it as hand-written JSX would risk per-byte
 * drift from the pixel-reference screenshots; rendering the SAME strings into the
 * #app host guarantees the cascade and layout are identical. React owns the host,
 * the boot/auth lifecycle, and a single render tick; the legacy view functions are
 * preserved verbatim below.
 */
import { useEffect, useRef } from 'react';
import { Auth } from '@/lib/client/auth';
import { BYA } from '@/lib/client/pipeline';

// The legacy app worked on loosely-typed JSON from the model/DB. Keep that shape
// rather than inventing a schema the runtime doesn't actually guarantee.
type Rec = Record<string, unknown>;

export default function BYAApp() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Run the legacy SPA exactly once, against the #app host. Everything below is the
  // app.html IIFE, ported to TS: same state object, same functions, same wiring.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const $app = hostRef.current;
    if (!$app) return;

    // ───────────────────────── Icons (Lucide-style, 1.5 stroke) ─────────────────────────
    const ICONS: Record<string, string> = {
      layout: 'M3 3h18v18H3zM3 9h18M9 21V9', library: 'M3 4h18v16H3zM3 10h18M8 4v6',
      layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
      spark: 'M3 17l6-6 4 4 8-8M14 7h7v7', globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18',
      settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13a7.9 7.9 0 000-2l2-1.5-2-3.4-2.3 1a7.9 7.9 0 00-1.7-1l-.3-2.6h-4l-.3 2.6a7.9 7.9 0 00-1.7 1l-2.3-1-2 3.4L4.6 11a7.9 7.9 0 000 2l-2 1.5 2 3.4 2.3-1a7.9 7.9 0 001.7 1l.3 2.6h4l.3-2.6a7.9 7.9 0 001.7-1l2.3 1 2-3.4z',
      plus: 'M12 5v14M5 12h14', check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12',
      'arrow-right': 'M5 12h14M13 6l6 6-6 6', 'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
      image: 'M3 3h18v18H3zM9 9a2 2 0 100-.01M21 15l-5-5L5 21', download: 'M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4M7 10l5 5 5-5M12 15V3',
      copy: 'M9 9h13v13H9zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1', external: 'M15 3h6v6M10 14 21 3M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5',
      refresh: 'M21 12a9 9 0 11-3-6.7M21 4v5h-5', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
      info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v5M12 16h.01',
    };
    function icon(name: string, size?: number, color?: string): string {
      const d = ICONS[name]; if (!d) return '';
      const paths = d.split('M').filter(Boolean).map(function (seg) { return '<path d="M' + seg + '" />'; }).join('');
      return '<svg class="ico" width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="' +
        (color || 'currentColor') + '" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" style="flex-shrink:0">' + paths + '</svg>';
    }
    type BtnOpts = { variant?: string; size?: string; full?: boolean; id?: string; disabled?: boolean; attr?: string; style?: string; icon?: string; iconRight?: string };
    function btn(label: string, o?: BtnOpts): string {
      o = o || {};
      const cls = ['btn', o.variant && o.variant !== 'secondary' ? o.variant : '', o.size === 'sm' ? 'sm' : '', o.full ? 'full' : ''].filter(Boolean).join(' ');
      const isz = o.size === 'lg' ? 16 : 14;
      const style = (o.size === 'lg' ? 'font-size:15px;padding:14px 22px;' : '') + (o.full ? 'width:100%;justify-content:center;' : '') + (o.style || '');
      return '<button class="' + cls + '"' + (o.id ? ' id="' + o.id + '"' : '') + (o.disabled ? ' disabled' : '') +
        (o.attr || '') + ' style="' + style + '">' +
        (o.icon ? icon(o.icon, isz) : '') + '<span>' + label + '</span>' + (o.iconRight ? icon(o.iconRight, isz) : '') + '</button>';
    }
    function esc(s: unknown): string { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function hostOf(u: unknown): string { try { return new URL(/^https?:\/\//.test(String(u)) ? String(u) : 'https://' + String(u)).hostname.replace(/^www\./, ''); } catch { return String(u || ''); } }

    // Goal → which two awareness stages the board emphasizes.
    const GOAL_FOCUS: Record<string, string[]> = { waitlist: ['problem', 'solution'], trials: ['solution', 'product'], paid: ['product', 'most'] };
    const GOAL_LABEL: Record<string, string> = { waitlist: 'Grow a waitlist', trials: 'Get signups / trials', paid: 'Convert to paid' };
    const STAGE_ORDER = ['unaware', 'problem', 'solution', 'product', 'most'];
    const STAGE_META: Record<string, { name: string; blurb: string }> = {
      unaware: { name: 'Unaware', blurb: "They don't know they have this problem yet." },
      problem: { name: 'Problem-aware', blurb: "They feel the pain but don't know solutions exist." },
      solution: { name: 'Solution-aware', blurb: 'They know tools like this exist; weighing approaches.' },
      product: { name: 'Product-aware', blurb: 'They know you; comparing you to alternatives.' },
      most: { name: 'Most-aware', blurb: 'Basically ready — they just need a nudge.' },
    };
    // Reuse external VOC if present; otherwise run the one-time research pass and persist it.
    async function ensureResearch(brand: Rec): Promise<Rec> {
      const a = (brand.analysis as Rec) || {};
      if (a.external_voc) return a;
      let voc = null;
      try { voc = await BYA.researchCustomers(a); } catch { /* best-effort */ }
      if (voc) {
        a.external_voc = voc;
        brand.analysis = a;
        try { await BYA.saveBrand(brand.website_url as string, a, state.userId as string, (brand.goal as string) || null); } catch { /* best-effort */ }
      }
      return a;
    }

    // ───────────────────────── State ─────────────────────────
    type State = {
      userId: string | null; email: string; booted: boolean;
      brands: Rec[]; ads: Rec[]; adsError: string | null;
      view: string; modal: Rec | null; wb: Rec | null;
      goal: string | null; primaryBrand: Rec | null; concepts: Rec[] | null;
      selected: Set<number> | null; expanded: Set<string> | null;
      brandDnaOpen: boolean; pendingConcepts: Rec[] | null; onboarding: Rec | null;
    };
    const state: State = {
      userId: null, email: '',
      booted: false,
      brands: [], ads: [], adsError: null,
      view: 'home', modal: null, wb: null,
      goal: null, primaryBrand: null, concepts: null,
      selected: null, expanded: null,
      brandDnaOpen: false, pendingConcepts: null, onboarding: null,
    };

    // ───────────────────────── Reusable: image file → downscaled data URL ─────────────────────────
    function fileToDataUrl(file: File, maxDim?: number): Promise<string> {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () {
          const img = new Image();
          img.onload = function () {
            try {
              const scale = Math.min(1, (maxDim || 1400) / Math.max(img.width, img.height));
              const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
              const c = document.createElement('canvas'); c.width = w; c.height = h;
              c.getContext('2d')!.drawImage(img, 0, 0, w, h);
              resolve(c.toDataURL('image/png'));
            } catch { resolve(String(reader.result)); }
          };
          img.onerror = function () { resolve(String(reader.result)); };
          img.src = String(reader.result);
        };
        reader.onerror = function () { reject(new Error('Could not read file')); };
        reader.readAsDataURL(file);
      });
    }
    // Best-effort: load a logo URL cross-origin and rasterize to a data URL (skips on CORS taint).
    function deriveLogoFromUrls(urls: string[]): Promise<string | null> {
      return new Promise(function (resolve) {
        const list = (urls || []).filter(Boolean);
        let i = 0;
        function tryNext() {
          if (i >= list.length) { resolve(null); return; }
          const u = list[i++];
          const img = new Image(); img.crossOrigin = 'anonymous';
          img.onload = function () {
            try {
              const c = document.createElement('canvas'); c.width = img.naturalWidth || 256; c.height = img.naturalHeight || 256;
              c.getContext('2d')!.drawImage(img, 0, 0);
              resolve(c.toDataURL('image/png'));
            } catch { tryNext(); }
          };
          img.onerror = tryNext;
          img.src = u;
        }
        tryNext();
      });
    }

    // Derive a simple display palette (bg/fg/accent) for the "drawing" preview from a brand analysis.
    function derivePalette(analysis: Rec | null): { bg: string; fg: string; accent: string; name: string } {
      const out = { bg: '#0a0a0a', fg: '#f4efe6', accent: '#1a3df0', name: 'your brand' };
      try {
        const vbs = (analysis && (analysis.visual_brand_system as Rec)) || {};
        const id = (analysis && (analysis.brand_identity as Rec)) || {};
        out.name = ((id.brand_name as string) || (id.name as string) || out.name);
        const pal = ((vbs.color_palette as Rec) || (vbs.colors as Rec) || {});
        const pick = function (v: unknown): string | null { return typeof v === 'string' && /^#?[0-9a-f]{3,8}$/i.test(v.replace('#', '')) ? (v[0] === '#' ? v : '#' + v) : null; };
        const bg = pick(pal.background) || pick(pal.primary) || pick(vbs.background_color);
        const fg = pick(pal.text) || pick(pal.foreground) || pick(vbs.text_color);
        const ac = pick(pal.accent) || pick(pal.cta) || pick(vbs.accent_color) || pick(pal.primary);
        if (bg) out.bg = bg; if (fg) out.fg = fg; if (ac) out.accent = ac;
      } catch { /* defaults */ }
      return out;
    }

    // ───────────────────────── Brand DNA panel ─────────────────────────
    function brandDnaHTML(analysis: Rec | null, opts?: { compact?: boolean }): string {
      try {
        if (!analysis) return '';
        opts = opts || {};
        const vbs = (analysis.visual_brand_system as Rec) || {};
        const id = (analysis.brand_identity as Rec) || {};
        const brandName = (id.brand_name as string) || (id.name as string) || '';
        const positioning = (id.positioning as string) || (id.tagline as string) || '';

        function pickHex(v: unknown): string | null {
          if (!v) return null;
          if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = pickHex(v[i]); if (r) return r; } return null; }
          if (typeof v === 'string' && /^#?[0-9a-f]{3,8}$/i.test(v.replace(/^#+/, ''))) return '#' + v.replace(/^#+/, '');
          return null;
        }

        const pal = (vbs.color_palette as Rec) || (vbs.colors as Rec) || {};
        const colorRoles = [
          { role: 'background', val: pickHex(pal.background) || pickHex(vbs.background_color) },
          { role: 'text', val: pickHex(pal.text) || pickHex(pal.foreground) || pickHex(vbs.text_color) },
          { role: 'primary', val: pickHex(pal.primary) },
          { role: 'accent', val: pickHex(pal.accent) || pickHex(vbs.accent_color) },
          { role: 'cta', val: pickHex(pal.cta) },
          { role: 'secondary', val: pickHex(pal.secondary) },
        ].filter(function (cr) { return !!cr.val; });

        if (!colorRoles.length && !brandName) return '';

        const typo = (vbs.typography as Rec) || {};
        const fontFamilies = typo.font_families || [];
        let headingFont = Array.isArray(fontFamilies) ? (fontFamilies[0] || '') : (typeof fontFamilies === 'string' ? fontFamilies.split(',')[0].trim() : (typeof fontFamilies === 'object' ? ((fontFamilies as Rec).heading || '') : ''));
        let bodyFont = Array.isArray(fontFamilies) ? (fontFamilies[1] || fontFamilies[0] || '') : (typeof fontFamilies === 'string' ? (fontFamilies.split(',')[1] || fontFamilies.split(',')[0] || '').trim() : (typeof fontFamilies === 'object' ? ((fontFamilies as Rec).body || (fontFamilies as Rec).heading || '') : ''));
        if (!headingFont) headingFont = (typo.heading_style as string) || '';
        if (!bodyFont) bodyFont = (typo.body_style as string) || '';
        const casingStyle = (typo.casing_style as string) || '';

        const uiStyle = (vbs.ui_style as Rec) || {};
        const mood = (uiStyle.overall_mood as string) || (uiStyle.mood as string) || (vbs.mood as string) || '';

        if (opts.compact) {
          const swatchesCompact = colorRoles.slice(0, 5).map(function (cr) {
            return '<div title="' + esc(cr.role) + '" style="width:14px;height:14px;background:' + esc(cr.val) + ';flex-shrink:0"></div>';
          }).join('');
          const compactFontParts: string[] = [];
          if (headingFont) compactFontParts.push(esc(headingFont));
          if (bodyFont && bodyFont !== headingFont) compactFontParts.push(esc(bodyFont));
          return '<div style="padding:12px 14px;border:1px solid var(--border-hairline);border-radius:6px;background:var(--bg);display:flex;align-items:center;gap:12px">' +
            (swatchesCompact ? '<div style="display:flex;border:1px solid var(--fg);border-radius:2px;overflow:hidden;flex-shrink:0">' + swatchesCompact + '</div>' : '') +
            '<div style="flex:1;font-size:12px;min-width:0;overflow:hidden">' +
              (brandName ? '<strong>' + esc(brandName) + '</strong>' : '') +
              (brandName && positioning ? ' · ' : '') +
              (positioning ? esc(String(positioning).slice(0, 80)) : '') +
              (compactFontParts.length ? '<span style="font-family:var(--font-mono);color:var(--fg-3);font-size:11px;margin-left:6px">' + compactFontParts.join(' / ') + '</span>' : '') +
              (mood ? '<span style="color:var(--fg-3);font-size:11px;margin-left:6px">' + esc(String(mood).slice(0, 50)) + '</span>' : '') +
            '</div>' +
            icon('check', 14, 'var(--bya-forest)') +
          '</div>';
        }

        const swatchesSummary = colorRoles.slice(0, 6).map(function (cr) {
          return '<div title="' + esc(cr.role) + '" style="width:16px;height:16px;background:' + esc(cr.val) + ';flex-shrink:0"></div>';
        }).join('');
        const fontSummaryParts: string[] = [];
        if (headingFont) fontSummaryParts.push(esc(headingFont));
        if (bodyFont && bodyFont !== headingFont) fontSummaryParts.push(esc(bodyFont));

        const summaryInner =
          '<div style="display:flex;align-items:center;gap:10px;min-width:0">' +
            (swatchesSummary ? '<div style="display:flex;gap:2px;flex-shrink:0">' + swatchesSummary + '</div>' : '') +
            '<span style="font-size:13px;font-weight:500;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(brandName || 'brand') + '</span>' +
            (fontSummaryParts.length ? '<span style="font-size:12px;color:var(--fg-3);font-family:var(--font-mono);white-space:nowrap">' + fontSummaryParts.join(' / ') + '</span>' : '') +
            (mood ? '<span style="font-size:12px;color:var(--fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(String(mood).slice(0, 60)) + '</span>' : '') +
          '</div>' +
          '<span style="font-size:11px;color:var(--fg-3);font-family:var(--font-mono);flex-shrink:0;user-select:none">▸ brand DNA</span>';

        const swatchesDetailed = colorRoles.map(function (cr) {
          return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px">' +
            '<div style="width:28px;height:28px;border-radius:3px;background:' + esc(cr.val) + ';border:1px solid rgba(255,255,255,0.08)"></div>' +
            '<span style="font-family:var(--font-mono);font-size:9px;color:var(--fg-3)">' + esc(cr.role) + '</span>' +
            '<span style="font-family:var(--font-mono);font-size:9px;color:var(--fg-2)">' + esc(cr.val) + '</span>' +
          '</div>';
        }).join('');

        const fontLines: string[] = [];
        if (headingFont) fontLines.push('<span style="font-size:12px"><strong style="color:var(--fg-2)">heading</strong> ' + esc(headingFont) + '</span>');
        if (bodyFont && bodyFont !== headingFont) fontLines.push('<span style="font-size:12px"><strong style="color:var(--fg-2)">body</strong> ' + esc(bodyFont) + '</span>');
        if (casingStyle) fontLines.push('<span style="font-size:12px"><strong style="color:var(--fg-2)">casing</strong> ' + esc(casingStyle) + '</span>');
        if (typo.button_style) fontLines.push('<span style="font-size:12px"><strong style="color:var(--fg-2)">button</strong> ' + esc(typo.button_style) + '</span>');

        const expandedBody =
          '<div style="padding:14px 16px 12px;border-top:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:14px">' +
            (positioning ? '<p style="font-size:13px;color:var(--fg-2);margin:0;line-height:1.4">' + esc(positioning) + '</p>' : '') +
            (swatchesDetailed ? '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start">' + swatchesDetailed + '</div>' : '') +
            (fontLines.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--fg-3)">' + fontLines.join('') + '</div>' : '') +
            (mood ? '<div style="font-size:12px;color:var(--fg-2)"><strong style="color:var(--fg-3);font-size:11px;text-transform:uppercase;letter-spacing:0.1em">vibe</strong><br>' + esc(mood) + '</div>' : '') +
          '</div>';

        return '<details id="brandDnaDetails"' + (state.brandDnaOpen ? ' open' : '') + ' style="margin-bottom:20px;border:1px solid var(--border-hairline);border-radius:8px;background:var(--bg-raised);overflow:hidden">' +
          '<summary style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;cursor:pointer;outline:none">' +
            summaryInner +
          '</summary>' +
          expandedBody +
        '</details>';
      } catch {
        return '';
      }
    }

    // ───────────────────────── Rail (left nav) ─────────────────────────
    function railHTML(active: string): string {
      const brandsNav = state.brands.slice(0, 6).map(function (b) {
        const on = active === 'home' && state.primaryBrand && state.primaryBrand.id === b.id;
        return '<button class="nav-item' + (on ? ' active' : '') + '" data-action="switchBrand" data-brand-id="' + esc(b.id) + '">' +
          icon('globe') + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(hostOf(b.website_url)) + '</span></button>';
      }).join('');
      const myAdsCount = adsForActiveBrand().length;
      const initial = (state.email || '?')[0].toUpperCase();
      return '<aside class="rail">' +
        '<a class="brand" href="#" data-nav="home"><img class="mark" src="assets/logo-mark.png" alt="" width="28" height="28" />' +
        '<span class="wordmark">betteryour<span class="ads">ads</span></span></a>' +
        '<div class="nav-section">' +
          '<button class="nav-item' + (active === 'home' ? ' active' : '') + '" data-nav="home">' + icon('layout') + ' home</button>' +
          '<button class="nav-item' + (active === 'create' ? ' active' : '') + '" data-nav="start">' + icon('spark') + ' make an ad</button>' +
          '<button class="nav-item' + (active === 'library' ? ' active' : '') + '" data-nav="library">' + icon('library') + ' my ads' +
            (myAdsCount ? '<span class="count">' + myAdsCount + '</span>' : '') + '</button>' +
          '<button class="nav-item' + (active === 'brands' ? ' active' : '') + '" data-nav="brands">' + icon('layers') + ' brands' +
            (state.brands.length ? '<span class="count">' + state.brands.length + '</span>' : '') + '</button>' +
          '<button class="nav-item" data-action="addBrand">' + icon('spark') + ' new company</button>' +
        '</div>' +
        (brandsNav ? '<div class="nav-section"><h6>your brands</h6>' + brandsNav + '</div>' : '') +
        '<div class="footer"><div class="user">' +
          '<div class="avatar">' + esc(initial) + '</div>' +
          '<div class="meta"><span class="name">' + esc(state.email || 'you') + '</span><span class="role">vector.co</span></div>' +
          '<button class="btn ghost icon" title="sign out" data-action="signout" style="margin-left:auto;padding:6px">' + icon('settings') + '</button>' +
        '</div></div></aside>';
    }
    function topbarHTML(eyebrow: string, title: string, actions?: string): string {
      return '<div class="topbar"><div class="crumbs" style="flex-direction:column;align-items:flex-start;gap:0">' +
        (eyebrow ? '<span class="crumb" style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:var(--fg-3)">' + esc(eyebrow) + '</span>' : '') +
        '<span class="crumb current" style="font-size:15px;font-weight:500">' + esc(title) + '</span></div>' +
        '<div class="actions">' + (actions || '') + '</div></div>';
    }
    function shell(active: string, mainHTML: string): string {
      return '<div style="display:grid;grid-template-columns:232px 1fr;height:100vh;width:100vw;background:var(--bg);overflow:hidden">' +
        railHTML(active) +
        '<main style="overflow:hidden;position:relative;display:flex;flex-direction:column;min-width:0">' + mainHTML + '</main></div>';
    }

    function adFace(pal: { bg: string; fg: string; accent: string; name: string } | null, headline: string): string {
      pal = pal || { bg: 'var(--bg-raised)', fg: 'var(--fg)', accent: 'var(--accent)', name: 'ad' };
      return '<div class="ad-face" style="background:' + pal.bg + ';color:' + pal.fg + '">' +
        '<div style="font-size:11px;font-weight:600;opacity:.85">' + esc(pal.name) + '</div>' +
        '<div style="font-size:18px;font-weight:600;line-height:1.05">' + esc(headline || '') + '</div>' +
        '<div><span style="background:' + pal.accent + ';color:' + pal.bg + ';padding:4px 10px;font-size:10px;font-weight:600">start free →</span></div></div>';
    }

    // ───────────────────────── Sign in ─────────────────────────
    const LINK = 'background:none;border:0;color:var(--accent);cursor:pointer;font-size:12px;padding:0;font-family:var(--font-mono)';

    function setHTML(html: string) { $app!.innerHTML = html; }

    function renderAuthShell(cardHTML: string) {
      state.booted = false;
      setHTML(
        '<div class="auth"><div class="left">' +
          '<span style="display:inline-flex;align-items:center;gap:8px"><img src="assets/logo-mark.png" width="36" height="36" alt="" />' +
          '<span style="font-size:22px;font-weight:700;letter-spacing:-0.03em">betteryour<span style="color:var(--accent)">ads</span></span></span>' +
          '<div style="max-width:540px">' +
            '<div class="eyebrow-mut" style="margin-bottom:22px">meta ads · built for b2b saas</div>' +
            '<h1>Stop guessing.<br/>Stop overpaying <span class="accent">agencies</span>.</h1>' +
            '<p style="font-size:17px;line-height:1.5;color:var(--fg-2);margin:0;max-width:460px">We read your site, learn your customers, and ship Meta ads built for SaaS funnels — not ecommerce. Three clicks per ad. No retainer.</p>' +
          '</div>' +
          '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3)">private beta · 2026 · sf</div>' +
        '</div><div class="right"><div class="auth-card" id="authCard">' + cardHTML + '</div></div></div>');
    }
    function swapAuthCard(html: string, wire?: () => void) {
      const el = document.getElementById('authCard');
      if (el) el.innerHTML = html;
      if (wire) wire();
    }

    function renderSignIn(prefill?: string) { renderAuthShell(signInInputHTML(prefill || '')); wireSignIn(); }
    function signInInputHTML(email: string): string {
      return '<h2 style="font-size:26px;font-weight:600;letter-spacing:-0.01em;margin:0 0 8px">sign in</h2>' +
        '<p style="font-size:13px;color:var(--fg-2);margin:0 0 24px">Enter your email and password.</p>' +
        '<div class="field"><label>work email</label><input class="input" id="authEmail" type="email" placeholder="you@company.com" value="' + esc(email) + '" /></div>' +
        '<div class="field"><label>password</label><input class="input" id="authPassword" type="password" placeholder="your password" /></div>' +
        btn('sign in', { variant: 'primary', size: 'lg', full: true, id: 'authSend' }) +
        '<div id="authMsg" style="margin-top:14px;font-size:12px;color:var(--fg-2)"></div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:14px">' +
          '<button id="authForgot" style="' + LINK + '">forgot password?</button>' +
          '<button id="authToSignup" style="' + LINK + '">create account</button>' +
        '</div>' +
        '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--fg);text-align:center">' +
          '<button id="authMagic" style="' + LINK + '">email me a sign-in link instead</button>' +
        '</div>' +
        '<div style="margin-top:14px;font-size:11px;color:var(--fg-3);font-family:var(--font-mono)">first time? create an account — you\'ll land in the approval queue.</div>';
    }
    function wireSignIn() {
      const emailEl = document.getElementById('authEmail') as HTMLInputElement | null;
      const pwEl = document.getElementById('authPassword') as HTMLInputElement | null;
      const sendEl = document.getElementById('authSend') as HTMLButtonElement | null;
      const msg = document.getElementById('authMsg');
      if (!emailEl || !pwEl || !sendEl || !msg) return;
      emailEl.focus();
      async function signin() {
        const email = (emailEl!.value || '').trim();
        const password = pwEl!.value || '';
        if (!email || !password) { msg!.textContent = 'Enter your email and password.'; return; }
        sendEl!.disabled = true; sendEl!.querySelector('span')!.textContent = 'signing in…';
        const { error } = await Auth.signInWithPassword(email, password);
        if (error) { sendEl!.disabled = false; sendEl!.querySelector('span')!.textContent = 'sign in'; msg!.textContent = "Couldn't sign in: " + error.message; return; }
      }
      sendEl.addEventListener('click', signin);
      emailEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') pwEl!.focus(); });
      pwEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') signin(); });

      document.getElementById('authForgot')!.addEventListener('click', async function () {
        const email = (emailEl!.value || '').trim();
        if (!email) { msg!.textContent = 'Enter your email first, then tap forgot password.'; return; }
        const { error } = await Auth.resetPasswordForEmail(email);
        msg!.textContent = error ? "Couldn't send reset email: " + error.message : 'Check your inbox for a link to set a new password.';
      });
      document.getElementById('authToSignup')!.addEventListener('click', function () {
        swapAuthCard(signUpInputHTML((emailEl!.value || '').trim()), wireSignUp);
      });
      document.getElementById('authMagic')!.addEventListener('click', async function () {
        const email = (emailEl!.value || '').trim();
        if (!email) { msg!.textContent = 'Enter your email first.'; return; }
        const { error } = await Auth.signInWithOtp(email);
        if (error) { msg!.textContent = "Couldn't send link: " + error.message; return; }
        swapAuthCard(checkInboxHTML(email, false));
      });
    }

    function signUpInputHTML(email: string): string {
      return '<h2 style="font-size:26px;font-weight:600;letter-spacing:-0.01em;margin:0 0 8px">create account</h2>' +
        '<p style="font-size:13px;color:var(--fg-2);margin:0 0 24px">Pick an email and password to get started.</p>' +
        '<div class="field"><label>work email</label><input class="input" id="authEmail" type="email" placeholder="you@company.com" value="' + esc(email) + '" /></div>' +
        '<div class="field"><label>password</label><input class="input" id="authPassword" type="password" placeholder="at least 6 characters" /></div>' +
        btn('create account', { variant: 'primary', size: 'lg', full: true, id: 'authSend' }) +
        '<div id="authMsg" style="margin-top:14px;font-size:12px;color:var(--fg-2)"></div>' +
        '<div style="margin-top:16px;text-align:center"><button id="authToSignin" style="' + LINK + '">already have an account? sign in</button></div>';
    }
    function wireSignUp() {
      const emailEl = document.getElementById('authEmail') as HTMLInputElement | null;
      const pwEl = document.getElementById('authPassword') as HTMLInputElement | null;
      const sendEl = document.getElementById('authSend') as HTMLButtonElement | null;
      const msg = document.getElementById('authMsg');
      if (!emailEl || !pwEl || !sendEl || !msg) return;
      emailEl.focus();
      async function signup() {
        const email = (emailEl!.value || '').trim();
        const password = pwEl!.value || '';
        if (!email || !password) { msg!.textContent = 'Enter your email and a password.'; return; }
        if (password.length < 6) { msg!.textContent = 'Password must be at least 6 characters.'; return; }
        sendEl!.disabled = true; sendEl!.querySelector('span')!.textContent = 'creating…';
        const { data, error } = await Auth.signUp(email, password);
        if (error) { sendEl!.disabled = false; sendEl!.querySelector('span')!.textContent = 'create account'; msg!.textContent = "Couldn't create account: " + error.message; return; }
        if (data && data.session) return; // signed in immediately; onAuthStateChange routes.
        swapAuthCard(checkInboxHTML(email, true));
      }
      sendEl.addEventListener('click', signup);
      pwEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') signup(); });
      document.getElementById('authToSignin')!.addEventListener('click', function () {
        swapAuthCard(signInInputHTML((emailEl!.value || '').trim()), wireSignIn);
      });
    }

    function checkInboxHTML(email: string, confirm: boolean): string {
      const line = confirm
        ? 'We sent a confirmation link to <strong style="color:var(--fg)">' + esc(email) + '</strong>. Open it to verify your email, then come back and sign in.'
        : 'We sent a sign-in link to <strong style="color:var(--fg)">' + esc(email) + '</strong>. Open it in this browser to continue.';
      return '<h2 style="font-size:26px;font-weight:600;letter-spacing:-0.01em;margin:0 0 8px">check your inbox</h2>' +
        '<p style="font-size:13px;color:var(--fg-2);margin:0 0 12px">' + line + '</p>' +
        '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-2);padding:10px;border:1px solid var(--fg);border-radius:4px;background:var(--bg-raised)">' +
          (confirm ? 'After confirming, return here to sign in with your password.' : 'The link signs you in automatically when you return to this tab.') +
        '</div>';
    }

    function renderRecovery() { renderAuthShell(recoveryInputHTML()); wireRecovery(); }
    function recoveryInputHTML(): string {
      return '<h2 style="font-size:26px;font-weight:600;letter-spacing:-0.01em;margin:0 0 8px">set a new password</h2>' +
        '<p style="font-size:13px;color:var(--fg-2);margin:0 0 24px">Choose a new password for your account.</p>' +
        '<div class="field"><label>new password</label><input class="input" id="authPassword" type="password" placeholder="at least 6 characters" /></div>' +
        btn('update password', { variant: 'primary', size: 'lg', full: true, id: 'authSend' }) +
        '<div id="authMsg" style="margin-top:14px;font-size:12px;color:var(--fg-2)"></div>';
    }
    function wireRecovery() {
      const pwEl = document.getElementById('authPassword') as HTMLInputElement | null;
      const sendEl = document.getElementById('authSend') as HTMLButtonElement | null;
      const msg = document.getElementById('authMsg');
      if (!pwEl || !sendEl || !msg) return;
      pwEl.focus();
      async function update() {
        const password = pwEl!.value || '';
        if (password.length < 6) { msg!.textContent = 'Password must be at least 6 characters.'; return; }
        sendEl!.disabled = true; sendEl!.querySelector('span')!.textContent = 'updating…';
        const { error } = await Auth.updatePassword(password);
        if (error) { sendEl!.disabled = false; sendEl!.querySelector('span')!.textContent = 'update password'; msg!.textContent = "Couldn't update password: " + error.message; return; }
        Auth.clearRecoveryHash();
        const { data } = await Auth.getSession();
        evaluate(data.session);
      }
      sendEl.addEventListener('click', update);
      pwEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') update(); });
    }
    function renderPending(email: string) {
      state.booted = false;
      setHTML(
        '<div class="auth"><div class="left">' +
          '<span style="display:inline-flex;align-items:center;gap:8px"><img src="assets/logo-mark.png" width="36" height="36" alt="" />' +
          '<span style="font-size:22px;font-weight:700;letter-spacing:-0.03em">betteryour<span style="color:var(--accent)">ads</span></span></span>' +
          '<div style="max-width:540px"><div class="eyebrow-mut" style="margin-bottom:22px">private beta</div>' +
          '<h1>You\'re on the <span class="accent">list</span>.</h1>' +
          '<p style="font-size:17px;line-height:1.5;color:var(--fg-2);margin:0;max-width:460px">You\'re signed in as ' + esc(email) + ', but your account is awaiting approval. We\'ll email you the moment you\'re in.</p></div>' +
          '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3)">private beta · 2026 · sf</div>' +
        '</div><div class="right"><div class="auth-card">' +
          '<h2 style="font-size:22px;font-weight:600;margin:0 0 8px">awaiting approval</h2>' +
          '<p style="font-size:13px;color:var(--fg-2);margin:0 0 24px">Hang tight — we approve new workspaces daily.</p>' +
          btn('sign out', { full: true, attr: ' data-action="signout"' }) +
        '</div></div></div>');
    }

    // ───────────────────────── Onboarding ─────────────────────────
    function needsOnboarding(): boolean {
      if (!state.primaryBrand) state.primaryBrand = state.brands && state.brands.length ? state.brands[0] : null;
      return !state.primaryBrand || !state.primaryBrand.goal;
    }
    function renderOnboarding() {
      state.view = 'onboarding';
      const ob = state.onboarding || (state.onboarding = { step: state.primaryBrand ? 'goal' : 'url', url: '', error: null });
      let card: string;
      if (ob.step === 'url') {
        card =
          '<div class="eyebrow-acc" style="margin-bottom:10px">welcome</div>' +
          '<h1 style="font-size:40px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0 0 12px">Let’s learn your brand.</h1>' +
          '<p style="font-size:16px;color:var(--fg-2);margin:0 0 24px;line-height:1.5">Paste your site. We read it in a real browser, study what your customers say, and build you a board of ad concepts.</p>' +
          (ob.error ? '<div style="color:var(--bya-oxblood);font-size:13px;margin-bottom:12px">' + esc(ob.error) + '</div>' : '') +
          '<div style="display:flex;gap:8px"><input class="input" id="obUrl" type="url" placeholder="https://yourcompany.com" value="' + esc(ob.url) + '" style="flex:1;font-size:15px" />' +
          btn('continue', { variant: 'primary', iconRight: 'arrow-right', id: 'obUrlGo' }) + '</div>';
      } else if (ob.step === 'analyzing') {
        card =
          '<div class="eyebrow-acc" style="margin-bottom:10px">one moment</div>' +
          '<h1 style="font-size:40px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0 0 12px">Reading <span style="color:var(--accent)">' + esc(hostOf(ob.url || (state.primaryBrand && state.primaryBrand.website_url) || 'your site')) + '</span>.</h1>' +
          '<p style="font-size:16px;color:var(--fg-2);margin:0 0 24px;line-height:1.5" id="obStatus">Learning your colors, voice, and customers…</p>' +
          '<div style="display:flex;align-items:center;gap:10px;color:var(--fg-2);font-size:14px"><span class="spinner"></span> <span>analyzing…</span></div>';
      } else {
        const goalCard = function (key: string, sub: string) {
          return '<button class="brand-pick" data-goal="' + key + '" style="padding:16px 18px">' +
            '<span style="flex:1"><span style="font-size:15px;font-weight:600;color:var(--fg);display:block">' + esc(GOAL_LABEL[key]) + '</span>' +
            '<span style="font-size:12px;color:var(--fg-3)">' + esc(sub) + '</span></span>' + icon('arrow-right', 14, 'var(--fg-3)') + '</button>';
        };
        card =
          '<div class="eyebrow-acc" style="margin-bottom:10px">last step</div>' +
          '<h1 style="font-size:40px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0 0 12px">What are you trying to do right now?</h1>' +
          '<p style="font-size:16px;color:var(--fg-2);margin:0 0 24px;line-height:1.5">This shapes which concepts we put in front of you.</p>' +
          (ob.error ? '<div style="color:var(--bya-oxblood);font-size:13px;margin-bottom:12px">' + esc(ob.error) + '</div>' : '') +
          '<div style="display:flex;flex-direction:column;gap:10px">' +
            goalCard('waitlist', 'Catch people who feel the pain and want in early.') +
            goalCard('trials', 'They’re comparing options — show yours wins.') +
            goalCard('paid', 'They know you — remove the last hesitation.') + '</div>';
      }
      setHTML(
        '<div style="height:100vh;width:100vw;background:var(--bg);display:grid;place-items:center;padding:24px">' +
          '<div style="width:100%;max-width:560px">' + card + '</div></div>');
      wireOnboarding();
    }
    function wireOnboarding() {
      const ob = state.onboarding!;
      if (ob.step === 'url') {
        const urlEl = document.getElementById('obUrl') as HTMLInputElement | null;
        if (!urlEl) return;
        const go = function () { const v = (urlEl.value || '').trim(); if (v) onboardAnalyze(v); };
        document.getElementById('obUrlGo')!.addEventListener('click', go);
        urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        urlEl.focus();
      } else if (ob.step === 'goal') {
        $app!.querySelectorAll('[data-goal]').forEach(function (b) {
          b.addEventListener('click', function () { onboardSaveGoal((b as HTMLElement).getAttribute('data-goal')!); });
        });
      }
    }
    async function onboardAnalyze(url: string) {
      const ob = state.onboarding!; ob.url = url; ob.error = null; ob.step = 'analyzing'; renderOnboarding();
      const setStatus = function (m: string) { const el = document.getElementById('obStatus'); if (el) el.textContent = m; };
      try {
        const extracted = await BYA.extractSite(url);
        setStatus('Learning your brand’s colors, voice, and customers…');
        const res = await BYA.analyzeBrand(extracted as unknown as Rec, { url, online: false }) as Rec;
        let saved: Rec | null = null;
        try { saved = await BYA.saveBrand((extracted as Rec).finalUrl as string || url, res.merged as Rec, state.userId as string); } catch { /* best-effort */ }
        const brand = saved || { website_url: (extracted as Rec).finalUrl as string || url, analysis: res.merged as Rec, goal: null };
        setStatus('Researching what your customers actually say…');
        brand.analysis = await ensureResearch(brand);
        state.brands = await BYA.loadBrands();
        state.primaryBrand = state.brands[0] || brand;
        ob.step = 'goal'; renderOnboarding();
      } catch (e) {
        ob.step = 'url'; ob.error = (e as Error).message || String(e); renderOnboarding();
      }
    }
    async function onboardSaveGoal(goal: string) {
      const ob = state.onboarding!; ob.error = null;
      const brand = state.primaryBrand; if (!brand) { ob.step = 'url'; renderOnboarding(); return; }
      ob.step = 'analyzing'; renderOnboarding();
      const setStatus = function (m: string) { const el = document.getElementById('obStatus'); if (el) el.textContent = m; };
      setStatus('Researching what your customers actually say…');
      try {
        brand.analysis = await ensureResearch(brand);
        await BYA.saveBrand(brand.website_url as string, brand.analysis as Rec, state.userId as string, goal);
        brand.goal = goal;
        state.brands = await BYA.loadBrands();
        state.primaryBrand = state.brands[0] || brand;
        state.goal = goal; state.onboarding = null;
        state.concepts = null; state.selected = new Set(); state.expanded = new Set();
        renderHome();
      } catch (e) {
        ob.step = 'goal'; ob.error = (e as Error).message || String(e); renderOnboarding();
      }
    }
    function switchBrand(brandId: string) {
      const b = state.brands && state.brands.find(function (x) { return String(x.id) === String(brandId); });
      if (!b) return;
      if (!state.primaryBrand || state.primaryBrand.id !== b.id) {
        state.primaryBrand = b;
        state.goal = (b.goal as string) || null;
        state.concepts = null; state.selected = new Set(); state.expanded = new Set();
      }
      renderHome();
    }

    // ───────────────────────── Home = concept board ─────────────────────────
    function conceptCacheKey(): string { return 'bya_concepts_' + (state.primaryBrand && state.primaryBrand.id) + '_' + state.goal; }
    function renderHome() {
      state.view = 'home';
      if (needsOnboarding()) { renderOnboarding(); return; }
      if (!state.selected) state.selected = new Set();
      if (!state.expanded) state.expanded = new Set();
      const main = topbarHTML('your strategist · ' + (GOAL_LABEL[state.goal!] || state.goal), 'concept board',
          btn('my ads', { icon: 'library', size: 'sm', attr: ' data-nav="library"' }) +
          btn('↻ regenerate', { size: 'sm', id: 'boardRegen' })) +
        '<div style="overflow-y:auto;flex:1;padding:48px 56px" id="boardScroll">' + boardBodyHTML() + '</div>' +
        boardFooterHTML();
      setHTML(shell('home', main));
      wireBoard();
      if (state.concepts === null) loadConcepts();
    }
    function boardBodyHTML(): string {
      const goalIntro = ({
        waitlist: 'People who feel the pain and want in early. Catch them before they shop around.',
        trials: "They're comparing options. Show, concretely, why yours wins.",
        paid: 'They already know you. Remove the last reason not to buy.',
      } as Record<string, string>)[state.goal!];
      const header =
        '<div style="margin-bottom:36px;max-width:640px">' +
        '<h1 style="font-size:42px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0 0 10px">What should we make this week?</h1>' +
        '<p style="font-size:17px;color:var(--fg-2);margin:0;line-height:1.5">' + esc(goalIntro) + '</p></div>';
      const focus = GOAL_FOCUS[state.goal!] || [];
      const strip = '<div style="margin-bottom:40px;font-size:14px;color:var(--fg-3);display:flex;flex-wrap:wrap;gap:6px 18px">' +
        STAGE_ORDER.map(function (s) {
          const on = focus.indexOf(s) >= 0;
          return '<span style="' + (on ? 'color:var(--fg);border-bottom:2px solid var(--accent);padding-bottom:2px;font-weight:600' : 'opacity:.6') + '">' + esc(STAGE_META[s].name) + '</span>';
        }).join('<span style="opacity:.3">·</span>') + '</div>';
      const brandDna = brandDnaHTML((state.primaryBrand && (state.primaryBrand.analysis as Rec)) || null);
      if (state.concepts === null) return header + brandDna + strip + '<div style="display:flex;align-items:center;gap:10px;color:var(--fg-2);font-size:15px"><span class="spinner"></span> your strategist is drafting concepts…</div>';
      if (state.concepts.length === 0) return header + brandDna + strip + '<div style="border:1px dashed var(--fg);border-radius:8px;padding:32px;color:var(--fg-3)">Couldn\'t draft concepts. Tap ↻ regenerate to try again.</div>';
      const byStage: Record<string, number[]> = {}; STAGE_ORDER.forEach(function (s) { byStage[s] = []; });
      state.concepts.forEach(function (c, i) { (byStage[c.stage as string] || byStage.solution).push(i); });
      const sections = STAGE_ORDER.filter(function (s) { return byStage[s].length; }).map(function (s) {
        const isFocus = focus.indexOf(s) >= 0;
        const rows = byStage[s].map(conceptRowHTML).join('');
        const head = '<div style="display:flex;align-items:baseline;gap:12px;margin:0 0 6px">' +
          '<h3 style="font-size:22px;font-weight:500;letter-spacing:-0.01em;margin:0">' + esc(STAGE_META[s].name) + '</h3>' +
          (isFocus ? '<span style="font-size:12px;color:var(--accent);font-weight:600">your focus</span>' : '') + '</div>' +
          '<p style="font-size:14px;color:var(--fg-3);margin:0 0 14px">' + esc(STAGE_META[s].blurb) + '</p>';
        if (isFocus) return '<section style="margin-bottom:40px">' + head + rows + '</section>';
        const open = state.expanded && state.expanded.has(s);
        return '<section style="margin-bottom:28px" data-collapse="' + s + '">' + head +
          (open ? '' : '<button class="board-more" data-more="' + s + '" style="background:none;border:0;color:var(--accent);cursor:pointer;font-size:13px;padding:0">Show ' + byStage[s].length + ' more →</button>') +
          '<div data-rows="' + s + '" style="display:' + (open ? 'block' : 'none') + '">' + rows + '</div></section>';
      }).join('');
      return header + brandDna + strip + sections;
    }
    function conceptRowHTML(i: number): string {
      const c = state.concepts![i];
      const on = state.selected && state.selected.has(i);
      return '<button class="concept-row" data-concept="' + i + '" style="display:flex;gap:14px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;border-top:1px solid var(--border-hairline);padding:16px 2px;cursor:pointer;font-family:var(--font-sans)">' +
        '<span style="width:20px;height:20px;border-radius:4px;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--fg-3)') + ';background:' + (on ? 'var(--accent)' : 'transparent') + ';display:grid;place-items:center;flex-shrink:0;margin-top:2px">' + (on ? icon('check', 13, 'var(--bg)') : '') + '</span>' +
        '<span style="flex:1;min-width:0">' +
          '<span style="display:block;font-size:16px;color:var(--fg);line-height:1.35">' + esc(c.headline) + '</span>' +
          '<span style="display:block;font-size:13px;color:var(--fg-3);margin-top:4px">' + esc(c.angle) + (c.rationale ? ' · ' + esc(c.rationale) : '') + '</span>' +
        '</span></button>';
    }
    function boardFooterHTML(): string {
      const n = state.selected ? state.selected.size : 0;
      return '<div style="padding:16px 40px;border-top:1px solid var(--fg);background:var(--bg);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:14px;color:var(--fg-2)">' + n + ' concept' + (n === 1 ? '' : 's') + ' selected</span>' +
        btn('next', { variant: 'primary', iconRight: 'arrow-right', id: 'boardNext', disabled: n === 0 }) + '</div>';
    }
    async function loadConcepts() {
      try { const cached = localStorage.getItem(conceptCacheKey()); if (cached) { state.concepts = JSON.parse(cached); renderHome(); return; } } catch { /* cache miss */ }
      try {
        const concepts = await BYA.generateConcepts((state.primaryBrand && (state.primaryBrand.analysis as Rec)) || {}, state.goal!);
        state.concepts = concepts as unknown as Rec[];
        if (state.primaryBrand && state.primaryBrand.id) { try { localStorage.setItem(conceptCacheKey(), JSON.stringify(concepts)); } catch { /* quota */ } }
      } catch { state.concepts = []; }
      if (state.view === 'home') renderHome();
    }
    function wireBoard() {
      const regen = document.getElementById('boardRegen');
      if (regen) regen.addEventListener('click', function () { try { localStorage.removeItem(conceptCacheKey()); } catch { /* ignore */ } state.concepts = null; state.selected = new Set(); state.expanded = new Set(); renderHome(); });
      const next = document.getElementById('boardNext');
      if (next) next.addEventListener('click', goToCreate);
      $app!.querySelectorAll('[data-concept]').forEach(function (b) {
        b.addEventListener('click', function () {
          const i = parseInt((b as HTMLElement).getAttribute('data-concept')!, 10);
          if (state.selected!.has(i)) state.selected!.delete(i); else state.selected!.add(i);
          renderHome();
        });
      });
      $app!.querySelectorAll('[data-more]').forEach(function (b) {
        b.addEventListener('click', function () {
          const s = (b as HTMLElement).getAttribute('data-more')!;
          if (state.expanded) state.expanded.add(s);
          const rows = $app!.querySelector('[data-rows="' + s + '"]') as HTMLElement | null;
          if (rows) { rows.style.display = 'block'; (b as HTMLElement).style.display = 'none'; }
        });
      });
      const brandDnaDetails = document.getElementById('brandDnaDetails') as HTMLDetailsElement | null;
      if (brandDnaDetails) {
        brandDnaDetails.addEventListener('toggle', function () { state.brandDnaOpen = brandDnaDetails.open; });
      }
    }
    function goToCreate() {
      if (!state.concepts || !state.selected) return;
      const concepts = Array.from(state.selected).map(function (i) { return state.concepts![i]; }).filter(Boolean);
      if (!concepts.length) return;
      state.pendingConcepts = concepts;
      startWorkbench(state.primaryBrand!.website_url as string);
    }
    function adCardHTML(a: Rec): string {
      const thumb = a.signedUrl
        ? '<img src="' + esc(a.signedUrl) + '" alt="ad" />'
        : adFace(null, (a.headline as string) || '');
      return '<a class="ad-card" ' + (a.signedUrl ? 'href="' + esc(a.signedUrl) + '" target="_blank" rel="noopener"' : 'href="#"') + '>' +
        '<div class="ad-thumb">' + thumb +
        (a.justShipped ? '<div style="position:absolute;top:8px;left:8px"><span class="badge blue">new</span></div>' : '') +
        '</div>' +
        '<div style="padding:10px 12px">' +
          '<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.angle || hostOf(a.website_url) || 'ad') + '</div>' +
          '<div style="font-family:var(--font-mono);font-size:10px;color:var(--fg-3);margin-top:4px;display:flex;justify-content:space-between">' +
            '<span>' + esc(hostOf(a.website_url) || '') + '</span><span>' + esc(a.when || relTime(a.created_at as string)) + '</span></div></div></a>';
    }
    function relTime(ts: string): string {
      if (!ts) return 'just now';
      const s = (Date.now() - new Date(ts).getTime()) / 1000;
      if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + 'm ago';
      if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago';
    }

    // ───────────────────────── Start modal ("Which brand?") ─────────────────────────
    function renderModal() {
      const m = document.getElementById('modalRoot');
      if (m) m.remove();
      if (!state.modal) return;
      const root = document.createElement('div'); root.id = 'modalRoot';
      if (state.modal.type === 'start') root.innerHTML = startModalHTML((state.modal.presetUrl as string) || '');
      if (state.modal.type === 'success') root.innerHTML = successToastHTML(state.modal.ad as Rec);
      document.body.appendChild(root);
      if (state.modal.type === 'start') wireStartModal();
    }
    function startModalHTML(presetUrl: string): string {
      const picks = state.brands.map(function (b) {
        const pal = derivePalette(b.analysis as Rec);
        return '<button class="brand-pick" data-url="' + esc(b.website_url) + '">' +
          '<span style="width:24px;height:24px;background:' + pal.accent + ';border-radius:4px;flex-shrink:0"></span>' +
          '<span style="flex:1"><span style="font-size:14px;font-weight:500;color:var(--fg)">' + esc(b.name || hostOf(b.website_url)) + '</span>' +
          '<span style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3);margin-left:8px">' + esc(hostOf(b.website_url)) + '</span></span>' +
          icon('arrow-right', 14, 'var(--fg-3)') + '</button>';
      }).join('');
      return '<div class="scrim" data-close="1"><div class="modal">' +
        '<div style="padding:26px 30px 0;display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div><div class="eyebrow-acc">new ad</div><h2 style="font-size:28px;font-weight:500;letter-spacing:-0.02em;margin:4px 0 0">Which brand?</h2></div>' +
          '<button data-close="1" style="background:transparent;border:0;cursor:pointer;color:var(--fg-3);padding:6px">' + icon('x', 18) + '</button></div>' +
        '<div style="padding:20px 30px 26px">' +
          '<p style="font-size:14px;color:var(--fg-2);margin:0 0 18px;line-height:1.5">Paste your site, or pick a brand you’ve already analyzed.</p>' +
          '<div style="display:flex;gap:8px;margin-bottom:' + (picks ? '18px' : '0') + '">' +
            '<input class="input" id="modalUrl" type="url" placeholder="https://yourcompany.com" value="' + esc(presetUrl) + '" style="flex:1;font-size:14px" />' +
            btn('go', { variant: 'primary', iconRight: 'arrow-right', id: 'modalGo' }) + '</div>' +
          (picks ? '<div class="mono-mut" style="margin-bottom:10px">or your saved brands</div><div style="display:flex;flex-direction:column;gap:8px">' + picks + '</div>' : '') +
        '</div></div></div>';
    }
    function wireStartModal() {
      const root = document.getElementById('modalRoot')!;
      root.querySelectorAll('[data-close]').forEach(function (e) { e.addEventListener('click', function (ev) { if (ev.target === e || (e as HTMLElement).tagName === 'BUTTON') { state.modal = null; renderModal(); } }); });
      const urlEl = root.querySelector('#modalUrl') as HTMLInputElement;
      const go = function () { const v = (urlEl.value || '').trim(); if (v) startWorkbench(v); };
      root.querySelector('#modalGo')!.addEventListener('click', go);
      urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      if (urlEl && !urlEl.value) urlEl.focus();
      root.querySelectorAll('.brand-pick').forEach(function (b) { b.addEventListener('click', function () { startWorkbench((b as HTMLElement).getAttribute('data-url')!); }); });
    }
    function successToastHTML(ad: Rec): string {
      return '<div class="toast"><div class="body">' +
        '<div style="width:36px;height:36px;border-radius:4px;background:var(--accent);display:grid;place-items:center;flex-shrink:0">' + icon('check', 20, 'var(--bg)') + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">downloaded · headline copied</div>' +
        '<div style="font-family:var(--font-mono);font-size:11px;color:var(--bya-cream-2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(ad.angle || 'your ad') + ' · paste into Ads Manager</div></div>' +
        '<button data-close="1" style="background:transparent;border:0;cursor:pointer;color:var(--bg);padding:6px;opacity:.7">' + icon('x', 16) + '</button></div></div>';
    }

    // ───────────────────────── Workbench ─────────────────────────
    async function startWorkbench(url: string) {
      state.modal = null; renderModal();
      const typed = BYA.normalizeUrl(url);
      const match = state.brands.find(function (b) { return b.website_url && BYA.normalizeUrl(b.website_url as string) === typed; });
      state.wb = {
        url, brandId: match ? match.id : null, analysis: match ? match.analysis : null,
        brandJson: match ? JSON.stringify(match.analysis, null, 2) : null,
        name: match ? (match.name || hostOf(url)) : hostOf(url),
        palette: match ? derivePalette(match.analysis as Rec) : { bg: '#0a0a0a', fg: '#f4efe6', accent: '#1a3df0', name: hostOf(url) },
        logoUrls: [], productAssets: [],
        refImageDataUrl: null, logoDataUrl: null,
        stage: match ? 'pick-ref' : 'analyzing',
        baseAdPromptObj: null, aspect: '1:1',
        angles: [], results: [], selIdx: 0, analyzeError: null,
        selectedConcepts: state.pendingConcepts || null,
      };
      state.pendingConcepts = null;
      state.view = 'workbench';
      renderWorkbench();

      if (state.wb.brandId) {
        BYA.loadBrandAssets(state.wb.brandId as string).then(function (assets) {
          if (state.wb) state.wb.productAssets = assets.map(function (a) { return a.dataUrl; }); });
      }

      if (!match) {
        try {
          const extracted = await BYA.extractSite(url) as unknown as Rec;
          state.wb!.logoUrls = (extracted.logos as string[]) || [];
          const res = await BYA.analyzeBrand(extracted, { url, online: false }) as Rec;
          state.wb!.analysis = res.merged;
          state.wb!.brandJson = JSON.stringify(res.merged, null, 2);
          state.wb!.name = ((res.merged as Rec).brand_identity && (((res.merged as Rec).brand_identity as Rec).brand_name || ((res.merged as Rec).brand_identity as Rec).name)) || hostOf(url);
          state.wb!.palette = derivePalette(res.merged as Rec);
          try { const saved = await BYA.saveBrand(extracted.finalUrl as string || url, res.merged as Rec, state.userId as string); if (saved) { state.wb!.brandId = saved.id; state.brands = await BYA.loadBrands(); } } catch { /* best-effort */ }
          deriveLogoFromUrls(state.wb!.logoUrls as string[]).then(function (logo) { if (logo && state.wb && !state.wb.logoDataUrl) { state.wb.logoDataUrl = logo; if (state.wb.stage === 'pick-ref') renderWorkbench(); } });
          state.wb!.stage = 'pick-ref';
        } catch (e) {
          state.wb!.analyzeError = (e as Error).message || String(e);
        }
        if (state.view === 'workbench') renderWorkbench();
      } else {
        deriveLogoFromUrls(state.wb.logoUrls as string[]).then(function (logo) { if (logo && state.wb && !state.wb.logoDataUrl) { state.wb.logoDataUrl = logo; if (state.wb.stage === 'pick-ref') renderWorkbench(); } });
      }
    }

    function progressHTML(stage: string): string {
      const steps = [
        { n: 1, label: 'your brand', st: 'done' },
        { n: 2, label: 'a reference', st: (stage === 'ready' ? 'done' : 'active') },
        { n: 3, label: 'your ad', st: (stage === 'ready' ? 'active' : 'pending') },
      ];
      const parts = steps.map(function (s, i) {
        const dotBg = (s.st === 'done' || s.st === 'active') ? 'var(--accent)' : 'var(--bg)';
        const dotBorder = s.st === 'pending' ? 'var(--fg)' : 'var(--accent)';
        const dotColor = s.st !== 'pending' ? 'var(--bg)' : 'var(--fg-3)';
        const labColor = s.st === 'active' ? 'var(--fg)' : (s.st === 'done' ? 'var(--fg-2)' : 'var(--fg-3)');
        let html = '<div style="display:flex;align-items:center;gap:8px">' +
          '<div style="width:22px;height:22px;border-radius:50%;border:1px solid ' + dotBorder + ';background:' + dotBg + ';color:' + dotColor + ';display:grid;place-items:center;font-family:var(--font-mono);font-size:11px;font-weight:600">' + (s.st === 'done' ? '✓' : s.n) + '</div>' +
          '<span style="font-weight:' + (s.st === 'active' ? 600 : 500) + ';color:' + labColor + '">' + s.label + '</span></div>';
        if (i < 2) html += '<div style="width:32px;height:1px;background:var(--fg);opacity:' + (s.st === 'done' ? 1 : 0.25) + '"></div>';
        return html;
      }).join('');
      return '<div style="padding:18px 40px;border-bottom:1px solid var(--border-hairline);display:flex;justify-content:center;background:var(--bg)">' +
        '<div style="display:flex;align-items:center;gap:12px;font-size:13px">' + parts + '</div></div>';
    }

    function renderWorkbench() {
      const wb = state.wb; if (!wb) return;
      const eyebrow = hostOf(wb.url) + ' · ' + (wb.stage === 'ready' ? 'ready' : wb.stage === 'drawing' ? 'drawing…' : wb.stage === 'analyzing' ? 'reading your site…' : 'pick a reference');
      const actions = wb.stage === 'ready'
        ? btn('start over', { icon: 'refresh', size: 'sm', id: 'wbReset' }) + btn('download', { icon: 'download', size: 'sm', id: 'wbDownload' })
        : btn('cancel', { icon: 'x', size: 'sm', variant: 'ghost', attr: ' data-nav="home"' });

      let left: string, right: string, footer: string;

      if (wb.stage === 'analyzing' || wb.analyzeError) {
        left = analyzingLeftHTML(wb);
        right = previewPaneHTML(wb, 'analyzing');
        footer = footerHTML(wb);
      } else if (wb.stage === 'ready') {
        left = anglePickerHTML(wb);
        right = previewPaneHTML(wb, 'ready');
        footer = footerHTML(wb);
      } else {
        left = refPickerHTML(wb);
        right = previewPaneHTML(wb, wb.stage as string);
        footer = footerHTML(wb);
      }

      const main = topbarHTML(eyebrow, 'make an ad', actions) + progressHTML(wb.stage as string) +
        '<div style="flex:1;display:grid;grid-template-columns:1.4fr 1fr;min-height:0">' +
          '<div style="overflow-y:auto;padding:44px 56px 24px">' + left + '</div>' +
          '<div style="background:var(--bg-raised);border-left:1px solid var(--fg);display:flex;flex-direction:column">' + right + '</div>' +
        '</div>' + footer;
      setHTML(shell('create', main));
      wireWorkbench();
    }

    function analyzingLeftHTML(wb: Rec): string {
      if (wb.analyzeError) {
        return '<div style="max-width:540px">' +
          '<div class="eyebrow-mut" style="margin-bottom:14px">step 1 of 3</div>' +
          '<h1 style="font-size:42px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0">We couldn’t read that site.</h1>' +
          '<p style="font-size:16px;color:var(--fg-2);margin:12px 0 24px;line-height:1.5">' + esc(wb.analyzeError) + '</p>' +
          btn('try another url', { variant: 'primary', icon: 'arrow-left', attr: ' data-nav="start"' }) + '</div>';
      }
      return '<div style="max-width:540px">' +
        '<div class="eyebrow-mut" style="margin-bottom:14px">step 1 of 3</div>' +
        '<h1 style="font-size:42px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0">Reading <span style="color:var(--accent)">' + esc(hostOf(wb.url)) + '</span>.</h1>' +
        '<p style="font-size:16px;color:var(--fg-2);margin:12px 0 28px;line-height:1.5">We’re loading your site in a real browser to learn its exact colors, fonts, voice, and customers. This takes a few seconds.</p>' +
        '<div style="display:flex;align-items:center;gap:10px;color:var(--fg-2);font-size:14px"><span class="spinner"></span> analyzing your brand…</div></div>';
    }

    function refPickerHTML(wb: Rec): string {
      const refFilled = !!wb.refImageDataUrl;
      const logoFilled = !!wb.logoDataUrl;
      return '<div style="max-width:540px">' +
        '<div class="eyebrow-mut" style="margin-bottom:14px">step 2 of 3</div>' +
        '<h1 style="font-size:42px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0">Drop a reference.</h1>' +
        '<p style="font-size:16px;color:var(--fg-2);margin:12px 0 28px;line-height:1.5">Any static Meta ad you like. We read its <strong style="color:var(--fg)">shape</strong>, never its colors or copy — those come from your brand.</p>' +
        '<div class="dropzone" id="refDrop" style="width:100%;height:160px;margin-bottom:18px">' +
          (refFilled ? '<img class="fill" src="' + esc(wb.refImageDataUrl) + '" alt="reference" />' : icon('image', 22, 'var(--fg-3)') + '<div style="font-size:14px;font-weight:600;color:var(--fg)">drop a reference ad — or click to upload</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3)">png or jpg</div>') +
        '</div>' +
        '<div style="display:flex;gap:14px;align-items:center;margin-bottom:24px">' +
          '<div class="dropzone" id="logoDrop" style="width:96px;height:96px;flex-shrink:0">' +
            (logoFilled ? '<img class="fill" src="' + esc(wb.logoDataUrl) + '" alt="logo" />' : icon('plus', 18, 'var(--fg-3)')) + '</div>' +
          '<div style="font-size:13px;color:var(--fg-2)"><strong style="color:var(--fg)">brand logo</strong>' +
            (logoFilled ? ' <span style="color:var(--bya-forest)">✓ from your site</span> — click to change.' : ' — drop your logo here (we couldn’t pull one from your site).') +
            '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3);margin-top:4px">required · png with transparent background works best</div></div>' +
        '</div>' +
        '<div style="margin-bottom:24px">' +
          '<div style="font-size:13px;color:var(--fg-2);margin-bottom:8px"><strong style="color:var(--fg)">product screenshot</strong> — optional. Drop your real UI/product image so the ad shows it exactly (not an invented screen).</div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
            (wb.productAssets as string[]).map(function (u, i) {
              return '<div style="position:relative;width:72px;height:72px;border:1px solid var(--fg);border-radius:4px;overflow:hidden;background:var(--bg-raised)">' +
                '<img src="' + esc(u) + '" alt="product" style="width:100%;height:100%;object-fit:cover" />' +
                '<button data-prodrm="' + i + '" title="remove" style="position:absolute;top:2px;right:2px;background:var(--bg);border:1px solid var(--fg);border-radius:3px;cursor:pointer;padding:1px 3px;line-height:1">' + icon('x', 11) + '</button></div>';
            }).join('') +
            '<div class="dropzone" id="prodDrop" style="width:72px;height:72px;flex-shrink:0">' + icon('plus', 18, 'var(--fg-3)') + '</div>' +
          '</div></div>' +
        (wb.analysis ? brandDnaHTML(wb.analysis as Rec, { compact: true }) : '') + '</div>';
    }

    function anglePickerHTML(wb: Rec): string {
      const rows = (wb.angles as Rec[]).map(function (a, i) {
        return '<button class="angle-row ' + (i === wb.selIdx ? 'sel' : '') + '" data-angle="' + i + '">' +
          '<div class="radio"></div><div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:500;color:var(--fg)">' + esc(a.headline) + '</div>' +
          '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3);margin-top:3px">' + esc(a.angle) + '</div></div>' +
          ((wb.results as Rec[])[i] && (wb.results as Rec[])[i].url ? '<span class="badge success mono">rendered</span>' : '') + '</button>';
      }).join('');
      return '<div style="max-width:540px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><span class="badge success mono">ready</span>' +
        '<span class="eyebrow-mut">step 3 of 3</span></div>' +
        '<h1 style="font-size:42px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0">Pick your angle.</h1>' +
        '<p style="font-size:16px;color:var(--fg-2);margin:12px 0 28px;line-height:1.5">We wrote ' + (wb.angles as Rec[]).length + '. Same brand, same format — different way in. Tap one to render its preview.</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' + rows + '</div></div>';
    }

    function previewPaneHTML(wb: Rec, stage: string): string {
      let headerRight = '';
      let label = 'live preview';
      if (stage === 'drawing') { label = 'drawing…'; headerRight = '<span class="badge live">working</span>'; }
      else if (stage === 'ready') { label = 'preview · v' + ((wb.selIdx as number) + 1) + ' of ' + (wb.angles as Rec[]).length; }
      else if (stage === 'analyzing') { label = 'live preview'; }

      let body: string;
      if (stage === 'analyzing') body = previewEmpty(wb, 'learning your brand…');
      else if (stage === 'pick-ref') body = previewEmpty(wb, 'pick a reference to start rendering');
      else if (stage === 'drawing') body = previewDrawing(wb);
      else body = previewReady(wb);

      const strip = (stage === 'ready') ? variantStripHTML(wb) : '';
      return '<div style="padding:16px 24px;border-bottom:1px solid var(--border-hairline);display:flex;justify-content:space-between;align-items:center">' +
        '<span class="mono-mut">' + esc(label) + '</span>' + headerRight + '</div>' +
        '<div style="flex:1;padding:32px;display:flex;align-items:center;justify-content:center;position:relative">' + body + '</div>' + strip;
    }
    function previewEmpty(wb: Rec, sub: string): string {
      return '<div style="width:340px;aspect-ratio:1/1;border:1.5px dashed var(--fg);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--bg);opacity:.7">' +
        '<div style="width:44px;height:44px;border:1px solid var(--fg);border-radius:4px;display:grid;place-items:center;background:var(--bg-raised)">' + icon('image', 20, 'var(--fg-3)') + '</div>' +
        '<div style="font-size:13px;font-weight:500;color:var(--fg-2)">' + esc(wb.name) + ' · ready</div>' +
        '<div style="font-family:var(--font-mono);font-size:10px;color:var(--fg-3)">' + esc(sub) + '</div></div>';
    }
    function previewDrawing(wb: Rec): string {
      const p = wb.palette as { bg: string; fg: string; accent: string; name: string };
      return '<div style="width:340px;aspect-ratio:1/1;background:' + p.bg + ';border-radius:4px;border:1px solid var(--fg);position:relative;overflow:hidden;box-shadow:var(--shadow-lg)">' +
        '<div style="position:absolute;inset:9%;display:flex;flex-direction:column;justify-content:space-between">' +
          '<div style="font-size:13px;font-weight:600;color:' + p.fg + ';opacity:.9;letter-spacing:-0.02em">' + esc(wb.name) + '</div>' +
          '<div><div style="height:14px;background:' + p.fg + ';opacity:.85;margin-bottom:8px;width:85%"></div>' +
            '<div style="height:14px;background:' + p.fg + ';opacity:.85;margin-bottom:14px;width:60%"></div>' +
            '<div style="height:6px;background:' + p.fg + ';opacity:.4;margin-bottom:6px;width:70%"></div>' +
            '<div style="height:6px;background:' + p.fg + ';opacity:.4;width:50%"></div></div>' +
          '<div style="background:' + p.accent + ';opacity:.85;padding:6px 14px;color:' + p.fg + ';font-size:10px;font-weight:600;width:fit-content">start free →</div></div>' +
        '<div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent);animation:scan 1.6s linear infinite"></div>' +
        '<div id="drawStatus" style="position:absolute;left:0;right:0;bottom:0;padding:8px;text-align:center;font-family:var(--font-mono);font-size:10px;color:' + p.fg + ';background:rgba(0,0,0,0.25)">drawing…</div></div>';
    }
    function previewReady(wb: Rec): string {
      const r = (wb.results as Rec[])[wb.selIdx as number];
      if (r && r.loading) {
        return '<div style="width:340px;aspect-ratio:1/1;border:1px solid var(--fg);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--bg-raised)"><span class="spinner"></span><span style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3)">rendering…</span></div>';
      }
      if (r && r.url) {
        return '<div style="width:340px;aspect-ratio:1/1;border:1px solid var(--fg);border-radius:4px;overflow:hidden;box-shadow:var(--shadow-lg);animation:slideUp 320ms var(--ease)">' +
          '<img src="' + esc(r.url) + '" alt="ad" style="width:100%;height:100%;object-fit:cover;display:block" /></div>';
      }
      if (r && r.error) {
        return '<div style="width:340px;aspect-ratio:1/1;border:1px solid var(--bya-oxblood);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center">' +
          '<div style="color:var(--bya-oxblood);font-size:13px">' + esc(r.error) + '</div>' + btn('retry', { size: 'sm', id: 'wbRetry' }) + '</div>';
      }
      return '<div style="width:340px;aspect-ratio:1/1;border:1.5px dashed var(--fg);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--bg)">' +
        '<div style="font-size:13px;color:var(--fg-2);text-align:center;max-width:220px">This angle hasn’t been rendered yet.</div>' +
        btn('render this angle', { variant: 'primary', size: 'sm', id: 'wbRenderAngle' }) + '</div>';
    }
    function variantStripHTML(wb: Rec): string {
      const thumbs = (wb.angles as Rec[]).map(function (a, i) {
        const r = (wb.results as Rec[])[i];
        const inner = r && r.url ? '<img src="' + esc(r.url) + '" alt="" />'
          : (r && r.loading ? '<div style="display:grid;place-items:center;height:100%"><span class="spinner"></span></div>'
          : '<div style="display:grid;place-items:center;height:100%;color:var(--fg-3)">' + icon('plus', 14, 'var(--fg-3)') + '</div>');
        return '<button class="variant-thumb ' + (i === wb.selIdx ? 'sel' : '') + '" data-variant="' + i + '">' + inner + '</button>';
      }).join('');
      return '<div style="border-top:1px solid var(--border-hairline);padding:14px 24px;background:var(--bg)">' +
        '<div class="mono-mut" style="margin-bottom:8px">' + (wb.angles as Rec[]).length + ' angles</div>' +
        '<div style="display:flex;gap:6px;overflow-x:auto">' + thumbs + '</div></div>';
    }
    function footerHTML(wb: Rec): string {
      const right = wb.stage === 'ready'
        ? btn('ship to meta', { variant: 'primary', iconRight: 'external', size: 'lg', id: 'wbShip' })
        : (wb.stage === 'pick-ref'
            ? btn('make my ad', { variant: 'primary', iconRight: 'arrow-right', id: 'wbGo', disabled: !(wb.refImageDataUrl && wb.logoDataUrl) })
            : btn('rendering…', { variant: 'primary', disabled: true }));
      return '<div style="padding:18px 40px;border-top:1px solid var(--fg);background:var(--bg);display:flex;justify-content:space-between;align-items:center">' +
        btn('back', { icon: 'arrow-left', attr: ' data-nav="home"' }) + right + '</div>';
    }

    // ───────────────────────── Workbench wiring ─────────────────────────
    function attachDrop(el: HTMLElement | null, onFile: (f: File) => void) {
      if (!el) return;
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
      el.appendChild(input);
      el.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () { const f = input.files && input.files[0]; if (f) onFile(f); input.value = ''; });
      el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', function () { el.classList.remove('over'); });
      el.addEventListener('drop', function (e) { e.preventDefault(); el.classList.remove('over'); const f = (e as DragEvent).dataTransfer!.files && (e as DragEvent).dataTransfer!.files[0]; if (f) onFile(f); });
    }
    function wireWorkbench() {
      const wb = state.wb; if (!wb) return;
      attachDrop(document.getElementById('refDrop'), function (f) { fileToDataUrl(f, 1400).then(function (u) { wb.refImageDataUrl = u; renderWorkbench(); }); });
      attachDrop(document.getElementById('logoDrop'), function (f) { fileToDataUrl(f, 800).then(function (u) { wb.logoDataUrl = u; renderWorkbench(); }); });
      attachDrop(document.getElementById('prodDrop'), function (f) { fileToDataUrl(f, 1400).then(function (u) { wb.productAssets = (wb.productAssets as string[]).concat([u]); renderWorkbench(); }); });
      $app!.querySelectorAll('[data-prodrm]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); const i = parseInt((b as HTMLElement).getAttribute('data-prodrm')!, 10); wb.productAssets = (wb.productAssets as string[]).filter(function (_, j) { return j !== i; }); renderWorkbench(); }); });

      const go = document.getElementById('wbGo'); if (go) go.addEventListener('click', runPipeline);
      const reset = document.getElementById('wbReset'); if (reset) reset.addEventListener('click', function () {
        wb.stage = 'pick-ref'; wb.angles = []; wb.results = []; wb.selIdx = 0; wb.baseAdPromptObj = null; renderWorkbench();
      });
      const ship = document.getElementById('wbShip'); if (ship) ship.addEventListener('click', shipCurrent);
      const dl = document.getElementById('wbDownload'); if (dl) dl.addEventListener('click', downloadCurrent);
      const renderAngle = document.getElementById('wbRenderAngle'); if (renderAngle) renderAngle.addEventListener('click', function () { renderAngleImage(wb.selIdx as number); });
      const retry = document.getElementById('wbRetry'); if (retry) retry.addEventListener('click', function () { renderAngleImage(wb.selIdx as number); });

      $app!.querySelectorAll('[data-angle]').forEach(function (b) { b.addEventListener('click', function () { selectAngle(parseInt((b as HTMLElement).getAttribute('data-angle')!, 10)); }); });
      $app!.querySelectorAll('[data-variant]').forEach(function (b) { b.addEventListener('click', function () { selectAngle(parseInt((b as HTMLElement).getAttribute('data-variant')!, 10)); }); });
    }

    function selectAngle(i: number) {
      const wb = state.wb; if (!wb) return;
      wb.selIdx = i;
      renderWorkbench();
      const results = wb.results as Rec[];
      if (!results[i] || (!results[i].url && !results[i].loading && !results[i].error)) renderAngleImage(i);
    }

    async function runPipeline() {
      const wb = state.wb; if (!wb) return;
      if (!wb.refImageDataUrl || !wb.logoDataUrl) return;
      wb.stage = 'drawing'; renderWorkbench();
      const setStatus = function (m: string) { const el = document.getElementById('drawStatus'); if (el) el.textContent = m; };
      try {
        setStatus('studying your reference…');
        const stage2 = await BYA.makeAdPrompt({ brandJson: wb.brandJson as string, refImageDataUrl: wb.refImageDataUrl as string, productAssets: wb.productAssets as string[], mode: 'exact' });
        const prep = BYA.prepareStage3(stage2) as Rec;
        wb.baseAdPromptObj = prep.adPromptObj;
        wb.aspect = prep.aspect || '1:1';
        const baseCopy = ((prep.adPromptObj as Rec) && ((prep.adPromptObj as Rec).copy as Rec)) || {};
        const baseHeadline = (baseCopy.headline as string) || (wb.name as string);

        if (wb.selectedConcepts && (wb.selectedConcepts as Rec[]).length) {
          if (!wb.baseAdPromptObj) throw new Error('Couldn’t read your reference into an ad layout — try a different reference.');
          wb.angles = (wb.selectedConcepts as Rec[]).slice();
          wb.results = (wb.angles as Rec[]).map(function () { return {}; });
          wb.selIdx = 0;
          wb.stage = 'ready';
          renderWorkbench();
          (wb.angles as Rec[]).forEach(function (_, i) { renderAngleImage(i); });
          return;
        }

        const anglesPromise = BYA.generateAngles(baseCopy, wb.brandJson as string, 5).catch(function () { return []; });
        setStatus('rendering your first ad…');
        const baseResult = await renderOneImage(prep.adPromptStr as string, setStatus) as Rec;
        let angles = await anglesPromise as unknown as Rec[];
        if (!angles.length) angles = [{ angle: 'headline', headline: baseHeadline, color_treatment: null }];
        wb.angles = angles;
        wb.results = angles.map(function () { return {}; });
        wb.selIdx = 0;
        if (baseResult.ok) {
          (wb.results as Rec[])[0] = { url: (baseResult.urls as string[])[0], headline: angles[0].headline, prompt: prep.adPromptStr };
          saveAdSilently((wb.results as Rec[])[0], angles[0]);
        } else {
          (wb.results as Rec[])[0] = { error: baseResult.error };
          if (baseResult.timedOut && baseResult.taskId) {
            persistPendingRender({
              taskId: baseResult.taskId as string, brandId: wb.brandId, websiteUrl: wb.url,
              prompt: '[Angle: ' + (angles[0].angle || '') + ']\n' + (prep.adPromptStr || ''),
              aspectRatio: wb.aspect, angleHeadline: angles[0].headline,
              savedAt: Date.now(),
            });
          }
        }
        wb.stage = 'ready';
        renderWorkbench();
      } catch (e) {
        wb.stage = 'pick-ref'; wb.analyzeError = null;
        renderWorkbench();
        flash((e as Error).message || String(e));
      }
    }

    async function renderOneImage(promptText: string, onStatus: (m: string) => void) {
      const wb = state.wb!;
      return BYA.generateImage({
        prompt: promptText, referenceImage: wb.refImageDataUrl as string, logoImage: wb.logoDataUrl as string,
        productImages: wb.productAssets as string[], aspect: wb.aspect as string,
      }, onStatus);
    }

    async function renderAngleImage(i: number) {
      const wb = state.wb; if (!wb || !(wb.angles as Rec[])[i] || !wb.baseAdPromptObj) return;
      const results = wb.results as Rec[];
      if (results[i] && (results[i].url || results[i].loading)) { renderWorkbench(); return; }
      results[i] = { loading: true };
      renderWorkbench();
      try {
        const promptText = BYA.buildVariantPrompt(wb.baseAdPromptObj as Rec, (wb.angles as Rec[])[i] as never, (wb.productAssets as string[]).length);
        const res = await renderOneImage(promptText, function (m) { const el = document.getElementById('drawStatus'); if (el) el.textContent = m; }) as Rec;
        if (!state.wb || state.wb !== wb) return;
        if (res.ok) {
          (wb.results as Rec[])[i] = { url: (res.urls as string[])[0], headline: (wb.angles as Rec[])[i].headline, prompt: promptText };
          saveAdSilently((wb.results as Rec[])[i], (wb.angles as Rec[])[i]);
        } else {
          (wb.results as Rec[])[i] = { error: res.error };
          if (res.timedOut && res.taskId) {
            persistPendingRender({
              taskId: res.taskId as string, brandId: wb.brandId, websiteUrl: wb.url,
              prompt: '[Angle: ' + ((wb.angles as Rec[])[i].angle || '') + ']\n' + (promptText || ''),
              aspectRatio: wb.aspect, angleHeadline: (wb.angles as Rec[])[i].headline,
              savedAt: Date.now(),
            });
          }
        }
      } catch (e) {
        if (!state.wb || state.wb !== wb) return;
        (wb.results as Rec[])[i] = { error: (e as Error).message || String(e) };
      }
      renderWorkbench();
    }

    function saveAdSilently(result: Rec, angle: Rec) {
      const wb = state.wb; if (!wb) return;
      BYA.saveAd({
        imageUrl: result.url as string, brandId: wb.brandId as string, websiteUrl: wb.url as string,
        prompt: '[Angle: ' + (angle.angle || '') + ']\n' + (result.prompt || ''), aspectRatio: wb.aspect as string,
      } as never).then(function (r) {
        if (r.ok && r.ad) { (r.ad as Rec).angle = angle.headline; (r.ad as Rec).justShipped = true; (r.ad as Rec).signedUrl = result.url; (r.ad as Rec).when = 'just now'; state.ads.unshift(r.ad as Rec); }
      }).catch(function () { /* silent */ });
    }

    // ───────────────────────── Pending-render persistence ─────────────────────────
    let _resumeInFlight = false;

    function persistPendingRender(meta: Rec) {
      try {
        const raw = localStorage.getItem('bya_pending_renders');
        let list: Rec[] = [];
        try { list = JSON.parse(raw!) || []; } catch { list = []; }
        if (!Array.isArray(list)) list = [];
        list.push(meta);
        localStorage.setItem('bya_pending_renders', JSON.stringify(list));
      } catch { /* quota */ }
    }

    async function resumePendingRenders() {
      if (_resumeInFlight) return;
      let raw;
      try { raw = localStorage.getItem('bya_pending_renders'); } catch { return; }
      if (!raw) return;
      let list: Rec[];
      try { list = JSON.parse(raw); } catch { return; }
      if (!Array.isArray(list) || !list.length) return;
      _resumeInFlight = true;
      let anyAdded = false;
      try {
        const surviving: Rec[] = [];
        for (let i = 0; i < list.length; i++) {
          const entry = list[i];
          let keep = true;
          if (entry.savedAt && (Date.now() - (entry.savedAt as number)) > 86400000) {
            keep = false;
          }
          if (!keep) { continue; }
          try {
            const p = await BYA.pollRender(entry.taskId as string) as Rec;
            if (p.state === 'success' && (p.urls as string[]).length) {
              const r = await BYA.saveAd({
                imageUrl: (p.urls as string[])[0], brandId: entry.brandId, websiteUrl: entry.websiteUrl,
                prompt: entry.prompt, aspectRatio: entry.aspectRatio, resolution: entry.resolution,
              } as never);
              if (r.ok && r.ad) {
                (r.ad as Rec).angle = entry.angleHeadline;
                (r.ad as Rec).justShipped = true;
                (r.ad as Rec).signedUrl = (p.urls as string[])[0];
                (r.ad as Rec).when = 'just now';
                state.ads.unshift(r.ad as Rec);
                anyAdded = true;
                keep = false;
              }
            } else if (p.state === 'fail' || p.state === 'error') {
              keep = false;
            }
          } catch { /* keep for retry */ }
          if (keep) surviving.push(entry);
        }
        try { localStorage.setItem('bya_pending_renders', JSON.stringify(surviving)); } catch { /* quota */ }
        if (anyAdded && state.view === 'library') renderLibrary();
      } finally {
        _resumeInFlight = false;
      }
    }

    async function downloadCurrent() {
      const wb = state.wb; const r = wb && (wb.results as Rec[])[wb.selIdx as number];
      if (!r || !r.url) { flash('Render an angle first.'); return; }
      try {
        const resp = await fetch(r.url as string); const blob = await resp.blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = hostOf(wb!.url).replace(/\W+/g, '-') + '-' + ((wb!.angles as Rec[])[wb!.selIdx as number].angle || 'ad') + '.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      } catch { window.open(r.url as string, '_blank'); }
    }
    async function shipCurrent() {
      const wb = state.wb; const r = wb && (wb.results as Rec[])[wb.selIdx as number];
      if (!r || !r.url) { flash('Render an angle first.'); return; }
      await downloadCurrent();
      try { await navigator.clipboard.writeText(((wb!.angles as Rec[])[wb!.selIdx as number].headline as string) || ''); } catch { /* clipboard blocked */ }
      state.view = 'home';
      renderHome();
      state.modal = { type: 'success', ad: { angle: (wb!.angles as Rec[])[wb!.selIdx as number].headline } };
      renderModal();
      setTimeout(function () { if (state.modal && state.modal.type === 'success') { state.modal = null; renderModal(); } }, 4500);
    }

    function flash(msg: string) {
      const t = document.createElement('div'); t.className = 'toast';
      t.innerHTML = '<div class="body" style="background:var(--bya-oxblood)"><div style="flex:1;font-size:13px">' + esc(msg) + '</div></div>';
      document.body.appendChild(t); setTimeout(function () { t.remove(); }, 4000);
    }

    // ───────────────────────── Library ─────────────────────────
    function adsForBrand(b: Rec | null): Rec[] {
      if (!b) return state.ads;
      const host = hostOf(b.website_url);
      return state.ads.filter(function (a) {
        if (a.brand_id && b.id) return a.brand_id === b.id;
        return host && hostOf(a.website_url) === host;
      });
    }
    function adsForActiveBrand(): Rec[] { return adsForBrand(state.primaryBrand); }

    function renderBrands() {
      state.view = 'brands';
      resumePendingRenders().catch(function () { /* best-effort */ });
      const cards = state.brands.map(function (b) {
        const host = hostOf(b.website_url);
        const count = adsForBrand(b).length;
        const on = state.primaryBrand && state.primaryBrand.id === b.id;
        return '<button class="nav-item" data-action="switchBrand" data-brand-id="' + esc(b.id) + '" ' +
          'style="display:flex;flex-direction:column;align-items:stretch;gap:10px;text-align:left;background:var(--bg-raised);' +
          'border:1px solid ' + (on ? 'var(--accent)' : 'var(--border-hairline)') + ';border-radius:10px;padding:18px;min-height:118px;cursor:pointer">' +
          '<span style="display:flex;align-items:center;gap:8px">' + icon('globe', 16, 'var(--fg-2)') +
            '<span style="font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(host) + '</span>' +
            (on ? '<span style="font-size:11px;color:var(--accent);font-weight:600;margin-left:auto">active</span>' : '') + '</span>' +
          '<span style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3)">' + count + ' ad' + (count === 1 ? '' : 's') +
            ' · ' + esc(b.goal ? (GOAL_LABEL[b.goal as string] || b.goal) : 'no goal yet') + '</span>' +
          '<span style="margin-top:auto;font-size:13px;color:var(--accent);font-weight:600">open →</span>' +
        '</button>';
      }).join('');
      const main = topbarHTML('your accounts', 'brands',
          btn('analyze new company', { variant: 'primary', icon: 'plus', size: 'sm', attr: ' data-action="addBrand"' })) +
        '<div style="overflow-y:auto;flex:1;padding:36px"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">' +
          (cards || '<div style="color:var(--fg-3)">No brands yet.</div>') + '</div></div>';
      setHTML(shell('brands', main));
    }

    function renderLibrary() {
      state.view = 'library';
      resumePendingRenders().catch(function () { /* best-effort */ });
      const ads = adsForActiveBrand();
      const brandHost = (state.primaryBrand && hostOf(state.primaryBrand.website_url)) || 'all brands';
      const groups: Record<string, Rec[]> = {};
      ads.forEach(function (a) { const k = hostOf(a.website_url) || 'other'; (groups[k] = groups[k] || []).push(a); });
      const keys = Object.keys(groups);
      const body = keys.length ? keys.map(function (k) {
        const cards = groups[k].map(function (a) {
          const thumb = a.signedUrl ? '<img src="' + esc(a.signedUrl) + '" alt="ad" />' : adFace(null, (a.angle as string) || '');
          return '<a class="ad-card" ' + (a.signedUrl ? 'href="' + esc(a.signedUrl) + '" target="_blank" rel="noopener"' : 'href="#"') + '>' +
            '<div class="ad-thumb">' + thumb + (a.justShipped ? '<div style="position:absolute;top:8px;left:8px"><span class="badge blue">new</span></div>' : '') + '</div>' +
            '<div style="padding:9px 11px"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.angle || 'ad') + '</div>' +
            '<div style="font-family:var(--font-mono);font-size:10px;color:var(--fg-3);margin-top:3px;display:flex;justify-content:space-between"><span>' + esc(k) + '</span><span>' + esc(a.when || relTime(a.created_at as string)) + '</span></div></div></a>';
        }).join('');
        return '<div style="margin-bottom:40px"><div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-hairline)">' +
          '<span style="width:8px;height:8px;background:var(--accent);border-radius:2px;align-self:center"></span>' +
          '<h3 style="font-size:20px;font-weight:500;letter-spacing:-0.01em;margin:0">' + esc(k) + '</h3>' +
          '<span style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3)">' + groups[k].length + ' ads</span></div>' +
          '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">' + cards + '</div></div>';
      }).join('') : (state.adsError
        ? '<div style="border:1px dashed var(--danger,#c0392b);border-radius:8px;padding:48px;text-align:center;color:var(--fg-2)">' +
            'Couldn\'t load your ads. <button data-action="reload-ads" class="signal" style="background:none;border:0;cursor:pointer;color:inherit;text-decoration:underline">Retry</button>' +
            '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3);margin-top:12px">' + esc(state.adsError) + '</div>' +
            '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3);margin-top:4px">signed in as ' + esc(state.email || '?') + '</div></div>'
        : '<div style="border:1px dashed var(--fg);border-radius:8px;padding:48px;text-align:center;color:var(--fg-3)">No ads yet. <a href="#" data-nav="start" class="signal">Make your first ad →</a>' +
            '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3);margin-top:12px">signed in as ' + esc(state.email || '?') + '</div></div>');

      const main = topbarHTML(ads.length + ' ad' + (ads.length === 1 ? '' : 's') + ' · ' + brandHost, 'my ads',
          btn('new ad', { variant: 'primary', icon: 'plus', size: 'sm', attr: ' data-nav="start"' })) +
        '<div style="overflow-y:auto;flex:1;padding:36px">' + body + '</div>';
      setHTML(shell('library', main));
    }

    async function reloadAds() {
      try { state.ads = await BYA.loadAds(); state.adsError = null; }
      catch (e) { state.ads = []; state.adsError = e && (e as Error).message ? (e as Error).message : String(e); }
      if (state.view === 'library') renderLibrary();
      else if (state.view === 'brands') renderBrands();
    }

    // ───────────────────────── Routing + global wiring ─────────────────────────
    function route(target: string, preset?: string | null) {
      if (target === 'start') { state.modal = { type: 'start', presetUrl: preset || '' }; renderModal(); return; }
      if (target === 'home') renderHome();
      else if (target === 'library') { renderLibrary(); reloadAds(); }
      else if (target === 'brands') { renderBrands(); reloadAds(); }
    }
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const nav = target.closest && target.closest('[data-nav]');
      if (nav) { e.preventDefault(); route(nav.getAttribute('data-nav')!, nav.getAttribute('data-url')); return; }
      const act = target.closest && target.closest('[data-action]');
      if (act && act.getAttribute('data-action') === 'signout') { e.preventDefault(); signOut(); }
      if (act && act.getAttribute('data-action') === 'reload-ads') { e.preventDefault(); reloadAds(); }
      if (act && act.getAttribute('data-action') === 'addBrand') {
        e.preventDefault();
        state.onboarding = { step: 'url', url: '', error: null };
        renderOnboarding();
      }
      if (act && act.getAttribute('data-action') === 'switchBrand') {
        e.preventDefault();
        switchBrand(act.getAttribute('data-brand-id')!);
      }
    }
    document.addEventListener('click', onDocClick);
    async function signOut() { await Auth.signOut(); }

    // ───────────────────────── Boot / auth ─────────────────────────
    async function initApp() {
      state.booted = true;
      try { state.brands = await BYA.loadBrands(); } catch { state.brands = []; }
      try { state.ads = await BYA.loadAds(); state.adsError = null; }
      catch (e) { state.ads = []; state.adsError = e && (e as Error).message ? (e as Error).message : String(e); }
      resumePendingRenders().catch(function () { /* best-effort */ });
      state.primaryBrand = null; state.goal = null;
      if (state.brands && state.brands.length) renderBrands();
      else renderOnboarding();
    }
    async function evaluate(session: { user: { email?: string | null; id: string } } | null) {
      if (!session) { if (!state.booted) renderSignIn(); return; }
      state.email = session.user.email || ''; state.userId = session.user.id;
      let profile: Rec | null = null;
      try { const r = await Auth.getProfile(session.user.id); profile = r as Rec | null; } catch { /* default */ }
      if (profile && profile.approved) { if (!state.booted) initApp(); }
      else { renderPending(session.user.email || ''); }
    }
    async function boot() {
      try { await Auth.init(); }
      catch (e) {
        setHTML('<div style="height:100vh;display:grid;place-items:center;padding:24px;text-align:center;color:var(--fg-2)"><div><h2>Setup needed</h2><p>' + esc((e as Error).message) + '</p><p class="meta">Add SUPABASE_URL / SUPABASE_ANON_KEY to .env, then restart.</p></div></div>');
        return;
      }
      const client = Auth.client;
      if (!client) return;
      client.auth.onAuthStateChange(function (event, session) {
        if (event === 'PASSWORD_RECOVERY') { renderRecovery(); return; }
        evaluate(session);
      });
      if (window.location.hash && window.location.hash.indexOf('type=recovery') !== -1) { renderRecovery(); return; }
      const { data } = await client.auth.getSession();
      evaluate(data.session);
    }
    boot();

    return () => {
      document.removeEventListener('click', onDocClick);
      const m = document.getElementById('modalRoot');
      if (m) m.remove();
    };
  }, []);

  // The #app host the legacy app populated. styles/app.css targets `#app`.
  return <div id="app" ref={hostRef} />;
}
