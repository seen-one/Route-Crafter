// Main application module

import { MapManager } from './map.js';
import { RoutingManager } from './routing.js';
import { CoverageManager } from './coverage.js';
import { stopSpinner } from './utils.js';

export class RouteCrafterApp {
    constructor() {
        this.mapManager = null;
        this.routingManager = null;
        this.coverageManager = null;
        
        // Global state
        this.highlightedPolygons = [];
        this.previewLayer = null;
        this.geoJsonLayer = null;
        this.gridLayer = null;
        this.cppSolutionLayer = null;
        this.coordinateToNodeIdMap = new Map();
        this.nodeIdToCoordinateMap = new Map();
        this.previousSearchRule = null;
        
        this.init();
    }

    init() {
        // Initialize map manager first
        this.mapManager = new MapManager();
        
        // Initialize routing manager
        this.routingManager = new RoutingManager(this.mapManager);
        
        // Initialize coverage manager
        this.coverageManager = new CoverageManager(this.mapManager.getMap(), this.mapManager.getBaseMaps());
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize coverage layers
        this.coverageManager.initializeLayers();
        
        // Setup attribution
        this.mapManager.getMap().attributionControl.setPrefix(
            `Route Crafter <a href="https://github.com/seen-one/Route-Crafter" target="_blank">GitHub</a> | ${this.mapManager.getMap().attributionControl.options.prefix}`
        );
    }

