import React, { useState, useMemo } from 'react';

// ============================================================
// Simulated NSW1 pre-dispatch forecast (c/kWh) — 48 × 30min
// ============================================================
const generatePriceCurve = () => {
  const base = [
    4, 3, 3, 2, 2, 3, 4, 5, 6, 8, 10, 12,
    18, 22, 19, 12, 6, 2, 0, -1, -2, -1, 1, 4,
    7, 11, 16, 24, 38, 52, 68, 78, 72, 58, 42, 32,
    28, 24, 20, 17, 14, 11, 9, 7, 6, 5, 5, 4,
  ];
  return base.map((p, i) => {
    const jitter = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 0.6;
    return Math.round((p + jitter) * 10) / 10;
  });
};

const intervalLabel = (i) => {
  const h = Math.floor(i / 2);
  const m = (i % 2) * 30;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const inWindow = (i, startInterval, endInterval) =>
  startInterval <= endInterval
    ? i >= startInterval && i < endInterval
    : i >= startInterval || i < endInterval;

const scheduleCharging = ({ prices, startInterval, endInterval, intervalsNeeded, pinned, excluded }) => {
  const pinnedInWindow = [...pinned].filter((i) => inWindow(i, startInterval, endInterval) && !excluded.has(i));
  const remainingNeeded = Math.max(0, intervalsNeeded - pinnedInWindow.length);
  const candidates = [];
  for (let i = 0; i < 48; i++) {
    if (!inWindow(i, startInterval, endInterval)) continue;
    if (pinned.has(i) || excluded.has(i)) continue;
    candidates.push({ interval: i, price: prices[i] });
  }
  candidates.sort((a, b) => a.price - b.price);
  const autoPicks = candidates.slice(0, remainingNeeded).map((c) => c.interval);
  const finalSlots = new Set([...pinnedInWindow, ...autoPicks]);
  return { slots: finalSlots, achievable: finalSlots.size >= intervalsNeeded, shortfall: intervalsNeeded - finalSlots.size };
};

export default function EVScheduler() {
  const [prices] = useState(generatePriceCurve);
  const [currentSoC, setCurrentSoC] = useState(28);
  const [targetSoC, setTargetSoC] = useState(80);
  const [batterykWh, setBatterykWh] = useState(75);
  const [chargerkW, setChargerkW] = useState(7.4);
  const [departureHour, setDepartureHour] = useState(7);
  const [plugInHour, setPlugInHour] = useState(19);
  const [pinned, setPinned] = useState(new Set());
  const [excluded, setExcluded] = useState(new Set());

  const energyNeeded = useMemo(
    () => Math.max(0, ((targetSoC - currentSoC) / 100) * batterykWh),
    [currentSoC, targetSoC, batterykWh]
  );
  const intervalsNeeded = useMemo(
    () => Math.ceil(energyNeeded / (chargerkW * 0.5)),
    [energyNeeded, chargerkW]
  );

  const startInterval = plugInHour * 2;
  const endInterval = departureHour * 2;

  const { slots: smartSlots, achievable, shortfall } = useMemo(
    () => scheduleCharging({ prices, startInterval, endInterval, intervalsNeeded, pinned, excluded }),
    [prices, startInterval, endInterval, intervalsNeeded, pinned, excluded]
  );

  const baselineSlots = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < intervalsNeeded; i++) s.add((startInterval + i) % 48);
    return s;
  }, [startInterval, intervalsNeeded]);

  const calcCost = (slots) => {
    let t = 0;
    slots.forEach((i) => { t += (prices[i] / 100) * chargerkW * 0.5; });
    return t;
  };

  const smartCost = calcCost(smartSlots);
  const baselineCost = calcCost(baselineSlots);
  const savings = baselineCost - smartCost;
  const annualSavings = savings * 365 * 0.7;
  const savingsPct = baselineCost > 0 ? (savings / baselineCost) * 100 : 0;

  const toggleSlot = (i) => {
    if (!inWindow(i, startInterval, endInterval)) return;
    const isSelected = smartSlots.has(i);
    const isPinned = pinned.has(i);
    const isExcluded = excluded.has(i);
    if (isPinned) { const np = new Set(pinned); np.delete(i); setPinned(np); }
    else if (isExcluded) { const ne = new Set(excluded); ne.delete(i); setExcluded(ne); }
    else if (isSelected) { const ne = new Set(excluded); ne.add(i); setExcluded(ne); }
    else { const np = new Set(pinned); np.add(i); setPinned(np); }
  };

  const resetOverrides = () => { setPinned(new Set()); setExcluded(new Set()); };

  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(0, Math.min(...prices));
  const priceRange = maxPrice - minPrice;

  let cumCost = 0;
  const tableRows = prices.map((p, i) => {
    const isSelected = smartSlots.has(i);
    const isInWin = inWindow(i, startInterval, endInterval);
    if (isSelected) cumCost += (p / 100) * chargerkW * 0.5;
    return {
      interval: i,
      time: intervalLabel(i),
      endTime: intervalLabel((i + 1) % 48),
      price: p,
      isSelected, isInWindow: isInWin,
      isPinned: pinned.has(i),
      isExcluded: excluded.has(i),
      cumCost: isSelected ? cumCost : null,
    };
  });

  const minSelectedPrice = smartSlots.size > 0 ? Math.min(...[...smartSlots].map(i => prices[i])) : 0;

  const chartW = 100, chartH = 100;
  const xAt = (i) => (i / 47) * chartW;
  const yAt = (p) => chartH - ((p - minPrice) / priceRange) * chartH;
  const pathD = prices.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(p).toFixed(2)}`
  ).join(' ');

  return (
    <div className="ev-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .ev-app {
          --bg: #2a3138;
          --bg-2: #353d45;
          --surface: #3d464f;
          --surface-2: #4a545e;
          --line: #56616c;
          --line-soft: #424b54;
          --text: #f0f4f8;
          --text-soft: #c4ccd4;
          --text-dim: #8a949e;
          --leaf: #5fdb78;
          --leaf-bright: #7fee93;
          --leaf-dark: #3fb958;
          --leaf-glow: rgba(95, 219, 120, 0.25);
          --leaf-soft: rgba(95, 219, 120, 0.12);
          --drop: #5ac8e0;
          --warn: #ff9a4a;
          --pin: #b18aff;
          font-family: 'Space Grotesk', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          padding: 28px 36px;
          background-image:
            radial-gradient(ellipse at top left, rgba(95,219,120,0.06) 0%, transparent 50%),
            radial-gradient(ellipse at bottom right, rgba(90,200,224,0.04) 0%, transparent 50%);
        }
        .ev-app *, .ev-app *::before, .ev-app *::after { box-sizing: border-box; }

        /* ── Header ─────────────────────────────────────────── */
        .header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 24px; padding-bottom: 18px;
          border-bottom: 1px solid var(--line-soft);
        }
        .logo {
          font-size: 28px; font-weight: 700; letter-spacing: -0.03em;
          color: var(--text);
          display: flex; align-items: center; gap: 6px;
        }
        .logo .dot { color: var(--leaf); }
        .logo-tag {
          font-size: 11px; color: var(--text-dim); margin-top: 2px;
          letter-spacing: 0.02em;
        }
        .live {
          display: flex; align-items: center; gap: 8px;
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em;
          color: var(--text-soft);
          font-family: 'JetBrains Mono', monospace;
        }
        .pulse {
          width: 7px; height: 7px; background: var(--leaf); border-radius: 50%;
          box-shadow: 0 0 10px var(--leaf);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* ── Main two-column layout ─────────────────────────── */
        .layout {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 24px;
        }

        /* ── Slim sidebar ───────────────────────────────────── */
        .sidebar {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 18px 16px;
          height: fit-content;
          position: sticky; top: 24px;
        }
        .sidebar-title {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em;
          color: var(--text-dim); font-weight: 600;
          margin: 0 0 14px;
          display: flex; align-items: center; gap: 6px;
        }
        .field { margin-bottom: 14px; }
        .field:last-child { margin-bottom: 0; }
        .field-label {
          display: flex; justify-content: space-between; align-items: baseline;
          font-size: 13px; color: var(--text);
          margin-bottom: 7px;
          font-weight: 500;
        }
        .field-value {
          font-family: 'JetBrains Mono', monospace;
          color: var(--leaf-bright); font-weight: 600; font-size: 14px;
        }
        input[type="range"] {
          width: 100%; -webkit-appearance: none; appearance: none;
          background: transparent; margin: 0; height: 14px;
        }
        input[type="range"]::-webkit-slider-runnable-track {
          height: 2px; background: var(--line); border-radius: 1px;
        }
        input[type="range"]::-moz-range-track {
          height: 2px; background: var(--line); border-radius: 1px;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 12px; height: 12px;
          background: var(--leaf); border-radius: 50%;
          margin-top: -5px; cursor: pointer;
          box-shadow: 0 0 8px var(--leaf-glow);
        }
        input[type="range"]::-moz-range-thumb {
          width: 12px; height: 12px; background: var(--leaf);
          border-radius: 50%; cursor: pointer; border: none;
          box-shadow: 0 0 8px var(--leaf-glow);
        }

        .plan-mini {
          margin-top: 16px; padding-top: 14px;
          border-top: 1px dashed var(--line);
        }
        .plan-mini-row {
          display: flex; justify-content: space-between; align-items: baseline;
          font-size: 11px; margin-bottom: 6px;
        }
        .plan-mini-row:last-child { margin-bottom: 0; }
        .plan-mini-label { color: var(--text-dim); }
        .plan-mini-value {
          font-family: 'JetBrains Mono', monospace;
          color: var(--text); font-weight: 600;
        }
        .plan-arrow {
          display: flex; align-items: center; justify-content: center;
          gap: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 18px; font-weight: 700;
          color: var(--text); margin: 8px 0;
        }
        .plan-arrow .from { color: var(--text-soft); }
        .plan-arrow .to { color: var(--leaf-bright); }
        .plan-arrow .arr { color: var(--leaf); font-size: 14px; }

        /* ── Main column ────────────────────────────────────── */
        .main { display: flex; flex-direction: column; gap: 18px; }

        /* ── Hero chart ─────────────────────────────────────── */
        .hero {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 26px 30px;
          position: relative;
          overflow: hidden;
        }
        .hero::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(circle at 70% 0%, var(--leaf-soft) 0%, transparent 50%);
          pointer-events: none;
        }
        .hero-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 22px;
          position: relative; z-index: 1;
        }
        .hero-title {
          font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
          color: var(--text); margin: 0;
          display: flex; align-items: center; gap: 8px;
        }
        .hero-sub {
          font-size: 12px; color: var(--text-soft);
          margin-top: 4px;
          font-family: 'JetBrains Mono', monospace;
        }
        .hero-sub strong { color: var(--leaf-bright); font-weight: 600; }
        .legend {
          display: flex; gap: 14px; font-size: 11px; color: var(--text-soft);
        }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-swatch {
          width: 14px; height: 10px; border-radius: 2px;
        }

        .chart-wrap {
          position: relative;
          height: 280px;
          padding-left: 38px;
        }
        .chart-y {
          position: absolute; left: 0; top: 0; bottom: 20px;
          width: 34px;
          display: flex; flex-direction: column; justify-content: space-between;
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          color: var(--text-dim); text-align: right; padding-right: 6px;
        }
        .chart-svg { width: 100%; height: 100%; overflow: visible; }
        .chart-x {
          display: flex; justify-content: space-between;
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          color: var(--text-dim); margin-top: 8px; padding-left: 38px;
        }

        /* ── Inline cost equation ───────────────────────────── */
        .equation {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 18px 24px;
          display: flex; align-items: center; justify-content: center;
          gap: 18px;
          font-family: 'JetBrains Mono', monospace;
          flex-wrap: wrap;
        }
        .eq-term { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .eq-label {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em;
          color: var(--text-dim);
          font-weight: 500;
        }
        .eq-value {
          font-size: 22px; font-weight: 700;
          color: var(--text);
          letter-spacing: -0.01em;
        }
        .eq-value.smart { color: var(--leaf-bright); }
        .eq-value.baseline { color: var(--warn); text-decoration: line-through; text-decoration-color: rgba(255,154,74,0.5); }
        .eq-value.saved {
          color: var(--leaf);
          font-size: 26px;
        }
        .eq-op {
          font-size: 24px; color: var(--text-dim); font-weight: 400;
          padding: 0 4px;
        }
        .eq-sub {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 11px; color: var(--text-soft);
          margin-top: 1px;
        }
        .eq-sub strong { color: var(--leaf); font-weight: 600; }

        .warn-line {
          margin-top: 12px;
          padding: 10px 14px;
          background: rgba(255,154,74,0.1);
          border: 1px solid var(--warn);
          border-radius: 6px;
          font-size: 12px;
          color: var(--warn);
          text-align: center;
        }

        /* ── Table ──────────────────────────────────────────── */
        .table-panel {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 22px 26px;
        }
        .table-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 14px; gap: 16px;
        }
        .panel-title {
          font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
          color: var(--text); margin: 0;
          display: flex; align-items: center; gap: 6px;
        }
        .help-text {
          font-size: 12px; color: var(--text-soft); margin-top: 3px;
        }
        .reset-btn {
          background: transparent; border: 1px solid var(--line);
          color: var(--text-soft); padding: 6px 12px;
          font-family: inherit; font-size: 11px;
          letter-spacing: 0.08em; text-transform: uppercase;
          border-radius: 4px; cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
          font-weight: 500;
        }
        .reset-btn:hover { background: var(--surface-2); color: var(--text); border-color: var(--leaf); }

        .forecast-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .forecast-table th {
          text-align: left; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.12em; color: var(--text-dim); font-weight: 600;
          padding: 10px 14px; border-bottom: 1px solid var(--line);
          background: var(--bg-2); position: sticky; top: 0; z-index: 2;
        }
        .forecast-table th.num { text-align: right; }
        .forecast-table td {
          padding: 8px 14px;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text);
          border-bottom: 1px solid var(--line-soft);
        }
        .forecast-table td.num { text-align: right; }
        .forecast-table tr { cursor: pointer; transition: background 0.1s; }
        .forecast-table tr.in-window { background: rgba(95,219,120,0.025); }
        .forecast-table tr.selected { background: rgba(95,219,120,0.12); }
        .forecast-table tr.selected td { color: var(--leaf-bright); font-weight: 500; }
        .forecast-table tr.pinned { background: rgba(177,138,255,0.12); }
        .forecast-table tr.excluded { background: rgba(255,154,74,0.1); }
        .forecast-table tr.excluded td:nth-child(2) { text-decoration: line-through; color: var(--text-dim); }
        .forecast-table tr.outside { cursor: not-allowed; }
        .forecast-table tr.outside td { color: var(--text-dim); opacity: 0.5; }
        .forecast-table tr:hover:not(.outside) { background: rgba(95,219,120,0.06); }

        .tag {
          display: inline-block; padding: 3px 8px;
          font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em;
          font-family: 'Space Grotesk', sans-serif;
          border-radius: 3px; font-weight: 700;
        }
        .tag-charging { background: var(--leaf); color: var(--bg); }
        .tag-pinned { background: var(--pin); color: var(--bg); }
        .tag-excluded { background: var(--warn); color: var(--bg); }
        .tag-available { background: var(--surface-2); color: var(--text-soft); }
        .tag-outside { background: transparent; color: var(--text-dim); border: 1px dashed var(--line); }

        .table-scroll {
          max-height: 360px; overflow-y: auto;
          border: 1px solid var(--line-soft); border-radius: 6px;
        }
        .table-scroll::-webkit-scrollbar { width: 8px; }
        .table-scroll::-webkit-scrollbar-track { background: var(--bg-2); }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }

        .footer-note {
          margin-top: 20px;
          padding: 12px 16px;
          background: var(--bg-2);
          border-left: 2px solid var(--leaf);
          border-radius: 4px;
          font-size: 11px;
          color: var(--text-soft);
          line-height: 1.6;
        }
        .footer-note strong { color: var(--leaf-bright); }

        @media (max-width: 900px) {
          .layout { grid-template-columns: 1fr; }
          .sidebar { position: relative; top: 0; }
          .equation { gap: 10px; }
          .eq-value { font-size: 18px; }
        }
      `}</style>

      {/* Header */}
      <div className="header">
        <div>
          <div className="logo">amped<span className="dot">.</span> 🌱</div>
          <div className="logo-tag">smart EV charging on AEMO data</div>
        </div>
        <div className="live">
          <span className="pulse"></span>
          NSW1 · live pre-dispatch
        </div>
      </div>

      <div className="layout">
        {/* ── Slim sidebar ────────────────────────────────── */}
        <aside className="sidebar">
          <h3 className="sidebar-title">⚡ Inputs</h3>

          <div className="field">
            <div className="field-label">
              <span>Current</span>
              <span className="field-value">{currentSoC}%</span>
            </div>
            <input type="range" min="5" max="95" value={currentSoC}
              onChange={(e) => setCurrentSoC(+e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">
              <span>Target</span>
              <span className="field-value">{targetSoC}%</span>
            </div>
            <input type="range" min={currentSoC + 5} max="100" value={targetSoC}
              onChange={(e) => setTargetSoC(+e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">
              <span>Plug in</span>
              <span className="field-value">{plugInHour.toString().padStart(2,'0')}:00</span>
            </div>
            <input type="range" min="15" max="23" value={plugInHour}
              onChange={(e) => setPlugInHour(+e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">
              <span>Leave by</span>
              <span className="field-value">{departureHour.toString().padStart(2,'0')}:00</span>
            </div>
            <input type="range" min="4" max="11" value={departureHour}
              onChange={(e) => setDepartureHour(+e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">
              <span>Charger</span>
              <span className="field-value">{chargerkW}kW</span>
            </div>
            <input type="range" min="2.4" max="22" step="0.2" value={chargerkW}
              onChange={(e) => setChargerkW(+e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">
              <span>Battery</span>
              <span className="field-value">{batterykWh}kWh</span>
            </div>
            <input type="range" min="40" max="120" value={batterykWh}
              onChange={(e) => setBatterykWh(+e.target.value)} />
          </div>

          <div className="plan-mini">
            <div className="plan-arrow">
              <span className="from">{currentSoC}%</span>
              <span className="arr">→</span>
              <span className="to">{targetSoC}%</span>
            </div>
            <div className="plan-mini-row">
              <span className="plan-mini-label">Energy 💧</span>
              <span className="plan-mini-value">{energyNeeded.toFixed(1)} kWh</span>
            </div>
            <div className="plan-mini-row">
              <span className="plan-mini-label">Slots</span>
              <span className="plan-mini-value">{intervalsNeeded} × 30m</span>
            </div>
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────── */}
        <div className="main">

          {/* HERO: forecast chart with selected slots */}
          <div className="hero">
            <div className="hero-header">
              <div>
                <h2 className="hero-title">🌿 Tonight's price forecast</h2>
                <div className="hero-sub">
                  Cheapest pick <strong>{minSelectedPrice.toFixed(1)}c/kWh</strong> · peak avoided <strong>{maxPrice.toFixed(0)}c/kWh</strong> · {smartSlots.size} slots scheduled
                </div>
              </div>
              <div className="legend">
                <div className="legend-item">
                  <div className="legend-swatch" style={{background: 'var(--leaf)'}}></div>
                  Charging
                </div>
                <div className="legend-item">
                  <div className="legend-swatch" style={{background: 'var(--leaf-soft)'}}></div>
                  In window
                </div>
                <div className="legend-item">
                  <div className="legend-swatch" style={{background: 'var(--surface-2)'}}></div>
                  Outside
                </div>
              </div>
            </div>

            <div className="chart-wrap">
              <div className="chart-y">
                <span>{maxPrice.toFixed(0)}c</span>
                <span>{(maxPrice/2).toFixed(0)}c</span>
                <span>0c</span>
                {minPrice < 0 && <span>{minPrice.toFixed(0)}c</span>}
              </div>

              <svg className="chart-svg" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="leafGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--leaf-bright)" stopOpacity="0.95"/>
                    <stop offset="100%" stopColor="var(--leaf-dark)" stopOpacity="0.7"/>
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="0.5" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>

                {/* Gridlines */}
                <line x1="0" y1={yAt(0)} x2={chartW} y2={yAt(0)} stroke="var(--line)" strokeWidth="0.15" strokeDasharray="0.5 0.5"/>
                <line x1="0" y1={yAt(maxPrice/2)} x2={chartW} y2={yAt(maxPrice/2)} stroke="var(--line-soft)" strokeWidth="0.1" strokeDasharray="0.5 0.5"/>

                {/* Bars */}
                {prices.map((p, i) => {
                  const isInWin = inWindow(i, startInterval, endInterval);
                  const isSel = smartSlots.has(i);
                  const isExc = excluded.has(i);
                  const isPin = pinned.has(i);
                  const x = xAt(i);
                  const barW = chartW / 48 - 0.18;
                  const barH = Math.abs(yAt(p) - yAt(0));
                  const barY = p >= 0 ? yAt(p) : yAt(0);
                  let fill = 'var(--surface-2)';
                  let op = 0.9;
                  let filter = '';
                  if (isSel) { fill = 'url(#leafGrad)'; op = 1; filter = 'url(#glow)'; }
                  else if (isPin) { fill = 'var(--pin)'; op = 0.6; }
                  else if (isExc) { fill = 'var(--warn)'; op = 0.3; }
                  else if (isInWin) { fill = 'var(--leaf)'; op = 0.18; }
                  return (
                    <rect key={i} x={x} y={barY} width={barW} height={barH}
                      fill={fill} opacity={op} filter={filter} rx="0.2"/>
                  );
                })}

                {/* Trendline */}
                <path d={pathD} fill="none" stroke="var(--text-soft)"
                  strokeWidth="0.35" strokeLinejoin="round" opacity="0.5"/>

                {/* Dots on selected slots */}
                {prices.map((p, i) => {
                  if (!smartSlots.has(i)) return null;
                  return (
                    <circle key={`dot-${i}`} cx={xAt(i)} cy={yAt(p)}
                      r="1" fill="var(--leaf-bright)"
                      stroke="var(--bg)" strokeWidth="0.3"
                      filter="url(#glow)"/>
                  );
                })}

                {/* Pin rings */}
                {prices.map((p, i) => {
                  if (pinned.has(i)) {
                    return (
                      <circle key={`pin-${i}`} cx={xAt(i)} cy={yAt(p)}
                        r="1.3" fill="none" stroke="var(--pin)" strokeWidth="0.4"/>
                    );
                  }
                  return null;
                })}
              </svg>
            </div>

            <div className="chart-x">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
            </div>
          </div>

          {/* INLINE COST EQUATION */}
          <div>
            <div className="equation">
              <div className="eq-term">
                <div className="eq-label">Baseline</div>
                <div className="eq-value baseline">${baselineCost.toFixed(2)}</div>
              </div>
              <div className="eq-op">−</div>
              <div className="eq-term">
                <div className="eq-label">Smart 🌱</div>
                <div className="eq-value smart">${smartCost.toFixed(2)}</div>
              </div>
              <div className="eq-op">=</div>
              <div className="eq-term">
                <div className="eq-label">You save</div>
                <div className="eq-value saved">${savings.toFixed(2)}</div>
                <div className="eq-sub">
                  <strong>{savingsPct.toFixed(0)}%</strong> off · ≈ ${annualSavings.toFixed(0)}/yr
                </div>
              </div>
            </div>
            {!achievable && (
              <div className="warn-line">
                ⚠ Target unachievable — need {shortfall} more slot(s). Remove some exclusions or extend your window.
              </div>
            )}
          </div>

          {/* TABLE */}
          <div className="table-panel">
            <div className="table-header">
              <div>
                <h3 className="panel-title">📊 Full forecast · 30-min intervals</h3>
                <div className="help-text">
                  Click any in-window row to override — pin extra in, or exclude a selected one.
                </div>
              </div>
              {(pinned.size > 0 || excluded.size > 0) && (
                <button className="reset-btn" onClick={resetOverrides}>
                  Reset ({pinned.size + excluded.size})
                </button>
              )}
            </div>

            <div className="table-scroll">
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th className="num">Forecast price</th>
                    <th>Status</th>
                    <th className="num">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => {
                    let cls = '';
                    if (!row.isInWindow) cls = 'outside';
                    else if (row.isPinned) cls = 'pinned in-window';
                    else if (row.isExcluded) cls = 'excluded in-window';
                    else if (row.isSelected) cls = 'selected in-window';
                    else cls = 'in-window';

                    let statusTag, statusCls;
                    if (!row.isInWindow) { statusTag = 'Outside'; statusCls = 'tag-outside'; }
                    else if (row.isPinned) { statusTag = '📌 Pinned'; statusCls = 'tag-pinned'; }
                    else if (row.isExcluded) { statusTag = 'Excluded'; statusCls = 'tag-excluded'; }
                    else if (row.isSelected) { statusTag = '🌿 Charging'; statusCls = 'tag-charging'; }
                    else { statusTag = 'Available'; statusCls = 'tag-available'; }

                    return (
                      <tr key={row.interval} className={cls} onClick={() => toggleSlot(row.interval)}>
                        <td>{row.time} – {row.endTime}</td>
                        <td className="num">{row.price.toFixed(1)}c/kWh</td>
                        <td><span className={`tag ${statusCls}`}>{statusTag}</span></td>
                        <td className="num">{row.cumCost !== null ? `$${row.cumCost.toFixed(2)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="footer-note">
              <strong>🌱 Demo data.</strong> Price curve modelled on typical NSW1 pre-dispatch patterns.
              Production ingests live AEMO pre-dispatch (30-min, ~40hr horizon, refreshed every 30 min)
              and dispatches via Tesla Fleet API / OCPP / smart-plug fallback.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
