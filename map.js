import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1IjoidGlhbnRpYW56aGVuZyIsImEiOiJjbWh6OHM4ZWgwaTkzMmxxMjl5Z2g0ejJ1In0.RhKIbB3NuaARBQVNgVAs-A';


const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

const svg = d3.select("#map").select("svg");

map.on("load", async () => {
    console.log("Map loaded, adding Boston bike lanes...");
  
    // Boston bike lanes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': '#32D400',
            'line-width': 5,
            'line-opacity': 0.6
        }
    });

    // Cambridge bike lanes
    map.addSource("cambridge_routes", {
        type: "geojson",
        data: "https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson"
    });
      
    map.addLayer({
        id: "bike-lanes-cambridge",
        type: "line",
        source: "cambridge_routes",
        paint: {
            "line-color": "#32D400",
            "line-width": 3,
            "line-opacity": 0.6
        }
    });

 // ------- Bluebikes station data -------
 let jsonData;
 try {
     const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
     jsonData = await d3.json(jsonurl);
 } catch (error) {
     console.error('Error loading JSON:', error);
 }

 let stations = jsonData.data.stations;

 // ---- Load trip data ----
 let trips = await d3.csv(
   "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv",
   (trip) => {
     trip.started_at = new Date(trip.started_at);
     trip.ended_at = new Date(trip.ended_at);
     return trip;
   }
 );

 // ---- Compute arrivals / departures ----
 const departures = d3.rollup(
     trips,
     (v) => v.length,
     (d) => d.start_station_id
 );

 const arrivals = d3.rollup(
     trips,
     (v) => v.length,
     (d) => d.end_station_id
 );

 stations = stations.map((station) => {
     const id = station.short_name;
     station.arrivals = arrivals.get(id) ?? 0;
     station.departures = departures.get(id) ?? 0;
     station.totalTraffic = station.arrivals + station.departures;
     return station;
 });

 // ---- Create radius scale (before circles!) ----
 const radiusScale = d3
   .scaleSqrt()
   .domain([0, d3.max(stations, (d) => d.totalTraffic)])
   .range([0, 25]);

 // ---- Append circles ----
 const circles = svg
  .selectAll("circle")
  .data(stations)
  .enter()
  .append("circle")
  .attr("r", (d) => radiusScale(d.totalTraffic))
  .attr("fill", "steelblue")
  .attr("fill-opacity", 0.6)
  .attr("stroke", "white")
  .attr("stroke-width", 1)
  .each(function (d) {
    // Add <title> for browser tooltips
    d3.select(this)
      .append('title')
      .text(
        `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
      );
    });  
 // ---- Now define updatePositions (after circles exist!) ----
 function updatePositions() {
   circles
     .attr("cx", (d) => getCoords(d).cx)
     .attr("cy", (d) => getCoords(d).cy);
 }

 // ---- Bind map events AFTER circles exist ----
 updatePositions();
 map.on("move", updatePositions);
 map.on("zoom", updatePositions);
 map.on("resize", updatePositions);
 map.on("moveend", updatePositions);
});




function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
}