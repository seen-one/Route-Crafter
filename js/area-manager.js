// Area selection and management module

import { stopSpinner } from './utils.js';

export class AreaManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        
        // State management
        this.highlightedPolygons = [];
        this.previewLayer = null;
        this.geoJsonLayer = null;
        this.gridLayer = null;
        this.previousSearchRule = null;
    }

    getHighlightedPolygons() {
        return this.highlightedPolygons;
    }

    getPreviewLayer() {
        return this.previewLayer;
    }

    getGeoJsonLayer() {
        return this.geoJsonLayer;
    }

    getGridLayer() {
        return this.gridLayer;
    }

    getPreviousSearchRule() {
        return this.previousSearchRule;
    }

    setPreviousSearchRule(rule) {
        this.previousSearchRule = rule;
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
            
            // Calculate longitude step at this specific latitude for correct width
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

    // Helper function to minify Overpass query by removing unnecessary whitespace
    minifyOverpassQuery(query) {
        return query
            .replace(/\s+/g, ' ')  // Replace multiple spaces/newlines with single space
            .replace(/\s*([;(){}\[\]])\s*/g, '$1')  // Remove spaces around special chars
            .trim();
    }

    clearLayers() {
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
    }
}

