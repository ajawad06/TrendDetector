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

      // OpenStreetMap tiles, darkened with a CSS filter on the tile pane only (.tiles-dark in components.css)
      // so the map matches the dark UI. CARTO Dark Matter was tried first, but its tiles now come back
      // stamped "API key required" without an account, so the filter approach is used instead.
      container.classList.add('tiles-dark');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
    this.popOrder = {};
    this.popUntil = performance.now() + 700;   // markers pop in once; icon refreshes inside this window keep the animation

    regions.forEach((city, order) => {
      if (city.lat === undefined || city.lon === undefined) return;

      const cityId = city.id.toLowerCase();
      const trend = this.currentTrends[cityId] || { direction: 'stable', tier: 'no_trend' };

      this.popOrder[cityId] = order;
      const markerIcon = this._createMarkerIcon(cityId, trend, cityId === this.activeCityId, order);   // order: staggered pop-in on first render only
      const marker = L.marker([city.lat, city.lon], { icon: markerIcon, title: city.name, alt: city.name, keyboard: true }).addTo(this.map);

      const arrow = trend.direction === 'increasing' ? '↑' : trend.direction === 'decreasing' ? '↓' : '→';
      const tooltipContent = `<div class="map-tip"><b>${city.name}</b><br>${arrow} ${trend.direction}, ${trend.tier.replace('_', ' ')}</div>`;
      marker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, -10], className: 'map-tooltip' });

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
      marker.setIcon(this._createMarkerIcon(cityId, trend, isSelected, this._pop(cityId)));
    });
  }

  _pop(cityId) { return performance.now() < (this.popUntil || 0) ? (this.popOrder?.[cityId] ?? -1) : -1; }

  setActiveCity(cityId) {
    this.activeCityId = cityId.toLowerCase();
    Object.entries(this.markers).forEach(([id, marker]) => {
      const trend = this.currentTrends[id] || { direction: 'stable', tier: 'no_trend' };
      const isSelected = id === this.activeCityId;
      marker.setIcon(this._createMarkerIcon(id, trend, isSelected, this._pop(id)));
    });
  }

  _createMarkerIcon(cityId, trend, isSelected, popOrder = -1) {
    const dir = trend.direction || 'stable';
    const arrow = dir === 'increasing' ? '↑' : dir === 'decreasing' ? '↓' : '→';
    const html = `<div class="pin pin-${dir}${isSelected ? ' is-selected' : ''}${popOrder >= 0 ? ' pin-pop' : ''}"${popOrder >= 0 ? ` style="--i:${popOrder}"` : ''} aria-hidden="true">${arrow}</div>`;
    return L.divIcon({
      html,
      className: 'pin-wrap',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  }
}
