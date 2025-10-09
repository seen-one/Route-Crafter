// Graph building module for OARLib format export

export class GraphBuilder {
    constructor() {
        // This class is stateless and works with coordinate maps passed from app
    }

    exportForChinesePostman(geoJsonLayer, coordinateToNodeIdMap, nodeIdToCoordinateMap) {
        if (!geoJsonLayer) {
            alert('No road data available. Please fetch roads first.');
            return;
        }

        try {
            // Extract road features from the current layer
            const roadFeatures = [];
            geoJsonLayer.eachLayer((layer) => {
                const feature = layer.feature;
                if (feature && feature.geometry.type === 'LineString') {
                    roadFeatures.push(feature);
                }
            });

            if (roadFeatures.length === 0) {
                alert('No road segments found to export.');
                return;
            }

            // Check if coverage filtering is enabled
            const coverageFilterEnabled = document.getElementById('filterMapillaryCoverage').checked;
            
            // Check if mixed format should be used (default is windy)
            const useMixedFormat = document.getElementById('useMixedGraphFormat').checked;
            
            // Build the road graph for Chinese Postman Problem
            const roadGraph = this.buildChinesePostmanGraph(roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap);
            
            // Generate OARLib native format
            const oarLibContent = this.generateOARLibFormat(roadGraph, roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap, coverageFilterEnabled, useMixedFormat);

            // Download the OARLib file
            const blob = new Blob([oarLibContent], {
                type: 'text/plain'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.download = 'route_crafter_graph.oarlib';
            document.body.appendChild(a);
            a.href = url;
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Show info message about export type
            if (useMixedFormat) {
                console.log('OARLib MIXED format exported successfully (all roads required)');
                alert('Exported MIXED OARLib format:\n\n' +
                      'All roads marked as REQUIRED.\n' +
                      'This is suitable for Chinese Postman Problem solvers.');
            } else {
                // Calculate statistics for required/optional roads
                const requiredCount = roadFeatures.filter(f => {
                    const isRouteRequired = f.properties.isRouteRequired !== undefined ? f.properties.isRouteRequired : true;
                    if (coverageFilterEnabled) {
                        return !f.properties.isCovered && isRouteRequired;
                    } else {
                        return isRouteRequired;
                    }
                }).length;
                const optionalCount = roadFeatures.length - requiredCount;
                
                if (coverageFilterEnabled) {
                    console.log(`OARLib WINDY format exported: ${requiredCount} required roads (uncovered + NOT in route filter), ${optionalCount} optional roads`);
                    alert(`Exported WINDY OARLib format:\n\n` +
                          `✓ ${requiredCount} roads marked as REQUIRED (uncovered AND NOT in route filter)\n` +
                          `✓ ${optionalCount} roads marked as OPTIONAL (covered OR in route filter)\n\n` +
                          `This is suitable for Windy Rural Postman Problem solvers.`);
                } else {
                    console.log(`OARLib WINDY format exported: ${requiredCount} required roads (NOT in route filter), ${optionalCount} optional roads`);
                    alert(`Exported WINDY OARLib format:\n\n` +
                          `✓ ${requiredCount} roads marked as REQUIRED (NOT in route filter)\n` +
                          `✓ ${optionalCount} roads marked as OPTIONAL (in route filter)\n\n` +
                          `This is suitable for Windy Rural Postman Problem solvers.`);
                }
            }
        } catch (error) {
            console.error('Error exporting OARLib data:', error);
            alert('Error exporting data. Please try again.');
        }
    }

    generateOARLibFormat(roadGraph, roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap, coverageFilterEnabled = false, useMixedFormat = false) {
        // Use MIXED graph type if checkbox is checked, otherwise use WINDY (default)
        const graphType = useMixedFormat ? 'MIXED' : 'WINDY';

        // Get basic counts
        const numVertices = roadGraph.nodes.length;
        const numEdges = roadGraph.edges.length;
        
        // Determine depot (use first vertex as depot, which should be vertex 1)
        const depotId = roadGraph.nodes.length > 0 ? roadGraph.nodes[0].id : 1;
        
        // Determine problem type based on graph type
        const problemType = useMixedFormat ? 'CHINESE_POSTMAN' : 'WINDY_RURAL_POSTMAN';

        // Build header
        let content = `%
% This is a file generated by the Open Source, Arc-Routing Library (OAR Lib).
% For more information on OAR Lib, or the format please visit: 
% https://github.com/Olibear/ArcRoutingLibrary 
%
`;
        
        if (!useMixedFormat) {
            content += `% WINDY VERSION (default)
% For one-way roads, reverse cost is set to 999999 (essentially infinity)
% Roads outside the original boundary are always OPTIONAL
`;
            if (coverageFilterEnabled) {
                content += `% Roads are REQUIRED if: inside boundary AND uncovered AND NOT in route filter
% Roads are OPTIONAL if: outside boundary OR covered OR in route filter
`;
            } else {
                content += `% Roads are REQUIRED if: inside boundary AND NOT in route filter
% Roads are OPTIONAL if: outside boundary OR in route filter
`;
            }
            content += `%
`;
        }
        
        content += `
================================
Format: OAR Lib
Graph Type: ${graphType}
Depot ID(s): ${depotId}
N: ${numVertices}
M: ${numEdges}
Problem Type: ${problemType}
Fleet Size: 1
Number of Depots: 1
================================

LINKS
`;

        // Different line format for WINDY vs MIXED graphs
        if (useMixedFormat) {
            content += `Line Format: V1,V2,COST,isDirected,isRequired\n\n`;
        } else {
            content += `Line Format: V1,V2,COST,REVERSE_COST,isRequired\n\n`;
        }

        // Add edges
        roadGraph.edges.forEach((edge, index) => {
            if (useMixedFormat) {
                // MIXED format: V1,V2,COST,isDirected,isRequired
                const isDirected = edge.directed === true;
                const isRequired = true; // All edges required for Chinese Postman
                
                content += `${edge.source},${edge.target},${Math.round(edge.weight)},${isDirected},${isRequired}\n`;
            } else {
                // WINDY format: V1,V2,COST,REVERSE_COST,isRequired
                // For one-way roads, set reverse cost very high (999999)
                // For two-way roads, reverse cost equals forward cost
                const reverseCost = edge.directed ? 999999 : edge.weight;
                
                // Determine if edge is required based on both coverage and route filter
                let isRequired = true;
                if (coverageFilterEnabled) {
                    // If coverage filtering is enabled, road must be uncovered AND match route filter
                    isRequired = !edge.isCovered && (edge.isRouteRequired !== undefined ? edge.isRouteRequired : true);
                } else {
                    // If no coverage filtering, only route filter matters
                    isRequired = edge.isRouteRequired !== undefined ? edge.isRouteRequired : true;
                }
                
                content += `${edge.source},${edge.target},${Math.round(edge.weight)},${Math.round(reverseCost)},${isRequired}\n`;
            }
        });

        content += `===========END LINKS============

VERTICES
Line Format: x,y

`;

        // Add vertex coordinates
        roadGraph.nodes.forEach(node => {
            const coord = nodeIdToCoordinateMap.get(node.id);
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

    createCoordinateMappings(roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap) {
        // Clear existing mappings
        coordinateToNodeIdMap.clear();
        nodeIdToCoordinateMap.clear();
        
        let nodeIdCounter = 1; // Start from 1 for OARLib compatibility

        // Helper function to get or create node ID for a coordinate
        const getNodeId = (coord) => {
            const key = `${coord[0].toFixed(8)},${coord[1].toFixed(8)}`;
            if (coordinateToNodeIdMap.has(key)) {
                return coordinateToNodeIdMap.get(key);
            }
            
            const nodeId = nodeIdCounter++;
            coordinateToNodeIdMap.set(key, nodeId);
            nodeIdToCoordinateMap.set(nodeId, coord);
            
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
        
        console.log(`Created coordinate mappings for ${nodeIdToCoordinateMap.size} nodes`);
    }

    // Method to ensure depot connectivity
    ensureDepotConnectivity(roadFeatures, nodes, edges, coordinateToNodeIdMap, nodeIdToCoordinateMap) {
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
        const currentFirstId = coordinateToNodeIdMap.get(firstCoordKey);
        
        // If the first coordinate is not vertex 1, we need to swap IDs
        if (currentFirstId !== 1) {
            console.log(`Swapping vertex IDs: ${currentFirstId} <-> 1 to ensure depot connectivity`);
            
            // Get the coordinate for vertex 1
            const vertex1Coord = nodeIdToCoordinateMap.get(1);
            const vertex1Key = vertex1Coord ? `${vertex1Coord[0].toFixed(8)},${vertex1Coord[1].toFixed(8)}` : null;
            
            // Swap the mappings
            coordinateToNodeIdMap.set(firstCoordKey, 1);
            nodeIdToCoordinateMap.set(1, firstUsedCoord);
            
            if (vertex1Key) {
                coordinateToNodeIdMap.set(vertex1Key, currentFirstId);
                nodeIdToCoordinateMap.set(currentFirstId, vertex1Coord);
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

    buildChinesePostmanGraph(roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap) {
        const nodes = [];
        const edges = [];
        let nodeIdCounter = 1; // Start from 1 for OARLib compatibility
        let edgeIdCounter = 0;

        // Use existing mappings or create new ones if needed
        if (nodeIdToCoordinateMap.size === 0) {
            this.createCoordinateMappings(roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap);
        }

        // Always create mixed graphs for OARLib (both directed and undirected edges)
        const treatAsUndirected = false;

        // Helper function to get node ID for a coordinate (should already exist)
        const getNodeId = (coord) => {
            const key = `${coord[0].toFixed(8)},${coord[1].toFixed(8)}`;
            if (coordinateToNodeIdMap.has(key)) {
                return coordinateToNodeIdMap.get(key);
            }
            
            // This shouldn't happen if mappings were created properly
            console.warn('Coordinate mapping not found for:', coord);
            const nodeId = nodeIdCounter++;
            coordinateToNodeIdMap.set(key, nodeId);
            nodeIdToCoordinateMap.set(nodeId, coord);
            
            return nodeId;
        };

        // Create nodes from existing mappings
        nodeIdToCoordinateMap.forEach((coord, nodeId) => {
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
            
            // Get coverage information and route filter marking from feature properties
            const isCovered = properties.isCovered || false;
            const isRouteRequired = properties.isRouteRequired !== undefined ? properties.isRouteRequired : true;
            
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
                        highwayType: highwayType,
                        isCovered: isCovered,
                        isRouteRequired: isRouteRequired
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
                            highwayType: highwayType,
                            isCovered: isCovered,
                            isRouteRequired: isRouteRequired
                        });
                    } else {
                        // Two-way road - create single undirected edge for mixed graph
                        edges.push({
                            source: sourceNodeId,
                            target: targetNodeId,
                            weight: Math.round(distance * 100) / 100,
                            directed: false,
                            roadName: roadName,
                            highwayType: highwayType,
                            isCovered: isCovered,
                            isRouteRequired: isRouteRequired
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
        this.ensureDepotConnectivity(roadFeatures, connectedNodes, edges, coordinateToNodeIdMap, nodeIdToCoordinateMap);
        
        console.log(`Created mixed graph with ${connectedNodes.length} nodes and ${edges.length} edges`);
        console.log(`Depot vertex: ${connectedNodes.find(n => n.id === 1) ? '1' : 'not found'}`);
        
        return { nodes: connectedNodes, edges };
    }
}

