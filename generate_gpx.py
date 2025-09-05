import sys
import json
import osmnx as ox
import networkx as nx
from shapely.geometry import Polygon
from datetime import datetime
from everystreet.libs.gpx_formatter import TEMPLATE, TRACE_POINT
from everystreet.libs.tools import *
from everystreet.libs.graph_route import plot_graph_route
from network import Network
from network.algorithms import hierholzer

CUSTOM_FILTER = (
    '["highway"]["area"!~"yes"]["highway"!~"bridleway|bus_guideway|construction|'
    'cycleway|elevator|footway|motorway|motorway_junction|motorway_link|escalator|proposed|'
    'construction|platform|raceway|rest_area|path"]["access"!~"customers|no|private"]'
    '["public_transport"!~"platform"]["fee"!~"yes"]["foot"!~"no"]["service"!~"drive-through|'
    'driveway|parking_aisle"]["toll"!~"yes"]'
)

def generate_gpx(polygon_coords):
    try:
        polygon = Polygon(polygon_coords)
        org_graph = ox.graph_from_polygon(polygon, custom_filter=CUSTOM_FILTER, truncate_by_edge=True)
        
        graph = ox.project_graph(org_graph)
        graph = ox.consolidate_intersections(graph, rebuild_graph=True, tolerance=15, dead_ends=True)
        graph = ox.project_graph(graph, to_latlong=True)
        org_graph = graph
        #graph = ox.convert.to_undirected(graph)
        
        # Get strongly connected component (SCC) as subgraph
        largest_scc = max(nx.strongly_connected_components(org_graph), key=len)
        graph = org_graph.subgraph(largest_scc).copy()

        odd_degree_nodes = get_odd_degree_nodes(graph)
        pair_weights = get_shortest_distance_for_odd_degrees(graph, odd_degree_nodes)
        matched_edges_with_weights = min_matching(pair_weights)

        single_edges = [(u, v) for u, v, k in graph.edges]
        added_edges = get_shortest_paths(graph, matched_edges_with_weights)
        edges = map_osmnx_edges2integers(graph, single_edges + added_edges)

        network = Network(len(graph.nodes), edges, weighted=True)
        eulerian_path = hierholzer(network)
        converted_eulerian_path = convert_integer_path2osmnx_nodes(eulerian_path, graph.nodes())
        double_edge_heap = get_double_edge_heap(org_graph)

        final_path = convert_path(graph, converted_eulerian_path, double_edge_heap)
        coordinates_path = convert_final_path_to_coordinates(org_graph, final_path)

        eccentricity = nx.eccentricity(graph)
        center = nx.center(graph)
        center_node = graph.nodes[center[0]]
        
        trace_point_template = '<trkpt lat="{lat}" lon="{lon}" />'

        trace_points = "\n\t\t\t".join([
            trace_point_template.format(lat=lat, lon=lon)
            for lat, lon in coordinates_path
        ])

        gpx_payload = TEMPLATE.format(
            name="Generated Route",
            trace_points=trace_points,
            center_lat=center_node["y"],
            center_lon=center_node["x"]
        )

        return gpx_payload

    except Exception as e:
        return str(e)

if __name__ == '__main__':
    # Read polygon coordinates from stdin
    polygon_coords = json.load(sys.stdin)

    gpx_data = generate_gpx(polygon_coords)
    print(gpx_data)  # Print GPX data to stdout
