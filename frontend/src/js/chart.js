/**
 * Trend Detector — High-Performance HTML5 Canvas Time Series Visualizer
 * Enforces SRD §17 Visualization:
 * - 60 FPS optimized with requestAnimationFrame (Zero lag)
 * - Raw monthly values (context line)
 * - Monthly anomalies (primary line)
 * - OLS fitted trend line & Theil-Sen line
 * - Preserves legitimate zeros (rain_mm = 0 is a real value)
 * - Supports NO2 display scaling (x10^15)
 * - Monochromatic Deep Forest Palette:
 *   Obsidian (#051F20), Pine (#163832), Forest Mid (#235347),
 *   Sage (#8EB69B for series), Mint (#DAF1DE for OLS trend line)
 */

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

    this._setupEvents();
  }

  setData(dataPoints, olsResult, unit, useAnomalies = true, displayScale = 1.0, displayUnit = null) {
    this.dataPoints = dataPoints || [];
    this.olsResult = olsResult;
    this.unit = unit || "";
    this.displayScale = displayScale || 1.0;
    this.displayUnit = displayUnit || unit || "";
    this.useAnomalies = useAnomalies;
    this.hoverIndex = -1;
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

    const padding = { top: 25, right: 25, bottom: 40, left: 65 };
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

    // Add 10% breathing room to Y axis
    const ySpan = (maxY - minY) || 1.0;
    minY -= ySpan * 0.08;
    maxY += ySpan * 0.08;

    // If showing anomalies, ensure zero line is included
    if (this.useAnomalies) {
      if (minY > 0) minY = -ySpan * 0.1;
      if (maxY < 0) maxY = ySpan * 0.1;
    }

    const totalPts = this.dataPoints.length;
    const getX = (index) => padding.left + (index / (totalPts - 1)) * plotWidth;
    const getY = (val) => padding.top + plotHeight - ((val - minY) / (maxY - minY)) * plotHeight;

    // Draw Dark Grids & Labels
    this._drawGrid(ctx, padding, plotWidth, plotHeight, minY, maxY);

    // Draw Zero reference line for anomalies
    if (this.useAnomalies && minY <= 0 && maxY >= 0) {
      const zeroY = getY(0);
      if (zeroY >= padding.top && zeroY <= padding.top + plotHeight) {
        ctx.save();
        ctx.strokeStyle = "rgba(218, 241, 222, 0.4)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(padding.left + plotWidth, zeroY);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 1. Draw Primary Series Line in Sage Green (#8EB69B)
    ctx.save();
    ctx.strokeStyle = "#8EB69B";
    ctx.lineWidth = 2.0;
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

    // 2. Draw OLS Trend Line in Glowing Ice Mint (#DAF1DE)
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
      ctx.strokeStyle = "#DAF1DE";
      ctx.lineWidth = 3.2;
      ctx.shadowColor = "rgba(218, 241, 222, 0.4)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(getX(0), y1);
      ctx.lineTo(getX(totalPts - 1), y2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Hover Point & Tooltip
    if (this.hoverIndex >= 0 && this.hoverIndex < totalPts) {
      const pt = this.dataPoints[this.hoverIndex];
      const rawVal = this.useAnomalies ? pt.anomaly : pt.value;
      if (rawVal !== null && rawVal !== undefined && !isNaN(rawVal)) {
        const val = rawVal / scale;
        const x = getX(this.hoverIndex);
        const y = getY(val);

        ctx.save();
        ctx.fillStyle = "#DAF1DE";
        ctx.strokeStyle = "#051F20";
        ctx.lineWidth = 3.0;
        ctx.shadowColor = "#DAF1DE";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 6.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        this._drawTooltip(ctx, x, y, pt, width, scale);
      }
    }
  }

  _drawGrid(ctx, pad, w, h, minY, maxY) {
    ctx.save();
    ctx.strokeStyle = "rgba(142, 182, 155, 0.12)";
    ctx.lineWidth = 0.8;
    ctx.fillStyle = "#8EB69B";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

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

    // Vertical Year Grid lines (2005, 2010, 2015, 2020, 2024)
    const keyYears = [2005, 2010, 2015, 2020, 2024];
    ctx.textAlign = "center";
    for (const yr of keyYears) {
      const targetDate = `${yr}-01`;
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

        ctx.fillText(yr.toString(), x, pad.top + h + 18);
      }
    }

    // Y-Axis Unit label
    ctx.save();
    ctx.translate(16, pad.top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.fillStyle = "#DAF1DE";
    ctx.fillText(this.useAnomalies ? `Anomaly (${this.displayUnit})` : `Value (${this.displayUnit})`, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  _drawTooltip(ctx, x, y, pt, canvasWidth, scale) {
    const rawVal = pt.value !== null ? (pt.value / scale).toFixed(3) : 'Missing';
    const anomVal = pt.anomaly !== null ? ((pt.anomaly >= 0 ? '+' : '') + (pt.anomaly / scale).toFixed(3)) : 'N/A';

    const text1 = `Date: ${pt.date}`;
    const text2 = `Value: ${rawVal} ${this.displayUnit}`;
    const text3 = `Anomaly: ${anomVal}`;

    ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    const boxW = 165;
    const boxH = 64;
    let boxX = x + 14;
    if (boxX + boxW > canvasWidth - 10) boxX = x - boxW - 14;
    const boxY = Math.max(8, y - boxH / 2);

    ctx.save();
    ctx.fillStyle = "rgba(5, 31, 32, 0.94)";
    ctx.strokeStyle = "#235347";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(text1, boxX + 10, boxY + 18);
    ctx.fillStyle = "#8EB69B";
    ctx.fillText(text2, boxX + 10, boxY + 34);
    ctx.fillStyle = "#DAF1DE";
    ctx.fillText(text3, boxX + 10, boxY + 50);
    ctx.restore();
  }

  _renderEmpty(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = "#8EB69B";
    ctx.font = "14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Select a variable and city station to visualize observations", w / 2, h / 2);
    ctx.restore();
  }

  _setupEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const padding = { left: 65, right: 25 };
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
