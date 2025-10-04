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
        this.drawingEnabled = false;
        this.cppSolutionLayer = null;
        this.coordinateToNodeIdMap = new Map();
        this.nodeIdToCoordinateMap = new Map();
        
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
        // Drawing toggle
        document.getElementById('drawToggleButton').addEventListener('click', () => {
            this.drawingEnabled = !this.drawingEnabled;
            const button = document.getElementById('drawToggleButton');
            if (this.drawingEnabled) {
                button.textContent = 'Disable Drawing';
                button.style.backgroundColor = '#28a745';
                // Enable drawing tools
                const drawControl = this.mapManager.getDrawControl();
                drawControl._toolbars.draw._modes.polygon.handler.enable();
                drawControl._toolbars.draw._modes.rectangle.handler.enable();
            } else {
                button.textContent = 'Toggle Drawing';
                button.style.backgroundColor = '#007bff';
                // Disable drawing tools
                const drawControl = this.mapManager.getDrawControl();
                drawControl._toolbars.draw._modes.polygon.handler.disable();
                drawControl._toolbars.draw._modes.rectangle.handler.disable();
            }
        });

        // Draw events
        this.mapManager.getMap().on(L.Draw.Event.CREATED, (event) => {
            this.handleDrawCreated(event);
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

        // Disable zooming when hovering over inputs
        const bufferInput = document.getElementById('bufferSize');
        const consolidateToleranceInput = document.getElementById('consolidateTolerance');

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

        // Search button
        document.getElementById('searchButton').addEventListener('click', () => {
            this.searchLocation();
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

        // File upload handler
        document.getElementById('cppUploadInput').addEventListener('change', (event) => {
            this.handleCPPSolutionUpload(event);
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
                this.selectPolygon(layer);
                this.previewDrawnAreaWithBuffer(layer);
            });
        }
    }

    selectPolygon(layer) {
        // Remove existing highlights
        this.highlightedPolygons.forEach(polygon => {
            if (this.mapManager.getMap().hasLayer(polygon)) {
                this.mapManager.getMap().removeLayer(polygon);
            }
        });
        this.highlightedPolygons.length = 0;
        
        // Highlight the clicked drawn area
        const highlightLayer = L.polygon(layer.getLatLngs(), {
            color: '#ff6b6b',
            fillColor: '#ff6b6b',
            fillOpacity: 0.3,
            weight: 3
        });
        highlightLayer.addTo(this.mapManager.getMap());
        this.highlightedPolygons.push(highlightLayer);
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
        // Add loading spinner
        fetchButton.classList.add('button-loading');
        fetchButton.innerHTML = 'Finding Areas <span class="spinner"></span>';
        const selectedRule = document.getElementById('searchRules').value;
        
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
        
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
        
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
            
            const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
            
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
                
                // Remove existing road layer if it exists
                if (this.geoJsonLayer) {
                    this.mapManager.getMap().removeLayer(this.geoJsonLayer);
                }
                
                // Create coordinate mappings for CPP export/import
                this.createCoordinateMappings(roadFeatures);
                
                // Create a new GeoJSON layer for roads
                this.geoJsonLayer = L.geoJSON(roadFeatures, {
                    style: {
                        color: 'red',
                        weight: 4,
                        opacity: 0.7
                    },
                    onEachFeature: function(feature, layer) {
                        // Add popup with road information
                        const props = feature.properties;
                        const popupContent = `
                            <strong>Road Type:</strong> ${props.highway || 'Unknown'}<br>
                            <strong>Name:</strong> ${props.name || 'Unnamed'}<br>
                            <strong>Surface:</strong> ${props.surface || 'Unknown'}<br>
                            <strong>Access:</strong> ${props.access || 'Public'}<br>
                            <strong>Oneway:</strong> ${props.oneway || 'No'}
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
                
                // Calculate the area of the combined polygon
                const areaInSquareMeters = turf.area(combinedPolygon);
                const areaInSquareKm = areaInSquareMeters / 1000000;
                const areaInSquareMi = areaInSquareMeters / 2589988.11;
                
                // Update the routeLength paragraph with road statistics
                const truncateStatus = truncateByEdge ? ' (trimmed to polygon boundary)' : '';
                document.getElementById('routeLength').innerHTML = `
                    <strong>Selected Area:</strong> ${areaInSquareKm.toFixed(2)} km² (${areaInSquareMi.toFixed(2)} sq mi)<br>
                    <strong>Roads Found:</strong> ${roadFeatures.length} road segments${truncateStatus}<br>
                    <strong>Total Road Length:</strong> ${totalLengthKm.toFixed(2)} km (${totalLengthMi.toFixed(2)} mi)
                `;
                
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

    clearAllSelections() {
        // Clear highlighted polygons
        this.highlightedPolygons.forEach(layer => {
            layer.setStyle({
                color: 'blue',
                weight: 2
            });
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
        
        // Reset UI elements
        document.getElementById('routeLength').innerHTML = '';
        document.getElementById('searchBox').value = '';
        document.getElementById('bufferSize').value = '1';
        document.getElementById('truncateByEdge').checked = true;
        document.getElementById('consolidateTolerance').value = '15';
        document.getElementById('customFilter').value = '[highway][area!~"yes"][highway!~"bridleway|bus_guideway|construction|cycleway|elevator|footway|motorway|motorway_junction|motorway_link|escalator|proposed|platform|raceway|rest_area|path"][access!~"customers|no|private"][public_transport!~"platform"][fee!~"yes"][service!~"drive-through|driveway|parking_aisle"][toll!~"yes"]';
        document.getElementById('searchRules').selectedIndex = 0;
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
            
            // Create minimal JSON format for Chinese Postman Problem solvers
            const cppData = {
                nodes: roadGraph.nodes,
                edges: roadGraph.edges
            };

            // Download the JSON file
            const blob = new Blob([JSON.stringify(cppData, null, 2)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'chinese_postman_network.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Chinese Postman Problem data exported successfully:', cppData);
        } catch (error) {
            console.error('Error exporting Chinese Postman data:', error);
            alert('Error exporting data. Please try again.');
        }
    }

    createCoordinateMappings(roadFeatures) {
        // Clear existing mappings
        this.coordinateToNodeIdMap.clear();
        this.nodeIdToCoordinateMap.clear();
        
        let nodeIdCounter = 0;

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

    buildChinesePostmanGraph(roadFeatures) {
        const nodes = [];
        const edges = [];
        let nodeIdCounter = 0;
        let edgeIdCounter = 0;

        // Use existing mappings or create new ones if needed
        if (this.nodeIdToCoordinateMap.size === 0) {
            this.createCoordinateMappings(roadFeatures);
        }

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
                        directed: true
                    });
                } else {
                    // Two-way road - create two directed edges (one in each direction)
                    edges.push({
                        source: sourceNodeId,
                        target: targetNodeId,
                        weight: Math.round(distance * 100) / 100,
                        directed: false
                    });
                    edges.push({
                        source: targetNodeId,
                        target: sourceNodeId,
                        weight: Math.round(distance * 100) / 100,
                        directed: false
                    });
                }
            }
        });

        return { nodes, edges };
    }

    handleCPPSolutionUpload(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Please select a CSV file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csvText = e.target.result;
                const solutionPath = this.parseCPPSolutionCSV(csvText);
                if (solutionPath && solutionPath.length > 0) {
                    this.visualizeCPPSolution(solutionPath);
                } else {
                    alert('No valid path found in the CSV file. Please check the format.');
                }
            } catch (error) {
                console.error('Error parsing CSV:', error);
                alert('Error parsing CSV file. Please check the format and try again.');
            }
        };
        
        reader.onerror = () => {
            alert('Error reading file. Please try again.');
        };
        
        reader.readAsText(file);
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
