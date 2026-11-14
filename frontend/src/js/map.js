/**
 * Trend Detector — City Trend Map (Leaflet)
 * Displays the 8 observation cities at their real coordinates.
 * Markers dynamically visualize trend direction (arrow + color)
 * and statistical significance (solid = significant, dashed = caution, light = stable).
 * Monochromatic Deep Forest Palette & Dark Mode Glow
 */

export class RegionMap {
  constructor(mapContainerId, onCitySelect) {
    this.containerId = mapContainerId;
    this.onCitySelect = onCitySelect;
    this.map = null;
    this.markers = {};
    this.activeCityId = 'lahore';
    this.currentTrends = {}; // cityId -> { direction, tier, slope_per_year, unit }
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
        <div style="font-family:-apple-system, sans-serif; font-size:12px; line-height:1.4; padding:4px; background:#0B2B26; color:#DAF1DE; border-radius:6px;">
          <b style="color:#FFFFFF; font-size:13px;">${city.name}</b> (${city.lat.toFixed(2)}°N, ${city.lon.toFixed(2)}°E)<br>
          <span style="font-size:11px; color:#8EB69B;">Trend: <b style="color:#DAF1DE;">${trend.direction}</b> (${trend.tier.replace('_', ' ')})</span>
        </div>
      `;
      marker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, -12], className: 'custom-dark-tooltip' });

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
    const tier = trend.tier || 'no_trend';

    // Color based on direction in monochromatic deep forest theme
    let bg = '#163832'; // stable pine
    let arrow = '→';
    let textColor = '#DAF1DE';
    let borderColor = 'rgba(142, 182, 155, 0.4)';

    if (dir === 'increasing') {
      bg = '#235347'; // forest mid
      arrow = '↑';
      textColor = '#DAF1DE';
      borderColor = '#4ADE80';
    } else if (dir === 'decreasing') {
      bg = '#78350F'; // warm deep amber
      arrow = '↓';
      textColor = '#FDBA74';
      borderColor = '#FB923C';
    }

    // Border and Glow based on selection and significance tier
    let boxShadow = '0 2px 8px rgba(0,0,0,0.6)';
    if (isSelected) {
      boxShadow = '0 0 16px rgba(218, 241, 222, 0.8), 0 0 0 3px #DAF1DE';
      borderColor = '#FFFFFF';
    } else if (tier === 'significant') {
      boxShadow = '0 0 10px rgba(142, 182, 155, 0.4)';
    }

    const scale = isSelected ? 'transform: scale(1.22);' : '';

    const html = `
      <div style="
        background: ${bg};
        color: ${textColor};
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 14px;
        border: 2px solid ${borderColor};
        box-shadow: ${boxShadow};
        transition: all 0.25s ease;
        ${scale}
      ">${arrow}</div>
    `;

    return L.divIcon({
      html,
      className: `custom-city-marker-${cityId}`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }
}
