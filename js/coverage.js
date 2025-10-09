// Coverage layers module for Mapillary, Panoramax, KartaView, Mapilio

import { matchesMapillaryFilterCriteria, matchesPanoramaxFilterCriteria, matchesMapilioFilterCriteria } from './utils.js';

export class CoverageManager {
    constructor(map, baseMaps) {
        this.map = map;
        this.baseMaps = baseMaps;
        this.accessToken = 'MLY|31706646702259607|13ea77823b67451ce0704c521dcbf67f';
        this.mapillaryLayer = null;
        this.panoramaxLayer = null;
        this.kartaviewLayer = null;
        this.mapilioLayer = null;
        this.layerControl = null;
        this.overlayMaps = {};
        this.greyOverlay = null;
        
        this.init();
    }

    init() {
        this.setupKartaviewLayer();
        this.setupFilterControls();
        this.setupGreyOverlay();
        // Don't setup layers control here - wait for initializeLayers()
    }

    setupGreyOverlay() {
        // Create a grey overlay pane
        this.greyOverlay = L.rectangle(
            [[-90, -180], [90, 180]], // Cover entire world
            {
                color: 'transparent',
                fillColor: '#555555',
                fillOpacity: 0.3,
                interactive: false,
                pane: 'overlayPane'
            }
        );
    }

    updateGreyOverlay() {
        const zoomLevel = this.map.getZoom();
        const anyCoverageLayerEnabled = 
            (this.mapillaryLayer && this.map.hasLayer(this.mapillaryLayer)) ||
            (this.panoramaxLayer && this.map.hasLayer(this.panoramaxLayer)) ||
            (this.kartaviewLayer && this.map.hasLayer(this.kartaviewLayer)) ||
            (this.mapilioLayer && this.map.hasLayer(this.mapilioLayer));
        
        // Show grey overlay if any coverage layer is enabled and zoom is too low
        if (anyCoverageLayerEnabled && zoomLevel < 13) {
            if (!this.map.hasLayer(this.greyOverlay)) {
                this.greyOverlay.addTo(this.map);
                this.greyOverlay.bringToBack();
            }
        } else {
            if (this.map.hasLayer(this.greyOverlay)) {
                this.map.removeLayer(this.greyOverlay);
            }
        }
    }

    setupKartaviewLayer() {
        // Kartaview Layer initialization
        this.kartaviewLayer = L.tileLayer('https://api.openstreetcam.org/2.0/sequence/tiles/{x}/{y}/{z}.png', {
            maxNativeZoom: 14,
            maxZoom: 19,
            minZoom: 13,
            attribution: '<a href="https://kartaview.org">KartaView</a>'
        });
    }

