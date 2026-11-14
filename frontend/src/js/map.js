/**
 * Trend Detector — City Trend Map (Leaflet)
 * Displays the 8 observation cities at their real coordinates.
 * Markers dynamically visualize trend direction (arrow + color)
 * and statistical significance.
 * Calm, professional styling with green primary and brown secondary.
 */

export class RegionMap {
  constructor(mapContainerId, onCitySelect) {
    this.containerId = mapContainerId;
    this.onCitySelect = onCitySelect;
    this.map = null;
    this.markers = {};
    this.activeCityId = 'lahore';
    this.currentTrends = {};
  }

  init(regions) {
    if (!window.L) {
      console.warn("Leaflet library not loaded");
      return;
    }

    const container = document.getElementById(this.containerId);
    if (!container) return;

    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    try {
      // Centered on Pakistan
      this.map = L.map(this.containerId, {
        center: [30.2, 70.8],
        zoom: 5,
        minZoom: 4,
        maxZoom: 10,
        scrollWheelZoom: false
      });

      // OpenStreetMap clean tiles (styled dark via CSS filter)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
      }).addTo(this.map);

      this.renderCities(regions);
    } catch (e) {
      console.error("Map initialization error:", e);
    }
  }

  renderCities(regions) {
    if (!this.map || !regions) return;

    // Clear existing
    Object.values(this.markers).forEach(m => m.remove());
    this.markers = {};

    regions.forEach(city => {
      if (city.lat === undefined || city.lon === undefined) return;

      const cityId = city.id.toLowerCase();
      const trend = this.currentTrends[cityId] || { direction: 'stable', tier: 'no_trend' };

      const markerIcon = this._createMarkerIcon(cityId, trend, cityId === this.activeCityId);
      const marker = L.marker([city.lat, city.lon], { icon: markerIcon }).addTo(this.map);

      const tooltipContent = `
        <div style="font-family:'Plus Jakarta Sans', -apple-system, sans-serif; font-size:11px; line-height:1.4; padding:3px; background:#0E2B23; color:#E4F0E8; border-radius:4px;">
          <b style="color:#FFFFFF; font-size:12px;">${city.name}</b> (${city.lat.toFixed(2)}°N, ${city.lon.toFixed(2)}°E)<br>
          <span style="color:#8EB69B;">Trend: <b>${trend.direction}</b> (${trend.tier.replace('_', ' ')})</span>
        </div>
      `;
      marker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, -10], className: 'custom-dark-tooltip' });

      marker.on('click', () => {
        this.setActiveCity(cityId);
        if (this.onCitySelect) {
          this.onCitySelect(cityId);
        }
      });

      this.markers[cityId] = marker;
    });
  }

  updateTrends(cityTrendsMap) {
    this.currentTrends = cityTrendsMap || {};
    Object.entries(this.markers).forEach(([cityId, marker]) => {
      const trend = this.currentTrends[cityId] || { direction: 'stable', tier: 'no_trend' };
      const isSelected = cityId === this.activeCityId;
      marker.setIcon(this._createMarkerIcon(cityId, trend, isSelected));
    });
  }

  setActiveCity(cityId) {
    this.activeCityId = cityId.toLowerCase();
    Object.entries(this.markers).forEach(([id, marker]) => {
      const trend = this.currentTrends[id] || { direction: 'stable', tier: 'no_trend' };
      const isSelected = id === this.activeCityId;
      marker.setIcon(this._createMarkerIcon(id, trend, isSelected));
    });
  }

  _createMarkerIcon(cityId, trend, isSelected) {
    const dir = trend.direction || 'stable';

    // Color based on direction: primary green for increasing, secondary brown for decreasing
    let bg = '#153A30'; // stable dark green
    let arrow = '→';
    let textColor = '#8EB69B';
    let borderColor = '#1B453A';

    if (dir === 'increasing') {
      bg = '#245B4D'; // primary forest green
      arrow = '↑';
      textColor = '#DAF1DE';
      borderColor = '#DAF1DE';
    } else if (dir === 'decreasing') {
      bg = '#3E2522'; // secondary espresso brown
      arrow = '↓';
      textColor = '#FFE0B2';
      borderColor = '#D3A376';
    }

    const outline = isSelected ? 'outline: 2px solid #D3A376; outline-offset: 2px;' : '';

    const html = `
      <div style="
        background: ${bg};
        color: ${textColor};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 13px;
        border: 1.5px solid ${borderColor};
        ${outline}
      ">${arrow}</div>
    `;

    return L.divIcon({
      html,
      className: `custom-city-marker-${cityId}`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }
}
