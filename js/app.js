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

        // Clear button
        document.getElementById('clearButton').addEventListener('click', () => {
            this.clearAllSelections();
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
                const roadFeatures = geoJsonData.features.filter(feature => {
                    return feature.geometry.type === 'LineString' && feature.properties.highway;
                });
                
                if (roadFeatures.length === 0) {
                    alert('No roads found within the selected area that match the filter criteria. Try adjusting the filter or selecting a different area.');
                    stopSpinner(previewGPXButton, 'Fetch Roads');
                    return;
                }
                
                // Remove existing road layer if it exists
                if (this.geoJsonLayer) {
                    this.mapManager.getMap().removeLayer(this.geoJsonLayer);
                }
                
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
                document.getElementById('routeLength').innerHTML = `
                    <strong>Selected Area:</strong> ${areaInSquareKm.toFixed(2)} km² (${areaInSquareMi.toFixed(2)} sq mi)<br>
                    <strong>Roads Found:</strong> ${roadFeatures.length} road segments<br>
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
        
        // Reset routing manager
        this.routingManager.stopAnimation();
        
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RouteCrafterApp();
});
