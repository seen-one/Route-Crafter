// Utility functions for Route Crafter

/**
 * Calculate distance between two points using Haversine formula
 * @param {Array} point1 - [lat, lng]
 * @param {Array} point2 - [lat, lng]
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (point2[0] - point1[0]) * Math.PI / 180;
    const dLon = (point2[1] - point1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(point1[0] * Math.PI / 180) * Math.cos(point2[0] * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Calculate total distance up to a point in a route
 * @param {Array} points - Array of [lat, lng] points
 * @param {number} endIndex - End index (exclusive)
 * @returns {number} Total distance in kilometers
 */
export function calculateRouteDistanceToIndex(points, endIndex) {
    let distance = 0;
    for (let i = 1; i <= endIndex && i < points.length; i++) {
        distance += calculateDistance(points[i-1], points[i]);
    }
    return distance;
}

/**
 * Interpolate between two points
 * @param {Array} point1 - [lat, lng]
 * @param {Array} point2 - [lat, lng]
 * @param {number} t - Interpolation factor (0-1)
 * @returns {Array} Interpolated point [lat, lng]
 */
export function interpolatePoint(point1, point2, t) {
    return [
        point1[0] + (point2[0] - point1[0]) * t,
        point1[1] + (point2[1] - point1[1]) * t
    ];
}

/**
 * Format time for display
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} Formatted time string (MM:SS)
 */
export function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generate URLs for different mapping services
 * @param {string} service - Service name
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} zoom - Zoom level
 * @param {Object} mapCenter - Map center coordinates
 * @returns {string} Service URL
 */
export function generateServiceUrl(service, lat, lng, zoom, mapCenter) {
    const latFixed = lat.toFixed(6);
    const lngFixed = lng.toFixed(6);
    const zoomFixed = zoom.toFixed(2);
    
    const mapCenterLatFixed = mapCenter.lat.toFixed(6);
    const mapCenterLngFixed = mapCenter.lng.toFixed(6);
    
    switch(service) {
        case 'openstreetmap':
            return `https://www.openstreetmap.org/#map=${Math.round(zoom)}/${latFixed}/${lngFixed}`;
        case 'openstreetmap-query':
            return `https://www.openstreetmap.org/query?lat=${latFixed}&lon=${lngFixed}#map=${Math.round(zoom)}/${mapCenterLatFixed}/${mapCenterLngFixed}`;
        case 'nominatim':
            return `https://nominatim.openstreetmap.org/ui/reverse.html?lat=${latFixed}&lon=${lngFixed}`;
        case 'mapillary':
            return `https://www.mapillary.com/app/?lat=${latFixed}&lng=${lngFixed}&z=${zoomFixed}`;
        case 'panoramax':
            return `https://api.panoramax.xyz/?focus=map&map=${zoomFixed}/${latFixed}/${lngFixed}&`;
        case 'kartaview':
            return `https://kartaview.org/map/@${latFixed},${lngFixed},${Math.round(zoom)}z`;
        case 'mapilio':
            return `https://www.mapilio.com/app?lat=${latFixed}&lng=${lngFixed}&zoom=${zoomFixed}`;
        default:
            return '#';
    }
}

/**
 * Parse Panoramax date string
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date|null} Parsed date or null if invalid
 */
