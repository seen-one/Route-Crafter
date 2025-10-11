// Graph building module for OARLib format export

import { findStronglyConnectedComponents, filterGraphByComponent } from './utils.js';

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
            
            // Get selected export format
            const exportFormat = document.getElementById('exportFormatSelect').value;
            
            // Build the road graph for Chinese Postman Problem
            const roadGraph = this.buildChinesePostmanGraph(roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap, exportFormat);
            
            // Generate OARLib native format
            const oarLibContent = this.generateOARLibFormat(roadGraph, roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap, coverageFilterEnabled, exportFormat);

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
            this.showExportMessage(exportFormat, roadFeatures, coverageFilterEnabled);
        } catch (error) {
            console.error('Error exporting OARLib data:', error);
            alert('Error exporting data. Please try again.');
        }
    }

    showExportMessage(exportFormat, roadFeatures, coverageFilterEnabled) {
        const formatNames = {
            'undirected': 'Undirected Chinese Postman',
            'directed': 'Directed Chinese Postman',
            'mixed_frederickson': 'Mixed Chinese Postman (Frederickson)',
            'mixed_yaoyuenyong': 'Mixed Chinese Postman (Yaoyuenyong)',
            'windy_rural_win': 'Windy Rural Postman (Win)',
            'windy_rural_benavent': 'Windy Rural Postman (Benavent)'
        };

        const formatName = formatNames[exportFormat];
        
        if (exportFormat.includes('rural')) {
            // Windy Rural Postman modes - respects coverage
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
                console.log(`OARLib ${formatName} exported: ${requiredCount} required roads (uncovered + NOT in route filter), ${optionalCount} optional roads`);
                alert(`Exported ${formatName} format:\n\n` +
                      `✓ ${requiredCount} roads marked as REQUIRED (uncovered AND NOT in route filter)\n` +
                      `✓ ${optionalCount} roads marked as OPTIONAL (covered OR in route filter)\n\n` +
                      `This is suitable for Windy Rural Postman Problem solvers.`);
            } else {
                console.log(`OARLib ${formatName} exported: ${requiredCount} required roads (NOT in route filter), ${optionalCount} optional roads`);
                alert(`Exported ${formatName} format:\n\n` +
                      `✓ ${requiredCount} roads marked as REQUIRED (NOT in route filter)\n` +
                      `✓ ${optionalCount} roads marked as OPTIONAL (in route filter)\n\n` +
                      `This is suitable for Windy Rural Postman Problem solvers.`);
            }
        } else {
            // Chinese Postman modes - all roads required
            console.log(`OARLib ${formatName} format exported successfully (all roads required)`);
            alert(`Exported ${formatName} format:\n\n` +
                  'All roads marked as REQUIRED.\n' +
                  'This is suitable for Chinese Postman Problem solvers.');
        }
    }

    generateOARLibFormat(roadGraph, roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap, coverageFilterEnabled = false, exportFormat = 'windy_rural_benavent') {
        // Map export format to graph type
        const graphTypeMap = {
            'undirected': 'UNDIRECTED',
            'directed': 'DIRECTED',
            'mixed_frederickson': 'MIXED',
            'mixed_yaoyuenyong': 'MIXED',
            'windy_rural_win': 'WINDY',
            'windy_rural_benavent': 'WINDY'
        };
        const graphType = graphTypeMap[exportFormat];

        // Get basic counts
        const numVertices = roadGraph.nodes.length;
        const numEdges = roadGraph.edges.length;
        
        // Determine depot - use selected depot if available, otherwise default to vertex 1
        let depotId = 1;
        if (window.app && window.app.mapManager) {
            const selectedDepotId = window.app.mapManager.getSelectedDepotId();
            if (selectedDepotId !== null) {
                depotId = selectedDepotId;
                console.log(`Using user-selected depot: ${depotId}`);
            } else {
                depotId = roadGraph.nodes.length > 0 ? roadGraph.nodes[0].id : 1;
                console.log(`Using default depot: ${depotId}`);
            }
        } else {
            depotId = roadGraph.nodes.length > 0 ? roadGraph.nodes[0].id : 1;
        }
        
        // Determine problem type based on export format
        const problemType = exportFormat.includes('rural') ? 'WINDY_RURAL_POSTMAN' : 'CHINESE_POSTMAN';

        // Build header
        let content = `%
% This is a file generated by the Open Source, Arc-Routing Library (OAR Lib).
% For more information on OAR Lib, or the format please visit: 
% https://github.com/Olibear/ArcRoutingLibrary 
%
`;
        
        // Add format-specific comments
        if (graphType === 'WINDY') {
            content += `% WINDY VERSION
% Costs are in CENTIMETERS (meters * 100) to preserve precision as integers
% For one-way roads, reverse cost is set to 999999 (essentially infinity)
% Roads outside the original boundary are always OPTIONAL
`;
            if (exportFormat.includes('rural')) {
                if (coverageFilterEnabled) {
                    content += `% Roads are REQUIRED if: inside boundary AND uncovered AND NOT in route filter
% Roads are OPTIONAL if: outside boundary OR covered OR in route filter
`;
                } else {
                    content += `% Roads are REQUIRED if: inside boundary AND NOT in route filter
% Roads are OPTIONAL if: outside boundary OR in route filter
`;
                }
            }
            content += `%
`;
        } else if (graphType === 'DIRECTED') {
            content += `% DIRECTED VERSION
% Costs are in CENTIMETERS (meters * 100) to preserve precision as integers
% Two-way roads are represented as two separate arcs
% One-way roads are represented as a single arc
% All roads marked as REQUIRED (Chinese Postman mode)
%
`;
        } else if (graphType === 'UNDIRECTED') {
            content += `% UNDIRECTED VERSION
% Costs are in CENTIMETERS (meters * 100) to preserve precision as integers
% All roads are treated as bidirectional edges
% All roads marked as REQUIRED (Chinese Postman mode)
%
`;
        } else if (graphType === 'MIXED') {
            content += `% MIXED VERSION
% Costs are in CENTIMETERS (meters * 100) to preserve precision as integers
% One-way roads are directed edges, two-way roads are undirected edges
% All roads marked as REQUIRED (Chinese Postman mode)
%
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

        // Different line format based on graph type
        if (graphType === 'MIXED') {
            content += `Line Format: V1,V2,COST,isDirected,isRequired\n\n`;
        } else if (graphType === 'WINDY') {
            content += `Line Format: V1,V2,COST,REVERSE_COST,isRequired\n\n`;
        } else {
            // UNDIRECTED and DIRECTED use the same format
            content += `Line Format: V1,V2,COST,isRequired\n\n`;
        }

        // Add edges
        roadGraph.edges.forEach((edge, index) => {
            // Determine if edge is required
            let isRequired;
            if (exportFormat.includes('rural')) {
                // Windy Rural modes - respect coverage filtering
                if (coverageFilterEnabled) {
                    isRequired = !edge.isCovered && (edge.isRouteRequired !== undefined ? edge.isRouteRequired : true);
                } else {
                    isRequired = edge.isRouteRequired !== undefined ? edge.isRouteRequired : true;
                }
            } else {
                // All Chinese Postman modes - all edges required
                isRequired = true;
            }

            if (graphType === 'MIXED') {
                // MIXED format: V1,V2,COST,isDirected,isRequired
                const isDirected = edge.directed === true;
                // Convert to centimeters (multiply by 100) to preserve precision as integer
                const cost = Math.round(edge.weight * 100);
                content += `${edge.source},${edge.target},${cost},${isDirected},${isRequired}\n`;
            } else if (graphType === 'WINDY') {
                // WINDY format: V1,V2,COST,REVERSE_COST,isRequired
                // Convert to centimeters (multiply by 100) to preserve precision as integer
                const cost = Math.round(edge.weight * 100);
                const reverseCost = edge.directed ? 999999 : cost;
                content += `${edge.source},${edge.target},${cost},${reverseCost},${isRequired}\n`;
            } else if (graphType === 'DIRECTED') {
                // DIRECTED format: V1,V2,COST,isRequired
                // Note: edge.source and edge.target already properly oriented for directed graph
                // Convert to centimeters (multiply by 100) to preserve precision as integer
                const cost = Math.round(edge.weight * 100);
                content += `${edge.source},${edge.target},${cost},${isRequired}\n`;
            } else if (graphType === 'UNDIRECTED') {
                // UNDIRECTED format: V1,V2,COST,isRequired
                // Convert to centimeters (multiply by 100) to preserve precision as integer
                const cost = Math.round(edge.weight * 100);
                content += `${edge.source},${edge.target},${cost},${isRequired}\n`;
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

    buildChinesePostmanGraph(roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap, exportFormat = 'windy_rural_benavent') {
        const nodes = [];
        const edges = [];
        let nodeIdCounter = 1; // Start from 1 for OARLib compatibility
        let edgeIdCounter = 0;

        // Use existing mappings or create new ones if needed
        if (nodeIdToCoordinateMap.size === 0) {
            this.createCoordinateMappings(roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap);
        }

        // Determine edge creation strategy based on export format
        const treatAsUndirected = exportFormat === 'undirected';

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
                
                // Determine if road is one-way (including roundabouts)
                const isOneway = properties.oneway === 'yes' || 
                                properties.oneway === '1' || 
                                properties.oneway === 'true' ||
                                properties.junction === 'roundabout';
                
                if (exportFormat === 'undirected') {
                    // UNDIRECTED: Treat all roads as bidirectional edges
                    // Use consistent ordering to avoid duplicates
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
                } else if (exportFormat === 'directed') {
                    // DIRECTED: Create separate arcs for each direction
                    if (isOneway) {
                        // One-way road - single arc
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
                        // Two-way road - two arcs (one in each direction)
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
                        edges.push({
                            source: targetNodeId,
                            target: sourceNodeId,
                            weight: Math.round(distance * 100) / 100,
                            directed: true,
                            roadName: roadName,
                            highwayType: highwayType,
                            isCovered: isCovered,
                            isRouteRequired: isRouteRequired
                        });
                    }
                } else if (exportFormat.startsWith('mixed_')) {
                    // MIXED: One-way = directed, two-way = undirected
                    if (isOneway) {
                        // One-way road - directed edge
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
                        // Two-way road - undirected edge
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
                } else {
                    // WINDY (both Win and Benavent): Use windy edge representation
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
                        // Two-way road - single undirected edge for windy graph
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

    exportLargestComponentForChinesePostman(geoJsonLayer, coordinateToNodeIdMap, nodeIdToCoordinateMap) {
        if (!geoJsonLayer) {
            alert('No road data available. Please fetch roads first.');
            return null;
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
            
            // Get selected export format
            const exportFormat = document.getElementById('exportFormatSelect').value;
            
            // Build the road graph
            const roadGraph = this.buildChinesePostmanGraph(roadFeatures, coordinateToNodeIdMap, nodeIdToCoordinateMap, exportFormat);
            
            // Find strongly connected components
            const components = findStronglyConnectedComponents(roadGraph.nodes, roadGraph.edges);
            
            // Get statistics before filtering
            const totalNodes = roadGraph.nodes.length;
            const totalEdges = roadGraph.edges.length;
            
            console.log(`Found ${components.length} strongly connected component(s)`);
            components.forEach((comp, idx) => {
                console.log(`  Component ${idx + 1}: ${comp.size} nodes`);
            });
            
            // Find the largest component
            let largestComponent = components[0];
            for (const component of components) {
                if (component.size > largestComponent.size) {
                    largestComponent = component;
                }
            }
            
            console.log(`Largest component has ${largestComponent.size} nodes`);
            
            // Filter graph to only include the largest component
            const filteredGraph = filterGraphByComponent(roadGraph.nodes, roadGraph.edges, largestComponent);
            
            // Renumber nodes to be sequential (1, 2, 3, ...) for OARLib format
            // Create mapping from old IDs to new IDs
            const oldIdToNewId = new Map();
            let newId = 1;
            filteredGraph.nodes.forEach(node => {
                oldIdToNewId.set(node.id, newId);
                newId++;
            });
            
            // Update node IDs in the filtered graph
            filteredGraph.nodes.forEach(node => {
                node.id = oldIdToNewId.get(node.id);
            });
            
            // Update edge source and target references
            filteredGraph.edges.forEach(edge => {
                edge.source = oldIdToNewId.get(edge.source);
                edge.target = oldIdToNewId.get(edge.target);
            });
            
            // Create new coordinate mappings with sequential IDs (don't modify originals)
            // This ensures the original export button and other features still work
            const newNodeIdToCoordinateMap = new Map();
            const newCoordinateToNodeIdMap = new Map();
            
            nodeIdToCoordinateMap.forEach((coord, oldNodeId) => {
                if (largestComponent.has(oldNodeId)) {
                    const newNodeId = oldIdToNewId.get(oldNodeId);
                    const coordKey = `${coord[0].toFixed(8)},${coord[1].toFixed(8)}`;
                    newNodeIdToCoordinateMap.set(newNodeId, coord);
                    newCoordinateToNodeIdMap.set(coordKey, newNodeId);
                }
            });
            
            console.log(`Created renumbered coordinate mappings: ${newNodeIdToCoordinateMap.size} nodes`);
            
            // Generate OARLib native format with filtered graph and new coordinate maps
            const oarLibContent = this.generateOARLibFormat(filteredGraph, roadFeatures, newCoordinateToNodeIdMap, newNodeIdToCoordinateMap, coverageFilterEnabled, exportFormat);

            // Download the OARLib file
            const blob = new Blob([oarLibContent], {
                type: 'text/plain'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.download = 'route_crafter_graph_largest_component.oarlib';
            document.body.appendChild(a);
            a.href = url;
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Calculate statistics
            const nodePercentage = ((filteredGraph.nodes.length / totalNodes) * 100).toFixed(1);
            const edgePercentage = ((filteredGraph.edges.length / totalEdges) * 100).toFixed(1);
            const nodesRemoved = totalNodes - filteredGraph.nodes.length;
            
            // Show comprehensive alert
            const componentInfo = components.length === 1 
                ? 'Graph is fully connected (1 component).'
                : `Found ${components.length} strongly connected components.`;
            
            const formatNames = {
                'undirected': 'UNDIRECTED',
                'directed': 'DIRECTED',
                'mixed_frederickson': 'MIXED',
                'mixed_yaoyuenyong': 'MIXED',
                'windy_rural_win': 'WINDY',
                'windy_rural_benavent': 'WINDY'
            };
            const graphTypeStr = formatNames[exportFormat];
            
            alert(`${componentInfo}\n\n` +
                  `Exported largest component as ${graphTypeStr} OARLib format:\n\n` +
                  `✓ ${filteredGraph.nodes.length}/${totalNodes} nodes (${nodePercentage}%)\n` +
                  `✓ ${filteredGraph.edges.length}/${totalEdges} edges (${edgePercentage}%)\n\n` +
                  `${nodesRemoved > 0 ? `Removed ${nodesRemoved} node(s) from smaller components.` : 'All nodes included.'}\n` +
                  `Nodes renumbered sequentially (1-${filteredGraph.nodes.length}).`);
            
            console.log(`Exported largest component: ${filteredGraph.nodes.length}/${totalNodes} nodes (${nodePercentage}%), ${filteredGraph.edges.length}/${totalEdges} edges (${edgePercentage}%)`);
            
            // Return the new coordinate mappings so they can be used for applying solutions
            return {
                coordinateToNodeIdMap: newCoordinateToNodeIdMap,
                nodeIdToCoordinateMap: newNodeIdToCoordinateMap
            };
        } catch (error) {
            console.error('Error exporting largest component:', error);
            alert('Error exporting data. Please try again.');
            return null;
        }
    }
}

