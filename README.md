# amped

Smart EV charging on Australia's National Electricity Market.

This is the MVP demo — a working scheduler running on a hand-modelled NSW1 price curve. See `amped-mvp-brief.docx` for the full technical brief.

---


You'll need Node.js 18+ installed.

```bash
npm install
npm run dev
```

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

