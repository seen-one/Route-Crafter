// Road fetching and processing module

import { stopSpinner } from './utils.js';

export class RoadProcessor {
    constructor(mapManager, areaManager, coverageManager) {
        this.mapManager = mapManager;
        this.areaManager = areaManager;
        this.coverageManager = coverageManager;
        
        this.geoJsonLayer = null;
    }

    getGeoJsonLayer() {
        return this.geoJsonLayer;
    }

    setGeoJsonLayer(layer) {
        this.geoJsonLayer = layer;
    }

    // Helper function to check if a feature matches an Overpass filter
    checkFeatureMatchesFilter(feature, filterString) {
        if (!filterString || filterString.trim() === '') {
            return true; // Empty filter matches everything
        }
        
        const props = feature.properties || {};
        
        // Parse the Overpass filter string
        // Format: [key=value][key!=value][key!~"regex"]
        const filterRegex = /\[([^\]]+)\]/g;
        let match;
        
        while ((match = filterRegex.exec(filterString)) !== null) {
            const condition = match[1];
            
            // Handle different condition types
            if (condition.includes('!~')) {
                // Negative regex match: key!~"value1|value2"
                const parts = condition.split('!~');
                const key = parts[0].trim();
                const valuePattern = parts[1].replace(/["']/g, '').trim();
                const values = valuePattern.split('|');
                
                const propValue = props[key];
                if (propValue && values.includes(String(propValue))) {
                    return false; // Property matches excluded pattern
                }
            } else if (condition.includes('!=')) {
                // Not equal: key!=value
                const parts = condition.split('!=');
                const key = parts[0].trim();
                const value = parts[1].replace(/["']/g, '').trim();
                
                const propValue = props[key];
                if (propValue && String(propValue) === value) {
                    return false; // Property equals excluded value
                }
            } else if (condition.includes('=')) {
                // Equal: key=value
                const parts = condition.split('=');
                const key = parts[0].trim();
                const value = parts[1].replace(/["']/g, '').trim();
                const values = value.split('|');
                
                const propValue = props[key];
                if (!propValue || !values.includes(String(propValue))) {
                    return false; // Property doesn't match required value
                }
            } else {
                // Just key existence: [key]
                const key = condition.trim();
                if (!props[key]) {
                    return false; // Property doesn't exist
                }
            }
        }
        
        return true; // All conditions passed
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

    fetchRoadsInArea(createCoordinateMappingsCallback) {
        const previewGPXButton = document.getElementById('previewGPXButton');
        previewGPXButton.classList.add('button-loading');
        previewGPXButton.innerHTML = 'Fetching Roads <span class="spinner"></span>';
        
        // Combine highlighted polygons and drawn items
        const allSelectedAreas = [...this.areaManager.getHighlightedPolygons()];
        
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
        const navigationFilter = document.getElementById('navigationFilter').value;
        const routeFilter = document.getElementById('routeFilter').value;
        
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
            
            // Use the navigation filter directly as Overpass QL format
            let filterConditions = navigationFilter.trim();
            if (!filterConditions) {
                console.warn('No navigation filter provided, using default highway filter');
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
                
                // Filter to only include LineString features (roads)
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
                
                // Apply route filter marking - check if each road matches the route filter
                // If route filter is empty, all roads are required
                // If it matches route filter, mark as optional (NOT required)
                // If it doesn't match route filter, mark as required
                roadFeatures.forEach(feature => {
                    if (!routeFilter || routeFilter.trim() === '') {
                        // Empty filter - all roads are required
                        feature.properties.isRouteRequired = true;
                    } else {
                        // Check if matches route filter
                        const matchesRouteFilter = this.checkFeatureMatchesFilter(feature, routeFilter);
                        feature.properties.isRouteRequired = !matchesRouteFilter;
                    }
                });
                
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
                createCoordinateMappingsCallback(roadFeatures);
                
                // Create a new GeoJSON layer for roads
                this.geoJsonLayer = L.geoJSON(roadFeatures, {
                    style: function(feature) {
                        // Style based on route filter and coverage status
                        // If road is marked as optional (NOT required), show in dark grey
                        if (!feature.properties.isRouteRequired) {
                            return {
                                color: '#555555',
                                weight: 4,
                                opacity: 0.6
                            };
                        }
                        // Otherwise, style based on coverage status
                        else if (feature.properties.isCovered) {
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
                
                // Calculate total road length and coverage/route filter statistics
                let totalLengthKm = 0;
                let coveredLengthKm = 0;
                let uncoveredLengthKm = 0;
                let optionalLengthKm = 0;
                let coveredCount = 0;
                let uncoveredCount = 0;
                let optionalCount = 0;
                
                roadFeatures.forEach(feature => {
                    if (feature.geometry.type === 'LineString') {
                        const line = turf.lineString(feature.geometry.coordinates);
                        const length = turf.length(line, { units: 'kilometers' });
                        totalLengthKm += length;
                        
                        // Check if optional (matches route filter)
                        if (!feature.properties.isRouteRequired) {
                            optionalLengthKm += length;
                            optionalCount++;
                        } else if (feature.properties.isCovered) {
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
                const optionalLengthMi = optionalLengthKm * 0.621371;
                
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
                
                // Add optional roads statistics if route filter is used
                if (optionalCount > 0) {
                    statsHtml += `<br>
                    <strong>Route Filter:</strong><br>
                    <span style="color: #555555;">● Optional (in filter):</span> ${optionalCount} segments, ${optionalLengthKm.toFixed(2)} km (${optionalLengthMi.toFixed(2)} mi)
                    `;
                }
                
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

    handleOverpassResponseUpload(event, createCoordinateMappingsCallback) {
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
                this.processUploadedOverpassResponse(overpassData, createCoordinateMappingsCallback);
                
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

    processUploadedOverpassResponse(data, createCoordinateMappingsCallback) {
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
            
            // Get route filter for marking
            const routeFilter = document.getElementById('routeFilter').value;
            
            // Initialize coverage properties and route filter marking for uploaded data
            roadFeatures.forEach(feature => {
                feature.properties.coveragePercent = 0;
                feature.properties.isCovered = false;
                feature.properties.coverageSources = 'None';
                
                if (!routeFilter || routeFilter.trim() === '') {
                    // Empty filter - all roads are required
                    feature.properties.isRouteRequired = true;
                } else {
                    // Check if matches route filter
                    const matchesRouteFilter = this.checkFeatureMatchesFilter(feature, routeFilter);
                    feature.properties.isRouteRequired = !matchesRouteFilter;
                }
            });
            
            // Create coordinate mappings for CPP export/import
            createCoordinateMappingsCallback(roadFeatures);
            
            // Create a new GeoJSON layer for roads
            this.geoJsonLayer = L.geoJSON(roadFeatures, {
                style: function(feature) {
                    // Style based on route filter and coverage status
                    // If road is marked as optional (NOT required), show in dark grey
                    if (!feature.properties.isRouteRequired) {
                        return {
                            color: '#555555',
                            weight: 4,
                            opacity: 0.6
                        };
                    }
                    // Otherwise, style based on coverage status
                    else if (feature.properties.isCovered) {
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

    clearLayers() {
        if (this.geoJsonLayer) {
            this.mapManager.getMap().removeLayer(this.geoJsonLayer);
            this.geoJsonLayer = null;
        }
    }
}

