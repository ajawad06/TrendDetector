/**
 * Trend Detector — High-Performance HTML5 Canvas Time Series Visualizer
 * Enforces SRD §17 Visualization:
 * - 60 FPS optimized with requestAnimationFrame
 * - Raw monthly values & climatological anomalies
 * - OLS fitted linear trend line
 * - Preserves legitimate zeros (rain_mm = 0 is a real value)
 * - Supports NO2 display scaling (x10^15)
 * - Styled from design tokens only (tokens.css): muted gridlines, mono axis
 *   labels, rounded dark tooltip, observed / trend / baseline series colours.
 * - Motion (presentation only): lines draw in left to right (900ms), tooltip
 *   fades and scales from 0.96 (120ms). Skipped under prefers-reduced-motion.
 */

import { tok as T } from './theme.js';

const MONO = () => T('--font-mono', 'monospace');
const SANS = () => T('--font-body', 'sans-serif');
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DRAW_MS = 900, TIP_MS = 120;

export class TrendChart {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.dataPoints = [];
    this.olsResult = null;
    this.unit = "";
    this.displayUnit = "";
    this.displayScale = 1.0;
    this.useAnomalies = true;
    this.hoverIndex = -1;
    this.renderRequested = false;
    this.drawStart = 0;      // draw-in animation clock
    this.tipStart = 0;       // tooltip fade clock

