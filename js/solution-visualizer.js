// CPP solution parsing and visualization module

export class SolutionVisualizer {
    constructor(mapManager, routingManager) {
        this.mapManager = mapManager;
        this.routingManager = routingManager;
        
        this.cppSolutionLayer = null;
    }

    getCppSolutionLayer() {
        return this.cppSolutionLayer;
    }

    handleCPPSolutionText(solutionText, nodeIdToCoordinateMap) {
        try {
            const solutionPath = this.parseOARLibSolution(solutionText);
            if (solutionPath && solutionPath.length > 0) {
                this.visualizeCPPSolution(solutionPath, nodeIdToCoordinateMap);
                // Optionally clear the textarea after successful application
                // document.getElementById('oarlibSolutionTextarea').value = '';
            } else {
                alert('No valid path found in the solution text. Please check the format.');
            }
        } catch (error) {
            console.error('Error parsing solution:', error);
            alert('Error parsing solution. Please check the format and try again.\n\nExpected format: Route with vertex IDs like [1-22-21-20-...] or one vertex ID per line.');
        }
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
                // Extract the route from the line like: [1-22-21-20-...]
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

    visualizeCPPSolution(vertexPath, nodeIdToCoordinateMap) {
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
        const reconstructedPath = this.reconstructPathFromVertices(vertexPath, nodeIdToCoordinateMap);
        const hasCoordinateMappings = nodeIdToCoordinateMap.size > 0;
        
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

    reconstructPathFromVertices(vertexPath, nodeIdToCoordinateMap) {
        // Reconstruct the path using stored coordinate mappings for vertex sequence
        if (vertexPath.length === 0) {
            return [];
        }
        
        const reconstructedPath = [];
        
        // Map each vertex ID to its coordinate
        for (const vertexId of vertexPath) {
            const coord = nodeIdToCoordinateMap.get(vertexId);
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

    clearLayers() {
        if (this.cppSolutionLayer) {
            this.mapManager.getMap().removeLayer(this.cppSolutionLayer);
            this.cppSolutionLayer = null;
        }
    }
}

