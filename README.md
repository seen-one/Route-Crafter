# Route Crafter
Find your area. Create a route. Done!

![Screenshot](https://github.com/user-attachments/assets/8563137e-301b-443b-9da1-5693049e9651)

Route Crafter lets you find and select areas where you want to cover every street within it. Find your area based on OpenStreetMap data:
* Landuse: Residential/Retail/Commercial/Industrial
* Admin Level 10
* Admin Level 9
* Admin Level 8
* Admin Level 7
* Boundary: Political
* Place: Suburb

Click on multiple areas to generate a single route across a larger area. If the areas selected don't quite connect, increase the buffer to enlarge area selection. Once generated, a preview of the route will appear on the map. You can then play an animation of the route or download the GPX file for you runners, cyclists, DIY street viewer, postie etc.

Route Crafter uses Python, the [everystreet](https://github.com/matejker/everystreet) algorithm to solve the Chinese Postman Problem (aka Route Inspection Problem), OpenStreetMap and Overpass API for the map and data, Leaflet as the main frontend UI and Flask as the backend.

## Windows install and usage
1. Install the latest version of Python (from [python.org](https://www.python.org/downloads/windows/) and not from Microsoft Store) and tick 'Add Python.exe to PATH'
2. Install Git
3. Download Visual Studio Community 2022, select and install the Python Development and Python Native Development Tools
4. `git clone --recursive https://github.com/seen-one/Route-Crafter.git`
5. `cd Route-Crafter`
6. `pip install -r requirements.txt`
7. `python app.py`
8. It should now be accessible at http://localhost:5000/ or the IP of the device

## Linux install and usage (tested on Ubuntu)
1. Install Git, the command for Ubuntu is `sudo apt install git`
2. `git clone --recursive https://github.com/seen-one/Route-Crafter.git`
3. `cd Route-Crafter`
4. `python3 -m venv env`
5. `source env/bin/activate`
6. `pip install -r requirements.txt`
7. `python app.py`
8. It should now be accessible at http://localhost:5000/ or the IP of the device

## The background and what is with the code?
I confess 99% of the code was written by ChatGPT. While I have achieved what I wanted to create, this definitely gave me an insight as to the limitation of cheating and letting AI do all the work for you, like asking AI to write an essay for you and not learning how to do things properly, except security issues are much more likely to go unnoticed. This is why I decided not to host it as initially planned. Feel free to fork this repo and bring it up to spec, maybe even host it. You'll probably find code that is really out of place, outdated libraries, silly and unnecessary stuff, maybe a spaghetti. This was created because I wanted to see if I can really build a better tool for DIY street view mappers (me on a bicycle!).

## License
Now that I have coughed out that ChatGPT did most of the work, I have read that it would mean the code would not be copyrightable. Still, attribution would be welcome :) I don't know, I'm no lawyer.  After really digging into this, my conclusion is that while still not copyrightable, a license can still be applied which would act like a promise between two people and keep them happy :)
