# amped

Smart EV charging on Australia's National Electricity Market.

This is the MVP demo — a working scheduler running on a hand-modelled NSW1 price curve. See `amped-mvp-brief.docx` for the full technical brief.

---

## Run locally

You'll need Node.js 18+ installed.

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

To build for production:

```bash
npm run build
```

Output goes to `dist/`. To preview the production build locally:

```bash
npm run preview
```

---

## Deploy to Vercel (recommended, ~3 minutes)

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   gh repo create amped --public --source=. --push
   ```
   (Or do this via the GitHub website if you don't have the `gh` CLI.)

2. Go to https://vercel.com, sign in with GitHub.

3. Click **Add New → Project**, select the `amped` repo.

4. Vercel auto-detects Vite. Leave the defaults. Click **Deploy**.

5. ~60 seconds later you have a live URL like `amped-xyz.vercel.app`.

6. (Optional) Add a custom domain in Vercel project settings — `amped.energy`, `getamped.com.au`, etc.

Every `git push` to `main` redeploys automatically.

---

## Deploy to Netlify (alternative)

1. Push to GitHub (same as above).
2. Go to https://netlify.com → **Add new site → Import from Git**.
3. Build command: `npm run build`. Publish directory: `dist`.
4. Deploy.

---

## Project structure

```
amped/
├── index.html          # Entry HTML
├── package.json        # Dependencies
├── vite.config.js      # Build config
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx        # React entry point
    └── EVScheduler.jsx # The whole app (single component)
```

The entire application is a single React component. All styling is inline via a `<style>` tag inside the component, so no CSS files, no Tailwind, no preprocessor needed.

---

## What's real vs simulated

- **Real:** scheduling algorithm, cost engine, override logic, all UI state.
- **Simulated:** the AEMO price curve (hand-modelled NSW1 pattern), the "live" badge, vehicle state-of-charge (slider only).

See section 4 of the technical brief for full detail.