export function parsePanoramaxDate(dateStr) {
    if (!dateStr) return null;
    var parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Check if Mapillary feature passes filters
 * @param {Object} properties - Feature properties
 * @param {Object} filters - Filter criteria
 * @param {string} layerName - Layer name
 * @returns {boolean} Whether feature passes filters
 */
export function matchesMapillaryFilterCriteria(properties, filters, layerName) {
    if (filters.startDate || filters.endDate) {
        const capturedAt = properties.captured_at;
        if (!capturedAt) return false;
        const capturedDate = new Date(capturedAt);
        if (filters.startDate && capturedDate < filters.startDate) return false;
        if (filters.endDate && capturedDate > filters.endDate) return false;
    }
    if (filters.imageType === '360' && properties.is_pano !== true) {
        return false;
    }
    if (filters.imageType === 'classic' && properties.is_pano === true) {
        return false;
    }
    if (filters.mapillaryUserId && properties.creator_id !== filters.mapillaryUserId) {
        return false;
    }
    return true;
}

/**
 * Check if Panoramax feature passes filters
 * @param {Object} properties - Feature properties
 * @param {Object} filters - Filter criteria
 * @param {string} layerName - Layer name
 * @returns {boolean} Whether feature passes filters
 */
export function matchesPanoramaxFilterCriteria(properties, filters, layerName) {
    if (layerName === 'sequences') {
        if (filters.startDate || filters.endDate) {
            var dateStr = properties.date;
            var captureDate = parsePanoramaxDate(dateStr);
            if (!captureDate) return false;
            if (filters.startDate && captureDate < filters.startDate) return false;
            if (filters.endDate && captureDate > filters.endDate) return false;
        }
        if (filters.imageType === '360' && properties.type !== 'equirectangular') {
            return false;
        }
        if (filters.imageType === 'classic' && properties.type === 'equirectangular') {
            return false;
        }
        if (filters.panoramaxUsername && properties.account_id !== filters.panoramaxUsername) {
            return false;
        }
    }
    return true;
}

/**
 * Check if Mapilio feature passes filters
 * @param {Object} properties - Feature properties
 * @param {Object} filters - Filter criteria
 * @returns {boolean} Whether feature passes filters
 */
export function matchesMapilioFilterCriteria(properties, filters) {
    // Filter by image type
    if (filters.imageType === '360' && properties.fov < 360) {
        return false;
    }
    if (filters.imageType === 'classic' && properties.fov >= 360) {
        return false;
    }

    // Filter by capture date
    if (filters.startDate && properties.capture_time) {
        const capturedDate = new Date(properties.capture_time);
        if (capturedDate < filters.startDate) {
            return false;
        }
    }
    if (filters.endDate && properties.capture_time) {
        const capturedDate = new Date(properties.capture_time);
        if (capturedDate > filters.endDate) {
            return false;
        }
    }
    
    // Filter by Mapilio user ID (created_by_id)
    if (filters.mapilioUserId && properties.created_by_id) {
        if (properties.created_by_id !== filters.mapilioUserId) {
            return false;
        }
    }

    return true; // If no filters are failed, show the feature
}

/**
 * Stop loading spinner on button
 * @param {HTMLElement} button - Button element
 * @param {string} defaultText - Default button text
 */
export function stopSpinner(button, defaultText) {
    button.classList.remove('button-loading');
    button.innerHTML = defaultText;
}

/**
 * Convert GeoJSON road data to custom nodes and edges format
 * @param {Object} geoJsonData - GeoJSON FeatureCollection containing road LineStrings
 * @returns {Object} Custom format with nodes and edges
 */
export function convertRoadsToCustomFormat(geoJsonData) {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map(); // Map to track unique nodes by coordinates
    let nodeId = 1;
    let edgeId = 100;

    if (!geoJsonData || !geoJsonData.features) {
        return { nodes: [], edges: [] };
    }

    geoJsonData.features.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'LineString') {
            const coordinates = feature.geometry.coordinates;
            const properties = feature.properties || {};
            
            // Process each segment of the road
            for (let i = 0; i < coordinates.length - 1; i++) {
                const fromCoord = coordinates[i];
                const toCoord = coordinates[i + 1];
                
                // Create or find nodes
                const fromKey = `${fromCoord[1]},${fromCoord[0]}`; // lat,lng
                const toKey = `${toCoord[1]},${toCoord[0]}`; // lat,lng
                
                let fromNodeId, toNodeId;
                
                // Add or find from node
                if (!nodeMap.has(fromKey)) {
                    fromNodeId = nodeId++;
                    nodes.push({
                        id: fromNodeId,
                        x: fromCoord[1], // latitude
                        y: fromCoord[0]  // longitude
                    });
                    nodeMap.set(fromKey, fromNodeId);
                } else {
                    fromNodeId = nodeMap.get(fromKey);
                }
                
                // Add or find to node
                if (!nodeMap.has(toKey)) {
                    toNodeId = nodeId++;
                    nodes.push({
                        id: toNodeId,
                        x: toCoord[1], // latitude
                        y: toCoord[0]  // longitude
                    });
                    nodeMap.set(toKey, toNodeId);
                } else {
                    toNodeId = nodeMap.get(toKey);
                }
                
                // Calculate distance as cost
                const distance = calculateDistance([fromCoord[1], fromCoord[0]], [toCoord[1], toCoord[0]]);
                const cost = distance * 1000; // Convert to meters
                
                // Determine if road is undirected based on oneway property
                const isOneway = properties.oneway === 'yes' || properties.oneway === '1' || properties.oneway === 'true';
                const undirected = !isOneway; // Use OSM oneway property to determine direction
                
                // Add edge
                edges.push({
                    id: edgeId++,
                    from: fromNodeId,
                    to: toNodeId,
                    cost: Math.round(cost * 100) / 100, // Round to 2 decimal places
                    undirected: undirected
                });
            }
        }
    });

    return { nodes, edges };
}

