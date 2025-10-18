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

    // Helper function to split a road at the boundary into inside and outside parts
    splitRoadAtBoundary(feature, polygon) {
        const result = [];
        const coords = feature.geometry.coordinates;
        
        if (coords.length < 2) {
            result.push(feature);
            return result;
        }
        
        // Check each coordinate to see if it's inside or outside the boundary
        const coordStatus = coords.map(coord => {
            const point = turf.point(coord);
            return turf.booleanWithin(point, polygon);
        });
        
        const polygonBoundary = turf.polygonToLine(polygon);
        
        // Build segments by walking through the coordinates
        let currentSegment = [];
        let currentSegmentIsInside = null;
        
        for (let i = 0; i < coords.length; i++) {
            const coord = coords[i];
            const isInside = coordStatus[i];
            
            // Initialize the segment type on first point
            if (currentSegmentIsInside === null) {
                currentSegmentIsInside = isInside;
                currentSegment.push(coord);
                continue;
            }
            
            // Check if we're transitioning between inside and outside
            if (i > 0 && coordStatus[i - 1] !== isInside) {
                // Find the intersection point where the road crosses the boundary
                const segment = turf.lineString([coords[i - 1], coord]);
                const intersection = this.findLineIntersection(segment, polygonBoundary);
                
                if (intersection) {
                    // Close current segment at intersection point
                    currentSegment.push(intersection);
                    
                    // Save current segment if it has at least 2 points
                    if (currentSegment.length >= 2) {
                        result.push({
                            ...feature,
                            geometry: {
                                type: 'LineString',
                                coordinates: [...currentSegment]
                            },
                            properties: {
                                ...feature.properties,
                                isOutsideBoundary: !currentSegmentIsInside
                            }
                        });
                    }
                    
                    // Start new segment from intersection point
                    currentSegment = [intersection, coord];
                    currentSegmentIsInside = isInside;
                } else {
                    // No intersection found, just continue
                    currentSegment.push(coord);
                }
            } else {
                // Same status as previous point, just add it
                currentSegment.push(coord);
            }
        }
        
        // Save the final segment
        if (currentSegment.length >= 2) {
            result.push({
                ...feature,
                geometry: {
                    type: 'LineString',
                    coordinates: currentSegment
                },
                properties: {
                    ...feature.properties,
                    isOutsideBoundary: !currentSegmentIsInside
                }
            });
        }
        
        // If no valid segments were created, return the original feature as inside
        if (result.length === 0) {
            result.push({
                ...feature,
                properties: {
                    ...feature.properties,
                    isOutsideBoundary: false
                }
            });
        }
        
        return result;
    }

    fetchRoadsInArea(createCoordinateMappingsCallback) {
        const previewGPXButton = document.getElementById('previewGPXButton');
        previewGPXButton.classList.add('button-loading');
        previewGPXButton.innerHTML = 'Fetching Roads <span class="spinner"></span>';

        // If a starting location (depot) was previously set, clear it when fetching roads again
        try {
            if (this.mapManager && typeof this.mapManager.clearDepotMarker === 'function') {
                this.mapManager.clearDepotMarker();
            }
        } catch (e) {
            console.warn('Failed to clear depot marker before fetching roads:', e);
        }
        
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
            
            // Check if navigation past boundary is enabled (we read these early so we can
            // test whether applying the boundary buffer would merge distant areas)
            const allowNavigationPastBoundary = document.getElementById('allowNavigationPastBoundary').checked;
            const boundaryBuffer = parseInt(document.getElementById('boundaryBuffer').value, 10);

            // Determine which polygon we'd use for Overpass querying if navigation past
            // boundary is enabled — this lets us decide whether buffering will merge
            // the areas and avoid a MultiPolygon result.
            let queryPolygonCandidate = combinedPolygon;
            if (allowNavigationPastBoundary && boundaryBuffer > 0) {
                try {
                    queryPolygonCandidate = turf.buffer(combinedPolygon, boundaryBuffer, {
                        units: 'meters'
                    });
                } catch (bufErr) {
                    console.warn('Error buffering combined polygon for boundary buffer check:', bufErr);
                    queryPolygonCandidate = combinedPolygon;
                }
            }

            // If the polygon we'd use for querying is a MultiPolygon then warn the
            // user. If buffering (navigation past boundary) would produce a single
            // polygon, then skip the warning and continue.
            if (queryPolygonCandidate.geometry.type === 'MultiPolygon') {
                // Try to compute the buffer distance required to merge the disjoint components.
                let bufferNeededMeters = null;
                try {
                    // Build polygon components from the combined polygon (before extra buffering)
                    const components = [];
                    if (combinedPolygon.geometry.type === 'Polygon') {
                        components.push(combinedPolygon);
                    } else if (combinedPolygon.geometry.type === 'MultiPolygon') {
                        combinedPolygon.geometry.coordinates.forEach(coords => {
                            components.push(turf.polygon(coords));
                        });
                    }

                    // Convert each component to a FeatureCollection of its outer-ring vertices
                    const pointCollections = components.map(poly => {
                        const coords = (poly.geometry.coordinates && poly.geometry.coordinates[0]) || [];
                        const pts = coords.map(c => turf.point(c));
                        return turf.featureCollection(pts);
                    });

                    const n = pointCollections.length;
                    if (n > 1) {
                        // Compute pairwise minimal gap distances (meters) between components
                        const dist = Array.from({ length: n }, () => Array(n).fill(Infinity));
                        for (let i = 0; i < n; i++) {
                            for (let j = i + 1; j < n; j++) {
                                let minD = Infinity;
                                // iterate smaller collection against larger to slightly optimize
                                const a = pointCollections[i];
                                const b = pointCollections[j];
                                // For each point in a, find nearest in b
                                for (let p = 0; p < a.features.length; p++) {
                                    const pt = a.features[p];
                                    if (!pt) continue;
                                    const nearest = turf.nearestPoint(pt, b);
                                    if (!nearest) continue;
                                    const d = turf.distance(pt, nearest, { units: 'meters' });
                                    if (d < minD) minD = d;
                                }
                                // Also check the other direction (in case of asymmetry)
                                for (let p = 0; p < b.features.length; p++) {
                                    const pt = b.features[p];
                                    if (!pt) continue;
                                    const nearest = turf.nearestPoint(pt, a);
                                    if (!nearest) continue;
                                    const d = turf.distance(pt, nearest, { units: 'meters' });
                                    if (d < minD) minD = d;
                                }
                                if (!isFinite(minD)) minD = 0;
                                dist[i][j] = dist[j][i] = minD;
                            }
                        }

                        // Compute a Minimum Spanning Tree (Prim's) and track the largest edge used
                        const used = new Array(n).fill(false);
                        const minEdge = new Array(n).fill(Infinity);
                        minEdge[0] = 0;
                        let maxEdgeInMST = 0;

                        for (let k = 0; k < n; k++) {
                            let u = -1;
                            for (let i = 0; i < n; i++) {
                                if (!used[i] && (u === -1 || minEdge[i] < minEdge[u])) u = i;
                            }
                            if (u === -1) break;
                            used[u] = true;
                            if (minEdge[u] !== Infinity && minEdge[u] > 0) {
                                maxEdgeInMST = Math.max(maxEdgeInMST, minEdge[u]);
                            }
                            for (let v = 0; v < n; v++) {
                                if (!used[v] && dist[u][v] < minEdge[v]) {
                                    minEdge[v] = dist[u][v];
                                }
                            }
                        }

                        // Required additional buffer per-component (meters) is half the largest MST edge
                        bufferNeededMeters = Math.ceil(maxEdgeInMST / 2);
                    }
                } catch (calcErr) {
                    console.warn('Error calculating required merge buffer:', calcErr);
                    bufferNeededMeters = null;
                }

                // Build user-facing message including a suggested buffer if available
                if (bufferNeededMeters && bufferNeededMeters > 0) {
                    const suggestedTotal = bufferSize + bufferNeededMeters;
                    alert(`Error: One or more selected areas are too far apart. Increase the selected area buffer by to ${suggestedTotal} m to merge them. Alternatively, use 'Windy Rural' and enable 'Allow navigation past boundary' and set 'Boundary buffer' to at least ${bufferNeededMeters} m.`);
                } else {
                    alert("Error: One or more selected areas are too far apart. You can increase the buffer to merge adjacent areas. Alternatively, switch to the 'Windy Rural' map style and enable 'Allow navigation past boundary' with a sufficient 'Boundary buffer' (meters) to include nearby roads for navigation continuity.");
                }

                stopSpinner(previewGPXButton, 'Fetch Roads');
                return;
            }

            // Now set the actual query polygon (use the buffered candidate if allowed)
            let queryPolygon = combinedPolygon;
            if (allowNavigationPastBoundary && boundaryBuffer > 0) {
                queryPolygon = queryPolygonCandidate;
                console.log(`Fetching roads with ${boundaryBuffer}m boundary buffer for navigation continuity`);
            }
            
            // Use the navigation filter directly as Overpass QL format
            let filterConditions = navigationFilter.trim();
            if (!filterConditions) {
                console.warn('No navigation filter provided, using default highway filter');
                filterConditions = '[highway]';
            }
            
            // Convert polygon to Overpass poly format (use queryPolygon for fetching)
            const polyString = this.polygonToOverpassPoly(queryPolygon);
            
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

            
            const overpassEndpoint = 'https://overpass-api.de/api/interpreter';

            fetch(overpassEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                body: 'data=' + encodeURIComponent(minifiedQuery)
            }).then(response => {
                if (!response.ok) {
                    let errorMessage = '';
                    switch (response.status) {
                        case 504:
                            errorMessage = 'Gateway Timeout (504): The server took too long to respond. Please try again.';
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
                
                // Apply road trimming/splitting based on settings
                const truncateByEdge = document.getElementById('truncateByEdge').checked;
                
                if (allowNavigationPastBoundary && boundaryBuffer > 0 && truncateByEdge) {
                    // Split roads at boundary: inside parts remain normal, outside parts marked as outside boundary
                    console.log('Splitting roads at polygon boundary...');
                    const splitRoads = [];
                    
                    roadFeatures.forEach(feature => {
                        if (feature.geometry.type !== 'LineString') {
                            splitRoads.push(feature);
                            return;
                        }
                        
                        const roadLine = turf.lineString(feature.geometry.coordinates);
                        
                        // Check if road intersects with boundary
                        const intersects = turf.booleanIntersects(roadLine, combinedPolygon);
                        
                        if (!intersects) {
                            // Completely outside - mark as outside boundary
                            feature.properties.isOutsideBoundary = true;
                            splitRoads.push(feature);
                        } else {
                            // Check if completely inside
                            const isWithin = turf.booleanWithin(roadLine, combinedPolygon);
                            
                            if (isWithin) {
                                // Completely inside - keep as is
                                feature.properties.isOutsideBoundary = false;
                                splitRoads.push(feature);
                            } else {
                                // Crosses boundary - split it
                                const splitResult = this.splitRoadAtBoundary(feature, combinedPolygon);
                                splitRoads.push(...splitResult);
                            }
                        }
                    });
                    
                    roadFeatures = splitRoads;
                    const outsideCount = roadFeatures.filter(f => f.properties.isOutsideBoundary).length;
                    const insideCount = roadFeatures.filter(f => !f.properties.isOutsideBoundary).length;
                    console.log(`Split roads at boundary: ${roadFeatures.length} total segments (${insideCount} inside, ${outsideCount} outside)`);
                } else if (truncateByEdge && (!allowNavigationPastBoundary || boundaryBuffer === 0)) {
                    // Normal trimming (no navigation past boundary)
                    console.log('Trimming roads to polygon boundary...');
                    roadFeatures = this.trimRoadsToPolygon(roadFeatures, combinedPolygon);
                    roadFeatures.forEach(feature => {
                        feature.properties.isOutsideBoundary = false;
                    });
                    console.log(`Trimmed ${roadFeatures.length} road segments`);
                } else if (allowNavigationPastBoundary && boundaryBuffer > 0) {
                    // Navigation past boundary enabled, no trimming - mark completely outside roads
                    console.log('Marking roads outside the original boundary...');
                    roadFeatures.forEach(feature => {
                        if (feature.geometry.type === 'LineString') {
                            const roadLine = turf.lineString(feature.geometry.coordinates);
                            const intersects = turf.booleanIntersects(roadLine, combinedPolygon);
                            feature.properties.isOutsideBoundary = !intersects;
                        } else {
                            feature.properties.isOutsideBoundary = false;
                        }
                    });
                    const outsideCount = roadFeatures.filter(f => f.properties.isOutsideBoundary).length;
                    console.log(`Found ${outsideCount} road segments completely outside the original boundary`);
                } else {
                    // No trimming, no boundary buffer - mark all as inside
                    roadFeatures.forEach(feature => {
                        feature.properties.isOutsideBoundary = false;
                    });
                }
                
                // Apply route filter marking - check if each road matches the route filter
                // Roads outside boundary are always optional (not required)
                // If route filter is empty, all roads inside boundary are required
                // If it matches route filter, mark as optional (NOT required)
                // If it doesn't match route filter, mark as required
                roadFeatures.forEach(feature => {
                    if (feature.properties.isOutsideBoundary) {
                        // Roads outside boundary are always optional
                        feature.properties.isRouteRequired = false;
                    } else if (!routeFilter || routeFilter.trim() === '') {
                        // Empty filter - all roads inside boundary are required
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
                        // First check if outside boundary (always optional, dashed line)
                        if (feature.properties.isOutsideBoundary) {
                            return {
                                color: '#555555',
                                weight: 3,
                                opacity: 0.4,
                                dashArray: '5, 5'
                            };
                        }
                        // Then style based on route filter and coverage status
                        // If road is marked as optional (NOT required), show in dark grey
                        else if (!feature.properties.isRouteRequired) {
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
                let outsideBoundaryLengthKm = 0;
                let coveredCount = 0;
                let uncoveredCount = 0;
                let optionalCount = 0;
                let outsideBoundaryCount = 0;
                
                roadFeatures.forEach(feature => {
                    if (feature.geometry.type === 'LineString') {
                        const line = turf.lineString(feature.geometry.coordinates);
                        const length = turf.length(line, { units: 'kilometers' });
                        totalLengthKm += length;
                        
                        // Categorize roads: outside boundary first, then optional, then covered/uncovered
                        if (feature.properties.isOutsideBoundary) {
                            outsideBoundaryLengthKm += length;
                            outsideBoundaryCount++;
                        } else if (!feature.properties.isRouteRequired) {
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
                const outsideBoundaryLengthMi = outsideBoundaryLengthKm * 0.621371;
                
                // Calculate the area of the combined polygon
                const areaInSquareMeters = turf.area(combinedPolygon);
                const areaInSquareKm = areaInSquareMeters / 1000000;
                const areaInSquareMi = areaInSquareMeters / 2589988.11;
                
                // Expose required road length globally so other modules can compute efficiency
                // Keep total length available for reference if needed
                try { window.totalRoadLengthKm = totalLengthKm; } catch (e) { /* ignore */ }
                try { window.requiredRoadLengthKm = totalLengthKm - optionalLengthKm - outsideBoundaryLengthKm; } catch (e) { /* ignore */ }

                // Update the routeLength paragraph with road statistics
                const truncateStatus = truncateByEdge ? ' (trimmed to polygon boundary)' : '';
                
                // Compute required road length (exclude optional and outside-boundary roads)
                const requiredLengthKm = totalLengthKm - optionalLengthKm - outsideBoundaryLengthKm;
                const requiredLengthMi = requiredLengthKm * 0.621371;

                let statsHtml = `
                    <strong>Selected Area:</strong> ${areaInSquareKm.toFixed(2)} km² (${areaInSquareMi.toFixed(2)} sq mi)<br>
                    <strong>Roads Found:</strong> ${roadFeatures.length} road segments${truncateStatus}<br>
                    <strong>Required Road Length:</strong> ${requiredLengthKm.toFixed(2)} km (${requiredLengthMi.toFixed(2)} mi)
                `;
                
                // Add outside boundary statistics if navigation past boundary is enabled
                if (outsideBoundaryCount > 0) {
                    statsHtml += `<br>
                    <strong>Navigation Past Boundary:</strong><br>
                    <span style="color: #888888; font-style: italic;">● Outside boundary (optional):</span> ${outsideBoundaryCount} segments, ${outsideBoundaryLengthKm.toFixed(2)} km (${outsideBoundaryLengthMi.toFixed(2)} mi)
                    `;
                }
                
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
                
                // Fit map to show REQUIRED roads only (those that must be serviced).
                // If no required roads are present, fall back to fitting all fetched roads.
                try {
                    const requiredFeatures = roadFeatures.filter(f => f.properties && f.properties.isRouteRequired);
                    if (requiredFeatures.length > 0) {
                        const requiredLayer = L.geoJSON(requiredFeatures);
                        if (requiredLayer.getBounds().isValid()) {
                            this.mapManager.getMap().fitBounds(requiredLayer.getBounds());
                        }
                    } else if (this.geoJsonLayer && this.geoJsonLayer.getBounds().isValid()) {
                        // No required roads -> show all roads
                        this.mapManager.getMap().fitBounds(this.geoJsonLayer.getBounds());
                    }
                } catch (fitErr) {
                    console.warn('Error fitting bounds to required roads, falling back to all roads:', fitErr);
                    if (this.geoJsonLayer && this.geoJsonLayer.getBounds().isValid()) {
                        this.mapManager.getMap().fitBounds(this.geoJsonLayer.getBounds());
                    }
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
                feature.properties.isOutsideBoundary = false; // No boundary context for uploaded roads
                
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
                    // First check if outside boundary (always optional, dashed line)
                    if (feature.properties.isOutsideBoundary) {
                        return {
                            color: '#888888',
                            weight: 3,
                            opacity: 0.4,
                            dashArray: '5, 5'
                        };
                    }
                    // Then style based on route filter and coverage status
                    // If road is marked as optional (NOT required), show in dark grey
                    else if (!feature.properties.isRouteRequired) {
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
            
            // Fit map to show REQUIRED roads only (those that must be serviced).
            // If none are required, fall back to all roads from the uploaded response.
            try {
                const requiredFeatures = roadFeatures.filter(f => f.properties && f.properties.isRouteRequired);
                if (requiredFeatures.length > 0) {
                    const requiredLayer = L.geoJSON(requiredFeatures);
                    if (requiredLayer.getBounds().isValid()) {
                        this.mapManager.getMap().fitBounds(requiredLayer.getBounds());
                    }
                } else if (this.geoJsonLayer && this.geoJsonLayer.getBounds().isValid()) {
                    this.mapManager.getMap().fitBounds(this.geoJsonLayer.getBounds());
                }
            } catch (fitErr) {
                console.warn('Error fitting bounds to required roads (uploaded response), falling back to all roads:', fitErr);
                if (this.geoJsonLayer && this.geoJsonLayer.getBounds().isValid()) {
                    this.mapManager.getMap().fitBounds(this.geoJsonLayer.getBounds());
                }
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

