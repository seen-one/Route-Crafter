# Route Crafter

![Screenshot](https://github.com/user-attachments/assets/8563137e-301b-443b-9da1-5693049e9651)

Route Crafter lets you generate the most efficient .gpx route covering every street within OpenStreetMap area tags:
* Landuse: Residential/Retail/Commercial/Industrial
* Admin Level 10
* Admin Level 9
* Admin Level 8
* Admin Level 7
* Boundary: Neighborhood
* Boundary: Political
* Boundary: Census
* Place: Suburb
* Place: Quarter
* Place: Postal code
* Place: District
* Place: Subdistrict

Click on multiple areas to generate a single route for a larger area. If the areas selected don't quite connect, you can expand the surrounding area by increasing the buffer. Once generated, a preview of the route will appear on the map. You can then play an animation of the route or download the GPX file. 

Use this if want to generate a route to collect your own street-view/360 imagery for [Google Street View, Mapillary, Panoramax etc.](https://wiki.openstreetmap.org/wiki/Street-level_imagery_services) or if you just want to visit every street in your area!

Route Crafter uses Python, the [everystreet](https://github.com/matejker/everystreet) algorithm to solve the Chinese Postman Problem (aka Route Inspection Problem), OpenStreetMap and the Overpass API for the map and data, Leaflet as the main frontend UI and Flask as the backend. Vibe coded using ChatGPT.

## Google Colab
[Click here to open this repo in Colab](https://colab.research.google.com/github/seen-one/Route-Crafter/blob/main/colab.ipynb)
1. Click on Run all
2. If asked to Restart session, click Cancel
3. Scroll down and click on the URL generated below

## Windows
1. Install the latest version of Python (from [python.org](https://www.python.org/downloads/windows/) and not from Microsoft Store) and tick 'Add Python.exe to PATH'
2. Install Git
3. Download Visual Studio Community 2022, select and install the Python Development and Python Native Development Tools
4. `git clone --recursive https://github.com/seen-one/Route-Crafter.git`
5. `cd Route-Crafter`
6. `python -m venv env`
7. `.\env\Scripts\activate`
8. `pip install -r requirements.txt`
9. `python app.py`
10. It should now be accessible at http://localhost:5000/ or the IP of the device

To run subsequently
1. `cd Route-Crafter`
2. `.\env\Scripts\activate`
3. `python app.py`

## Linux (Ubuntu example)
1. `sudo apt install git`
2. `git clone --recursive https://github.com/seen-one/Route-Crafter.git`
3. `cd Route-Crafter`
4. `python3 -m venv env`
5. `source env/bin/activate`
6. `pip install -r requirements.txt`
7. `python app.py`
8. It should now be accessible at http://localhost:5000/ or the IP of the device

To run subsequently
1. `cd Route-Crafter`
2. `source env/bin/activate`
3. `python app.py`

## Related
* [Every Street Challenge](http://www.everystreetchallenge.com/)
* [solipsia/RunEveryStreet](https://github.com/solipsia/RunEveryStreet)
	*  [clementh44/RunEveryStreet](https://github.com/clementh44/RunEveryStreet) (fork)
	* [lejun/RunEveryStreet](https://codeberg.org/lejun/RunEveryStreet) (fork)
* [rkistner/chinese-postman](https://github.com/rkistner/chinese-postman)
* Creating a route manually with [BRouter](https://brouter.de/brouter-web/)

## FAQ

#### Routing behaviour
The routing algorithm has been modified to avoid U-turns/backtracking unless necessary. This reduces undesirable U-turns especially at T-intersections. The route length will increase slightly. To disable this modification, adjust these lines in generate_gpx.py:
```python
#eulerian_path = hierholzer(network)
eulerian_path = hierholzer_forward_prefer(network)
```
to
```python
eulerian_path = hierholzer(network)
#eulerian_path = hierholzer_forward_prefer(network)
```

One-way road rules are ignored. To enforce one-way rules, uncomment these lines in generate_gpx.py. The routing is not currently optimal and the route length will increase significantly, even in areas without one-way roads.
```python
#largest_scc = max(nx.strongly_connected_components(org_graph), key=len)`
#graph = org_graph.subgraph(largest_scc).copy()
```
to
```python
largest_scc = max(nx.strongly_connected_components(org_graph), key=len)
graph = org_graph.subgraph(largest_scc).copy()
```

#### I want to cover an area but there is no suitable OpenStreetMap area to select
On openstreetmap.org, right click on your area and choose 'query features' to see if it is in an area where the area tag is not listed here. Feel free to modify the `index.html` and add the missing area tag. Let me know so I can update the list for everyone. Otherwise, you might be able to help OpenStreetMap by defining potentially missing administrative boundaries!

#### Include/Exclude certain types of roads/paths
The list `CUSTOM_FILTER` can be modified in `generate_gpx.py`. [More info](https://osmnx.readthedocs.io/en/stable/user-reference.html#osmnx.graph.graph_from_polygon)

#### Error generating GPX: Took too long to generate. Please try again with a smaller area.
You can modify the `app.py` file `TIMEOUT_DURATION` to increase the default timeout of 120 seconds if you really want to try a larger area or if you are running a slower server.

#### Best app for navigating the generated .gpx route with many overlapping paths?
I have found [Locus Map](https://www.locusmap.app/) with BRouter Offline to be the least confusing navigation when glancing with overlapping paths due to it highlighting only the immediate path ahead. A downside is the offline maps are not free. Feel free to suggest other navigation apps that is suitable for .gpx routes with overlapping paths.

[Related OsmAnd issue](https://github.com/osmandapp/OsmAnd/issues/9975)

#### Features like manually defining a polygon, deselecting roads, other map overlays (e.g. Mapillary/Panoramax)
Maybe, let me know if you would like them added!