    this._setupEvents();
    document.fonts?.ready.then(() => this.requestRender());   // redraw once the mono font is available
  }

  setData(dataPoints, olsResult, unit, useAnomalies = true, displayScale = 1.0, displayUnit = null) {
    this.dataPoints = dataPoints || [];
    this.olsResult = olsResult;
    this.unit = unit || "";
    this.displayScale = displayScale || 1.0;
    this.displayUnit = displayUnit || unit || "";
    this.useAnomalies = useAnomalies;
    this.hoverIndex = -1;
    this.drawStart = reduced() ? 0 : performance.now();
    this.requestRender();
  }

  requestRender() {
    if (this.renderRequested) return;
    this.renderRequested = true;
    requestAnimationFrame(() => {
      this.renderRequested = false;
      this.render();
    });
  }

  render() {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const width = Math.floor(rect.width) || 600;
    const height = Math.floor(rect.height) || 360;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!this.dataPoints || this.dataPoints.length === 0) {
      this._renderEmpty(ctx, width, height);
      return;
    }

    const padding = { top: 20, right: 20, bottom: 35, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    if (plotWidth <= 10 || plotHeight <= 10) return;

    // Scale values for display
    const activeValues = [];
    const scale = this.displayScale || 1.0;

    for (let i = 0; i < this.dataPoints.length; i++) {
      const v = this.useAnomalies ? this.dataPoints[i].anomaly : this.dataPoints[i].value;
      if (v !== null && v !== undefined && !isNaN(v)) {
        activeValues.push(v / scale);
      }
    }

    if (activeValues.length === 0) {
      this._renderEmpty(ctx, width, height);
      return;
    }

    let minY = activeValues[0];
    let maxY = activeValues[0];
    for (let i = 1; i < activeValues.length; i++) {
      if (activeValues[i] < minY) minY = activeValues[i];
      if (activeValues[i] > maxY) maxY = activeValues[i];
    }

    // Breathing room to Y axis
    const ySpan = (maxY - minY) || 1.0;
    minY -= ySpan * 0.06;
    maxY += ySpan * 0.06;

    if (this.useAnomalies) {
      if (minY > 0) minY = -ySpan * 0.1;
      if (maxY < 0) maxY = ySpan * 0.1;
    }

    const totalPts = this.dataPoints.length;
    const getX = (index) => padding.left + (index / (totalPts - 1)) * plotWidth;
    const getY = (val) => padding.top + plotHeight - ((val - minY) / (maxY - minY)) * plotHeight;

    // Draw Flat Grids & Labels
    this._drawGrid(ctx, padding, plotWidth, plotHeight, minY, maxY);

    // Draw Zero reference line for anomalies in secondary tan
    if (this.useAnomalies && minY <= 0 && maxY >= 0) {
      const zeroY = getY(0);
      if (zeroY >= padding.top && zeroY <= padding.top + plotHeight) {
        ctx.save();
        ctx.strokeStyle = T('--chart-base');
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(padding.left + plotWidth, zeroY);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw-in: series and trend line are revealed left to right through a clip rectangle.
    const drawT = this.drawStart ? Math.min(1, (performance.now() - this.drawStart) / DRAW_MS) : 1;
    const drawP = 1 - Math.pow(1 - drawT, 3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left - 2, 0, (plotWidth + 4) * drawP, height);
    ctx.clip();

    // 1. Draw Primary Series Line (observed)
    ctx.save();
    ctx.strokeStyle = T('--chart-obs');
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.beginPath();

    let inSegment = false;
    for (let i = 0; i < totalPts; i++) {
      const rawVal = this.useAnomalies ? this.dataPoints[i].anomaly : this.dataPoints[i].value;
      if (rawVal === null || rawVal === undefined || isNaN(rawVal)) {
        inSegment = false;
      } else {
        const val = rawVal / scale;
        const x = getX(i);
        const y = getY(val);
        if (!inSegment) {
          ctx.moveTo(x, y);
          inSegment = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();
    ctx.restore();

    // 2. Draw OLS Trend Line - crisp 2.4px
    if (this.olsResult && totalPts > 1) {
      const slope = this.olsResult.slope_per_year / scale;
      const periodYears = 20.0;
      
      let firstYVal = this.olsResult.intercept / scale;
      let lastYVal = (this.olsResult.intercept + this.olsResult.slope_per_year * periodYears) / scale;

      if (this.useAnomalies) {
        firstYVal = -(slope * (periodYears / 2.0));
        lastYVal = (slope * (periodYears / 2.0));
      }

      const y1 = getY(firstYVal);
      const y2 = getY(lastYVal);

      ctx.save();
      ctx.strokeStyle = T('--chart-fit');
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(getX(0), y1);
      ctx.lineTo(getX(totalPts - 1), y2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();   // end draw-in clip
    if (drawT < 1) this.requestRender(); else this.drawStart = 0;

    // 3. Draw Hover Point & Flat Tooltip
    if (this.hoverIndex >= 0 && this.hoverIndex < totalPts) {
      const pt = this.dataPoints[this.hoverIndex];
      const rawVal = this.useAnomalies ? pt.anomaly : pt.value;
      if (rawVal !== null && rawVal !== undefined && !isNaN(rawVal)) {
        const val = rawVal / scale;
        const x = getX(this.hoverIndex);
        const y = getY(val);

        const tipT = reduced() ? 1 : Math.min(1, (performance.now() - this.tipStart) / TIP_MS);
        ctx.save();
        ctx.globalAlpha = tipT;
        ctx.fillStyle = T('--chart-fit');
        ctx.strokeStyle = T('--bg-2');
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        this._drawTooltip(ctx, x, y, pt, width, scale, tipT);
        if (tipT < 1) this.requestRender();
      }
    }
  }

  _drawGrid(ctx, pad, w, h, minY, maxY) {
    ctx.save();
    ctx.strokeStyle = T('--grid');
    ctx.lineWidth = 1;
    ctx.fillStyle = T('--text-2');
    ctx.font = `500 11px ${MONO()}`;

    // Horizontal grid lines
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = minY + (i / steps) * (maxY - minY);
      const y = pad.top + h - (i / steps) * h;

      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + w, y);
      ctx.stroke();

      // Y-axis value label
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(2), pad.left - 8, y + 3.5);
    }

    // Vertical Year Grid lines
    const keyYears = [2005, 2010, 2015, 2020, 2024];
    ctx.textAlign = "center";
    for (const yr of keyYears) {
      let foundIdx = -1;
      for (let i = 0; i < this.dataPoints.length; i++) {
        if (this.dataPoints[i].date.startsWith(`${yr}-`)) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx >= 0) {
        const x = pad.left + (foundIdx / (this.dataPoints.length - 1)) * w;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + h);
        ctx.stroke();

        ctx.fillText(yr.toString(), x, pad.top + h + 16);
      }
    }

    // Y-Axis Unit label
    ctx.save();
    ctx.translate(14, pad.top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = `600 11px ${SANS()}`;
    ctx.fillStyle = T('--text-2');
    ctx.fillText(this.useAnomalies ? `Anomaly (${this.displayUnit})` : `Observed (${this.displayUnit})`, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  _drawTooltip(ctx, x, y, pt, canvasWidth, scale, t = 1) {
    const rawVal = pt.value !== null ? (pt.value / scale).toFixed(3) : 'Missing';
    const anomVal = pt.anomaly !== null ? ((pt.anomaly >= 0 ? '+' : '') + (pt.anomaly / scale).toFixed(3)) : 'N/A';

    const text1 = `${pt.date}`;
    const text2 = `Value: ${rawVal} ${this.displayUnit}`;
    const text3 = `Anomaly: ${anomVal}`;

    ctx.font = `500 11px ${MONO()}`;
    const boxW = Math.max(150, Math.ceil(Math.max(ctx.measureText(text2).width, ctx.measureText(text3).width)) + 22);
    const boxH = 62;
    let boxX = x + 12;
    if (boxX + boxW > canvasWidth - 10) boxX = Math.max(4, x - boxW - 12);
    const boxY = Math.max(6, y - boxH / 2);

    // fades in and scales from 0.96 around its own centre
    const s = 0.96 + 0.04 * t, cx = boxX + boxW / 2, cy = boxY + boxH / 2;
    ctx.save();
    ctx.globalAlpha = t;
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    ctx.fillStyle = T('--bg-1');
    ctx.strokeStyle = T('--border-strong');
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = T('--text');
    ctx.textAlign = "left";
    ctx.font = `600 11px ${SANS()}`;
    ctx.fillText(text1, boxX + 11, boxY + 18);

    ctx.font = `500 11px ${MONO()}`;
    ctx.fillStyle = T('--text');
    ctx.fillText(text2, boxX + 11, boxY + 35);
    ctx.fillStyle = T('--text-2');
    ctx.fillText(text3, boxX + 11, boxY + 51);
    ctx.restore();
  }

  _renderEmpty(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = T('--text-2');
    ctx.font = `13px ${SANS()}`;
    ctx.textAlign = "center";
    ctx.fillText("Select a variable and city station to display observations", w / 2, h / 2);
    ctx.restore();
  }

  _setupEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const padding = { left: 60, right: 20 };
      const plotWidth = rect.width - padding.left - padding.right;

      if (mouseX < padding.left || mouseX > rect.width - padding.right || !this.dataPoints.length) {
        if (this.hoverIndex !== -1) {
          this.hoverIndex = -1;
          this.requestRender();
        }
        return;
      }

      const fraction = (mouseX - padding.left) / plotWidth;
      const index = Math.round(fraction * (this.dataPoints.length - 1));
      if (index !== this.hoverIndex && index >= 0 && index < this.dataPoints.length) {
        if (this.hoverIndex === -1) this.tipStart = performance.now();
        this.hoverIndex = index;
        this.requestRender();
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoverIndex !== -1) {
        this.hoverIndex = -1;
        this.requestRender();
      }
    });

    window.addEventListener('resize', () => {
      this.requestRender();
    });
  }
}