/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Find strongly connected components using Tarjan's algorithm
 * @param {Array} nodes - Array of node objects with id property
 * @param {Array} edges - Array of edge objects with source, target, and directed properties
 * @returns {Array} Array of Sets, where each Set contains node IDs in a component
 */
export function findStronglyConnectedComponents(nodes, edges) {
    // Build adjacency list (treating undirected edges as bidirectional)
    const adjacencyList = new Map();
    
    // Initialize adjacency list
    nodes.forEach(node => {
        adjacencyList.set(node.id, []);
    });
    
    // Add edges to adjacency list
    edges.forEach(edge => {
        const source = edge.source;
        const target = edge.target;
        
        if (!adjacencyList.has(source)) adjacencyList.set(source, []);
        if (!adjacencyList.has(target)) adjacencyList.set(target, []);
        
        if (edge.directed === false) {
            // Undirected edge - add both directions
            adjacencyList.get(source).push(target);
            adjacencyList.get(target).push(source);
        } else {
            // Directed edge - add only forward direction
            adjacencyList.get(source).push(target);
        }
    });
    
    // Tarjan's algorithm state
    let index = 0;
    const indices = new Map();
    const lowlinks = new Map();
    const onStack = new Map();
    const stack = [];
    const components = [];
    
    // Tarjan's DFS
    function strongConnect(v) {
        indices.set(v, index);
        lowlinks.set(v, index);
        index++;
        stack.push(v);
        onStack.set(v, true);
        
        // Consider successors of v
        const neighbors = adjacencyList.get(v) || [];
        for (const w of neighbors) {
            if (!indices.has(w)) {
                // Successor w has not yet been visited; recurse on it
                strongConnect(w);
                lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
            } else if (onStack.get(w)) {
                // Successor w is in stack and hence in the current SCC
                lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
            }
        }
        
        // If v is a root node, pop the stack and create an SCC
        if (lowlinks.get(v) === indices.get(v)) {
            const component = new Set();
            let w;
            do {
                w = stack.pop();
                onStack.set(w, false);
                component.add(w);
            } while (w !== v);
            components.push(component);
        }
    }
    
    // Run Tarjan's algorithm on all nodes
    for (const node of nodes) {
        if (!indices.has(node.id)) {
            strongConnect(node.id);
        }
    }
    
    return components;
}

/**
 * Filter graph to only include nodes and edges in a specific component
 * @param {Array} nodes - Array of node objects with id property
 * @param {Array} edges - Array of edge objects with source and target properties
 * @param {Set} componentNodeIds - Set of node IDs to include
 * @returns {Object} Filtered graph with nodes and edges arrays
 */
export function filterGraphByComponent(nodes, edges, componentNodeIds) {
    // Filter nodes
    const filteredNodes = nodes.filter(node => componentNodeIds.has(node.id));
    
    // Filter edges - only include edges where both source and target are in component
    const filteredEdges = edges.filter(edge => 
        componentNodeIds.has(edge.source) && componentNodeIds.has(edge.target)
    );
    
    return {
        nodes: filteredNodes,
        edges: filteredEdges
    };
}