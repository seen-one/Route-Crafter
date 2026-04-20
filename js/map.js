// Map initialization and controls module

import {
    CUSTOM_OVERPASS_ENDPOINT_VALUE,
    OVERPASS_ENDPOINT_GROUPS,
    debounce,
    generateServiceUrl,
    getOverpassEndpointPresets,
    getStoredOverpassEndpoint,
    isValidOverpassEndpoint,
    normalizeOverpassEndpoint,
    saveOverpassEndpoint
} from './utils.js';

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
        this.depotMarker = null;
        this.selectedDepotId = null;
        this.vertexMarkers = [];
        this.toggleMainMenuButton = null;
        this.mainMenuHidden = false;
        this.sidebarResizeFrame = null;
        
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
        this.map.on('contextmenu', (e) => {
            // Store the click location immediately
            this.lastClickLatLng = e.latlng;
            this.displayContextMenu(e);
        });

        // Add long-press event listener for touch devices
        let touchStartTime = 0;
        let touchStartPointCount = 0;
        
        this.map.on('touchstart', (e) => {
            // Only start timer if it's a single touch (not multi-touch)
            const touchCount = e.originalEvent.touches.length;
            if (touchCount === 1) {
                touchStartTime = Date.now();
                touchStartPointCount = 1;
                // Store the touch location
                this.lastClickLatLng = e.latlng;
            } else {
                // Multi-touch detected, cancel any long-press
                touchStartTime = 0;
                touchStartPointCount = touchCount;
            }
        });

        this.map.on('touchend', (e) => {
            // Only trigger context menu if it was a single-touch long-press
            if (touchStartPointCount === 1) {
                const duration = Date.now() - touchStartTime;
                if (duration >= 1000) { // 1 second hold
                    this.displayContextMenu(e);
                }
            }
            touchStartTime = 0;
            touchStartPointCount = 0;
        });

        this.map.on('touchmove', (e) => {
            // Cancel long press if finger moves (regardless of touch count)
            touchStartTime = 0;
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
                    const action = item.getAttribute('data-action');
                    
                    if (action === 'set-depot') {
                        // Handle set depot action
                        this.handleSetDepot(this.lastClickLatLng);
                    } else if (service) {
                        // Handle external service links
                        const zoom = this.map.getZoom();
                        const url = generateServiceUrl(service, this.lastClickLatLng.lat, this.lastClickLatLng.lng, zoom, this.map.getCenter());
                        window.open(url, '_blank');
                    }
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
        // Debug menu in top-left corner (only enable when URL contains debug flag)
        const debugEnabled = (() => {
            try {
                const params = new URLSearchParams(window.location.search);
                return params.has('debug');
            } catch (e) {
                return false;
            }
        })();

        if (debugEnabled) {
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
                            <button id="exportLargestComponentButton" style="width: 100%; margin: 2px 0;">Export Largest Component OARLib</button>
                            <label for="oarlibSolutionTextarea" style="display: block; margin-top: 5px; font-size: 12px;">OARLib Solution:</label>
                            <textarea id="oarlibSolutionTextarea" placeholder="Paste OARLib solution here..." style="width: 100%; min-height: 80px; margin: 2px 0; padding: 5px; font-size: 11px; font-family: monospace; resize: vertical; box-sizing: border-box;"></textarea>
                            <button id="applyCPPSolutionButton" style="width: 100%; margin: 2px 0;">Apply Solution</button>
                            <button id="applyLargestComponentSolutionButton" style="width: 100%; margin: 2px 0;">Apply Solution (Largest Component)</button>
                            <label style="display: block; margin-top: 5px; font-size: 12px;"><input type="checkbox" id="showVertexMarkersCheckbox" style="margin-right: 5px;">Show Vertex Markers</label>
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
        }

        // Custom controls sidebar for Route Crafter features
        const controlsSidebar = document.getElementById('controlsSidebar');
        const div = document.createElement('div');
        div.className = 'main-controls-shell';
        const overpassEndpointOptions = this.getOverpassEndpointOptionsHtml();
        div.innerHTML = `
                <div id="mainControlsDiv" class="main-controls-panel">
                    <div class="main-controls-header">
                        <input type="text" id="searchBox" class="main-controls-search" placeholder="Search Map">
                        <button id="searchButton">Search</button>
                        <button id="toggleMainMenuButton" class="main-controls-toggle" aria-controls="mainMenuContent" aria-expanded="true">▾</button>
                    </div>
                    <div id="mainMenuContent" class="main-controls-content">
                        <div class="main-controls-select-action">
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
                        </div>
                        <div class="main-controls-actions">
                        <button id="previewGPXButton">Fetch Roads</button>
                        <button id="generateRouteButton">Generate Route</button>
                        <button id="playRouteButton">Play Route</button>
                        <button id="exportGPXButton">Export GPX</button>
                        <button id="clearButton">Reset</button>
                        </div>
                        <div class="main-controls-row">
                            <label for="bufferSize">Add buffer to selected areas (meters):</label>
                            <input type="number" id="bufferSize" class="main-controls-number" min="1" max="100" value="1">
                        </div>
                        <div class="main-controls-row">
                            <label for="truncateByEdge">Trim roads to polygon boundary</label>
                            <input type="checkbox" id="truncateByEdge" checked>
                        </div>
                        <div class="main-controls-row">
                            <label for="overpassEndpointSelect">Overpass endpoint:</label>
                            <select id="overpassEndpointSelect" class="main-controls-input-wide">
                                ${overpassEndpointOptions}
                            </select>
                        </div>
                        <div id="customOverpassEndpointContainer" class="main-controls-row main-controls-custom-endpoint" style="display: none;">
                            <input type="url" id="customOverpassEndpoint" class="main-controls-input-wide" placeholder="https://example.com/api/interpreter">
                            <button id="useCustomOverpassEndpointButton" type="button">Use endpoint</button>
                        </div>
                        <div class="main-controls-row">
                            <label for="exportFormatSelect">Route Solver:</label>
                            <select id="exportFormatSelect">
                                <option value="windy_rural_benavent">Windy Rural (Benavent)</option>
                                <option value="windy_rural_win">Windy Rural (Win)</option>
                                <option value="mixed_yaoyuenyong">Mixed (Yaoyuenyong)</option>
                                <option value="mixed_frederickson">Mixed (Frederickson)</option>
                                <option value="undirected">Undirected</option>
                                <option value="directed">Directed</option>
                            </select>
                        </div>
                        <div class="main-controls-row">
                            <label for="allowNavigationPastBoundary">Allow navigation past boundary</label>
                            <input type="checkbox" id="allowNavigationPastBoundary">
                        </div>
                        <div class="main-controls-row">
                            <label for="boundaryBuffer">Boundary buffer (meters):</label>
                            <input type="number" id="boundaryBuffer" class="main-controls-number" min="1" max="2000" value="500">
                        </div>
                        <div id="filterMapillaryContainer" class="main-controls-row">
                            <label for="filterMapillaryCoverage">Skip route sections with street-level coverage*</label>
                            <input type="checkbox" id="filterMapillaryCoverage">
                        </div>
                        <div class="main-controls-row">
                            <label for="coverageThreshold">Coverage threshold (%):</label>
                            <input type="number" id="coverageThreshold" class="main-controls-number" min="0" max="100" value="80">
                        </div>
                        <div class="main-controls-row">
                            <label for="proximityThreshold">Proximity threshold (meters):</label>
                            <input type="number" id="proximityThreshold" class="main-controls-number" min="1" max="100" value="20">
                        </div>
                        <div class="main-controls-row main-controls-long-field">
                            <label for="navigationFilter">Navigation filter:</label>
                            <input type="text" id="navigationFilter" class="main-controls-input-wide" value='[highway][area!~"yes"][highway!~"bridleway|bus_guideway|construction|corridor|cycleway|elevator|footway|motorway|motorway_junction|motorway_link|escalator|proposed|platform|raceway|rest_area|path|steps"][access!~"customers|no|private"][public_transport!~"platform"][fee!~"yes"][service!~"drive-through|driveway|parking_aisle"][toll!~"yes"]'>
                        </div>
                        <div id="routeFilterContainer" class="main-controls-row main-controls-long-field">
                            <label for="routeFilter">Route filter:</label>
                            <input type="text" id="routeFilter" class="main-controls-input-wide" value=''>
                        </div>
                        <!-- routeLength moved to a right-side stats panel for less clutter -->
                    </div>
                </div>
            `;

        // Store references to the controls and toggle button
        this.toggleMainMenuButton = div.querySelector('#toggleMainMenuButton');
        const menuContent = div.querySelector('#mainMenuContent');
        if (this.toggleMainMenuButton) {
            this.toggleMainMenuButton.setAttribute('aria-controls', 'mainMenuContent');
            this.toggleMainMenuButton.setAttribute('aria-expanded', 'true');
            this.toggleMainMenuButton.addEventListener('click', () => this.toggleMainMenu());
        }
        this.controlsDiv = menuContent;
        this.controlsContainer = div;

        if (controlsSidebar) {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'controls-sidebar-resize-handle';
            resizeHandle.setAttribute('role', 'separator');
            resizeHandle.setAttribute('aria-orientation', 'vertical');
            resizeHandle.setAttribute('aria-label', 'Resize controls sidebar');
            controlsSidebar.replaceChildren(div, resizeHandle);
            this.setupSidebarResize(controlsSidebar, resizeHandle);
        }

        setTimeout(() => this.map.invalidateSize(), 0);
        this.setupOverpassEndpointControl();

        // Show/enable the Mapillary coverage filter only for Windy Rural export formats
        setTimeout(() => {
            try {
                if (!this.controlsDiv) {
                    return;
                }

                const exportFormatSelect = this.controlsDiv.querySelector('#exportFormatSelect');
                const filterContainer = this.controlsDiv.querySelector('#filterMapillaryContainer');
                const filterCheckbox = this.controlsDiv.querySelector('#filterMapillaryCoverage');
                const routeFilterContainer = this.controlsDiv.querySelector('#routeFilterContainer');
                const routeFilterInput = this.controlsDiv.querySelector('#routeFilter');

                const updateFilterVisibility = () => {
                    const val = exportFormatSelect ? exportFormatSelect.value : '';
                    const isWindy = typeof val === 'string' && val.startsWith('windy_rural');
                    if (filterContainer) filterContainer.style.display = isWindy ? 'flex' : 'none';
                    if (filterCheckbox) filterCheckbox.disabled = !isWindy;
                    if (routeFilterContainer) routeFilterContainer.style.display = isWindy ? 'flex' : 'none';
                    if (routeFilterInput) routeFilterInput.disabled = !isWindy;
                };

                if (exportFormatSelect) {
                    exportFormatSelect.addEventListener('change', updateFilterVisibility);
                }

                // Initialize visibility based on current selection
                updateFilterVisibility();
            } catch (e) {
                // Fail silently - UI enhancement only
                console.error('Error setting up Mapillary filter visibility:', e);
            }
        }, 50);

        // Create a dedicated stats panel on the right side to avoid cluttering main controls
        this.statsContainer = L.control({ position: 'topright' });
        this.statsContainer.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar stats-panel');
            // Keep the inner HTML compact (avoid stray whitespace text nodes)
            div.innerHTML = `<div id="statsPanelInner" style="padding:8px; min-width:220px;"><p id="routeLength"></p></div>`;
            L.DomEvent.disableClickPropagation(div);

            // Hide the stats panel inner when it's empty. Use a MutationObserver so any
            // code that updates #routeLength (via innerHTML/textContent) will trigger
            // the visibility update without changing other files.
            try {
                const statsInner = div.querySelector('#statsPanelInner');
                const routeLengthEl = div.querySelector('#routeLength');

                const updateStatsVisibility = () => {
                    if (!statsInner || !routeLengthEl) return;

                    // Consider there to be content if routeLength has trimmed text or any
                    // descendant elements with non-empty text content.
                    const hasText = routeLengthEl.textContent && routeLengthEl.textContent.trim().length > 0;
                    const hasChildContent = Array.from(routeLengthEl.querySelectorAll('*')).some(el => el.textContent && el.textContent.trim().length > 0);
                    const visible = hasText || hasChildContent;

                    statsInner.style.display = visible ? '' : 'none';
                };

                updateStatsVisibility();

                const mo = new MutationObserver(updateStatsVisibility);
                mo.observe(routeLengthEl, { childList: true, subtree: true, characterData: true });

                // Also ensure visibility is correct after full page load in case other
                // scripts modify content later.
                window.addEventListener('load', updateStatsVisibility);
            } catch (e) {
                console.error('Error setting up stats panel visibility observer', e);
            }

            return div;
        };
        this.statsContainer.addTo(this.map);
    }

    setupSidebarResize(sidebar, resizeHandle) {
        const storageKey = 'routeCrafterSidebarWidth';
        const minWidth = 280;
        const maxWidth = 560;
        const mobileQuery = window.matchMedia('(max-width: 600px), (max-height: 450px) and (orientation: landscape)');

        const clampWidth = (width) => {
            const viewportMax = Math.max(minWidth, Math.min(maxWidth, Math.round(window.innerWidth * 0.55)));
            return Math.min(Math.max(width, minWidth), viewportMax);
        };

        const applyWidth = (width, persist = true) => {
            const nextWidth = clampWidth(width);
            document.documentElement.style.setProperty('--controls-sidebar-width', `${nextWidth}px`);

            if (persist) {
                localStorage.setItem(storageKey, String(nextWidth));
            }

            if (this.sidebarResizeFrame) {
                cancelAnimationFrame(this.sidebarResizeFrame);
            }

            this.sidebarResizeFrame = requestAnimationFrame(() => {
                this.map.invalidateSize();
                this.sidebarResizeFrame = null;
            });
        };

        const storedWidth = Number(localStorage.getItem(storageKey));
        if (Number.isFinite(storedWidth) && storedWidth > 0) {
            applyWidth(storedWidth, false);
        }

        const startResize = (event) => {
            if (mobileQuery.matches) {
                return;
            }

            event.preventDefault();
            document.body.classList.add('resizing-controls-sidebar');

            const onPointerMove = (moveEvent) => {
                applyWidth(moveEvent.clientX);
            };

            const stopResize = () => {
                document.body.classList.remove('resizing-controls-sidebar');
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', stopResize);
                window.removeEventListener('pointercancel', stopResize);
            };

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', stopResize);
            window.addEventListener('pointercancel', stopResize);
        };

        resizeHandle.addEventListener('pointerdown', startResize);
        resizeHandle.addEventListener('dblclick', () => {
            localStorage.removeItem(storageKey);
            applyWidth(360, false);
        });

        window.addEventListener('resize', () => {
            if (!mobileQuery.matches) {
                const currentWidth = parseInt(getComputedStyle(sidebar).width, 10);
                if (Number.isFinite(currentWidth)) {
                    applyWidth(currentWidth, false);
                }
            }
        });
    }

    getOverpassEndpointOptionsHtml() {
        const endpointOptions = OVERPASS_ENDPOINT_GROUPS.map(group => {
            const options = group.endpoints.map(endpoint => {
                return `<option value="${endpoint.url}">${endpoint.label}</option>`;
            }).join('');

            return `<optgroup label="${group.label}">${options}</optgroup>`;
        }).join('');

        return `
            ${endpointOptions}
            <optgroup label="Custom">
                <option value="${CUSTOM_OVERPASS_ENDPOINT_VALUE}">Custom endpoint...</option>
            </optgroup>
        `;
    }

    setupOverpassEndpointControl() {
        const endpointSelect = document.getElementById('overpassEndpointSelect');
        const customEndpointContainer = document.getElementById('customOverpassEndpointContainer');
        const customEndpointInput = document.getElementById('customOverpassEndpoint');
        const customEndpointButton = document.getElementById('useCustomOverpassEndpointButton');

        if (!endpointSelect || !customEndpointContainer || !customEndpointInput || !customEndpointButton) {
            return;
        }

        const storedEndpoint = getStoredOverpassEndpoint();
        const matchingPreset = getOverpassEndpointPresets().find(endpoint => {
            return normalizeOverpassEndpoint(endpoint.url) === storedEndpoint;
        });

        if (matchingPreset) {
            endpointSelect.value = matchingPreset.url;
        } else {
            endpointSelect.value = CUSTOM_OVERPASS_ENDPOINT_VALUE;
            customEndpointInput.value = storedEndpoint;
        }

        const updateCustomEndpointVisibility = () => {
            customEndpointContainer.style.display = endpointSelect.value === CUSTOM_OVERPASS_ENDPOINT_VALUE ? 'flex' : 'none';
        };

        endpointSelect.addEventListener('change', () => {
            updateCustomEndpointVisibility();

            if (endpointSelect.value !== CUSTOM_OVERPASS_ENDPOINT_VALUE) {
                saveOverpassEndpoint(endpointSelect.value);
            }
        });

        customEndpointButton.addEventListener('click', () => {
            const customEndpoint = customEndpointInput.value.trim();

            if (!isValidOverpassEndpoint(customEndpoint)) {
                alert('Please enter a valid Overpass endpoint URL that starts with http:// or https://.');
                return;
            }

            customEndpointInput.value = saveOverpassEndpoint(customEndpoint);
        });

        customEndpointInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                customEndpointButton.click();
            }
        });

        updateCustomEndpointVisibility();
    }

    toggleMainMenu() {
        if (!this.controlsDiv || !this.toggleMainMenuButton) {
            return;
        }

        if (this.mainMenuHidden) {
            this.controlsDiv.style.display = '';
            this.toggleMainMenuButton.textContent = '▾';
            this.toggleMainMenuButton.setAttribute('aria-expanded', 'true');
        } else {
            this.controlsDiv.style.display = 'none';
            this.toggleMainMenuButton.textContent = '▴';
            this.toggleMainMenuButton.setAttribute('aria-expanded', 'false');
        }

        this.mainMenuHidden = !this.mainMenuHidden;
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
        // Prevent default on the original event if it exists
        if (e.originalEvent) {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation();
        }
        
        // Ensure we have the click location stored (should already be set by the event handler)
        if (!this.lastClickLatLng && e.latlng) {
            this.lastClickLatLng = e.latlng;
        }
        
        const mapContainer = this.map.getContainer();
        const rect = mapContainer.getBoundingClientRect();
        
        // Calculate position relative to the map container
        let x, y;
        if (e.originalEvent) {
            if (e.originalEvent.touches && e.originalEvent.touches.length > 0) {
                // For touch events
                x = e.originalEvent.touches[0].clientX - rect.left;
                y = e.originalEvent.touches[0].clientY - rect.top;
            } else {
                // For mouse events
                x = e.originalEvent.clientX - rect.left;
                y = e.originalEvent.clientY - rect.top;
            }
        } else {
            // Fallback: convert latlng to screen coordinates
            const point = this.map.latLngToContainerPoint(e.latlng);
            x = point.x;
            y = point.y;
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
        // Don't clear lastClickLatLng here - it needs to persist for the menu item click handler
    }

    handleSetDepot(latlng) {
        console.log('Setting depot at location:', latlng);
        
        // Get the coordinate mappings from the global app instance
        if (!window.app || !window.app.nodeIdToCoordinateMap || window.app.nodeIdToCoordinateMap.size === 0) {
            alert('Please fetch roads first before setting a starting location. The starting location must be at a road intersection.');
            return;
        }

        const nodeIdToCoordinateMap = window.app.nodeIdToCoordinateMap;
        
        // Find the nearest node to the clicked location
        let nearestNodeId = null;
        let minDistance = Infinity;
        
        nodeIdToCoordinateMap.forEach((coord, nodeId) => {
            // coord is [lng, lat], latlng is {lat, lng}
            const dx = coord[0] - latlng.lng;
            const dy = coord[1] - latlng.lat;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestNodeId = nodeId;
            }
        });

        if (nearestNodeId === null) {
            alert('No nodes found. Please fetch roads first.');
            return;
        }

        // Get the coordinate of the nearest node
        const nearestCoord = nodeIdToCoordinateMap.get(nearestNodeId);
        const nearestLatLng = [nearestCoord[1], nearestCoord[0]]; // Convert [lng, lat] to [lat, lng]

        // Remove existing depot marker if any
        if (this.depotMarker) {
            this.map.removeLayer(this.depotMarker);
        }

        // Create a marker at the nearest node
        this.depotMarker = L.marker(nearestLatLng, {
            icon: L.divIcon({
                className: 'depot-marker',
                html: '<div style="background-color: #00ff00; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><div style="color: white; font-weight: bold; font-size: 14px; text-align: center; line-height: 24px;">▶</div></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        }).addTo(this.map);

    // Do not bind or open a popup for the depot marker by default
    // This keeps the map cleaner and prevents automatic popups when setting the starting location.

        // Store the selected depot ID
        this.selectedDepotId = nearestNodeId;

        console.log(`Depot set to node ${nearestNodeId} at coordinates [${nearestCoord[1]}, ${nearestCoord[0]}]`);
    }

    // Selected depot getter (exports require a depot)

    getSelectedDepotId() {
        return this.selectedDepotId;
    }

    clearDepotMarker() {
        if (this.depotMarker) {
            this.map.removeLayer(this.depotMarker);
            this.depotMarker = null;
        }
        this.selectedDepotId = null;
    }

    showVertexMarkers(nodeIdToCoordinateMap) {
        this.clearVertexMarkers();
        let count = 0;
        for (const [nodeId, coord] of nodeIdToCoordinateMap) {
            const marker = L.marker([coord[1], coord[0]]).bindPopup(`Vertex ID: ${nodeId}`);
            this.vertexMarkers.push(marker);
            marker.addTo(this.map);
            count++;
        }
        console.log(`Added ${count} vertex markers`);
    }

    hideVertexMarkers() {
        this.clearVertexMarkers();
    }

    clearVertexMarkers() {
        this.vertexMarkers.forEach(marker => this.map.removeLayer(marker));
        this.vertexMarkers = [];
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
