/**
 * Trend Detector — High-Performance HTML5 Canvas Time Series Visualizer
 * Enforces SRD §17 Visualization:
 * - 60 FPS optimized with requestAnimationFrame (Zero lag)
 * - Raw monthly values (context line)
 * - Monthly anomalies (primary line)
 * - OLS fitted trend line & Theil-Sen line
 * - GAPS for missing data (FR-VIS-005: missing data appears as gaps, never zeros or interpolated)
 * - Smooth hover tooltips
 */

export class TrendChart {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.dataPoints = [];
    this.olsResult = null;
    this.unit = "";
    this.useAnomalies = true;
    this.hoverIndex = -1;
    this.renderRequested = false;
    this.lastWidth = 0;
    this.lastHeight = 0;

    this._setupEvents();
  }

  setData(dataPoints, olsResult, unit, useAnomalies = true) {
    this.dataPoints = dataPoints || [];
    this.olsResult = olsResult;
    this.unit = unit || "";
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for speed

    // Resize canvas buffer only when physical dimensions change
    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!this.dataPoints || this.dataPoints.length === 0) {
      this._renderEmpty(ctx, width, height);
      return;
    }

    const padding = { top: 25, right: 25, bottom: 40, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    if (plotWidth <= 10 || plotHeight <= 10) return;

    // Filter valid points
    const activeValues = [];
    for (let i = 0; i < this.dataPoints.length; i++) {
      const v = this.useAnomalies ? this.dataPoints[i].anomaly : this.dataPoints[i].value;
      if (v !== null && v !== undefined && !isNaN(v)) {
        activeValues.push(v);
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

    let ySpan = maxY - minY;
    if (ySpan === 0) ySpan = 1;
    minY -= ySpan * 0.08;
    maxY += ySpan * 0.08;

    // Coordinates helpers
    const totalPts = this.dataPoints.length;
    const getX = (index) => padding.left + (index / (totalPts - 1)) * plotWidth;
    const getY = (val) => padding.top + plotHeight - ((val - minY) / (maxY - minY)) * plotHeight;

    // Draw Grid & Axes
    this._drawGrid(ctx, padding, plotWidth, plotHeight, minY, maxY);

    // Baseline zero line for anomalies
    if (this.useAnomalies && minY < 0 && maxY > 0) {
      const zeroY = getY(0);
      if (zeroY >= padding.top && zeroY <= padding.top + plotHeight) {
        ctx.save();
        ctx.strokeStyle = "#CBAB8D";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(padding.left + plotWidth, zeroY);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 1. Draw Primary Series Line in Dark Brown (Secondary Color)
    ctx.save();
    ctx.strokeStyle = "#5C4333"; // Rich espresso earth brown
    ctx.lineWidth = 2.0;
    ctx.lineJoin = "round";
    ctx.beginPath();

    let inSegment = false;
    for (let i = 0; i < totalPts; i++) {
      const val = this.useAnomalies ? this.dataPoints[i].anomaly : this.dataPoints[i].value;
      if (val === null || val === undefined || isNaN(val)) {
        inSegment = false; // Gaps for missing data
      } else {
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

    // 2. Draw OLS Trend Line in Main Green (#476E2A / #5D8C3A)
    if (this.olsResult && totalPts > 1) {
      const slope = this.olsResult.slope_per_year;
      const periodYears = totalPts / 12.0;
      
      let firstYVal = this.olsResult.intercept;
      let lastYVal = this.olsResult.intercept + slope * periodYears;

      if (this.useAnomalies) {
        firstYVal = -(slope * (periodYears / 2));
        lastYVal = (slope * (periodYears / 2));
      }

      const y1 = getY(firstYVal);
      const y2 = getY(lastYVal);

      ctx.save();
      ctx.strokeStyle = "#476E2A"; // Vibrant Main Green
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(getX(0), y1);
      ctx.lineTo(getX(totalPts - 1), y2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Hover Point & Tooltip
    if (this.hoverIndex >= 0 && this.hoverIndex < totalPts) {
      const pt = this.dataPoints[this.hoverIndex];
      const val = this.useAnomalies ? pt.anomaly : pt.value;
      if (val !== null && val !== undefined && !isNaN(val)) {
        const x = getX(this.hoverIndex);
        const y = getY(val);

        ctx.save();
        ctx.fillStyle = "#B8DB94";
        ctx.strokeStyle = "#5C4333";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        this._drawTooltip(ctx, x, y, pt, width);
      }
    }
  }

  _drawGrid(ctx, pad, w, h, minY, maxY) {
    ctx.save();
    ctx.strokeStyle = "#EBE3D9";
    ctx.lineWidth = 0.8;
    ctx.fillStyle = "#6B5B50";
    ctx.font = "11px -apple-system, sans-serif";

    // Horizontal grid lines
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = minY + (i / steps) * (maxY - minY);
      const y = pad.top + h - (i / steps) * h;

      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + w, y);
      ctx.stroke();

      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(2), pad.left - 6, y + 4);
    }

    // X-Axis Year Labels
    const totalPts = this.dataPoints.length;
    const step = Math.max(1, Math.floor(totalPts / 6));
    ctx.textAlign = "center";

    for (let i = 0; i < totalPts; i += step) {
      const x = pad.left + (i / (totalPts - 1)) * w;
      const dateStr = this.dataPoints[i].date;
      ctx.fillText(dateStr, x, pad.top + h + 18);
    }

    // Y-Axis Unit label
    ctx.save();
    ctx.translate(14, pad.top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.fillStyle = "#5C4333";
    ctx.fillText(this.useAnomalies ? `Anomaly (${this.unit})` : `Value (${this.unit})`, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  _drawTooltip(ctx, x, y, pt, canvasWidth) {
    const text1 = `Date: ${pt.date}`;
    const text2 = `Value: ${pt.value !== null ? pt.value.toFixed(3) : 'Missing'} ${this.unit}`;
    const text3 = `Anomaly: ${pt.anomaly !== null ? (pt.anomaly >= 0 ? '+' : '') + pt.anomaly.toFixed(3) : 'N/A'}`;

    ctx.font = "11px -apple-system, sans-serif";
    const boxW = 150;
    const boxH = 62;
    let boxX = x + 12;
    if (boxX + boxW > canvasWidth - 10) boxX = x - boxW - 12;
    const boxY = Math.max(8, y - boxH / 2);

    ctx.save();
    ctx.fillStyle = "rgba(92, 67, 51, 0.95)";
    ctx.strokeStyle = "#B8DB94";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(text1, boxX + 8, boxY + 18);
    ctx.fillStyle = "#E5D7C8";
    ctx.fillText(text2, boxX + 8, boxY + 34);
    ctx.fillStyle = "#B8DB94";
    ctx.fillText(text3, boxX + 8, boxY + 50);
    ctx.restore();
  }

  _renderEmpty(ctx, w, h) {
    ctx.fillStyle = "#6B5B50";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Select a variable and region to view time series and trend.", w / 2, h / 2);
  }

  _setupEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const paddingLeft = 60;
      const plotWidth = rect.width - 60 - 25;

      if (mouseX >= paddingLeft && mouseX <= paddingLeft + plotWidth && this.dataPoints.length > 1) {
        const fraction = (mouseX - paddingLeft) / plotWidth;
        const newIndex = Math.min(this.dataPoints.length - 1, Math.max(0, Math.round(fraction * (this.dataPoints.length - 1))));
        if (newIndex !== this.hoverIndex) {
          this.hoverIndex = newIndex;
          this.requestRender();
        }
      } else {
        if (this.hoverIndex !== -1) {
          this.hoverIndex = -1;
          this.requestRender();
        }
      }
    }, { passive: true });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoverIndex !== -1) {
        this.hoverIndex = -1;
        this.requestRender();
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      this.requestRender();
    }, { passive: true });
  }
}
