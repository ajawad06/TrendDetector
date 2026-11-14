/**
 * Trend Detector — Pakistan Regional Interactive Map
 * SRD §15 FR-PAK-001, FR-PAK-002, FR-PAK-006:
 * Clean, fast OpenStreetMap/Esri tiles with zero API key requirement.
 */

export class RegionMap {
  constructor(mapContainerId, onRegionSelect) {
    this.containerId = mapContainerId;
    this.onRegionSelect = onRegionSelect;
    this.map = null;
    this.layers = {};
    this.activeRegionId = 'pakistan';
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
        center: [30.3753, 69.3451],
        zoom: 5,
        minZoom: 4,
        maxZoom: 9,
        scrollWheelZoom: false // prevents accidental scroll trap
      });

      // Free, clean, fast tiles with NO API key requirement
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
      }).addTo(this.map);

      this.renderRegions(regions);
    } catch (e) {
      console.error("Map initialization error:", e);
    }
  }

  renderRegions(regions) {
    if (!this.map || !regions) return;

    regions.forEach(region => {
      if (!region.bbox) return;

      const bounds = [
        [region.bbox.south, region.bbox.west],
        [region.bbox.north, region.bbox.east]
      ];

      const isCountry = region.id === 'pakistan';
      const color = isCountry ? '#5C4333' : '#CBAB8D';

      const rect = L.rectangle(bounds, {
        color: color,
        weight: isCountry ? 2.5 : 1.8,
        fillColor: '#B8DB94',
        fillOpacity: region.id === this.activeRegionId ? 0.35 : 0.08,
        dashArray: isCountry ? null : '4, 4'
      }).addTo(this.map);

      rect.bindTooltip(`<b>${region.name}</b><br><span style="font-size:11px">${region.boundary_type.replace('_', ' ')}</span>`, {
        permanent: false,
        direction: 'center',
        className: 'custom-map-tooltip'
      });

      rect.on('click', () => {
        this.setActiveRegion(region.id);
        if (this.onRegionSelect) {
          this.onRegionSelect(region.id);
        }
      });

      rect.on('mouseover', () => {
        rect.setStyle({ fillOpacity: 0.45, weight: 3 });
      });

      rect.on('mouseout', () => {
        const isCurrent = region.id === this.activeRegionId;
        rect.setStyle({
          fillOpacity: isCurrent ? 0.35 : 0.08,
          weight: isCountry ? 2.5 : 1.8
        });
      });

      this.layers[region.id] = rect;
    });
  }

  setActiveRegion(regionId) {
    this.activeRegionId = regionId;
    Object.entries(this.layers).forEach(([id, layer]) => {
      const isSelected = id === regionId;
      layer.setStyle({
        fillOpacity: isSelected ? 0.35 : 0.08,
        color: isSelected ? '#5C4333' : (id === 'pakistan' ? '#5C4333' : '#CBAB8D'),
        weight: isSelected ? 3 : (id === 'pakistan' ? 2.5 : 1.8)
      });
    });
  }
}
