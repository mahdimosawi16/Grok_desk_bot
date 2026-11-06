/* Equity / candle chart — STEP 8.
   Empty: dashed start line + "Waiting for the first trade" (NO falling fill).
   With data: green/red line + soft gradient fill under the line + marks. */
(function (global) {
  const GREEN = '#00d35a';
  const RED = '#ff453a';
  const BLUE = '#0a84ff';
  const SEC = 'rgba(235,235,245,.55)';

  function dpr(c) {
    const r = c.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.floor(r.width * d));
    c.height = Math.max(1, Math.floor(r.height * d));
    const ctx = c.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  function emptyEquity(canvas, startY) {
    const { ctx, w, h } = dpr(canvas);
    ctx.clearRect(0, 0, w, h);
    const y = typeof startY === 'number' ? startY : h * 0.55;
    ctx.save();
    ctx.strokeStyle = SEC;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = SEC;
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for the first trade', w / 2, Math.min(h - 16, y + 28));
    ctx.restore();
  }

  function equity(canvas, points, opts) {
    opts = opts || {};
    const { ctx, w, h } = dpr(canvas);
    ctx.clearRect(0, 0, w, h);
    const vals = (points || []).map((p) => (typeof p === 'number' ? p : Number(p.v != null ? p.v : p.value)));
    if (vals.length < 2) {
      emptyEquity(canvas, h * 0.55);
      return;
    }
    const pad = 4;
    let mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    if (mn === mx) { mn -= 1; mx += 1; }
    const span = mx - mn;
    const xs = (i) => pad + (i / (vals.length - 1)) * (w - pad * 2);
    const ys = (v) => pad + (1 - (v - mn) / span) * (h - pad * 2);
    const up = vals[vals.length - 1] >= vals[0];
    const col = up ? GREEN : RED;

    // soft fill under the line (only when we have real series — not the empty state)
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, up ? 'rgba(0,211,90,0.28)' : 'rgba(255,69,58,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(xs(0), ys(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(xs(i), ys(vals[i]));
    ctx.lineTo(xs(vals.length - 1), h);
    ctx.lineTo(xs(0), h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    for (let i = 0; i < vals.length; i++) {
      if (i === 0) ctx.moveTo(xs(i), ys(vals[i]));
      else ctx.lineTo(xs(i), ys(vals[i]));
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // start-value dashed reference
    if (opts.start != null) {
      const y0 = ys(opts.start);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(235,235,245,.25)';
      ctx.beginPath();
      ctx.moveTo(8, y0);
      ctx.lineTo(w - 8, y0);
      ctx.stroke();
      ctx.restore();
    }

    // marks
    if (opts.marks && opts.marks.length) {
      const rows = {};
      opts.marks.forEach((m) => {
        let i = m.i;
        if (i == null && m.ts && points[0] && points[0].ts) {
          let best = 0, bd = Infinity;
          const t = Date.parse(m.ts);
          points.forEach((p, idx) => {
            const d = Math.abs(Date.parse(p.ts) - t);
            if (d < bd) { bd = d; best = idx; }
          });
          i = best;
        }
        if (i == null || i < 0 || i >= vals.length) return;
        const x = xs(i), y = ys(vals[i]);
        const kind = m.kind || '';
        let fill = BLUE;
        if (kind === 'sold' || (m.value && String(m.value).startsWith('+'))) fill = GREEN;
        if (kind === 'stopped' || kind === 'stop' || (m.value && String(m.value).startsWith('-'))) fill = RED;
        if (kind === 'bought') fill = BLUE;
        ctx.beginPath();
        ctx.arc(x, y - 8, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        const label = m.title || m.value || '';
        if (label) {
          const row = rows[i] || 0;
          rows[i] = row + 1;
          ctx.fillStyle = fill;
          ctx.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(label).slice(0, 18), x, y - 14 - row * 12);
        }
      });
    }
  }

  function candles(canvas, bars) {
    const { ctx, w, h } = dpr(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!bars || !bars.length) {
      ctx.fillStyle = SEC;
      ctx.font = '500 13px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No candles yet', w / 2, h / 2);
      return;
    }
    let mn = Infinity, mx = -Infinity, maxVol = 1;
    for (const b of bars) {
      if (b.l < mn) mn = b.l;
      if (b.h > mx) mx = b.h;
      if ((b.v || 0) > maxVol) maxVol = b.v;
    }
    if (mn === mx) { mn -= 1; mx += 1; }
    const padTop = 8, volH = 36, padBot = 4;
    const chartH = h - volH - padTop - padBot;
    const span = mx - mn;
    const bw = Math.max(2, (w - 16) / bars.length * 0.7);
    const gap = (w - 16) / bars.length;
    const ys = (v) => padTop + (1 - (v - mn) / span) * chartH;
    bars.forEach((b, i) => {
      const x = 8 + i * gap + gap / 2;
      const up = b.c >= b.o;
      ctx.strokeStyle = up ? GREEN : RED;
      ctx.fillStyle = up ? GREEN : RED;
      ctx.beginPath();
      ctx.moveTo(x, ys(b.h));
      ctx.lineTo(x, ys(b.l));
      ctx.stroke();
      const y1 = ys(Math.max(b.o, b.c));
      const y2 = ys(Math.min(b.o, b.c));
      ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
      // volume
      const vh = ((b.v || 0) / maxVol) * (volH - 4);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x - bw / 2, h - padBot - vh, bw, Math.max(1, vh));
      ctx.globalAlpha = 1;
    });
  }

  global.DeskChart = { equity, emptyEquity, candles };
})(window);
