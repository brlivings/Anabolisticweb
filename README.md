# Anabolistic — coaching website

Single-page site for Anabolistic online coaching: a dark, scroll-guided 3D page with
white molecules floating in the background (Three.js), what's included, 1:1 coaching,
a before/after slider, client reviews, socials, and a "Join on Skool" call to action.

## Files

- `index.html` — page content (text, links, reviews)
- `styles.css` — design (colors are the variables at the top)
- `main.js` — 3D molecule scene, scroll effects, before/after slider
- `assets/img/` — before/after photos
- `assets/vendor/three.module.min.js` — Three.js r160 (MIT), bundled so no CDN is needed

## Preview locally

The 3D scene loads as a JavaScript module, so open it through a local server
rather than double-clicking the file:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy

It's a static site with no build step. Upload the folder as-is to Netlify, Vercel,
GitHub Pages or Cloudflare Pages.

## Common edits

- **Skool link:** search `index.html` for `skool.com/anabolistic-5280`
- **Socials:** search for `instagram.com`, `snapchat.com`, `tiktok.com`, `discord.gg`
- **Accent color:** `--accent` in `styles.css`