    setupFilterControls() {
        // Custom Filter Control
        const FilterControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function (map) {
                const container = L.DomUtil.create('div', 'leaflet-control-filters');
                container.innerHTML = `
                    <div class="zoom-tip" id="zoomTip"></div>
                    <label>Start Date: <input type="date" id="startDate"></label>
                    <div style="display: flex; gap: 2px; margin: 5px 0;">
                        <button type="button" class="date-preset-btn" data-months="1">1 Month</button>
                        <button type="button" class="date-preset-btn" data-months="6">6 Months</button>
                        <button type="button" class="date-preset-btn" data-months="12">1 Year</button>
                    </div>
                    <label>End Date: <input type="date" id="endDate"></label>
                    <label style="display: block; margin: 5px 0;">
                        <div style="display: block; margin-bottom: 3px;">Image Type:</div>
                        <div style="display: flex; gap: 2px; width: 100%; box-sizing: border-box;">
                            <button type="button" class="image-type-btn active" data-type="all">All</button>
                            <button type="button" class="image-type-btn" data-type="classic">Classic</button>
                            <button type="button" class="image-type-btn" data-type="360">360°</button>
                        </div>
                    </label>
                    <label><input type="text" id="mapillaryUserId" placeholder="Mapillary User ID"></label>
                    <label><input type="text" id="panoramaxUsername" placeholder="Panoramax Account ID"></label>
                    <label><input type="text" id="mapilioUserId" placeholder="Mapilio User ID"></label>
                    <button id="applyFiltersBtn">Apply Filters</button>
                `;
                L.DomEvent.disableClickPropagation(container);
                return container;
            }
        });

        // Toggle button control to hide/show filters
        const ToggleFilterControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function (map) {
                const btn = L.DomUtil.create('button', '');
                btn.id = 'toggleFilterBtn';
                btn.textContent = 'Show Coverage Filters Menu';
                btn.style.background = '#fff';
                btn.style.padding = '6px';
                btn.style.border = 'none';
                btn.style.borderRadius = '5px';
                btn.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
                btn.style.cursor = 'pointer';
                btn.style.color = 'black';
                btn.onclick = function () {
                    const filterDiv = document.querySelector('.leaflet-control-filters');
                    const bottomControls = document.querySelector('.leaflet-bottom');
                    const isHidden = filterDiv.style.display === 'none' || 
                                  (filterDiv.style.display === '' && window.getComputedStyle(filterDiv).display === 'none');
                    if (isHidden) {
                        filterDiv.style.display = 'block';
                        btn.textContent = 'Hide Coverage Filters Menu';
                        // Hide bottom controls on mobile when filter menu is open
                        if (window.innerWidth <= 600 || (window.innerHeight <= 450 && window.innerWidth > window.innerHeight)) {
                            if (bottomControls) {
                                bottomControls.classList.add('hidden-on-mobile');
                            }
                        }
                    } else {
                        filterDiv.style.display = 'none';
                        btn.textContent = 'Show Coverage Filters Menu';
                        // Show bottom controls again when filter menu is closed
                        if (bottomControls) {
                            bottomControls.classList.remove('hidden-on-mobile');
                        }
                    }
                };
                L.DomEvent.disableClickPropagation(btn); // Prevent map interactions
                return btn;
            }
        });

        this.map.addControl(new ToggleFilterControl());
        this.map.addControl(new FilterControl());
    }

    setupLayersControl() {
        // Overlay Maps for Leaflet Layer Control
        this.overlayMaps = {
            "Mapillary Coverage": null,
            "Panoramax Coverage": null,
            "KartaView Coverage*": this.kartaviewLayer,
            "Mapilio Coverage": null
        };

        this.refreshLayerControl();
        this.setupLayersControlMobileBehavior();
    }

    initializeMapillaryLayer(filters = {}) {
        if (this.mapillaryLayer) this.map.removeLayer(this.mapillaryLayer);
        this.mapillaryLayer = L.vectorGrid.protobuf(
            `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${this.accessToken}`,
            {
                vectorTileLayerStyles: {
                    overview: function (properties, zoom) {
                        if (!matchesMapillaryFilterCriteria(properties, filters, 'overview')) {
                            return { fillOpacity: 0, opacity: 0 };
                        }
                        return {
                            radius: 0.001,
                            weight: 0,
                            color: '#05cb63',
                            fill: true,
                            fillColor: '#05cb63',
                            fillOpacity: 1
                        };
                    },
                    sequence: function (properties, zoom) {
                        if (!matchesMapillaryFilterCriteria(properties, filters, 'sequence')) {
                            return { opacity: 0 };
                        }
                        return {
                            weight: 0.5,
                            color: '#05cb63',
                            opacity: 0.9
                        };
                    },
                    image: function (properties, zoom) {
                        if (!matchesMapillaryFilterCriteria(properties, filters, 'image')) {
                            return { fillOpacity: 0, opacity: 0 };
                        }
                        return {
                            radius: 0,
                            weight: 0,
                            color: '#05cb63',
                            fill: false,
                            fillColor: '#05cb63',
                            fillOpacity: 0.5
                        };
                    }
                },
                maxNativeZoom: 13,
                maxZoom: 19,
                minZoom: 13,
                attribution: '<a href="https://www.mapillary.com">Mapillary</a>'
            }
        );
    }

    initializePanoramaxLayer(filters = {}) {
        if (this.panoramaxLayer) this.map.removeLayer(this.panoramaxLayer);
        this.panoramaxLayer = L.vectorGrid.protobuf(
            'https://api.panoramax.xyz/api/map/{z}/{x}/{y}.mvt', {
            maxNativeZoom: 13,
            maxZoom: 19,
            minZoom: 13,
            vectorTileLayerStyles: {
                grid: {
                    weight: 0,
                    color: '#555555',
                    fillOpacity: 0,
                    opacity: 0.5
                },
                sequences: function (properties, zoom) {
                    if (zoom < 7) return { opacity: 0 };
                    if (!matchesPanoramaxFilterCriteria(properties, filters, 'sequences')) {
                        return { opacity: 0 };
                    }
                    return {
                        weight: 0.5,
                        color: '#854900',
                        opacity: 0.9
                    };
                },
                pictures: {
                    radius: 3,
                    fill: true,
                    fillColor: '#550dff',
                    fillOpacity: 0.9,
                    stroke: false
                }
            },
            attribution: '<a href="https://panoramax.fr">Panoramax</a>'
        });
    }

    initializeMapilioLayer(filters = {}) {
        if (this.mapilioLayer) {
            this.map.removeLayer(this.mapilioLayer);
        }

        const mapilioUrl = 'https://geo.mapilio.com/map/{x}/{y}/{z}';

        this.mapilioLayer = L.vectorGrid.protobuf(mapilioUrl, {
            vectorTileLayerStyles: {
                // Style for the 'map_roads_line' layer you specified
                'map_roads_line': function(properties, zoom) {
                    if (!matchesMapilioFilterCriteria(properties, filters)) {
                        return { weight: 0, opacity: 0 }; // Hide features that don't pass the filter
                    }
                    // Style for visible features
                    return {
                        weight: 1,
                        color: '#8A2BE2', // Blue-violet color to distinguish from other layers
                        opacity: 0.9
                    };
                },
                'map_points': function(properties, zoom) {
                    // Hide the layer by setting style to transparent and no weight
                    return {
                        weight: 0,
                        opacity: 0,
                        fillOpacity: 0
                    };
                }
            },
            maxNativeZoom: 16,
            minZoom: 13, // The zoom level at which the layer becomes visible
            maxZoom: 19,
            rendererFactory: L.canvas.tile,
            attribution: '<a href="https://mapilio.com" target="_blank">Mapilio</a>'
        });
    }

    refreshLayerControl() {
        if (this.layerControl) {
            this.layerControl.remove();
        }
        
        // Only add overlay layers that exist
        const validOverlayMaps = {};
        if (this.mapillaryLayer) validOverlayMaps["Mapillary Coverage"] = this.mapillaryLayer;
        if (this.panoramaxLayer) validOverlayMaps["Panoramax Coverage"] = this.panoramaxLayer;
        if (this.kartaviewLayer) validOverlayMaps["KartaView Coverage*"] = this.kartaviewLayer;
        if (this.mapilioLayer) validOverlayMaps["Mapilio Coverage"] = this.mapilioLayer;
        
        // Ensure baseMaps is valid before creating layer control
        const baseMaps = this.baseMaps || {};
        
        this.layerControl = L.control.layers(baseMaps, validOverlayMaps).addTo(this.map);
    }

    updateZoomLevelIndicator() {
        const zoomLevel = this.map.getZoom();
        const tipElement = document.getElementById('zoomTip');
        tipElement.textContent = 'Zoom in to enable coverage layers. *Filtering is not available for KartaView.';
        if (zoomLevel < 13) {
            document.getElementById('applyFiltersBtn').disabled = true;
        } else {
            document.getElementById('applyFiltersBtn').disabled = false;
        }
        
        // Update grey overlay based on zoom and active layers
        this.updateGreyOverlay();
    }

    applyFilters() {
        const zoomLevel = this.map.getZoom();
        // Do filtering only if zoom is sufficient
        if (zoomLevel < 13) {
            alert('Zoom in to at least level 13 to apply filters on coverage layers. *Filtering is not available for KartaView.');
            return;
        }
        const mapillaryVisible = this.mapillaryLayer && this.map.hasLayer(this.mapillaryLayer);
        const panoramaxVisible = this.panoramaxLayer && this.map.hasLayer(this.panoramaxLayer);
        const mapilioVisible = this.mapilioLayer && this.map.hasLayer(this.mapilioLayer);
        const kartaviewVisible = this.kartaviewLayer && this.map.hasLayer(this.kartaviewLayer);

        const startDateStr = document.getElementById('startDate').value;
        const endDateStr = document.getElementById('endDate').value;
        const imageType = document.querySelector('.image-type-btn.active').getAttribute('data-type');
        const mapillaryUserIdStr = document.getElementById('mapillaryUserId').value.trim();
        const panoramaxUsernameStr = document.getElementById('panoramaxUsername').value.trim();
        const mapilioUserIdStr = document.getElementById('mapilioUserId').value.trim();

        const filters = {};
        if (startDateStr) filters.startDate = new Date(startDateStr);
        if (endDateStr) {
            filters.endDate = new Date(endDateStr);
            filters.endDate.setHours(23, 59, 59, 999);
        }
        if (imageType !== 'all') filters.imageType = imageType;
        if (mapillaryUserIdStr) filters.mapillaryUserId = parseInt(mapillaryUserIdStr, 10);
        if (panoramaxUsernameStr) filters.panoramaxUsername = panoramaxUsernameStr;
        if (mapilioUserIdStr) filters.mapilioUserId = parseInt(mapilioUserIdStr, 10);

        this.initializeMapillaryLayer(filters);
        this.initializePanoramaxLayer(filters);
        this.initializeMapilioLayer(filters);

        if (mapillaryVisible) {
            this.mapillaryLayer.addTo(this.map);
        }
        if (panoramaxVisible) {
            this.panoramaxLayer.addTo(this.map);
        }
        if (mapilioVisible) {
            this.mapilioLayer.addTo(this.map);
        }
        if (kartaviewVisible) {
            // Kartaview is a standard tile layer, its filtering would require a separate approach
            // For now, it's just toggled
            this.kartaviewLayer.addTo(this.map);
        }
        this.refreshLayerControl();
        
        // Update grey overlay after applying filters
        this.updateGreyOverlay();
    }

    setupLayersControlMobileBehavior() {
        if (!this.layerControl || !this.layerControl._container) {
            return;
        }
        
        const bottomControls = document.querySelector('.leaflet-bottom');
        if (!bottomControls) {
            return;
        }
        
        // Function to check if we're on mobile
        function isMobile() {
            return window.innerWidth <= 600 || (window.innerHeight <= 450 && window.innerWidth > window.innerHeight);
        }
        
        // Function to toggle bottom controls visibility
        function toggleBottomControls(show) {
            if (!isMobile()) return;
            
            if (show) {
                bottomControls.classList.remove('hidden-on-mobile');
            } else {
                bottomControls.classList.add('hidden-on-mobile');
            }
        }
        
        // Use MutationObserver to watch for class changes on the layers control
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const isExpanded = this.layerControl._container.classList.contains('leaflet-control-layers-expanded');
                    toggleBottomControls(!isExpanded);
                }
            });
        });
        
        // Start observing
        observer.observe(this.layerControl._container, {
            attributes: true,
            attributeFilter: ['class']
        });
        
        // Also handle window resize
        window.addEventListener('resize', function() {
            if (!isMobile()) {
                // If not mobile, ensure bottom controls are visible
                bottomControls.classList.remove('hidden-on-mobile');
            }
        });
    }

    setupEventListeners() {
        this.map.whenReady(() => {
            const btn = document.getElementById('applyFiltersBtn');
            if (btn) btn.addEventListener('click', () => this.applyFilters());
            
            // Add event listeners for image type buttons
            const imageTypeButtons = document.querySelectorAll('.image-type-btn');
            imageTypeButtons.forEach((button) => {
                button.addEventListener('click', function() {
                    // Remove active class from all buttons
                    imageTypeButtons.forEach((btn) => {
                        btn.classList.remove('active');
                    });
                    // Add active class to clicked button
                    this.classList.add('active');
                });
            });
            
            // Add event listeners for date preset buttons
            const datePresetButtons = document.querySelectorAll('.date-preset-btn');
            datePresetButtons.forEach((button) => {
                button.addEventListener('click', function() {
                    const months = parseInt(this.getAttribute('data-months'));
                    const today = new Date();
                    const startDate = new Date(today);
                    startDate.setMonth(today.getMonth() - months);
                    
                    // Format date as YYYY-MM-DD for date input
                    const year = startDate.getFullYear();
                    const month = String(startDate.getMonth() + 1).padStart(2, '0');
                    const day = String(startDate.getDate()).padStart(2, '0');
                    const formattedDate = `${year}-${month}-${day}`;
                    
                    // Set the start date input
                    const startDateInput = document.getElementById('startDate');
                    if (startDateInput) {
                        startDateInput.value = formattedDate;
                    }
                });
            });
            
            // Initialize zoom tip and disable filters if zoom too low
            this.updateZoomLevelIndicator();
            
            // Also setup layers control behavior here as a fallback
            setTimeout(() => this.setupLayersControlMobileBehavior(), 200);
        });
        
        this.map.on('zoomend', () => this.updateZoomLevelIndicator());
        
        // Listen for overlay layers being added or removed
        this.map.on('overlayadd', () => {
            this.updateGreyOverlay();
        });
        
        this.map.on('overlayremove', () => {
            this.updateGreyOverlay();
        });
    }

    // Initialize layers
    initializeLayers() {
        this.initializeMapillaryLayer();
        this.initializePanoramaxLayer();
        this.initializeMapilioLayer({});
        this.setupLayersControl();
        this.setupEventListeners();
    }

    // Check if any coverage layer is currently enabled
    isAnyCoverageLayerEnabled() {
        const mapillaryEnabled = this.mapillaryLayer && this.map.hasLayer(this.mapillaryLayer);
        const panoramaxEnabled = this.panoramaxLayer && this.map.hasLayer(this.panoramaxLayer);
        const mapilioEnabled = this.mapilioLayer && this.map.hasLayer(this.mapilioLayer);
        
        return mapillaryEnabled || panoramaxEnabled || mapilioEnabled;
    }

    // Get which coverage layers are currently enabled
    getEnabledCoverageLayers() {
        return {
            mapillary: this.mapillaryLayer && this.map.hasLayer(this.mapillaryLayer),
            panoramax: this.panoramaxLayer && this.map.hasLayer(this.panoramaxLayer),
            mapilio: this.mapilioLayer && this.map.hasLayer(this.mapilioLayer)
        };
    }

    // Get active filters from the coverage menu
    getActiveFilters() {
        const startDateStr = document.getElementById('startDate').value;
        const endDateStr = document.getElementById('endDate').value;
        const imageType = document.querySelector('.image-type-btn.active')?.getAttribute('data-type') || 'all';
        const mapillaryUserIdStr = document.getElementById('mapillaryUserId').value.trim();
        const panoramaxUsernameStr = document.getElementById('panoramaxUsername').value.trim();
        const mapilioUserIdStr = document.getElementById('mapilioUserId').value.trim();

        const filters = {};
        if (startDateStr) filters.startDate = new Date(startDateStr);
        if (endDateStr) {
            filters.endDate = new Date(endDateStr);
            filters.endDate.setHours(23, 59, 59, 999);
        }
        if (imageType !== 'all') filters.imageType = imageType;
        if (mapillaryUserIdStr) filters.mapillaryUserId = parseInt(mapillaryUserIdStr, 10);
        if (panoramaxUsernameStr) filters.panoramaxUsername = panoramaxUsernameStr;
        if (mapilioUserIdStr) filters.mapilioUserId = parseInt(mapilioUserIdStr, 10);

        return filters;
    }

    // Fetch Mapillary coverage data for a given bounding box
    async fetchMapillaryCoverageForBounds(bbox) {
        // bbox format: { minLat, minLng, maxLat, maxLng }
        const filters = this.getActiveFilters();
        
        // Calculate which tiles we need at zoom level 14
        const zoom = 14;
        const tiles = this.getTilesForBounds(bbox, zoom);
        
        console.log(`Fetching Mapillary coverage for ${tiles.length} tiles at zoom ${zoom}`);
        
        // Fetch all tiles
        const tilePromises = tiles.map(tile => 
            this.fetchMapillaryTile(tile.x, tile.y, tile.z)
        );
        
        try {
            const tileResults = await Promise.all(tilePromises);
            
            // Combine all sequences from all tiles
            const allSequences = [];
            tileResults.forEach(sequences => {
                if (sequences && sequences.length > 0) {
                    allSequences.push(...sequences);
                }
            });
            
            console.log(`Fetched ${allSequences.length} Mapillary sequences`);
            
            // Apply filters to sequences
            const filteredSequences = allSequences.filter(seq => {
                return matchesMapillaryFilterCriteria(seq.properties, filters, 'sequence');
            });
            
            console.log(`After filtering: ${filteredSequences.length} sequences`);
            
            return filteredSequences;
        } catch (error) {
            console.error('Error fetching Mapillary coverage:', error);
            throw error;
        }
    }

    // Calculate which tiles are needed for a bounding box at a given zoom level
    getTilesForBounds(bbox, zoom) {
        const tiles = [];
        
        // Convert lat/lng to tile coordinates
        const minTile = this.latLngToTile(bbox.minLat, bbox.minLng, zoom);
        const maxTile = this.latLngToTile(bbox.maxLat, bbox.maxLng, zoom);
        
        // Generate all tiles in the range
        for (let x = Math.min(minTile.x, maxTile.x); x <= Math.max(minTile.x, maxTile.x); x++) {
            for (let y = Math.min(minTile.y, maxTile.y); y <= Math.max(minTile.y, maxTile.y); y++) {
                tiles.push({ x, y, z: zoom });
            }
        }
        
        return tiles;
    }

    // Convert lat/lng to tile coordinates
    latLngToTile(lat, lng, zoom) {
        const n = Math.pow(2, zoom);
        const x = Math.floor((lng + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x, y };
    }

    // Fetch a single Mapillary tile and extract sequences
    async fetchMapillaryTile(x, y, z) {
        const url = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${this.accessToken}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Failed to fetch tile ${z}/${x}/${y}: ${response.status}`);
                return [];
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const tile = new VectorTile(new Pbf(arrayBuffer));
            
            // Extract sequences from the tile
            const sequences = [];
            
            // Check if sequence layer exists
            if (tile.layers.sequence) {
                const layer = tile.layers.sequence;
                
                for (let i = 0; i < layer.length; i++) {
                    const feature = layer.feature(i);
                    const geom = feature.loadGeometry();
                    
                    // Convert tile coordinates to lat/lng
                    const coordinates = [];
                    geom.forEach(ring => {
                        ring.forEach(point => {
                            const latLng = this.tilePointToLatLng(point.x, point.y, x, y, z, layer.extent);
                            coordinates.push([latLng.lng, latLng.lat]);
                        });
                    });
                    
                    if (coordinates.length > 0) {
                        sequences.push({
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: coordinates
                            },
                            properties: feature.properties
                        });
                    }
                }
            }
            
            return sequences;
        } catch (error) {
            console.warn(`Error fetching tile ${z}/${x}/${y}:`, error);
            return [];
        }
    }

    // Convert tile pixel coordinates to lat/lng
    tilePointToLatLng(x, y, tileX, tileY, zoom, extent) {
        const n = Math.pow(2, zoom);
        const lng = (tileX + x / extent) / n * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + y / extent) / n)));
        const lat = latRad * 180 / Math.PI;
        return { lat, lng };
    }

    // Fetch Panoramax coverage data for a given bounding box
    async fetchPanoramaxCoverageForBounds(bbox) {
        const filters = this.getActiveFilters();
        
        // Calculate which tiles we need at zoom level 14
        const zoom = 14;
        const tiles = this.getTilesForBounds(bbox, zoom);
        
        console.log(`Fetching Panoramax coverage for ${tiles.length} tiles at zoom ${zoom}`);
        
        // Fetch all tiles
        const tilePromises = tiles.map(tile => 
            this.fetchPanoramaxTile(tile.x, tile.y, tile.z)
        );
        
        try {
            const tileResults = await Promise.all(tilePromises);
            
            // Combine all sequences from all tiles
            const allSequences = [];
            tileResults.forEach(sequences => {
                if (sequences && sequences.length > 0) {
                    allSequences.push(...sequences);
                }
            });
            
            console.log(`Fetched ${allSequences.length} Panoramax sequences`);
            
            // Apply filters to sequences
            const filteredSequences = allSequences.filter(seq => {
                return matchesPanoramaxFilterCriteria(seq.properties, filters, 'sequences');
            });
            
            console.log(`After filtering: ${filteredSequences.length} Panoramax sequences`);
            
            return filteredSequences;
        } catch (error) {
            console.error('Error fetching Panoramax coverage:', error);
            throw error;
        }
    }

    // Fetch a single Panoramax tile and extract sequences
    async fetchPanoramaxTile(x, y, z) {
        const url = `https://api.panoramax.xyz/api/map/${z}/${x}/${y}.mvt`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Failed to fetch Panoramax tile ${z}/${x}/${y}: ${response.status}`);
                return [];
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const tile = new VectorTile(new Pbf(arrayBuffer));
            
            // Extract sequences from the tile
            const sequences = [];
            
            // Check if sequences layer exists
            if (tile.layers.sequences) {
                const layer = tile.layers.sequences;
                
                for (let i = 0; i < layer.length; i++) {
                    const feature = layer.feature(i);
                    const geom = feature.loadGeometry();
                    
                    // Convert tile coordinates to lat/lng
                    const coordinates = [];
                    geom.forEach(ring => {
                        ring.forEach(point => {
                            const latLng = this.tilePointToLatLng(point.x, point.y, x, y, z, layer.extent);
                            coordinates.push([latLng.lng, latLng.lat]);
                        });
                    });
                    
                    if (coordinates.length > 0) {
                        sequences.push({
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: coordinates
                            },
                            properties: feature.properties
                        });
                    }
                }
            }
            
            return sequences;
        } catch (error) {
            console.warn(`Error fetching Panoramax tile ${z}/${x}/${y}:`, error);
            return [];
        }
    }

    // Fetch Mapilio coverage data for a given bounding box
    async fetchMapilioCoverageForBounds(bbox) {
        const filters = this.getActiveFilters();
        
        // Calculate which tiles we need at zoom level 14
        const zoom = 14;
        const tiles = this.getTilesForBounds(bbox, zoom);
        
        console.log(`Fetching Mapilio coverage for ${tiles.length} tiles at zoom ${zoom}`);
        
        // Fetch all tiles
        const tilePromises = tiles.map(tile => 
            this.fetchMapilioTile(tile.x, tile.y, tile.z)
        );
        
        try {
            const tileResults = await Promise.all(tilePromises);
            
            // Combine all sequences from all tiles
            const allSequences = [];
            tileResults.forEach(sequences => {
                if (sequences && sequences.length > 0) {
                    allSequences.push(...sequences);
                }
            });
            
            console.log(`Fetched ${allSequences.length} Mapilio sequences`);
            
            // Apply filters to sequences
            const filteredSequences = allSequences.filter(seq => {
                return matchesMapilioFilterCriteria(seq.properties, filters);
            });
            
            console.log(`After filtering: ${filteredSequences.length} Mapilio sequences`);
            
            return filteredSequences;
        } catch (error) {
            console.error('Error fetching Mapilio coverage:', error);
            throw error;
        }
    }

    // Fetch a single Mapilio tile and extract sequences
    async fetchMapilioTile(x, y, z) {
        const url = `https://geo.mapilio.com/map/${x}/${y}/${z}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Failed to fetch Mapilio tile ${z}/${x}/${y}: ${response.status}`);
                return [];
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const tile = new VectorTile(new Pbf(arrayBuffer));
            
            // Extract sequences from the tile
            const sequences = [];
            
            // Check if map_roads_line layer exists
            if (tile.layers.map_roads_line) {
                const layer = tile.layers.map_roads_line;
                
                for (let i = 0; i < layer.length; i++) {
                    const feature = layer.feature(i);
                    const geom = feature.loadGeometry();
                    
                    // Convert tile coordinates to lat/lng
                    const coordinates = [];
                    geom.forEach(ring => {
                        ring.forEach(point => {
                            const latLng = this.tilePointToLatLng(point.x, point.y, x, y, z, layer.extent);
                            coordinates.push([latLng.lng, latLng.lat]);
                        });
                    });
                    
                    if (coordinates.length > 0) {
                        sequences.push({
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: coordinates
                            },
                            properties: feature.properties
                        });
                    }
                }
            }
            
            return sequences;
        } catch (error) {
            console.warn(`Error fetching Mapilio tile ${z}/${x}/${y}:`, error);
            return [];
        }
    }

    // Calculate what percentage of a road is covered by street-level imagery sequences
    calculateRoadCoveragePercentage(roadFeature, sequences, proximityThreshold = 20) {
        if (!roadFeature || !roadFeature.geometry || roadFeature.geometry.type !== 'LineString') {
            return 0;
        }
        
        if (!sequences || sequences.length === 0) {
            return 0;
        }
        
        const roadLine = turf.lineString(roadFeature.geometry.coordinates);
        const roadLength = turf.length(roadLine, { units: 'meters' });
        
        if (roadLength === 0) return 0;
        
        // Sample points along the road (every 10 meters)
        const sampleInterval = 10; // meters
        const numSamples = Math.max(Math.ceil(roadLength / sampleInterval), 2);
        
        let coveredSamples = 0;
        
        for (let i = 0; i < numSamples; i++) {
            const distance = (i / (numSamples - 1)) * roadLength;
            const point = turf.along(roadLine, distance, { units: 'meters' });
            
            // Check if this point is within proximity threshold of any sequence
            const isCovered = sequences.some(sequence => {
                try {
                    const sequenceLine = turf.lineString(sequence.geometry.coordinates);
                    const nearestPoint = turf.nearestPointOnLine(sequenceLine, point);
                    const distanceToSequence = turf.distance(point, nearestPoint, { units: 'meters' });
                    return distanceToSequence <= proximityThreshold;
                } catch (error) {
                    console.warn('Error calculating distance to sequence:', error);
                    return false;
                }
            });
            
            if (isCovered) {
                coveredSamples++;
            }
        }
        
        const coveragePercentage = (coveredSamples / numSamples) * 100;
        return coveragePercentage;
    }
}
