
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken =
  'pk.eyJ1IjoidGlhbnRpYW56aGVuZyIsImEiOiJjbWh6OHM4ZWgwaTkzMmxxMjl5Z2g0ejJ1In0.RhKIbB3NuaARBQVNgVAs-A';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

const svg = d3.select("#map").select("svg");

// ------------------- MAP LOAD ----------------------
map.on("load", async () => {

  // ---------------- BIKE LANES ----------------
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

  // ---------------- BLUEBIKES STATIONS ----------------
  const jsonData = await d3.json("https://dsc106.com/labs/lab07/data/bluebikes-stations.json");
  let stations = jsonData.data.stations;

  // ---------------- TRIPS ----------------
  let trips = await d3.csv(
    "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv",
    (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    }
  );
  
  // ---------------- ARRIVALS / DEPARTURES ----------------
  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

  stations = stations.map(st => {
    let id = st.short_name;
    st.arrivals = arrivals.get(id) ?? 0;
    st.departures = departures.get(id) ?? 0;
    st.totalTraffic = st.arrivals + st.departures;
    return st;
  });

  // ---------------- SCALE ----------------
  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([0, 25]);

  // ---------------- STEP 6.1: FLOW COLOR SCALE ----------------
  const stationFlow = d3.scaleQuantize()
    .domain([0, 1])
    .range([0, 0.5, 1]);


  // ---------------- DRAW CIRCLES ----------------
  const circles = svg.selectAll("circle")
    .data(stations, d => d.short_name)
    .enter()
    .append("circle")
    .attr("r", d => radiusScale(d.totalTraffic))
    .attr("fill-opacity", 0.6)
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .style("--departure-ratio", d =>
      stationFlow(d.totalTraffic === 0 ? 0.5 : d.departures / d.totalTraffic)
    )
    .each(function (d) {
      d3.select(this)
        .append("title")
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });

  // ---------------- POSITION UPDATE ----------------
  function updatePositions() {
    circles
      .attr("cx", d => getCoords(d).cx)
      .attr("cy", d => getCoords(d).cy);
  }

  updatePositions();
  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
  map.on("resize", updatePositions);
  map.on("moveend", updatePositions);

  // ---------------- STEP 5.x — TIME SLIDER ----------------

  const timeSlider = document.getElementById("time-slider");
  const selectedTime = document.getElementById("selected-time");
  const anyTimeLabel = document.getElementById("any-time");

  function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString("en-US", { timeStyle: "short" });
  }

  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  let departuresByMinute = Array.from({ length: 1440 }, () => []);
  let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

  trips.forEach(trip => {
    departuresByMinute[minutesSinceMidnight(trip.started_at)].push(trip);
    arrivalsByMinute[minutesSinceMidnight(trip.ended_at)].push(trip);
  });

  function filterByMinute(buckets, minute) {
    if (minute === -1) return buckets.flat();

    let min = (minute - 60 + 1440) % 1440;
    let max = (minute + 60) % 1440;

    if (min > max) {
      return buckets.slice(min).concat(buckets.slice(0, max)).flat();
    }
    return buckets.slice(min, max).flat();
  }

  function computeStationTraffic(stations, timeFilter = -1) {
    const dep = d3.rollup(
      filterByMinute(departuresByMinute, timeFilter),
      v => v.length,
      d => d.start_station_id
    );
    const arr = d3.rollup(
      filterByMinute(arrivalsByMinute, timeFilter),
      v => v.length,
      d => d.end_station_id
    );

    return stations.map(st => {
      let id = st.short_name;
      st.arrivals = arr.get(id) ?? 0;
      st.departures = dep.get(id) ?? 0;
      st.totalTraffic = st.arrivals + st.departures;
      return st;
    });
  }

  // ---------------- STEP 6: updateScatterPlot ALSO updates color ----------------
  function updateScatterPlot(timeFilter) {

    const filteredStations = computeStationTraffic(stations, timeFilter);

    if (timeFilter === -1) {
      radiusScale.range([0, 25]);
    } else {
      radiusScale.range([3, 50]);
    }

    circles
      .data(filteredStations, d => d.short_name)
      .join("circle")
      .attr("r", d => radiusScale(d.totalTraffic))
      .attr("cx", d => getCoords(d).cx)
      .attr("cy", d => getCoords(d).cy)
      .style("--departure-ratio", d =>
        stationFlow(d.totalTraffic === 0 ? 0.5 : d.departures / d.totalTraffic)
      );
  }

  function updateTimeDisplay() {
    const timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
      selectedTime.textContent = "";
      anyTimeLabel.style.display = "block";
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = "none";
    }

    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener("input", updateTimeDisplay);
  updateTimeDisplay();
});


// ---------------- GET COORDS ----------------
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}