// Map initialization and controls module

import { generateServiceUrl, debounce } from './utils.js';

export class MapManager {
    constructor() {
        this.map = null;
        this.controlsContainer = null;
        this.controlsDiv = null;
        this.drawnItems = null;
        this.drawControl = null;
        this.drawControlEnabled = false;
        this.contextMenu = null;
        this.contextMenuVisible = false;
        this.lastClickLatLng = null;
        this.hashUpdateTimeout = null;
        
        this.init();
    }

    init() {
        this.initializeMap();
        this.setupBasemaps();
        this.setupEventListeners();
        this.setupContextMenu();
        this.setupControls();
        this.setupDrawing();
    }

    initializeMap() {
        // Initialize the map with wraparound enabled
        this.map = L.map('map', {
            worldCopyJump: true // Enable world wraparound
        });

        // Initialize map with default view or restore from hash
        if (!this.restoreMapViewFromUrlHash()) {
            this.map.setView([51.505, -0.09], 13); // Default view if no hash
        }
    }

    setupBasemaps() {
        // Define basemap layers
        this.baseMaps = {
            "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }),
            "CartoDB Positron": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }),
            "CartoDB Dark Matter": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }),
            "CartoDB Voyager": L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }),
            "Esri World Imagery": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }),
            "Esri World Street Map": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
            }),
            "Esri World Topographic": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles &copy; Esri &mdash; Source: USGS, Esri, TANA, DeLorme, and NPS'
            }),
            "OpenTopoMap": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                maxZoom: 17,
                attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
            }),
            "CyclOSM": L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" title="CyclOSM - Open Bicycle render">CyclOSM</a> | Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            })
        };

        // Add default OpenStreetMap tiles
        this.baseMaps["OpenStreetMap"].addTo(this.map);
    }

    setupEventListeners() {
        // Add event listeners to save map state when view changes
        const debouncedSaveMapState = debounce(() => this.saveMapViewToUrlHash(), 500);
        
        this.map.on('moveend', debouncedSaveMapState);
        this.map.on('zoomend', debouncedSaveMapState);

        // Listen for hash changes (back/forward button navigation)
        window.addEventListener('hashchange', () => {
            this.restoreMapViewFromUrlHash();
        });
    }

    setupContextMenu() {
        this.contextMenu = document.getElementById('contextMenu');
        
        // Add right-click event listener to map
        this.map.on('contextmenu', (e) => this.displayContextMenu(e));

        // Alternative method: Add direct event listener to map container
        const mapContainer = this.map.getContainer();
        mapContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const latlng = this.map.containerPointToLatLng([e.offsetX, e.offsetY]);
            const fakeEvent = {
                latlng: latlng,
                originalEvent: e,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
            };
            this.displayContextMenu(fakeEvent);
        });

        // Add long-press event listener for touch devices
        let touchStartTime = 0;
        let touchTimer = null;
        
        this.map.on('touchstart', (e) => {
            touchStartTime = Date.now();
            touchTimer = setTimeout(() => {
                this.displayContextMenu(e);
            }, 500); // 500ms long press
        });

        this.map.on('touchend', (e) => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });

        this.map.on('touchmove', (e) => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });

        // Hide context menu when clicking elsewhere
        this.map.on('click', () => this.hideContextMenu());
        this.map.on('zoomstart', () => this.hideContextMenu());
        this.map.on('movestart', () => this.hideContextMenu());

        // Add click event listeners to context menu items
        document.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.lastClickLatLng) {
                    const service = item.getAttribute('data-service');
                    const zoom = this.map.getZoom();
                    const url = generateServiceUrl(service, this.lastClickLatLng.lat, this.lastClickLatLng.lng, zoom, this.map.getCenter());
                    window.open(url, '_blank');
                }
                this.hideContextMenu();
            });
        });

        // Hide context menu when clicking outside
        document.addEventListener('click', (e) => {
            if (this.contextMenuVisible && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
    }

    setupControls() {
        // Debug menu in top-left corner
        this.debugMenuContainer = L.control({ position: 'topleft' });

        this.debugMenuContainer.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar debug-menu-container');
            div.innerHTML = `
                <div style="background: white; border-radius: 4px;">
                    <button id="debugMenuToggle" style="width: 100%; background-color: #6c757d; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; font-size: 14px; margin: 0;">
                        🛠️ Debug Menu
                    </button>
                    <div id="debugMenuContent" style="display: none; padding: 5px; background: white; border-top: 1px solid #ddd; margin-top: 2px;">
                        <button id="downloadButton" style="width: 100%; margin: 2px 0;">Download Overpass Response</button>
                        <button id="uploadOverpassButton" style="width: 100%; margin: 2px 0;">Upload Overpass Response</button>
                        <button id="exportCPPButton" style="width: 100%; margin: 2px 0;">Export OARLib Format</button>
                        <button id="uploadCPPButton" style="width: 100%; margin: 2px 0;">Upload OARLib Solution</button>
                    </div>
                </div>
            `;
            L.DomEvent.disableClickPropagation(div);
            
            return div;
        };

        this.debugMenuContainer.addTo(this.map);

        // Add toggle functionality for debug menu
        setTimeout(() => {
            const debugMenuToggle = document.getElementById('debugMenuToggle');
            const debugMenuContent = document.getElementById('debugMenuContent');
            
            if (debugMenuToggle && debugMenuContent) {
                debugMenuToggle.addEventListener('click', () => {
                    if (debugMenuContent.style.display === 'none') {
                        debugMenuContent.style.display = 'block';
                        debugMenuToggle.textContent = '🛠️ Debug Menu ▼';
                    } else {
                        debugMenuContent.style.display = 'none';
                        debugMenuToggle.textContent = '🛠️ Debug Menu';
                    }
                });
            }
        }, 100);

        // Custom controls container for Route Crafter features
        this.controlsContainer = L.control({ position: 'bottomleft' });

        this.controlsContainer.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar');
            div.innerHTML = `
                <div id="mainControlsDiv" style="padding: 5px; background: white;">
                    <input type="text" id="searchBox" placeholder="Search Map" />
                    <button id="searchButton">Search</button>
                    <br>
                    <select id="searchRules">
                        <option value="landuse=residential|landuse=retail|landuse=commercial|landuse=industrial">Landuse: Residential/Retail/Commercial/Industrial</option>
                        <option value="admin_level=10">Admin Level 10</option>
                        <option value="admin_level=9">Admin Level 9</option>
                        <option value="admin_level=8">Admin Level 8</option>
                        <option value="admin_level=7">Admin Level 7</option>
                        <option value="boundary=neighborhood">Boundary: Neighborhood</option>
                        <option value="boundary=political">Boundary: Political</option>
                        <option value="boundary=place">Boundary: Place</option>
                        <option value="boundary=census">Boundary: Census</option>
                        <option value="place=suburb">Place: Suburb</option>
                        <option value="place=quarter">Place: Quarter</option>
                        <option value="place=postal_code">Place: Postal Code</option>
                        <option value="place=district">Place: District</option>
                        <option value="place=subdistrict">Place: Subdistrict</option>
                        <option value="grid_500m">Grid: 500m × 500m</option>
                        <option value="grid_1km">Grid: 1km × 1km</option>
                        <option value="grid_1500m">Grid: 1.5km × 1.5km</option>
                        <option value="draw_area">Draw Area</option>
                    </select>
                    <button id="fetchButton">Find Areas</button>
                    <br>
                    <button id="previewGPXButton">Fetch Roads</button>
                    <button id="playRouteButton">Play Route</button>
                    <button id="clearButton">Reset</button>
                    <br>
                    <div style="display: flex; align-items: center; margin: 0; padding: 0; box-shadow: none; border: none; background: none;">
                        <label for="bufferSize" style="flex: 1;">Add buffer to selected areas (meters):</label>
                        <input type="number" id="bufferSize" min="1" max="100" value="1" style="width: 80px;">
                    </div>
                    <div style="display: flex; align-items: center; margin: 0; padding: 0; box-shadow: none; border: none; background: none;">
                        <label for="consolidateTolerance" style="flex: 1;">Consolidate intersections tolerance (meters):</label>
                        <input type="number" id="consolidateTolerance" min="1" max="100" value="15" style="width: 80px;">
                    </div>
                    <div style="display: flex; align-items: center; margin: 0; padding: 0; box-shadow: none; border: none; background: none;">
                        <label for="truncateByEdge" style="flex: 1;">Trim roads to polygon boundary</label>
                        <input type="checkbox" id="truncateByEdge" checked>
                    </div>
                    <div style="display: flex; align-items: center; margin: 0; padding: 0; box-shadow: none; border: none; background: none;">
                        <label for="filterMapillaryCoverage" style="flex: 1;">Filter roads with Mapillary coverage</label>
                        <input type="checkbox" id="filterMapillaryCoverage">
                    </div>
                    <div style="display: flex; align-items: center; margin: 0; padding: 0; box-shadow: none; border: none; background: none;">
                        <label for="coverageThreshold" style="flex: 1;">Coverage threshold (%):</label>
                        <input type="number" id="coverageThreshold" min="0" max="100" value="50" style="width: 80px;">
                    </div>
                    <div style="display: flex; align-items: center; margin: 0; padding: 0; box-shadow: none; border: none; background: none;">
                        <label for="proximityThreshold" style="flex: 1;">Proximity threshold (meters):</label>
                        <input type="number" id="proximityThreshold" min="1" max="100" value="20" style="width: 80px;">
                    </div>
                    <div style="display: flex; align-items: center; margin: 0; padding: 0; box-shadow: none; border: none; background: none;">
                        <label for="customFilter" style="flex: 1;">Route filter:</label>
                        <input type="text" id="customFilter" style="width: 100%; margin-left: 10px;" value='[highway][area!~"yes"][highway!~"bridleway|bus_guideway|construction|cycleway|elevator|footway|motorway|motorway_junction|motorway_link|escalator|proposed|platform|raceway|rest_area|path"][access!~"customers|no|private"][public_transport!~"platform"][fee!~"yes"][service!~"drive-through|driveway|parking_aisle"][toll!~"yes"]'>
                    </div>
                    <p id="routeLength"></p>
                </div>
            `;
            L.DomEvent.disableClickPropagation(div); // Prevent map interactions when interacting with the controls
            
            // Store reference to the controls div
            this.controlsDiv = div.querySelector('#mainControlsDiv');
            
            return div;
        };

        this.controlsContainer.addTo(this.map);
    }

    setupDrawing() {
        // Initialize Leaflet.draw for manual area drawing
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);

        this.drawControl = new L.Control.Draw({
            position: 'topleft',
            draw: {
                polygon: {
                    allowIntersection: false,
                    showArea: true,
                    drawError: {
                        color: '#e1e100',
                        message: '<strong>Error!</strong> Shape edges cannot cross!'
                    },
                    shapeOptions: {
                        color: '#bada55',
                        fillColor: '#bada55',
                        fillOpacity: 0.2
                    }
                },
                polyline: false,
                rectangle: {
                    shapeOptions: {
                        color: '#bada55',
                        fillColor: '#bada55',
                        fillOpacity: 0.2
                    }
                },
                circle: false,
                circlemarker: false,
                marker: false
            },
            edit: {
                featureGroup: this.drawnItems,
                remove: true
            }
        });

        // Do not add draw control to map by default - it will be added when "Draw Area" is selected
    }

    enableDrawControl() {
        if (!this.drawControlEnabled) {
            this.map.addControl(this.drawControl);
            this.drawControlEnabled = true;
        }
    }

    disableDrawControl() {
        if (this.drawControlEnabled) {
            this.map.removeControl(this.drawControl);
            this.drawControlEnabled = false;
        }
    }

    displayContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const latlng = e.latlng || e.target.getLatLng();
        this.lastClickLatLng = latlng;
        
        const mapContainer = this.map.getContainer();
        const rect = mapContainer.getBoundingClientRect();
        
        // Calculate position relative to the map container
        let x, y;
        if (e.originalEvent) {
            x = e.originalEvent.clientX - rect.left;
            y = e.originalEvent.clientY - rect.top;
        } else {
            // For touch events
            x = e.originalEvent.touches[0].clientX - rect.left;
            y = e.originalEvent.touches[0].clientY - rect.top;
        }
        
        // Position the context menu
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
        this.contextMenu.style.display = 'block';
        this.contextMenuVisible = true;
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
        this.contextMenuVisible = false;
    }

    saveMapViewToUrlHash() {
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        const hash = `#map=${zoom}/${center.lat.toFixed(6)}/${center.lng.toFixed(6)}`;
        window.location.hash = hash;
    }

    restoreMapViewFromUrlHash() {
        const hash = window.location.hash.substring(1); // Remove the # symbol
        if (hash && hash.startsWith('map=')) {
            const mapPart = hash.substring(4); // Remove 'map=' prefix
            const parts = mapPart.split('/');
            
            if (parts.length === 3) {
                const zoom = parseInt(parts[0]);
                const lat = parseFloat(parts[1]);
                const lng = parseFloat(parts[2]);
                
                if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
                    this.map.setView([lat, lng], zoom);
                    return true; // Successfully restored from hash
                }
            }
        } else if (hash === '') {
            // If hash is empty, restore to default view
            this.map.setView([51.505, -0.09], 13);
            return true;
        }
        return false; // No valid hash data found
    }

    // Getter methods for external access
    getMap() {
        return this.map;
    }

    getBaseMaps() {
        return this.baseMaps;
    }

    getDrawnItems() {
        return this.drawnItems;
    }

    getDrawControl() {
        return this.drawControl;
    }
}
