// Main application module

import { MapManager } from './map.js';
import { RoutingManager } from './routing.js';
import { CoverageManager } from './coverage.js';
import { AreaManager } from './area-manager.js';
import { RoadProcessor } from './road-processor.js';
import { GraphBuilder } from './graph-builder.js';
import { SolutionVisualizer } from './solution-visualizer.js';
import { stopSpinner } from './utils.js';

export class RouteCrafterApp {
    constructor() {
        this.mapManager = null;
        this.routingManager = null;
        this.coverageManager = null;
        this.areaManager = null;
        this.roadProcessor = null;
        this.graphBuilder = null;
        this.solutionVisualizer = null;
        
        // Coordinate mappings (shared state across modules)
        this.coordinateToNodeIdMap = new Map();
        this.nodeIdToCoordinateMap = new Map();
        
        // Coordinate mappings for largest component (when exported)
        this.largestComponentCoordinateToNodeIdMap = new Map();
        this.largestComponentNodeIdToCoordinateMap = new Map();
        
        this.init();
    }

    init() {
        // Initialize map manager first
        this.mapManager = new MapManager();
        
        // Initialize routing manager
        this.routingManager = new RoutingManager(this.mapManager);
        
        // Initialize coverage manager
        this.coverageManager = new CoverageManager(this.mapManager.getMap(), this.mapManager.getBaseMaps());
        
        // Initialize area manager
        this.areaManager = new AreaManager(this.mapManager);
        
        // Initialize road processor
        this.roadProcessor = new RoadProcessor(this.mapManager, this.areaManager, this.coverageManager);
        
        // Initialize graph builder
        this.graphBuilder = new GraphBuilder();
        
        // Initialize solution visualizer
        this.solutionVisualizer = new SolutionVisualizer(this.mapManager, this.routingManager);
        
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
            const isFromDrawArea = this.areaManager.getPreviousSearchRule() === 'draw_area';
            const isToDrawArea = selectedValue === 'draw_area';
            const isFromGrid = this.areaManager.getPreviousSearchRule() === 'grid_500m' || 
                               this.areaManager.getPreviousSearchRule() === 'grid_1km' || 
                               this.areaManager.getPreviousSearchRule() === 'grid_1500m';
            const isToGrid = selectedValue === 'grid_500m' || 
                            selectedValue === 'grid_1km' || 
                            selectedValue === 'grid_1500m';
            
            // Always reset when switching from or to Draw Area or Grid
            if (isFromDrawArea || isToDrawArea || isFromGrid || isToGrid) {
                this.clearAllSelectionsWithoutResettingDropdown();
            }
            
            // Update previous search rule
            this.areaManager.setPreviousSearchRule(selectedValue);
            
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
            this.areaManager.handleDrawCreated(event);
        });

        // Handle draw deleted event
        this.mapManager.getMap().on(L.Draw.Event.DELETED, (event) => {
            const layers = event.layers;
            const highlightedPolygons = this.areaManager.getHighlightedPolygons();
            layers.eachLayer((layer) => {
                // Remove from highlighted polygons if it was selected
                const index = highlightedPolygons.indexOf(layer);
                if (index > -1) {
                    highlightedPolygons.splice(index, 1);
                }
            });
            // Update preview after deletion
            this.areaManager.previewCombinedPolygon();
        });

        // Handle draw edited event
        this.mapManager.getMap().on(L.Draw.Event.EDITED, (event) => {
            // Update preview after editing
            this.areaManager.previewCombinedPolygon();
        });

        // Buffer size changes
        document.getElementById('bufferSize').addEventListener('input', () => {
            this.areaManager.previewCombinedPolygon();
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
            this.areaManager.previewCombinedPolygon();
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

        // Boundary buffer wheel
        document.getElementById('boundaryBuffer').addEventListener('wheel', (event) => {
            event.preventDefault();
            let currentValue = parseInt(event.target.value, 10);
            if (isNaN(currentValue)) currentValue = 500;
            const step = 50;
            if (event.deltaY < 0) {
                event.target.value = Math.min(currentValue + step, 2000);
            } else if (event.deltaY > 0) {
                event.target.value = Math.max(currentValue - step, 1);
            }
        });

        // Disable zooming when hovering over inputs
        const bufferInput = document.getElementById('bufferSize');
        const consolidateToleranceInput = document.getElementById('consolidateTolerance');
        const coverageThresholdInput = document.getElementById('coverageThreshold');
        const proximityThresholdInput = document.getElementById('proximityThreshold');
        const boundaryBufferInput = document.getElementById('boundaryBuffer');

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

        boundaryBufferInput.addEventListener('mouseover', () => {
            this.mapManager.getMap().scrollWheelZoom.disable();
        });

        boundaryBufferInput.addEventListener('mouseout', () => {
            this.mapManager.getMap().scrollWheelZoom.enable();
        });

        // Toggle visibility of threshold inputs based on coverage filtering checkbox
        const filterMapillaryCoverageCheckbox = document.getElementById('filterMapillaryCoverage');
        const coverageThresholdContainer = coverageThresholdInput.parentElement;
        const proximityThresholdContainer = proximityThresholdInput.parentElement;
        
        const updateThresholdVisibility = () => {
            // Show thresholds only if checkbox is checked (regardless of coverage layers)
            if (filterMapillaryCoverageCheckbox.checked) {
                coverageThresholdContainer.style.display = 'flex';
                proximityThresholdContainer.style.display = 'flex';
            } else {
                coverageThresholdContainer.style.display = 'none';
                proximityThresholdContainer.style.display = 'none';
            }
        };
        
        // Set initial state (checkbox unchecked by default, so hide)
        updateThresholdVisibility();
        
        // Add event listener for checkbox changes
        filterMapillaryCoverageCheckbox.addEventListener('change', updateThresholdVisibility);

        // Toggle visibility of boundary buffer based on navigation past boundary checkbox
        const allowNavigationPastBoundaryCheckbox = document.getElementById('allowNavigationPastBoundary');
        const boundaryBufferContainer = boundaryBufferInput.parentElement;
        const exportFormatSelect = document.getElementById('exportFormatSelect');
        
        const updateBoundaryBufferVisibility = () => {
            // Only show "Allow navigation past boundary" for Windy Rural Postman mode
            const exportFormat = exportFormatSelect ? exportFormatSelect.value : 'windy_rural_benavent';
            const allowNavContainer = allowNavigationPastBoundaryCheckbox.parentElement;
            
            if (exportFormat.includes('rural')) {
                allowNavContainer.style.display = 'flex';
                // Show boundary buffer if navigation past boundary is checked
                if (allowNavigationPastBoundaryCheckbox.checked) {
                    boundaryBufferContainer.style.display = 'flex';
                } else {
                    boundaryBufferContainer.style.display = 'none';
                }
            } else {
                // Hide both for non-rural modes
                allowNavContainer.style.display = 'none';
                boundaryBufferContainer.style.display = 'none';
            }
        };
        
        // Set initial state (checkbox is unchecked by default, so hide it)
        updateBoundaryBufferVisibility();
        
        // Add event listener for checkbox changes
        allowNavigationPastBoundaryCheckbox.addEventListener('change', updateBoundaryBufferVisibility);
        
        // Listen for export format changes
        if (exportFormatSelect) {
            exportFormatSelect.addEventListener('change', updateBoundaryBufferVisibility);
        }

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
            this.areaManager.fetchAreasByRule();
        });

        // Preview GPX button
        document.getElementById('previewGPXButton').addEventListener('click', () => {
            this.roadProcessor.fetchRoadsInArea(
                (roadFeatures) => this.createCoordinateMappings(roadFeatures)
            );
        });

        // Export GPX button
        document.getElementById('exportGPXButton').addEventListener('click', () => {
            // Attempt to get route points from routing manager
            const routePoints = this.routingManager && this.routingManager.getRoutePoints ? this.routingManager.getRoutePoints() : [];
            if (!routePoints || routePoints.length === 0) {
                alert('No route available to export. Generate or apply a route first.');
                return;
            }

            // Use timestamped filename
            const now = new Date();
            const filename = `route-${now.toISOString().replace(/[:.]/g, '-')}.gpx`;
            this.exportRouteToGPX(routePoints, filename);
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

        // Export CPP: require depot
        document.getElementById('exportCPPButton').addEventListener('click', () => {
            const selectedDepot = this.mapManager.getSelectedDepotId && this.mapManager.getSelectedDepotId();
            if (!selectedDepot) {
                alert('Please set the starting location by right-clicking on the map (or press and hold for touch screens)');
                return;
            }

            this.graphBuilder.exportForChinesePostman(
                this.roadProcessor.getGeoJsonLayer(),
                this.coordinateToNodeIdMap,
                this.nodeIdToCoordinateMap
            );
        });

        // Export largest component: require depot
        document.getElementById('exportLargestComponentButton').addEventListener('click', () => {
            const selectedDepot = this.mapManager.getSelectedDepotId && this.mapManager.getSelectedDepotId();
            if (!selectedDepot) {
                alert('Please set the starting location by right-clicking on the map (or press and hold for touch screens)');
                return;
            }

            const mappings = this.graphBuilder.exportLargestComponentForChinesePostman(
                this.roadProcessor.getGeoJsonLayer(),
                this.coordinateToNodeIdMap,
                this.nodeIdToCoordinateMap
            );
            
            // Store the renumbered coordinate mappings for use with "Apply Solution (Largest Component)"
            if (mappings) {
                this.largestComponentCoordinateToNodeIdMap = mappings.coordinateToNodeIdMap;
                this.largestComponentNodeIdToCoordinateMap = mappings.nodeIdToCoordinateMap;
                console.log('Stored largest component coordinate mappings for solution application');
            }
        });

        // Show Vertex Markers checkbox
        document.getElementById('showVertexMarkersCheckbox').addEventListener('change', (event) => {
            console.log('Checkbox changed:', event.target.checked, 'Vertices:', this.nodeIdToCoordinateMap.size);
            if (event.target.checked) {
                this.mapManager.showVertexMarkers(this.nodeIdToCoordinateMap);
            } else {
                this.mapManager.hideVertexMarkers();
            }
        });

        // Clear button
        document.getElementById('clearButton').addEventListener('click', () => {
            this.clearAllSelections();
        });

        // Apply CPP Solution button
        document.getElementById('applyCPPSolutionButton').addEventListener('click', () => {
            // Stop any running animation by clicking the close button
            document.getElementById('closeBtn').click();
            
            const solutionText = document.getElementById('oarlibSolutionTextarea').value.trim();
            
            if (!solutionText) {
                alert('Please paste an OARLib solution into the text box.');
                return;
            }
            
            if (this.nodeIdToCoordinateMap.size === 0) {
                const proceed = confirm(
                    'No roads have been fetched yet. The solution will be shown as a demonstration path.\n\n' +
                    'For accurate mapping:\n' +
                    '1. First select an area and click "Fetch Roads"\n' +
                    '2. Then click "Export OARLib Format" to get the file\n' +
                    '3. Finally paste your solution here\n\n' +
                    'Do you want to proceed with a demonstration path?'
                );
                if (!proceed) return;
            }
            
            this.solutionVisualizer.handleCPPSolutionText(solutionText, this.nodeIdToCoordinateMap);
        });

        // Apply Largest Component Solution button
        document.getElementById('applyLargestComponentSolutionButton').addEventListener('click', () => {
            // Stop any running animation by clicking the close button
            document.getElementById('closeBtn').click();
            
            const solutionText = document.getElementById('oarlibSolutionTextarea').value.trim();
            
            if (!solutionText) {
                alert('Please paste an OARLib solution into the text box.');
                return;
            }
            
            if (this.largestComponentNodeIdToCoordinateMap.size === 0) {
                alert(
                    'No largest component has been exported yet.\n\n' +
                    'Please:\n' +
                    '1. First select an area and click "Fetch Roads"\n' +
                    '2. Then click "Export Largest Component OARLib" to get the file\n' +
                    '3. Solve the problem with OARLib\n' +
                    '4. Finally paste your solution here and click this button'
                );
                return;
            }
            
            this.solutionVisualizer.handleCPPSolutionText(solutionText, this.largestComponentNodeIdToCoordinateMap);
        });

        document.getElementById('overpassUploadInput').addEventListener('change', (event) => {
            this.roadProcessor.handleOverpassResponseUpload(
                event,
                (roadFeatures) => this.createCoordinateMappings(roadFeatures)
            );
        });
    }

    createCoordinateMappings(roadFeatures) {
        this.graphBuilder.createCoordinateMappings(
            roadFeatures,
            this.coordinateToNodeIdMap,
            this.nodeIdToCoordinateMap
        );
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

    clearAllSelectionsWithoutResettingDropdown() {
        // Clear area manager layers
        this.areaManager.clearLayers();
        
        // Clear drawn items
        this.mapManager.getDrawnItems().clearLayers();
        
        // Clear road processor layers
        this.roadProcessor.clearLayers();
        
        // Clear solution visualizer layers
        this.solutionVisualizer.clearLayers();
        
        // Clear depot marker
        this.mapManager.clearDepotMarker();
        
        // Clear coordinate mappings
        this.coordinateToNodeIdMap.clear();
        this.nodeIdToCoordinateMap.clear();
        
        // Clear largest component coordinate mappings
        this.largestComponentCoordinateToNodeIdMap.clear();
        this.largestComponentNodeIdToCoordinateMap.clear();
        
        // Reset routing manager
        this.routingManager.stopAnimation();
        this.routingManager.setRoutePoints([]);
        
        // Reset UI elements (but not the dropdown)
        document.getElementById('routeLength').innerHTML = '';
        document.getElementById('searchBox').value = '';
        document.getElementById('bufferSize').value = '1';
        document.getElementById('truncateByEdge').checked = true;
        document.getElementById('allowNavigationPastBoundary').checked = false;
        document.getElementById('boundaryBuffer').value = '500';
        document.getElementById('consolidateTolerance').value = '15';
        document.getElementById('navigationFilter').value = '[highway][area!~"yes"][highway!~"bridleway|bus_guideway|construction|corridor|cycleway|elevator|footway|motorway|motorway_junction|motorway_link|escalator|proposed|platform|raceway|rest_area|path|steps"][access!~"customers|no|private"][public_transport!~"platform"][fee!~"yes"][service!~"drive-through|driveway|parking_aisle"][toll!~"yes"]';
        document.getElementById('routeFilter').value = '';
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
        // Export route points (array of [lat, lng]) to a GPX file and trigger download
        exportRouteToGPX(routePoints, filename = 'route.gpx') {
            if (!routePoints || routePoints.length === 0) return;

            // Build GPX content (minimal GPX 1.1 track)
            const header = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Route Crafter" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <name>${filename}</name>\n    <trkseg>\n`;
            const footer = '    </trkseg>\n  </trk>\n</gpx>';

            // Each point is [lat, lng]
            const pts = routePoints.map(p => {
                const lat = p[0];
                const lon = p[1];
                return `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`;
            }).join('\n');

            const gpx = header + pts + '\n' + footer;

            const blob = new Blob([gpx], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }
    }

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RouteCrafterApp();
});