    setupEventListeners() {
        // Search rules dropdown change handler
        document.getElementById('searchRules').addEventListener('change', (event) => {
            const selectedValue = event.target.value;
            const fetchButton = document.getElementById('fetchButton');
            const bufferContainer = document.getElementById('bufferSize').parentElement;
            
            // Check if switching from or to draw_area or grid
            const isFromDrawArea = this.previousSearchRule === 'draw_area';
            const isToDrawArea = selectedValue === 'draw_area';
            const isFromGrid = this.previousSearchRule === 'grid_500m' || 
                               this.previousSearchRule === 'grid_1km' || 
                               this.previousSearchRule === 'grid_1500m';
            const isToGrid = selectedValue === 'grid_500m' || 
                            selectedValue === 'grid_1km' || 
                            selectedValue === 'grid_1500m';
            
            // Always reset when switching from or to Draw Area or Grid
            if (isFromDrawArea || isToDrawArea || isFromGrid || isToGrid) {
                this.clearAllSelectionsWithoutResettingDropdown();
            }
            
            // Update previous search rule
            this.previousSearchRule = selectedValue;
            
            // Check if grid option is selected
            const isGrid = isToGrid;
            
            if (selectedValue === 'draw_area') {
                // Hide fetch button and enable draw control
                fetchButton.style.display = 'none';
                this.mapManager.enableDrawControl();
                // Hide buffer for draw area
                bufferContainer.style.display = 'none';
                // Set buffer to 0 for draw area
                document.getElementById('bufferSize').value = '0';
            } else {
                // Show fetch button and disable draw control
                fetchButton.style.display = 'inline-block';
                this.mapManager.disableDrawControl();
                // Hide buffer for grids, show for other options
                if (isGrid) {
                    bufferContainer.style.display = 'none';
                    // Set buffer to 0 for grids
                    document.getElementById('bufferSize').value = '0';
                } else {
                    bufferContainer.style.display = 'flex';
                }
            }
        });

        // Draw events
        this.mapManager.getMap().on(L.Draw.Event.CREATED, (event) => {
            this.handleDrawCreated(event);
        });

        // Handle draw deleted event
        this.mapManager.getMap().on(L.Draw.Event.DELETED, (event) => {
            const layers = event.layers;
            layers.eachLayer((layer) => {
                // Remove from highlighted polygons if it was selected
                const index = this.highlightedPolygons.indexOf(layer);
                if (index > -1) {
                    this.highlightedPolygons.splice(index, 1);
                }
            });
            // Update preview after deletion
            this.previewCombinedPolygon();
        });

        // Handle draw edited event
        this.mapManager.getMap().on(L.Draw.Event.EDITED, (event) => {
            // Update preview after editing
            this.previewCombinedPolygon();
        });

        // Buffer size changes
        document.getElementById('bufferSize').addEventListener('input', () => {
            this.previewCombinedPolygon();
        });

        document.getElementById('bufferSize').addEventListener('wheel', (event) => {
            event.preventDefault();
            let currentValue = parseInt(event.target.value, 10);
            if (isNaN(currentValue)) currentValue = 1;
            const step = 1;
            if (event.deltaY < 0) {
                event.target.value = Math.min(currentValue + step, 100);
            } else if (event.deltaY > 0) {
                event.target.value = Math.max(currentValue - step, 1);
            }
            this.previewCombinedPolygon();
        });

        // Consolidate tolerance wheel
        document.getElementById('consolidateTolerance').addEventListener('wheel', (event) => {
            event.preventDefault();
            let currentValue = parseInt(event.target.value, 10);
            if (isNaN(currentValue)) currentValue = 15;
            const step = 1;
            if (event.deltaY < 0) {
                event.target.value = Math.min(currentValue + step, 100);
            } else if (event.deltaY > 0) {
                event.target.value = Math.max(currentValue - step, 1);
            }
        });

        // Coverage threshold wheel
        document.getElementById('coverageThreshold').addEventListener('wheel', (event) => {
            event.preventDefault();
            let currentValue = parseInt(event.target.value, 10);
            if (isNaN(currentValue)) currentValue = 50;
            const step = 5;
            if (event.deltaY < 0) {
                event.target.value = Math.min(currentValue + step, 100);
            } else if (event.deltaY > 0) {
                event.target.value = Math.max(currentValue - step, 0);
            }
        });

        // Proximity threshold wheel
        document.getElementById('proximityThreshold').addEventListener('wheel', (event) => {
            event.preventDefault();
            let currentValue = parseInt(event.target.value, 10);
            if (isNaN(currentValue)) currentValue = 20;
            const step = 5;
            if (event.deltaY < 0) {
                event.target.value = Math.min(currentValue + step, 100);
            } else if (event.deltaY > 0) {
                event.target.value = Math.max(currentValue - step, 1);
            }
        });

        // Disable zooming when hovering over inputs
        const bufferInput = document.getElementById('bufferSize');
        const consolidateToleranceInput = document.getElementById('consolidateTolerance');
        const coverageThresholdInput = document.getElementById('coverageThreshold');
        const proximityThresholdInput = document.getElementById('proximityThreshold');

        bufferInput.addEventListener('mouseover', () => {
            this.mapManager.getMap().scrollWheelZoom.disable();
        });

        bufferInput.addEventListener('mouseout', () => {
            this.mapManager.getMap().scrollWheelZoom.enable();
        });

        consolidateToleranceInput.addEventListener('mouseover', () => {
            this.mapManager.getMap().scrollWheelZoom.disable();
        });

        consolidateToleranceInput.addEventListener('mouseout', () => {
            this.mapManager.getMap().scrollWheelZoom.enable();
        });

        coverageThresholdInput.addEventListener('mouseover', () => {
            this.mapManager.getMap().scrollWheelZoom.disable();
        });

        coverageThresholdInput.addEventListener('mouseout', () => {
            this.mapManager.getMap().scrollWheelZoom.enable();
        });

        proximityThresholdInput.addEventListener('mouseover', () => {
            this.mapManager.getMap().scrollWheelZoom.disable();
        });

        proximityThresholdInput.addEventListener('mouseout', () => {
            this.mapManager.getMap().scrollWheelZoom.enable();
        });

        // Toggle visibility of threshold inputs based on any coverage layer being enabled
        const filterMapillaryCoverageCheckbox = document.getElementById('filterMapillaryCoverage');
        const coverageThresholdContainer = coverageThresholdInput.parentElement;
        const proximityThresholdContainer = proximityThresholdInput.parentElement;
        
        const updateThresholdVisibility = () => {
            // Check if any coverage layer is enabled
            const anyLayerEnabled = this.coverageManager.isAnyCoverageLayerEnabled();
            
            if (filterMapillaryCoverageCheckbox.checked && anyLayerEnabled) {
                coverageThresholdContainer.style.display = 'flex';
                proximityThresholdContainer.style.display = 'flex';
            } else {
                coverageThresholdContainer.style.display = 'none';
                proximityThresholdContainer.style.display = 'none';
            }
            
            // Update checkbox state to match layer availability
            filterMapillaryCoverageCheckbox.disabled = !anyLayerEnabled;
            if (!anyLayerEnabled) {
                filterMapillaryCoverageCheckbox.checked = false;
            }
        };
        
        // Set initial state
        updateThresholdVisibility();
        
        // Add event listener for checkbox changes
        filterMapillaryCoverageCheckbox.addEventListener('change', updateThresholdVisibility);
        
        // Listen for layer changes to update visibility
        this.mapManager.getMap().on('overlayadd', updateThresholdVisibility);
        this.mapManager.getMap().on('overlayremove', updateThresholdVisibility);

        // Search button
        document.getElementById('searchButton').addEventListener('click', () => {
            this.searchLocation();
        });

        // Search box - trigger search on Enter key
        document.getElementById('searchBox').addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.searchLocation();
            }
        });

        // Fetch button
        document.getElementById('fetchButton').addEventListener('click', () => {
            this.fetchAreasByRule();
        });

        // Preview GPX button
        document.getElementById('previewGPXButton').addEventListener('click', () => {
            this.fetchRoadsInArea();
        });

        // Play Route button
        document.getElementById('playRouteButton').addEventListener('click', () => {
            this.playRouteAnimation();
        });

        // Download button
        document.getElementById('downloadButton').addEventListener('click', () => {
            this.downloadRoadDataAsCustomFormat();
        });

        // Upload Overpass Response button
        document.getElementById('uploadOverpassButton').addEventListener('click', () => {
            document.getElementById('overpassUploadInput').click();
        });

        // Export Chinese Postman button
        document.getElementById('exportCPPButton').addEventListener('click', () => {
            this.exportForChinesePostman();
        });

        // Clear button
        document.getElementById('clearButton').addEventListener('click', () => {
            this.clearAllSelections();
        });

        // Upload CPP Solution button
        document.getElementById('uploadCPPButton').addEventListener('click', () => {
            // Stop any running animation by clicking the close button
            document.getElementById('closeBtn').click();
            
            if (this.nodeIdToCoordinateMap.size === 0) {
                const proceed = confirm(
                    'No roads have been fetched yet. The solution will be shown as a demonstration path.\n\n' +
                    'For accurate mapping:\n' +
                    '1. First select an area and click "Fetch Roads"\n' +
                    '2. Then click "Export for Chinese Postman" to get the CSV\n' +
                    '3. Finally upload your solution CSV here\n\n' +
                    'Do you want to proceed with a demonstration path?'
                );
                if (!proceed) return;
            }
            document.getElementById('cppUploadInput').click();
        });

        // File upload handlers
        document.getElementById('cppUploadInput').addEventListener('change', (event) => {
            this.handleCPPSolutionUpload(event);
        });

        document.getElementById('overpassUploadInput').addEventListener('change', (event) => {
            this.handleOverpassResponseUpload(event);
        });
    }

    handleDrawCreated(event) {
        const layer = event.layer;
        const type = event.layerType;
        
        // Add the drawn layer to our feature group
        this.mapManager.getDrawnItems().addLayer(layer);
        
        // Style the drawn area to match existing polygons
        if (type === 'polygon' || type === 'rectangle') {
            layer.setStyle({
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 0.2,
                weight: 2
            });
            
            // Add click handler to select the drawn area
            layer.on('click', (e) => {
                // Don't interfere if Leaflet Draw is in delete or edit mode
                const drawControl = this.mapManager.getDrawControl();
                if (drawControl._toolbars.edit._activeMode) {
                    // Edit or delete mode is active, don't run custom selection
                    return;
                }
                
                this.selectPolygon(layer);
                this.previewDrawnAreaWithBuffer(layer);
            });
        }
    }

    selectPolygon(layer) {
        // Check if layer is already highlighted
        const index = this.highlightedPolygons.indexOf(layer);
        
        if (index > -1) {
            // Unhighlight - reset to default style
            this.highlightedPolygons.splice(index, 1);
            layer.setStyle({
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 0.2,
                weight: 2
            });
        } else {
            // Highlight - change style to red
            this.highlightedPolygons.push(layer);
            layer.setStyle({
                color: '#ff6b6b',
                fillColor: '#ff6b6b',
                fillOpacity: 0.3,
                weight: 3
            });
        }
    }

    previewDrawnAreaWithBuffer(drawnLayer) {
        if (this.previewLayer) {
            this.mapManager.getMap().removeLayer(this.previewLayer);
        }
        
        const coordinates = drawnLayer.getLatLngs()[0];
        const polygon = turf.polygon([coordinates.map(coord => [coord.lng, coord.lat])]);
        
        // Apply buffer if specified
        const bufferSize = parseFloat(document.getElementById('bufferSize').value) || 1;
        const bufferedPolygon = turf.buffer(polygon, bufferSize, { units: 'meters' });
        
        // Create preview layer
        this.previewLayer = L.geoJSON(bufferedPolygon, {
            style: {
                color: '#ff6b6b',
                fillColor: '#ff6b6b',
                fillOpacity: 0.3,
                weight: 2
            }
        }).addTo(this.mapManager.getMap());
    }

    fetchAreasByRule() {
        const fetchButton = document.getElementById('fetchButton');
        const selectedRule = document.getElementById('searchRules').value;
        
        // Don't fetch if "Draw Area" is selected
        if (selectedRule === 'draw_area') {
            alert('Please select a search rule or use the drawing tools to create an area.');
            return;
        }
        
        // Handle grid generation specially
        if (selectedRule === 'grid_500m') {
            this.generateGrid(500);
            return;
        }
        if (selectedRule === 'grid_1km') {
            this.generateGrid(1000);
            return;
        }
        if (selectedRule === 'grid_1500m') {
            this.generateGrid(1500);
            return;
        }
        
        // Add loading spinner
        fetchButton.classList.add('button-loading');
        fetchButton.innerHTML = 'Finding Areas <span class="spinner"></span>';
        
        // Remove existing area layer (but not grid layer)
        if (this.geoJsonLayer) {
            this.mapManager.getMap().removeLayer(this.geoJsonLayer);
        }
        
        const bounds = this.mapManager.getMap().getBounds();
        const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
        let overpassQuery;
        
        if (selectedRule === "landuse=residential|landuse=retail|landuse=commercial|landuse=industrial") {
            overpassQuery = `
                [out:json][timeout:10];
                (
                    nwr[landuse=residential](${bbox});
                    nwr[landuse=retail](${bbox});
                    nwr[landuse=commercial](${bbox});
                    nwr[landuse=industrial](${bbox});
                );
                (._;>;);
                out body;
            `;
        } else {
            overpassQuery = `
                [out:json][timeout:10];
                (
                    relation[${selectedRule}](${bbox});
                );
                (._;>;);
                out body;
            `;
        }
        
        // Minify query to reduce URL length
        const minifiedQuery = this.minifyOverpassQuery(overpassQuery);
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(minifiedQuery)}`;
        
        fetch(url).then(response => {
            if (!response.ok) {
                let errorMessage = '';
                switch (response.status) {
                    case 504:
                        errorMessage = 'Gateway Timeout (504): The server took too long to respond. Please try again or zoom into a smaller area.';
                        break;
                    case 502:
                        errorMessage = 'Bad Gateway (502): The server is temporarily unavailable. Please try again later.';
                        break;
                    case 503:
                        errorMessage = 'Service Unavailable (503): The server is temporarily overloaded. Please try again later.';
                        break;
                    case 429:
                        errorMessage = 'Too Many Requests (429): Rate limit exceeded. Please wait a moment before trying again.';
                        break;
                    case 400:
                        errorMessage = 'Bad Request (400): Invalid query parameters. Please try a different search.';
                        break;
                    default:
                        errorMessage = `Server Error (${response.status}): ${response.statusText}. Please try again.`;
                }
                throw new Error(errorMessage);
            }
            return response.json();
        }).then(data => {
            if (data.remark && data.remark.includes('Query timed out')) {
                throw new Error('Too many results. Please zoom into a smaller area. (Overpass query timed out after 10 seconds)');
            }
            
            const geoJsonData = osmtogeojson(data);
            const filteredData = geoJsonData.features.filter(feature => {
                return feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';
            });
            
            if (filteredData.length === 0) {
                alert('No results found. Please try another search rule.');
            } else {
                const processedData = filteredData.map(feature => {
                    if (feature.geometry.type === 'MultiPolygon') {
                        const outerPolygon = feature.geometry.coordinates[0];
                        feature.geometry.coordinates = [outerPolygon];
                    }
                    const area = turf.area(feature);
                    return {
                        feature,
                        area
                    };
                }).sort((a, b) => b.area - a.area);
                
                this.geoJsonLayer = L.geoJSON({
                    type: "FeatureCollection",
                    features: processedData.map(item => item.feature)
                }, {
                    style: {
                        color: 'blue',
                        weight: 2
                    },
                    onEachFeature: (feature, layer) => {
                        layer.on('click', () => {
                            this.toggleAreaSelection(layer);
                        });
                    }
                }).addTo(this.mapManager.getMap());
            }
        }).catch(err => {
            console.error('Error fetching data:', err);
            const errorMessage = err.message || 'An unexpected error occurred while fetching data. Please try again.';
            alert(`Error: ${errorMessage}`);
        }).finally(() => {
            stopSpinner(fetchButton, 'Find Areas');
        });
    }

    generateGrid(gridSize) {
        if (this.gridLayer) {
            this.mapManager.getMap().removeLayer(this.gridLayer);
        }
        
        // Get current map bounds
        const bounds = this.mapManager.getMap().getBounds();
        const south = bounds.getSouth();
        const west = bounds.getWest();
        const north = bounds.getNorth();
        const east = bounds.getEast();
        
        // Grid cell size in meters (passed as parameter)
        
        // Fixed origin point (0, 0)
        const originLat = 0;
        const originLng = 0;
        
        // Calculate meters per degree for latitude (roughly constant)
        const metersPerDegreeLat = 111320;
        
        // Calculate grid indices for latitude (aligned to origin)
        const latStep = gridSize / metersPerDegreeLat;
        const southIndex = Math.floor((south - originLat) / latStep);
        const northIndex = Math.ceil((north - originLat) / latStep);
        
        // For longitude, we need to calculate indices at the center latitude of the viewport
        const centerLat = (south + north) / 2;
        const metersPerDegreeLng = metersPerDegreeLat * Math.cos(centerLat * Math.PI / 180);
        const lngStep = gridSize / metersPerDegreeLng;
        const westIndex = Math.floor((west - originLng) / lngStep);
        const eastIndex = Math.ceil((east - originLng) / lngStep);
        
        // Limit the number of grid cells to prevent performance issues
        const maxCells = 200;
        const totalCells = (northIndex - southIndex) * (eastIndex - westIndex);
        
        if (totalCells > maxCells) {
            alert(`Too many grid cells (${totalCells}). Please zoom in to see fewer than ${maxCells} cells.`);
            return;
        }
        
        // Generate grid cells aligned to the global grid
        const gridFeatures = [];
        
        for (let latIndex = southIndex; latIndex < northIndex; latIndex++) {
            // Calculate cell latitude boundaries (constant for all longitudes)
            const cellSouthLat = originLat + (latIndex * latStep);
            const cellNorthLat = originLat + ((latIndex + 1) * latStep);
            const cellCenterLat = (cellSouthLat + cellNorthLat) / 2;
            
            // Calculate longitude step at this specific latitude for 1km width
            const metersPerDegreeLngAtLat = metersPerDegreeLat * Math.cos(cellCenterLat * Math.PI / 180);
            const lngStepAtLat = gridSize / metersPerDegreeLngAtLat;
            
            for (let lngIndex = westIndex; lngIndex < eastIndex; lngIndex++) {
                // Calculate cell longitude boundaries
                const cellWestLng = originLng + (lngIndex * lngStepAtLat);
                const cellEastLng = originLng + ((lngIndex + 1) * lngStepAtLat);
                
                // Create polygon for this grid cell
                const coordinates = [[
                    [cellWestLng, cellSouthLat],
                    [cellEastLng, cellSouthLat],
                    [cellEastLng, cellNorthLat],
                    [cellWestLng, cellNorthLat],
                    [cellWestLng, cellSouthLat]
                ]];
                
                // Format grid size for display
                let sizeLabel;
                if (gridSize >= 1000) {
                    const km = gridSize / 1000;
                    sizeLabel = `${km}km × ${km}km`;
                } else {
                    sizeLabel = `${gridSize}m × ${gridSize}m`;
                }
                
                const feature = {
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: coordinates
                    },
                    properties: {
                        gridIndex: `${lngIndex},${latIndex}`,
                        cellSize: sizeLabel
                    }
                };
                
                gridFeatures.push(feature);
            }
        }
        
        if (gridFeatures.length === 0) {
            alert('No grid cells generated for the current view.');
            return;
        }
        
        // Create GeoJSON layer with the grid
        this.gridLayer = L.geoJSON({
            type: "FeatureCollection",
            features: gridFeatures
        }, {
            style: {
                color: 'blue',
                weight: 2,
                fillOpacity: 0.1
            },
            onEachFeature: (feature, layer) => {
                layer.on('click', () => {
                    this.toggleAreaSelection(layer);
                });
            }
        }).addTo(this.mapManager.getMap());
        
        // Format grid size for console log
        const sizeLabelConsole = gridSize >= 1000 ? `${gridSize / 1000}km × ${gridSize / 1000}km` : `${gridSize}m × ${gridSize}m`;
        console.log(`Generated ${gridFeatures.length} grid cells (${sizeLabelConsole})`);
    }

    toggleAreaSelection(layer) {
        if (this.previewLayer) {
            this.mapManager.getMap().removeLayer(this.previewLayer);
            this.previewLayer = null;
        }
        
        const index = this.highlightedPolygons.indexOf(layer);
        if (index > -1) {
            this.highlightedPolygons.splice(index, 1);
            layer.setStyle({
                color: 'blue',
                weight: 2
            });
        } else {
            this.highlightedPolygons.push(layer);
            layer.setStyle({
                color: 'red',
                weight: 3
            });
        }
        this.previewCombinedPolygon();
    }

    previewCombinedPolygon() {
        if (this.highlightedPolygons.length === 0) {
            if (this.previewLayer) {
                this.mapManager.getMap().removeLayer(this.previewLayer);
                this.previewLayer = null;
            }
            document.getElementById('routeLength').innerHTML = '';
            return;
        }
        
        let bufferSize = parseInt(document.getElementById('bufferSize').value, 10);
        if (isNaN(bufferSize)) {
            bufferSize = 0;
        }
        
        // Calculate area statistics for the selected polygons
        let areaStats = '';
        try {
            const bufferedPolygons = this.highlightedPolygons.map(layer => {
                const geoJson = layer.toGeoJSON();
                return turf.buffer(geoJson, bufferSize, {
                    units: 'meters'
                });
            });
            const combinedPolygon = bufferedPolygons.reduce((combined, feature, index) => {
                if (index === 0) return feature;
                return turf.union(combined, feature);
            });
            
            const areaInSquareMeters = turf.area(combinedPolygon);
            const areaInSquareKm = areaInSquareMeters / 1000000;
            const areaInSquareMi = areaInSquareMeters / 2589988.11;
            
            const areaWarning = areaInSquareKm > 5 ? ' <span style="color: red; font-weight: bold;">⚠️ Large Area</span>' : '';
            areaStats = `<strong>Selected Area:</strong> ${areaInSquareKm.toFixed(2)} km² (${areaInSquareMi.toFixed(2)} sq mi)${areaWarning}<br>`;
            
            document.getElementById('routeLength').innerHTML = areaStats;
        } catch (err) {
            console.error('Error calculating area:', err);
            document.getElementById('routeLength').innerHTML = '<span style="color: red;">Error calculating area</span><br>';
        }
        
        if (bufferSize === 0) {
            this.highlightedPolygons.forEach(layer => {
                layer.setStyle({
                    color: 'green',
                    weight: 3
                });
            });
            if (this.previewLayer) {
                this.mapManager.getMap().removeLayer(this.previewLayer);
                this.previewLayer = null;
            }
            return;
        }
        
        try {
            const bufferedPolygons = this.highlightedPolygons.map(layer => {
                const geoJson = layer.toGeoJSON();
                return turf.buffer(geoJson, bufferSize, {
                    units: 'meters'
                });
            });
            const combinedPolygon = bufferedPolygons.reduce((combined, feature, index) => {
                if (index === 0) return feature;
                return turf.union(combined, feature);
            });
            
            if (this.previewLayer) {
                this.mapManager.getMap().removeLayer(this.previewLayer);
            }
            
            this.previewLayer = L.geoJSON(combinedPolygon, {
                style: {
                    color: 'green',
                    weight: 3,
                    fillOpacity: 0.3
                },
                interactive: false
            }).addTo(this.mapManager.getMap());
            
            this.highlightedPolygons.forEach(layer => {
                layer.setStyle({
                    color: 'green',
                    weight: 3
                });
            });
        } catch (err) {
            console.error('Error previewing combined polygon:', err);
            alert('Error previewing polygon. Please ensure the selected polygons are valid.');
        }
    }

    // Helper function to convert polygon coordinates to Overpass poly format
    polygonToOverpassPoly(polygon) {
        const coordinates = polygon.geometry.coordinates[0];
        return coordinates.map(coord => `${coord[1]} ${coord[0]}`).join(' ');
    }

    // Helper function to minify Overpass query by removing unnecessary whitespace
    minifyOverpassQuery(query) {
        return query
            .replace(/\s+/g, ' ')  // Replace multiple spaces/newlines with single space
            .replace(/\s*([;(){}\[\]])\s*/g, '$1')  // Remove spaces around special chars
            .trim();
    }

    // Helper function to trim road segments that extend beyond the polygon boundary
    trimRoadsToPolygon(roadFeatures, polygon) {
        const trimmedRoads = [];
        
        // Ensure polygon is in the correct format
        let polygonFeature;
        if (polygon.geometry && polygon.geometry.type === 'Polygon') {
            polygonFeature = polygon;
        } else if (polygon.type === 'Feature' && polygon.geometry.type === 'Polygon') {
            polygonFeature = polygon;
        } else {
            console.error('Invalid polygon format for trimming:', polygon);
            return roadFeatures; // Return original roads if polygon is invalid
        }
        
        console.log('Trimming roads to polygon boundary...');
        
        roadFeatures.forEach((feature, index) => {
            if (feature.geometry.type !== 'LineString') {
                trimmedRoads.push(feature);
                return;
            }
            
            try {
                // Validate road coordinates
                const coords = feature.geometry.coordinates;
                if (!coords || coords.length < 2) {
                    console.log(`Road ${index} has invalid coordinates, skipping`);
                    return;
                }
                
                const roadLine = turf.lineString(coords);
                
                // Validate the road line
                if (!roadLine || !roadLine.geometry) {
                    console.log(`Road ${index} could not be converted to LineString, skipping`);
                    return;
                }
                
                // Check if road is completely inside polygon
                const isInside = turf.booleanWithin(roadLine, polygonFeature);
                if (isInside) {
                    trimmedRoads.push(feature);
                    return;
                }
                
                // Check if road intersects with polygon
                const intersects = turf.booleanIntersects(roadLine, polygonFeature);
                if (!intersects) {
                    return;
                }
                
                // Use intersect for clipping - but handle the geometry validation issue
                let intersection;
                try {
                    intersection = turf.intersect(roadLine, polygonFeature);
                } catch (intersectError) {
                    // Fallback: find intersection points and trim to boundary
                    const trimmedCoords = this.trimRoadToPolygonBoundary(coords, polygonFeature);
                    
                    if (trimmedCoords && trimmedCoords.length >= 2) {
                        const trimmedFeature = {
                            ...feature,
                            geometry: {
                                type: 'LineString',
                                coordinates: trimmedCoords
                            }
                        };
                        trimmedRoads.push(trimmedFeature);
                        console.log(`Road ${index} trimmed using boundary method`);
                    }
                    return;
                }
                
                if (intersection && intersection.geometry) {
                    if (intersection.geometry.type === 'LineString') {
                        const trimmedFeature = {
                            ...feature,
                            geometry: intersection.geometry
                        };
                        trimmedRoads.push(trimmedFeature);
                    } else if (intersection.geometry.type === 'MultiLineString') {
                        intersection.geometry.coordinates.forEach(coords => {
                            const trimmedFeature = {
                                ...feature,
                                geometry: {
                                    type: 'LineString',
                                    coordinates: coords
                                }
                            };
                            trimmedRoads.push(trimmedFeature);
                        });
                    }
                }
                
            } catch (error) {
                console.warn(`Error processing road ${index}:`, error);
                // If processing fails, include the original road
                trimmedRoads.push(feature);
            }
        });
        
        console.log(`Trimmed ${roadFeatures.length} roads to ${trimmedRoads.length} segments`);
        return trimmedRoads;
    }

    // Helper function to trim road to polygon boundary by finding intersection points
    trimRoadToPolygonBoundary(coords, polygonFeature) {
        if (!coords || coords.length < 2) return null;
        
        // Find which coordinates are inside the polygon
        const insideIndices = [];
        coords.forEach((coord, index) => {
            const point = turf.point(coord);
            if (turf.booleanWithin(point, polygonFeature)) {
                insideIndices.push(index);
            }
        });
        
        if (insideIndices.length === 0) return null; // No coordinates inside
        if (insideIndices.length === coords.length) return coords; // All coordinates inside
        
        // Find the first and last inside coordinates
        const firstInside = Math.min(...insideIndices);
        const lastInside = Math.max(...insideIndices);
        
        // Start with coordinates from first inside to last inside
        let trimmedCoords = coords.slice(firstInside, lastInside + 1);
        
        // Try to find intersection points at the boundaries
        const polygonBoundary = turf.polygonToLine(polygonFeature);
        
        // Check if we need to add intersection points at the start
        if (firstInside > 0) {
            const startSegment = turf.lineString([coords[firstInside - 1], coords[firstInside]]);
            const startIntersection = this.findLineIntersection(startSegment, polygonBoundary);
            if (startIntersection) {
                trimmedCoords.unshift(startIntersection);
            }
        }
        
        // Check if we need to add intersection points at the end
        if (lastInside < coords.length - 1) {
            const endSegment = turf.lineString([coords[lastInside], coords[lastInside + 1]]);
            const endIntersection = this.findLineIntersection(endSegment, polygonBoundary);
            if (endIntersection) {
                trimmedCoords.push(endIntersection);
            }
        }
        
        return trimmedCoords.length >= 2 ? trimmedCoords : null;
    }

    // Helper function to find intersection point between two lines
    findLineIntersection(line1, line2) {
        try {
            const intersection = turf.lineIntersect(line1, line2);
            if (intersection && intersection.features && intersection.features.length > 0) {
                const point = intersection.features[0];
                if (point.geometry && point.geometry.type === 'Point') {
                    return point.geometry.coordinates;
                }
            }
        } catch (error) {
            console.warn('Error finding line intersection:', error);
        }
        return null;
    }


    fetchRoadsInArea() {
        const previewGPXButton = document.getElementById('previewGPXButton');
        previewGPXButton.classList.add('button-loading');
        previewGPXButton.innerHTML = 'Fetching Roads <span class="spinner"></span>';
        
        // Combine highlighted polygons and drawn items
        const allSelectedAreas = [...this.highlightedPolygons];
        
        // Add drawn items to the selection
        this.mapManager.getDrawnItems().eachLayer((layer) => {
            if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
                allSelectedAreas.push(layer);
            }
        });
        
        if (allSelectedAreas.length === 0) {
            alert('No area has been selected. Please select an area from the map or draw one manually.');
            stopSpinner(previewGPXButton, 'Fetch Roads');
            return;
        }
        
        const bufferSize = parseInt(document.getElementById('bufferSize').value, 10);
        const customFilter = document.getElementById('customFilter').value;
        
        try {
            // Create combined polygon from selected areas
            const bufferedPolygons = allSelectedAreas.map(layer => {
                const geoJson = layer.toGeoJSON();
                return turf.buffer(geoJson, bufferSize, {
                    units: 'meters'
                });
            });
            const combinedPolygon = bufferedPolygons.reduce((combined, feature, index) => {
                if (index === 0) return feature;
                return turf.union(combined, feature);
            });
            
            if (combinedPolygon.geometry.type === 'MultiPolygon') {
                alert('Error: One or more selected areas are too far apart. You can increase the buffer to merge adjacent areas.');
                stopSpinner(previewGPXButton, 'Fetch Roads');
                return;
            }
            
            // Use the custom filter directly as Overpass QL format
            let filterConditions = customFilter.trim();
            if (!filterConditions) {
                console.warn('No custom filter provided, using default highway filter');
                filterConditions = '[highway]';
            }
            
            // Convert polygon to Overpass poly format
            const polyString = this.polygonToOverpassPoly(combinedPolygon);
            
            // Create Overpass query using poly filter for precise polygon filtering
            const overpassQuery = `
                [out:json][timeout:30];
                (
                    way${filterConditions}
                    (poly:"${polyString}");
                );
                (._;>;);
                out body;
            `;
            
            // Minify query to reduce URL length
            const minifiedQuery = this.minifyOverpassQuery(overpassQuery);
            const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(minifiedQuery)}`;
            
            fetch(url).then(response => {
                if (!response.ok) {
                    let errorMessage = '';
                    switch (response.status) {
                        case 504:
                            errorMessage = 'Gateway Timeout (504): The server took too long to respond. Please try again or zoom into a smaller area.';
                            break;
                        case 502:
                            errorMessage = 'Bad Gateway (502): The server is temporarily unavailable. Please try again later.';
                            break;
                        case 503:
                            errorMessage = 'Service Unavailable (503): The server is temporarily overloaded. Please try again later.';
                            break;
                        case 429:
                            errorMessage = 'Too Many Requests (429): Rate limit exceeded. Please wait a moment before trying again.';
                            break;
                        case 400:
                            errorMessage = 'Bad Request (400): Invalid query parameters. Please try a different search.';
                            break;
                        default:
                            errorMessage = `Server Error (${response.status}): ${response.statusText}. Please try again.`;
                    }
                    throw new Error(errorMessage);
                }
                return response.json();
            }).then(async data => {
                if (data.remark && data.remark.includes('Query timed out')) {
                    throw new Error('Too many results. Please zoom into a smaller area. (Overpass query timed out after 30 seconds)');
                }
                
                // Store the raw Overpass response for download
                window.overpassResponse = data;
                window.overpassQuery = overpassQuery;
                
                // Convert OSM data to GeoJSON for display purposes only
                const geoJsonData = osmtogeojson(data);
                
                // Filter to only include LineString features (roads) - no additional client-side filtering needed
                // since Overpass poly filter already handled the polygon intersection
                let roadFeatures = geoJsonData.features.filter(feature => {
                    return feature.geometry.type === 'LineString' && feature.properties.highway;
                });
                
                if (roadFeatures.length === 0) {
                    alert('No roads found within the selected area that match the filter criteria. Try adjusting the filter or selecting a different area.');
                    stopSpinner(previewGPXButton, 'Fetch Roads');
                    return;
                }
                
                // Apply road trimming if "truncate by edge" is enabled
                const truncateByEdge = document.getElementById('truncateByEdge').checked;
                if (truncateByEdge) {
                    console.log('Trimming roads to polygon boundary...');
                    console.log('Combined polygon:', combinedPolygon);
                    roadFeatures = this.trimRoadsToPolygon(roadFeatures, combinedPolygon);
                    console.log(`Trimmed ${roadFeatures.length} road segments`);
                }
                
                // Apply Mapillary coverage filtering if enabled
                const filterMapillaryCoverage = document.getElementById('filterMapillaryCoverage').checked;
                const coverageThreshold = parseInt(document.getElementById('coverageThreshold').value, 10);
                const proximityThreshold = parseInt(document.getElementById('proximityThreshold').value, 10) || 20;
                
                if (filterMapillaryCoverage) {
                    // Check which coverage layers are enabled
                    const enabledLayers = this.coverageManager.getEnabledCoverageLayers();
                    const enabledSources = [];
                    if (enabledLayers.mapillary) enabledSources.push('Mapillary');
                    if (enabledLayers.panoramax) enabledSources.push('Panoramax');
                    if (enabledLayers.mapilio) enabledSources.push('Mapilio');
                    
                    console.log(`Fetching coverage data from: ${enabledSources.join(', ')}`);
                    
                    try {
                        // Calculate bounding box for all roads
                        const allCoords = [];
                        roadFeatures.forEach(feature => {
                            if (feature.geometry.type === 'LineString') {
                                allCoords.push(...feature.geometry.coordinates);
                            }
                        });
                        
                        if (allCoords.length > 0) {
                            const bbox = {
                                minLat: Math.min(...allCoords.map(c => c[1])),
                                maxLat: Math.max(...allCoords.map(c => c[1])),
                                minLng: Math.min(...allCoords.map(c => c[0])),
                                maxLng: Math.max(...allCoords.map(c => c[0]))
                            };
                            
                            // Fetch coverage from all enabled sources
                            const coveragePromises = [];
                            if (enabledLayers.mapillary) {
                                coveragePromises.push(this.coverageManager.fetchMapillaryCoverageForBounds(bbox));
                            }
                            if (enabledLayers.panoramax) {
                                coveragePromises.push(this.coverageManager.fetchPanoramaxCoverageForBounds(bbox));
                            }
                            if (enabledLayers.mapilio) {
                                coveragePromises.push(this.coverageManager.fetchMapilioCoverageForBounds(bbox));
                            }
                            
                            const coverageResults = await Promise.all(coveragePromises);
                            
                            // Combine all sequences from all sources
                            const allSequences = coverageResults.flat();
                            console.log(`Total sequences from all sources: ${allSequences.length}`);
                            
                            // Calculate coverage for each road
                            roadFeatures.forEach(feature => {
                                const coveragePercent = this.coverageManager.calculateRoadCoveragePercentage(
                                    feature, 
                                    allSequences,
                                    proximityThreshold
                                );
                                feature.properties.coveragePercent = Math.round(coveragePercent);
                                feature.properties.isCovered = coveragePercent >= coverageThreshold;
                                feature.properties.coverageSources = enabledSources.join(', ');
                            });
                            
                            console.log(`Coverage analysis complete. Sources: ${enabledSources.join(', ')}, Threshold: ${coverageThreshold}%, Proximity: ${proximityThreshold}m`);
                        }
                    } catch (error) {
                        console.error('Error fetching coverage data:', error);
                        alert('Warning: Failed to fetch coverage data. Continuing without coverage filtering.');
                        // Continue without coverage data
                        roadFeatures.forEach(feature => {
                            feature.properties.coveragePercent = 0;
                            feature.properties.isCovered = false;
                            feature.properties.coverageSources = 'None';
                        });
                    }
                } else {
                    // No coverage filtering - mark all as uncovered
                    roadFeatures.forEach(feature => {
                        feature.properties.coveragePercent = 0;
                        feature.properties.isCovered = false;
                        feature.properties.coverageSources = 'None';
                    });
                }
                
                // Remove existing road layer if it exists
                if (this.geoJsonLayer) {
                    this.mapManager.getMap().removeLayer(this.geoJsonLayer);
                }
                
                // Create coordinate mappings for CPP export/import
                this.createCoordinateMappings(roadFeatures);
                
                // Create a new GeoJSON layer for roads
                this.geoJsonLayer = L.geoJSON(roadFeatures, {
                    style: function(feature) {
                        // Style based on coverage status
                        if (feature.properties.isCovered) {
                            return {
                                color: '#888888',
                                weight: 4,
                                opacity: 0.5
                            };
                        } else {
                            return {
                                color: 'red',
                                weight: 4,
                                opacity: 0.7
                            };
                        }
                    },
                    onEachFeature: function(feature, layer) {
                        // Add popup with road information
                        const props = feature.properties;
                        let coverageInfo = '';
                        if (props.coveragePercent !== undefined && props.coverageSources && props.coverageSources !== 'None') {
                            coverageInfo = `<strong>Coverage:</strong> ${props.coveragePercent}% (${props.coverageSources})<br>`;
                        }
                        const popupContent = `
                            <strong>Road Type:</strong> ${props.highway || 'Unknown'}<br>
                            <strong>Name:</strong> ${props.name || 'Unnamed'}<br>
                            <strong>Surface:</strong> ${props.surface || 'Unknown'}<br>
                            <strong>Access:</strong> ${props.access || 'Public'}<br>
                            <strong>Oneway:</strong> ${props.oneway || 'No'}<br>
                            ${coverageInfo}
                        `;
                        layer.bindPopup(popupContent);
                    }
                }).addTo(this.mapManager.getMap());
                
                // Calculate total road length and coverage statistics
                let totalLengthKm = 0;
                let coveredLengthKm = 0;
                let uncoveredLengthKm = 0;
                let coveredCount = 0;
                let uncoveredCount = 0;
                
                roadFeatures.forEach(feature => {
                    if (feature.geometry.type === 'LineString') {
                        const line = turf.lineString(feature.geometry.coordinates);
                        const length = turf.length(line, { units: 'kilometers' });
                        totalLengthKm += length;
                        
                        if (feature.properties.isCovered) {
                            coveredLengthKm += length;
                            coveredCount++;
                        } else {
                            uncoveredLengthKm += length;
                            uncoveredCount++;
                        }
                    }
                });
                
                const totalLengthMi = totalLengthKm * 0.621371;
                const coveredLengthMi = coveredLengthKm * 0.621371;
                const uncoveredLengthMi = uncoveredLengthKm * 0.621371;
                
                // Calculate the area of the combined polygon
                const areaInSquareMeters = turf.area(combinedPolygon);
                const areaInSquareKm = areaInSquareMeters / 1000000;
                const areaInSquareMi = areaInSquareMeters / 2589988.11;
                
                // Update the routeLength paragraph with road statistics
                const truncateStatus = truncateByEdge ? ' (trimmed to polygon boundary)' : '';
                
                let statsHtml = `
                    <strong>Selected Area:</strong> ${areaInSquareKm.toFixed(2)} km² (${areaInSquareMi.toFixed(2)} sq mi)<br>
                    <strong>Roads Found:</strong> ${roadFeatures.length} road segments${truncateStatus}<br>
                    <strong>Total Road Length:</strong> ${totalLengthKm.toFixed(2)} km (${totalLengthMi.toFixed(2)} mi)
                `;
                
                // Add coverage statistics if filtering is enabled
                if (filterMapillaryCoverage && (coveredCount > 0 || uncoveredCount > 0)) {
                    // Get enabled sources
                    const enabledLayers = this.coverageManager.getEnabledCoverageLayers();
                    const enabledSources = [];
                    if (enabledLayers.mapillary) enabledSources.push('Mapillary');
                    if (enabledLayers.panoramax) enabledSources.push('Panoramax');
                    if (enabledLayers.mapilio) enabledSources.push('Mapilio');
                    
                    statsHtml += `<br>
                    <strong>Coverage Analysis (${coverageThreshold}% threshold, ${enabledSources.join('/')}):</strong><br>
                    <span style="color: #888888;">● Covered:</span> ${coveredCount} segments, ${coveredLengthKm.toFixed(2)} km (${coveredLengthMi.toFixed(2)} mi)<br>
                    <span style="color: red;">● Uncovered:</span> ${uncoveredCount} segments, ${uncoveredLengthKm.toFixed(2)} km (${uncoveredLengthMi.toFixed(2)} mi)
                    `;
                }
                
                document.getElementById('routeLength').innerHTML = statsHtml;
                
                // Fit map to show all roads
                if (this.geoJsonLayer.getBounds().isValid()) {
                    this.mapManager.getMap().fitBounds(this.geoJsonLayer.getBounds());
                }
                
            }).catch(err => {
                console.error('Error fetching roads:', err);
                // If poly filter fails, provide helpful error message
                if (err.message.includes('Invalid') || err.message.includes('poly')) {
                    alert('Error: The selected area might be too complex for server-side filtering. Try selecting a simpler area or reducing the buffer size.');
                } else {
                    alert('Error fetching roads:\n\n' + (err.message || 'Failed to fetch road data from Overpass API'));
                }
            }).finally(() => {
                stopSpinner(previewGPXButton, 'Fetch Roads');
            });
        } catch (err) {
            console.error('Error combining polygons:', err);
            alert('Error combining polygons.');
            stopSpinner(previewGPXButton, 'Fetch Roads');
        }
    }

    clearAllSelectionsWithoutResettingDropdown() {
        // Clear highlighted polygons - reset their styles
        this.highlightedPolygons.forEach(layer => {
            // Check if it's a drawn item or a fetched area
            if (this.mapManager.getDrawnItems().hasLayer(layer)) {
                // Reset drawn item style
                layer.setStyle({
                    color: '#007bff',
                    fillColor: '#007bff',
                    fillOpacity: 0.2,
                    weight: 2
                });
            } else {
                // Reset fetched area style
                layer.setStyle({
                    color: 'blue',
                    weight: 2
                });
            }
        });
        this.highlightedPolygons.length = 0;
        
        // Clear drawn items
        this.mapManager.getDrawnItems().clearLayers();
        
        // Remove all layers from map
        if (this.previewLayer) {
            this.mapManager.getMap().removeLayer(this.previewLayer);
            this.previewLayer = null;
        }
        if (this.geoJsonLayer) {
            this.mapManager.getMap().removeLayer(this.geoJsonLayer);
            this.geoJsonLayer = null;
        }
        if (this.gridLayer) {
            this.mapManager.getMap().removeLayer(this.gridLayer);
            this.gridLayer = null;
        }
        if (this.cppSolutionLayer) {
            this.mapManager.getMap().removeLayer(this.cppSolutionLayer);
            this.cppSolutionLayer = null;
        }
        
        // Clear coordinate mappings
        this.coordinateToNodeIdMap.clear();
        this.nodeIdToCoordinateMap.clear();
        
        // Reset routing manager
        this.routingManager.stopAnimation();
        this.routingManager.setRoutePoints([]);
        
        // Reset UI elements (but not the dropdown)
        document.getElementById('routeLength').innerHTML = '';
        document.getElementById('searchBox').value = '';
        document.getElementById('bufferSize').value = '1';
        document.getElementById('truncateByEdge').checked = true;
        document.getElementById('consolidateTolerance').value = '15';
        document.getElementById('customFilter').value = '[highway][area!~"yes"][highway!~"bridleway|bus_guideway|construction|corridor|cycleway|elevator|footway|motorway|motorway_junction|motorway_link|escalator|proposed|platform|raceway|rest_area|path|steps"][access!~"customers|no|private"][public_transport!~"platform"][fee!~"yes"][service!~"drive-through|driveway|parking_aisle"][toll!~"yes"]';
    }

    clearAllSelections() {
        // Clear everything including resetting dropdown
        this.clearAllSelectionsWithoutResettingDropdown();
        
        // Reset to first option (will trigger the change event)
        const searchRules = document.getElementById('searchRules');
        searchRules.selectedIndex = 0;
        // Manually trigger change event to update UI
        searchRules.dispatchEvent(new Event('change'));
    }

    searchLocation() {
        const searchButton = document.getElementById('searchButton');
        const searchQuery = document.getElementById('searchBox').value;
        if (!searchQuery) {
            alert('Please enter a location to search.');
            return;
        }
        // Add loading spinner
        searchButton.classList.add('button-loading');
        searchButton.innerHTML = 'Searching <span class="spinner"></span>';
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`;
        fetch(url).then(response => response.json()).then(data => {
            if (data.length === 0) {
                alert('No results found for the search query.');
                return;
            }
            const result = data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            const display_name = result.display_name;
            this.mapManager.getMap().setView([lat, lon], 15);
            console.log('Search result:', display_name);
        }).catch(err => console.error('Error searching location:', err)).finally(() => {
            // Remove loading spinner
            searchButton.classList.remove('button-loading');
            searchButton.innerHTML = 'Search';
        });
    }

    playRouteAnimation() {
        if (!this.routingManager) {
            alert('No route to animate. Please generate the route first.');
            return;
        }
        
        // Check if we have route points set (either from CPP solution or regular roads)
        const routePoints = this.routingManager.getRoutePoints();
        if (routePoints.length === 0) {
            alert('No route to animate. Please upload a CPP solution or generate a route first.');
            return;
        }
        
        this.routingManager.startRouteAnimation();
    }

    downloadRoadDataAsCustomFormat() {
        if (!window.overpassResponse) {
            alert('No road data available. Please fetch roads first.');
            return;
        }
        
        // Download the raw Overpass response as a JSON file
        const blob = new Blob([JSON.stringify(window.overpassResponse, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'overpass_response.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleOverpassResponseUpload(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        if (!file.name.toLowerCase().endsWith('.json')) {
            alert('Please select a JSON file.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const fileText = e.target.result;
                const overpassData = JSON.parse(fileText);
                
                // Validate that this is an Overpass response
                if (!overpassData.elements || !Array.isArray(overpassData.elements)) {
                    alert('Invalid Overpass response format. The file must contain an "elements" array.');
                    event.target.value = '';
                    return;
                }

                // Store the response globally
                window.overpassResponse = overpassData;
                
                // Process and display the roads
                this.processUploadedOverpassResponse(overpassData);
                
                alert(`Successfully loaded Overpass response with ${overpassData.elements.length} elements.`);
            } catch (error) {
                console.error('Error parsing Overpass response:', error);
                alert('Error parsing JSON file. Please ensure it is a valid Overpass API response.');
            } finally {
                event.target.value = '';
            }
        };
        
        reader.onerror = () => {
            alert('Error reading file. Please try again.');
            event.target.value = '';
        };
        
        reader.readAsText(file);
    }

    processUploadedOverpassResponse(data) {
        try {
            // Convert OSM data to GeoJSON
            const geoJsonData = osmtogeojson(data);
            
            // Filter to only include LineString features (roads)
            let roadFeatures = geoJsonData.features.filter(feature => {
                return feature.geometry.type === 'LineString' && feature.properties.highway;
            });
            
            if (roadFeatures.length === 0) {
                alert('No roads found in the uploaded Overpass response.');
                return;
            }
            
            // Remove existing road layer if it exists
            if (this.geoJsonLayer) {
                this.mapManager.getMap().removeLayer(this.geoJsonLayer);
            }
            
            // Initialize coverage properties for uploaded data (no coverage analysis)
            roadFeatures.forEach(feature => {
                feature.properties.coveragePercent = 0;
                feature.properties.isCovered = false;
                feature.properties.coverageSources = 'None';
            });
            
            // Create coordinate mappings for CPP export/import
            this.createCoordinateMappings(roadFeatures);
            
            // Create a new GeoJSON layer for roads
            this.geoJsonLayer = L.geoJSON(roadFeatures, {
                style: function(feature) {
                    // Style based on coverage status
                    if (feature.properties.isCovered) {
                        return {
                            color: '#888888',
                            weight: 4,
                            opacity: 0.5
                        };
                    } else {
                        return {
                            color: 'red',
                            weight: 4,
                            opacity: 0.7
                        };
                    }
                },
                onEachFeature: function(feature, layer) {
                    // Add popup with road information
                    const props = feature.properties;
                    let coverageInfo = '';
                    if (props.coveragePercent !== undefined && props.coverageSources && props.coverageSources !== 'None') {
                        coverageInfo = `<strong>Coverage:</strong> ${props.coveragePercent}% (${props.coverageSources})<br>`;
                    }
                    const popupContent = `
                        <strong>Road Type:</strong> ${props.highway || 'Unknown'}<br>
                        <strong>Name:</strong> ${props.name || 'Unnamed'}<br>
                        <strong>Surface:</strong> ${props.surface || 'Unknown'}<br>
                        <strong>Access:</strong> ${props.access || 'Public'}<br>
                        <strong>Oneway:</strong> ${props.oneway || 'No'}<br>
                        ${coverageInfo}
                    `;
                    layer.bindPopup(popupContent);
                }
            }).addTo(this.mapManager.getMap());
            
            // Calculate total road length
            let totalLengthKm = 0;
            roadFeatures.forEach(feature => {
                if (feature.geometry.type === 'LineString') {
                    const line = turf.lineString(feature.geometry.coordinates);
                    const length = turf.length(line, { units: 'kilometers' });
                    totalLengthKm += length;
                }
            });
            
            const totalLengthMi = totalLengthKm * 0.621371;
            
            // Update the routeLength paragraph with road statistics
            document.getElementById('routeLength').innerHTML = `
                <strong>Uploaded Roads:</strong> ${roadFeatures.length} road segments<br>
                <strong>Total Road Length:</strong> ${totalLengthKm.toFixed(2)} km (${totalLengthMi.toFixed(2)} mi)
            `;
            
            // Fit map to show all roads
            if (this.geoJsonLayer.getBounds().isValid()) {
                this.mapManager.getMap().fitBounds(this.geoJsonLayer.getBounds());
            }
            
        } catch (err) {
            console.error('Error processing Overpass response:', err);
            alert('Error processing Overpass response:\n\n' + (err.message || 'Unknown error'));
        }
    }

    exportForChinesePostman() {
        if (!this.geoJsonLayer) {
            alert('No road data available. Please fetch roads first.');
            return;
        }

        try {
            // Extract road features from the current layer
            const roadFeatures = [];
            this.geoJsonLayer.eachLayer((layer) => {
                const feature = layer.feature;
                if (feature && feature.geometry.type === 'LineString') {
                    roadFeatures.push(feature);
                }
            });

            if (roadFeatures.length === 0) {
                alert('No road segments found to export.');
                return;
            }

            // Build the road graph for Chinese Postman Problem
            const roadGraph = this.buildChinesePostmanGraph(roadFeatures);
            
            // Generate OARLib native format
            const oarLibContent = this.generateOARLibFormat(roadGraph, roadFeatures);

            // Download the OARLib file
            const blob = new Blob([oarLibContent], {
                type: 'text/plain'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'route_crafter_graph.oarlib';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('OARLib format exported successfully');
        } catch (error) {
            console.error('Error exporting OARLib data:', error);
            alert('Error exporting data. Please try again.');
        }
    }

    generateOARLibFormat(roadGraph, roadFeatures) {
        // Create MIXED graphs for OARLib export
        const graphType = 'MIXED';

        // Get basic counts
        const numVertices = roadGraph.nodes.length;
        const numEdges = roadGraph.edges.length;
        
        // Determine depot (use first vertex as depot, which should be vertex 1)
        const depotId = roadGraph.nodes.length > 0 ? roadGraph.nodes[0].id : 1;

        // Build header
        let content = `%
% This is a file generated by the Open Source, Arc-Routing Library (OAR Lib).
% For more information on OAR Lib, or the format please visit: 
% https://github.com/Olibear/ArcRoutingLibrary 
%

================================
Format: OAR Lib
Graph Type: ${graphType}
Depot ID(s): ${depotId}
N: ${numVertices}
M: ${numEdges}
Problem Type: CHINESE_POSTMAN
Fleet Size: 1
Number of Depots: 1
================================

LINKS
Line Format: V1,V2,COST,isDirected,isRequired
`;

        // Add edges (mixed: directed and undirected based on edge properties)
        roadGraph.edges.forEach((edge, index) => {
            const isDirected = edge.directed === true;
            const isRequired = true; // All edges required for Chinese Postman Problem
            
            content += `${edge.source},${edge.target},${Math.round(edge.weight)},${isDirected},${isRequired}\n`;
        });

        content += `===========END LINKS============

VERTICES
Line Format: x,y
`;

        // Add vertex coordinates
        roadGraph.nodes.forEach(node => {
            const coord = this.nodeIdToCoordinateMap.get(node.id);
            if (coord) {
                // Convert from [lng, lat] to [x, y] format (longitude, latitude)
                content += `${coord[0]},${coord[1]}\n`;
            } else {
                // Fallback coordinates if mapping not found
                content += `0.0,0.0\n`;
            }
        });

        content += `===========END VERTICES============`;

        return content;
    }

    getHighwayTypeFromProperties(properties) {
        // Determine highway type from OSM properties
        if (properties.highway) {
            const highwayType = properties.highway;
            if (['motorway', 'trunk', 'primary', 'secondary'].includes(highwayType)) {
                return 'HIGHWAY';
            } else {
                return 'STREET';
            }
        }
        return 'STREET';
    }

    createCoordinateMappings(roadFeatures) {
        // Clear existing mappings
        this.coordinateToNodeIdMap.clear();
        this.nodeIdToCoordinateMap.clear();
        
        let nodeIdCounter = 1; // Start from 1 for OARLib compatibility

        // Helper function to get or create node ID for a coordinate
        const getNodeId = (coord) => {
            const key = `${coord[0].toFixed(8)},${coord[1].toFixed(8)}`;
            if (this.coordinateToNodeIdMap.has(key)) {
                return this.coordinateToNodeIdMap.get(key);
            }
            
            const nodeId = nodeIdCounter++;
            this.coordinateToNodeIdMap.set(key, nodeId);
            this.nodeIdToCoordinateMap.set(nodeId, coord);
            
            return nodeId;
        };

        // Process each road feature to create coordinate mappings
        roadFeatures.forEach((feature) => {
            if (feature.geometry.type === 'LineString') {
                const coordinates = feature.geometry.coordinates;
                
                // Create node IDs for all coordinates in the road
                coordinates.forEach(coord => {
                    getNodeId(coord);
                });
            }
        });
        
        console.log(`Created coordinate mappings for ${this.nodeIdToCoordinateMap.size} nodes`);
    }

    // New method to ensure depot connectivity
    ensureDepotConnectivity(roadFeatures, nodes, edges) {
        // Find the first coordinate that will be used in edges
        let firstUsedCoord = null;
        for (const feature of roadFeatures) {
            if (feature.geometry.type === 'LineString' && feature.geometry.coordinates.length > 0) {
                firstUsedCoord = feature.geometry.coordinates[0];
                break;
            }
        }
        
        if (!firstUsedCoord) {
            throw new Error('No valid coordinates found in road features');
        }
        
        // Get the current ID for the first coordinate
        const firstCoordKey = `${firstUsedCoord[0].toFixed(8)},${firstUsedCoord[1].toFixed(8)}`;
        const currentFirstId = this.coordinateToNodeIdMap.get(firstCoordKey);
        
        // If the first coordinate is not vertex 1, we need to swap IDs
        if (currentFirstId !== 1) {
            console.log(`Swapping vertex IDs: ${currentFirstId} <-> 1 to ensure depot connectivity`);
            
            // Get the coordinate for vertex 1
            const vertex1Coord = this.nodeIdToCoordinateMap.get(1);
            const vertex1Key = vertex1Coord ? `${vertex1Coord[0].toFixed(8)},${vertex1Coord[1].toFixed(8)}` : null;
            
            // Swap the mappings
            this.coordinateToNodeIdMap.set(firstCoordKey, 1);
            this.nodeIdToCoordinateMap.set(1, firstUsedCoord);
            
            if (vertex1Key) {
                this.coordinateToNodeIdMap.set(vertex1Key, currentFirstId);
                this.nodeIdToCoordinateMap.set(currentFirstId, vertex1Coord);
            }
            
            // Update all edge references
            edges.forEach(edge => {
                if (edge.source === currentFirstId) {
                    edge.source = 1;
                } else if (edge.source === 1) {
                    edge.source = currentFirstId;
                }
                if (edge.target === currentFirstId) {
                    edge.target = 1;
                } else if (edge.target === 1) {
                    edge.target = currentFirstId;
                }
            });
            
            // Update node IDs
            nodes.forEach(node => {
                if (node.id === currentFirstId) {
                    node.id = 1;
                } else if (node.id === 1) {
                    node.id = currentFirstId;
                }
            });
        }
        
        console.log(`Depot vertex is now: ${nodes.find(n => n.id === 1) ? '1' : 'not found'}`);
    }

    buildChinesePostmanGraph(roadFeatures) {
        const nodes = [];
        const edges = [];
        let nodeIdCounter = 1; // Start from 1 for OARLib compatibility
        let edgeIdCounter = 0;

        // Use existing mappings or create new ones if needed
        if (this.nodeIdToCoordinateMap.size === 0) {
            this.createCoordinateMappings(roadFeatures);
        }

        // Always create mixed graphs for OARLib (both directed and undirected edges)
        const treatAsUndirected = false;

        // Helper function to get node ID for a coordinate (should already exist)
        const getNodeId = (coord) => {
            const key = `${coord[0].toFixed(8)},${coord[1].toFixed(8)}`;
            if (this.coordinateToNodeIdMap.has(key)) {
                return this.coordinateToNodeIdMap.get(key);
            }
            
            // This shouldn't happen if mappings were created properly
            console.warn('Coordinate mapping not found for:', coord);
            const nodeId = nodeIdCounter++;
            this.coordinateToNodeIdMap.set(key, nodeId);
            this.nodeIdToCoordinateMap.set(nodeId, coord);
            
            return nodeId;
        };

        // Create nodes from existing mappings
        this.nodeIdToCoordinateMap.forEach((coord, nodeId) => {
            nodes.push({
                id: nodeId
            });
        });

        // Track which vertices are actually used in edges
        const usedVertices = new Set();

        // Process each road feature
        roadFeatures.forEach((feature, featureIndex) => {
            const coordinates = feature.geometry.coordinates;
            const properties = feature.properties || {};
            
            // Create edges between consecutive coordinates
            for (let i = 0; i < coordinates.length - 1; i++) {
                const sourceCoord = coordinates[i];
                const targetCoord = coordinates[i + 1];
                
                const sourceNodeId = getNodeId(sourceCoord);
                const targetNodeId = getNodeId(targetCoord);
                
                // Calculate distance between coordinates (weight for CPP)
                const sourcePoint = turf.point(sourceCoord);
                const targetPoint = turf.point(targetCoord);
                const distance = turf.distance(sourcePoint, targetPoint, { units: 'meters' });
                
                // Skip zero-length edges
                if (distance === 0) continue;
                
                // Track used vertices
                usedVertices.add(sourceNodeId);
                usedVertices.add(targetNodeId);
                
                // Extract road information from feature properties
                const roadName = properties.name ? properties.name.replace(/,/g, '_') : 'Road';
                const highwayType = this.getHighwayTypeFromProperties(properties);
                
                if (treatAsUndirected) {
                    // For undirected graphs, create a single undirected edge
                    // Use a consistent ordering to avoid duplicates (smaller node ID first)
                    const edgeSource = Math.min(sourceNodeId, targetNodeId);
                    const edgeTarget = Math.max(sourceNodeId, targetNodeId);
                    
                    edges.push({
                        source: edgeSource,
                        target: edgeTarget,
                        weight: Math.round(distance * 100) / 100,
                        directed: false,
                        roadName: roadName,
                        highwayType: highwayType
                    });
                } else {
                    // Determine if road is one-way (including roundabouts)
                    const isOneway = properties.oneway === 'yes' || 
                                    properties.oneway === '1' || 
                                    properties.oneway === 'true' ||
                                    properties.junction === 'roundabout';
                    
                    // Create edge(s) based on directionality
                    if (isOneway) {
                        // One-way road - single directed edge
                        edges.push({
                            source: sourceNodeId,
                            target: targetNodeId,
                            weight: Math.round(distance * 100) / 100,
                            directed: true,
                            roadName: roadName,
                            highwayType: highwayType
                        });
                    } else {
                        // Two-way road - create single undirected edge for mixed graph
                        edges.push({
                            source: sourceNodeId,
                            target: targetNodeId,
                            weight: Math.round(distance * 100) / 100,
                            directed: false,
                            roadName: roadName,
                            highwayType: highwayType
                        });
                    }
                }
            }
        });

        // Filter out unused vertices (isolated vertices)
        const connectedNodes = nodes.filter(node => usedVertices.has(node.id));
        
        // Ensure depot (vertex 1) is connected
        if (connectedNodes.length === 0) {
            throw new Error('No connected vertices found in the selected area');
        }
        
        // Ensure depot connectivity by swapping vertex IDs if needed
        this.ensureDepotConnectivity(roadFeatures, connectedNodes, edges);
        
        console.log(`Created mixed graph with ${connectedNodes.length} nodes and ${edges.length} edges`);
        console.log(`Depot vertex: ${connectedNodes.find(n => n.id === 1) ? '1' : 'not found'}`);
        
        return { nodes: connectedNodes, edges };
    }

    handleCPPSolutionUpload(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        // Accept both .txt and .csv files
        if (!file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.csv')) {
            alert('Please select a .txt or .csv file.');
            event.target.value = ''; // Reset input to allow re-uploading the same file
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const fileText = e.target.result;
                const solutionPath = this.parseOARLibSolution(fileText);
                if (solutionPath && solutionPath.length > 0) {
                    this.visualizeCPPSolution(solutionPath);
                } else {
                    alert('No valid path found in the file. Please check the format.');
                }
            } catch (error) {
                console.error('Error parsing solution file:', error);
                alert('Error parsing solution file. Please check the format and try again.');
            } finally {
                // Reset the input value to allow re-uploading the same file
                event.target.value = '';
            }
        };
        
        reader.onerror = () => {
            alert('Error reading file. Please try again.');
            // Reset the input value to allow re-uploading the same file
            event.target.value = '';
        };
        
        reader.readAsText(file);
    }

    parseOARLibSolution(fileText) {
        const lines = fileText.trim().split('\n');
        let vertexPath = [];
        let inRouteSection = false;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            // Look for the route section
            if (trimmedLine.includes('[') && trimmedLine.includes(']')) {
                inRouteSection = true;
                // Extract the route from the line like: [1-22-21-20-19-18-17-16-15-14-13-8-12-11-10-9-48-49-50-130-131-96-139-138-137-136-140-141-140-136-135-79-80-81-82-83-84-83-111-112-113-114-127-126-125-124-125-126-127-46-47-46-127-114-134-121-122-123-115-146-147-148-147-146-115-116-117-118-150-149-150-118-117-118-119-120-119-118-117-144-145-144-117-116-115-123-122-121-133-132-43-44-45-44-43-75-74-42-73-42-41-40-39-128-39-129-39-40-41-42-74-75-43-132-133-121-134-114-113-112-111-83-82-86-85-110-143-87-88-87-143-110-109-108-107-95-107-108-109-110-85-142-89-141-89-90-91-92-93-94-95-106-105-104-103-102-101-100-99-98-97-96-131-130-50-49-48-9-10-11-12-8-7-6-3-2-3-4-5-4-3-4-5-51-50-51-5-52-32-31-32-53-54-61-62-63-64-38-64-63-62-61-54-60-59-58-57-56-55-56-76-77-78-79-78-77-76-56-55-72-55-72-71-70-69-70-71-72-71-70-69-73-69-68-67-66-65-38-37-33-36-33-34-35-30-31-30-29-28-27-26-25-24-23-1]
                const routeMatch = trimmedLine.match(/\[([^\]]+)\]/);
                if (routeMatch) {
                    const routeString = routeMatch[1];
                    const vertices = routeString.split('-').map(v => parseInt(v.trim()));
                    
                    // Filter out any invalid vertex IDs
                    vertexPath = vertices.filter(v => !isNaN(v));
                    break;
                }
            }
        }
        
        if (vertexPath.length === 0) {
            // Fallback to CSV parsing for backward compatibility
            return this.parseCPPSolutionCSV(fileText);
        }
        
        console.log('Parsed OARLib solution path:', vertexPath);
        return vertexPath;
    }

    parseCPPSolutionCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const vertexPath = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            const vertex = parseInt(trimmedLine);
            if (isNaN(vertex)) {
                console.warn('Skipping invalid vertex ID:', trimmedLine);
                continue;
            }
            
            vertexPath.push(vertex);
        }
        
        if (vertexPath.length === 0) {
            alert('No valid vertex IDs found in the CSV file. Expected format: single vertex ID per line (e.g., 28, 29, 28, 27...)');
            return null;
        }
        
        console.log('Parsed vertex path:', vertexPath);
        return vertexPath;
    }

    visualizeCPPSolution(vertexPath) {
        // Remove existing CPP solution layer
        if (this.cppSolutionLayer) {
            this.mapManager.getMap().removeLayer(this.cppSolutionLayer);
            this.cppSolutionLayer = null;
        }

        if (!vertexPath || vertexPath.length === 0) {
            alert('No valid vertex path found in the CSV file.');
            return;
        }

        // Reconstruct the path from vertex sequence
        const reconstructedPath = this.reconstructPathFromVertices(vertexPath);
        const hasCoordinateMappings = this.nodeIdToCoordinateMap.size > 0;
        
        if (reconstructedPath.length === 0) {
            alert('Unable to reconstruct path from the provided vertex IDs. The node IDs may not correspond to existing map features.');
            return;
        }

        // Create a polyline for the solution path
        const pathLayer = L.polyline(reconstructedPath, {
            color: '#ff6b00',
            weight: 6,
            opacity: 0.8,
            dashArray: '10, 10'
        });

        // Add markers for start and end points
        const startMarker = L.marker(reconstructedPath[0], {
            icon: L.divIcon({
                className: 'cpp-start-marker',
                html: '<div style="background-color: #00ff00; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [20, 20]
            })
        });

        const endMarker = L.marker(reconstructedPath[reconstructedPath.length - 1], {
            icon: L.divIcon({
                className: 'cpp-end-marker',
                html: '<div style="background-color: #ff0000; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [20, 20]
            })
        });

        // Create a feature group to hold all solution elements
        this.cppSolutionLayer = L.featureGroup([pathLayer, startMarker, endMarker]);
        
        // Add popup with solution information
        const pathDescription = `${vertexPath.length} vertices`;
        const mappingStatus = hasCoordinateMappings ? 
            '<br><span style="color: green;">✓</span> <em>Mapped to actual road coordinates</em>' : 
            '<br><span style="color: orange;">⚠</span> <em>Using demonstration path (no roads fetched yet)</em>';
        
        const pathInfo = `
            <strong>Chinese Postman Solution (Vertex Path)</strong><br>
            ${pathDescription}${mappingStatus}
        `;
        
        pathLayer.bindPopup(pathInfo);
        this.cppSolutionLayer.addTo(this.mapManager.getMap());

        // Fit map to show the solution path
        if (this.cppSolutionLayer.getBounds().isValid()) {
            this.mapManager.getMap().fitBounds(this.cppSolutionLayer.getBounds());
        }

        // Update route length display
        const mappingNote = hasCoordinateMappings ? 
            '<br><span style="color: green;">✓</span> Mapped to actual road coordinates' : 
            '<br><span style="color: orange;">⚠</span> Demonstration path (fetch roads first for real mapping)';
        
        const animationNote = reconstructedPath.length > 0 ? 
            '<br><span style="color: #007bff;">🎬</span> Ready for animation - click "Play Route" to animate' : '';
        
        document.getElementById('routeLength').innerHTML = `
            <strong>CPP Solution (Vertex Path):</strong> ${pathDescription}${mappingNote}<br>
            <span style="color: #ff6b00;">●</span> Orange dashed line shows the solution path${animationNote}
        `;

        // Set route points for animation
        this.routingManager.setRoutePoints(reconstructedPath);
        
        console.log('CPP Solution visualized:', vertexPath);
        console.log('Route points set for animation:', reconstructedPath.length);
    }


    reconstructPathFromVertices(vertexPath) {
        // Reconstruct the path using stored coordinate mappings for vertex sequence
        if (vertexPath.length === 0) {
            return [];
        }
        
        const reconstructedPath = [];
        
        // Map each vertex ID to its coordinate
        for (const vertexId of vertexPath) {
            const coord = this.nodeIdToCoordinateMap.get(vertexId);
            if (coord) {
                // Convert [lng, lat] to [lat, lng]
                reconstructedPath.push([coord[1], coord[0]]);
            }
        }
        
        // If we couldn't map any coordinates, fall back to a demonstration path
        if (reconstructedPath.length === 0) {
            console.warn('No coordinate mappings found for vertex path. This might be because no roads have been fetched yet.');
            return this.createVertexDemonstrationPath(vertexPath);
        }
        
        // Remove duplicate consecutive coordinates to create a cleaner path
        return this.removeDuplicateCoordinates(reconstructedPath);
    }

    removeDuplicateCoordinates(path) {
        if (path.length <= 1) return path;
        
        const cleanedPath = [path[0]];
        
        for (let i = 1; i < path.length; i++) {
            const current = path[i];
            const previous = cleanedPath[cleanedPath.length - 1];
            
            // Check if coordinates are different (with small tolerance for floating point precision)
            const tolerance = 0.000001;
            if (Math.abs(current[0] - previous[0]) > tolerance || Math.abs(current[1] - previous[1]) > tolerance) {
                cleanedPath.push(current);
            }
        }
        
        return cleanedPath;
    }


    createVertexDemonstrationPath(vertexPath) {
        // Fallback: Create a demonstration path when no coordinate mappings exist for vertex path
        const reconstructedPath = [];
        
        const centerLat = 51.505;
        const centerLng = -0.09;
        const radius = 0.05; // degrees
        
        // Start from the center
        let currentLat = centerLat;
        let currentLng = centerLng;
        reconstructedPath.push([currentLat, currentLng]);
        
        // Create a connected path that represents the vertex sequence
        let angle = 0;
        const angleStep = (2 * Math.PI) / Math.max(vertexPath.length, 10);
        
        for (let i = 0; i < vertexPath.length; i++) {
            const vertexId = vertexPath[i];
            
            // Calculate next position based on angle and vertex ID
            const latOffset = (radius * Math.cos(angle)) * (0.3 + (vertexId % 10) / 100);
            const lngOffset = (radius * Math.sin(angle)) * (0.3 + (vertexId % 10) / 100);
            
            currentLat += latOffset;
            currentLng += lngOffset;
            
            reconstructedPath.push([currentLat, currentLng]);
            
            // Adjust angle for next point to create a more realistic path
            angle += angleStep * (0.7 + (vertexId % 5) / 50);
        }
        
        return this.smoothPath(reconstructedPath);
    }

    smoothPath(path) {
        if (path.length < 3) return path;
        
        const smoothed = [path[0]];
        
        for (let i = 1; i < path.length - 1; i++) {
            const prev = path[i - 1];
            const curr = path[i];
            const next = path[i + 1];
            
            // Simple smoothing by averaging adjacent points
            const smoothedLat = (prev[0] + curr[0] + next[0]) / 3;
            const smoothedLng = (prev[1] + curr[1] + next[1]) / 3;
            
            smoothed.push([smoothedLat, smoothedLng]);
        }
        
        smoothed.push(path[path.length - 1]);
        return smoothed;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RouteCrafterApp();
});
