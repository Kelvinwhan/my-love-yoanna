const HKO_API = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";
const KMB_API = "https://data.etabus.gov.hk/v1/transport/kmb";
const CITYBUS_API = "https://rt.data.gov.hk/v2/transport/citybus";
const DEFAULT_ROUTE = "680";
const DEFAULT_STOP = "石門";
const WIND_SPEED_RANGES = [
  [0, 0],
  [1, 5],
  [6, 11],
  [12, 19],
  [20, 28],
  [29, 38],
  [39, 49],
  [50, 61],
  [62, 74],
  [75, 88],
  [89, 102],
  [103, 117],
  [118, 999]
];

const elements = {
  currentTemperature: document.querySelector("#current-temperature"),
  currentCondition: document.querySelector("#current-condition"),
  currentSky: document.querySelector("#current-sky"),
  currentHumidity: document.querySelector("#current-humidity"),
  currentWind: document.querySelector("#current-wind"),
  weatherSummary: document.querySelector("#weather-summary"),
  weatherUpdated: document.querySelector("#weather-updated"),
  weatherError: document.querySelector("#weather-error"),
  forecastGrid: document.querySelector("#forecast-grid"),
  routeForm: document.querySelector("#route-form"),
  routeInput: document.querySelector("#route-input"),
  selectedRouteLabel: document.querySelector("#selected-route-label"),
  busResults: document.querySelector("#bus-results"),
  busError: document.querySelector("#bus-error"),
  searchButton: document.querySelector(".search-button"),
  refreshButton: document.querySelector("#refresh-button")
};

let stopsByIdPromise;
const citybusStopsById = new Map();

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}).`);
  }
  return response.json();
}

function setError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function formatObservationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-HK", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Hong_Kong"
  }).format(date);
}

function formattedForecastDate(value) {
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00+08:00`);
  return new Intl.DateTimeFormat("en-HK", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Hong_Kong"
  }).format(date);
}

function weatherSymbol(description) {
  const text = description.toLowerCase();
  if (/thunder|lightning/.test(text)) return "⛈";
  if (/shower|rain|drizzle/.test(text)) return "🌦";
  if (/fog|mist|haze/.test(text)) return "🌫";
  if (/cloud|overcast/.test(text)) return "☁";
  if (/sun|fine|clear/.test(text)) return "☀";
  return "◌";
}

function currentWeatherSymbol(iconCode) {
  const icon = Number(iconCode);
  if (icon >= 60 && icon < 70) return "🌧";
  if (icon >= 70 && icon < 80) return "🌫";
  if (icon === 50 || icon === 51 || icon === 52 || icon === 53 || (icon >= 80 && icon <= 82)) return "☀";
  return "☁";
}

function describeWind(wind) {
  const match = wind.match(/^(.*?)\s+force\s+(\d+)(?:\s+to\s+(\d+))?/i);
  if (!match) return { direction: wind, speed: "" };

  const direction = match[1].replace(/^(light|moderate|fresh|strong|gale|storm)\s+/i, "").trim();
  const firstForce = Math.min(Number(match[2]), WIND_SPEED_RANGES.length - 1);
  const lastForce = Math.min(Number(match[3] || match[2]), WIND_SPEED_RANGES.length - 1);
  const minimum = WIND_SPEED_RANGES[firstForce][0];
  const maximum = WIND_SPEED_RANGES[lastForce][1];
  const forceLabel = firstForce === lastForce ? `Force ${firstForce}` : `Force ${firstForce}–${lastForce}`;

  return {
    direction: direction || "Variable",
    speed: `${forceLabel} · ~${minimum}–${maximum} km/h`
  };
}

function compactWindDirection(direction) {
  return direction.replace(/\bnorth\b/gi, "N")
    .replace(/\bsouth\b/gi, "S")
    .replace(/\beast\b/gi, "E")
    .replace(/\bwest\b/gi, "W");
}

function renderForecast(forecasts) {
  elements.forecastGrid.replaceChildren();
  forecasts.forEach((day) => {
    const card = document.createElement("article");
    card.className = "forecast-card";

    const heading = document.createElement("div");
    heading.className = "forecast-day";
    heading.textContent = day.week;

    const date = document.createElement("div");
    date.className = "forecast-date";
    date.textContent = formattedForecastDate(day.forecastDate);

    const symbol = document.createElement("div");
    symbol.className = "forecast-symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = weatherSymbol(day.forecastWeather);

    const weather = document.createElement("div");
    weather.className = "forecast-weather";
    weather.textContent = day.forecastWeather;

    const temperatures = document.createElement("div");
    temperatures.className = "forecast-temperatures";

    const high = document.createElement("span");
    high.className = "forecast-high";
    high.textContent = `${day.forecastMaxtemp.value}°`;

    const low = document.createElement("span");
    low.className = "forecast-low";
    low.textContent = `${day.forecastMintemp.value}°`;
    temperatures.append(high, low);

    const wind = describeWind(day.forecastWind || "Wind information unavailable");
    const windInfo = document.createElement("div");
    windInfo.className = "forecast-wind";

    const direction = document.createElement("span");
    direction.textContent = `↗ ${wind.direction}`;

    const speed = document.createElement("strong");
    speed.textContent = wind.speed || "HKO wind forecast";
    windInfo.append(direction, speed);

    card.append(heading, date, symbol, weather, temperatures, windInfo);
    elements.forecastGrid.append(card);
  });
}

async function loadWeather() {
  setError(elements.weatherError, "");
  try {
    const [current, forecast] = await Promise.all([
      fetchJson(`${HKO_API}?dataType=rhrread&lang=en`),
      fetchJson(`${HKO_API}?dataType=fnd&lang=en`)
    ]);
    const observatory = current.temperature?.data?.find((station) => station.place === "Hong Kong Observatory")
      || current.temperature?.data?.[0];
    const humidity = current.humidity?.data?.find((station) => station.place === "Hong Kong Observatory")
      || current.humidity?.data?.[0];
    const days = forecast.weatherForecast?.slice(0, 7) || [];

    if (!observatory || days.length < 7) {
      throw new Error("The Observatory returned incomplete weather data.");
    }

    elements.currentTemperature.textContent = observatory.value;
    elements.currentCondition.textContent = `Hong Kong Observatory · ${formatObservationTime(current.updateTime)} HKT`;
    elements.currentSky.textContent = currentWeatherSymbol(current.icon?.[0]);
    elements.currentHumidity.textContent = humidity ? `${humidity.value}%` : "Unavailable";
    const nextWind = describeWind(days[0].forecastWind || "");
    const windSpeed = nextWind.speed.replace(/Force [^·]+·\s*/, "");
    elements.currentWind.textContent = windSpeed
      ? `${compactWindDirection(nextWind.direction)} · ${windSpeed}`
      : nextWind.direction || "Unavailable";
    elements.weatherSummary.textContent = forecast.generalSituation || "A new outlook from the Hong Kong Observatory is available.";
    elements.weatherUpdated.textContent = `Updated ${formatObservationTime(forecast.updateTime)} HKT`;
    renderForecast(days);
  } catch (error) {
    setError(elements.weatherError, `Weather could not be loaded: ${error.message} Check your connection and try refreshing.`);
    elements.weatherUpdated.textContent = "Weather data unavailable";
  }
}

function getStopsById() {
  if (!stopsByIdPromise) {
    stopsByIdPromise = fetchJson(`${KMB_API}/stop/`).then((result) => {
      if (!Array.isArray(result.data)) {
        throw new Error("The KMB stop list is unavailable.");
      }
      return new Map(result.data.map((stop) => [stop.stop, stop]));
    }).catch((error) => {
      stopsByIdPromise = undefined;
      throw error;
    });
  }
  return stopsByIdPromise;
}

function directionLabel(bound) {
  return bound === "O" ? "Outbound" : "Inbound";
}

function formatEtaTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-HK", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Hong_Kong"
  }).format(date);
}

function etaCountdown(value) {
  const milliseconds = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(milliseconds)) return { text: "Time unavailable", arriving: false };
  const minutes = Math.ceil(milliseconds / 60000);
  if (minutes <= 0) return { text: "Arriving", arriving: true };
  if (minutes === 1) return { text: "1 min", arriving: true };
  return { text: `${minutes} mins`, arriving: false };
}

function renderEtaRow(eta) {
  const row = document.createElement("div");
  row.className = "eta-row";

  const time = document.createElement("span");
  time.className = "eta-time";

  const clock = document.createElement("strong");
  clock.className = "eta-clock";
  clock.textContent = formatEtaTime(eta.eta);

  const remark = document.createElement("span");
  remark.className = "eta-remark";
  remark.textContent = eta.rmk_tc || eta.rmk_en || "Live estimate";
  time.append(clock, remark);

  const countdown = etaCountdown(eta.eta);
  const minutes = document.createElement("span");
  minutes.className = `eta-countdown${countdown.arriving ? " arriving" : ""}`;
  minutes.textContent = countdown.text;
  row.append(time, minutes);
  return row;
}

function makeOperatorColumn(label, result) {
  const column = document.createElement("section");
  column.className = "operator-column";

  const heading = document.createElement("h3");
  heading.className = "operator-heading";
  heading.textContent = label;

  const etaList = document.createElement("div");
  etaList.className = "eta-list";
  if (result?.etas.length) {
    result.etas.forEach((eta) => etaList.append(renderEtaRow(eta)));
  } else {
    const empty = document.createElement("span");
    empty.className = "no-eta-value";
    empty.textContent = "--";
    etaList.append(empty);
  }

  column.append(heading, etaList);
  if (result?.error) {
    const error = document.createElement("p");
    error.className = "operator-error";
    error.textContent = result.error;
    column.append(error);
  }
  return column;
}

function makeBusCard(row, route) {
  const card = document.createElement("article");
  card.className = "bus-card";

  const header = document.createElement("div");
  header.className = "bus-card-heading";
  const stopDetails = document.createElement("div");
  const stopName = document.createElement("div");
  stopName.className = "bus-stop-name";
  stopName.textContent = row.stop.name_tc;
  const subtitle = document.createElement("div");
  subtitle.className = "bus-stop-subtitle";
  const service = row.kmb?.group.serviceTypes.map((type) => `Service ${type}`).join(", ");
  const destination = row.kmb?.group.route.dest_tc || row.citybus?.group.destinationTc;
  subtitle.textContent = `${route} → ${destination || "石門"}${service ? ` · ${service}` : ""}`;

  const tag = document.createElement("span");
  tag.className = "direction-tag";
  tag.textContent = row.kmb
    ? directionLabel(row.kmb.group.bound)
    : directionLabel(row.citybus.group.bound);

  stopDetails.append(stopName, subtitle);
  header.append(stopDetails, tag);
  card.append(header);

  if (row.citybus && row.kmb && row.citybus.group.stop.name_tc !== row.kmb.group.stop.name_tc) {
    const citybusStop = document.createElement("p");
    citybusStop.className = "matched-stop-name";
    citybusStop.textContent = `城巴站：${row.citybus.group.stop.name_tc}`;
    card.append(citybusStop);
  }

  const columns = document.createElement("div");
  columns.className = "operator-columns";
  columns.append(
    makeOperatorColumn("九巴", row.kmb),
    makeOperatorColumn("城巴", row.citybus)
  );
  card.append(columns);
  return card;
}

function setBusLoading(route) {
  const loading = document.createElement("div");
  loading.className = "bus-loading";
  const spinner = document.createElement("span");
  spinner.className = "loading-line";
  spinner.setAttribute("aria-hidden", "true");
  const text = document.createElement("p");
  text.textContent = `Finding route ${route} at Shek Mun…`;
  loading.append(spinner, text);
  elements.busResults.replaceChildren(loading);
}

async function loadBus(routeValue) {
  const route = routeValue.trim().toUpperCase();
  setError(elements.busError, "");
  elements.selectedRouteLabel.textContent = route || DEFAULT_ROUTE;
  if (!/^[A-Z0-9]{1,8}$/.test(route)) {
    elements.busResults.replaceChildren();
    setError(elements.busError, "Enter a valid bus route number using letters or numbers.");
    return;
  }

  elements.searchButton.disabled = true;
  setBusLoading(route);
  const issues = [];
  try {
    const [kmbRoutesResult, citybusRoutesResult, allStopsResult] = await Promise.allSettled([
      fetchJson(`${KMB_API}/route/`),
      fetchJson(`${CITYBUS_API}/route/CTB`),
      getStopsById()
    ]);
    if (kmbRoutesResult.status === "rejected") {
      issues.push(`九巴 route data: ${kmbRoutesResult.reason.message}`);
    }
    if (citybusRoutesResult.status === "rejected") {
      issues.push(`城巴 route data: ${citybusRoutesResult.reason.message}`);
    }
    if (allStopsResult.status === "rejected") {
      throw new Error(`Shek Mun stop data could not be loaded: ${allStopsResult.reason.message}`);
    }

    const allStops = allStopsResult.value;
    const shekMunStops = [...allStops.values()].filter((stop) =>
      stop.name_tc.includes(DEFAULT_STOP) || stop.name_en.toLowerCase().includes("shek mun")
    );
    const kmbVariants = kmbRoutesResult.status === "fulfilled"
      ? kmbRoutesResult.value.data.filter((item) => item.route.toUpperCase() === route)
      : [];
    const citybusVariants = citybusRoutesResult.status === "fulfilled"
      ? citybusRoutesResult.value.data.filter((item) => item.route.toUpperCase() === route)
      : [];

    const uniqueKmbVariants = kmbVariants.filter((item, index, all) =>
      all.findIndex((other) => other.bound === item.bound && other.service_type === item.service_type) === index
    );

    const kmbRouteStops = await Promise.all(uniqueKmbVariants.map(async (variant) => {
      const direction = variant.bound === "O" ? "outbound" : "inbound";
      try {
        const response = await fetchJson(
          `${KMB_API}/route-stop/${encodeURIComponent(variant.route)}/${direction}/${encodeURIComponent(variant.service_type)}`
        );
        return { variant, stops: response.data, error: "" };
      } catch (error) {
        issues.push(`九巴 ${variant.route} ${direction}: ${error.message}`);
        return { variant, stops: [], error: error.message };
      }
    }));

    const kmbGroups = new Map();
    kmbRouteStops.forEach(({ variant, stops, error }) => {
      stops.forEach((routeStop) => {
        const stop = allStops.get(routeStop.stop);
        if (!stop || !(stop.name_tc.includes(DEFAULT_STOP) || stop.name_en.toLowerCase().includes("shek mun"))) return;
        const key = `${variant.bound}:${routeStop.stop}`;
        if (!kmbGroups.has(key)) {
          kmbGroups.set(key, { stop, bound: variant.bound, route: variant, serviceTypes: [], error });
        }
        const group = kmbGroups.get(key);
        if (!group.serviceTypes.includes(variant.service_type)) {
          group.serviceTypes.push(variant.service_type);
        }
      });
    });

    const uniqueCitybusVariants = citybusVariants.filter((item, index, all) =>
      all.findIndex((other) => other.orig_tc === item.orig_tc && other.dest_tc === item.dest_tc) === index
    );
    const citybusRouteStops = await Promise.all(uniqueCitybusVariants.flatMap((variant) =>
      ["outbound", "inbound"].map(async (direction) => {
        try {
          const response = await fetchJson(
            `${CITYBUS_API}/route-stop/CTB/${encodeURIComponent(route)}/${direction}`
          );
          const bound = direction === "outbound" ? "O" : "I";
          const destinationTc = bound === "I" ? variant.orig_tc : variant.dest_tc;
          return { variant, bound, destinationTc, stops: response.data };
        } catch (error) {
          issues.push(`城巴 ${route} ${direction}: ${error.message}`);
          return { variant, bound: direction === "outbound" ? "O" : "I", destinationTc: "", stops: [], error: error.message };
        }
      })
    ));

    const uniqueCitybusStopIds = [...new Set(citybusRouteStops.flatMap((result) =>
      result.stops.map((routeStop) => routeStop.stop)
    ))];
    const citybusStopResults = await mapWithConcurrency(uniqueCitybusStopIds, 8, async (stopId) => {
      try {
        const response = await getCitybusStop(stopId);
        return { stopId, stop: response.data, error: "" };
      } catch (error) {
        return { stopId, stop: null, error: error.message };
      }
    });
    const citybusStops = new Map();
    citybusStopResults.forEach((result) => {
      if (result.stop) {
        citybusStops.set(result.stopId, result.stop);
      } else {
        issues.push(`城巴 stop ${result.stopId}: ${result.error}`);
      }
    });
    const citybusGroups = new Map();
    citybusRouteStops.forEach(({ variant, bound, destinationTc, stops }) => {
      stops.forEach((routeStop) => {
        const stop = citybusStops.get(routeStop.stop);
        if (!stop || !isNearShekMun(stop, shekMunStops)) return;
        const key = `${bound}:${routeStop.stop}`;
        if (!citybusGroups.has(key)) {
          citybusGroups.set(key, { stop, bound, destinationTc, route: variant });
        }
      });
    });

    const [kmbArrivals, citybusArrivals] = await Promise.all([
      Promise.all([...kmbGroups.values()].map(async (group) => {
        const results = await Promise.allSettled(group.serviceTypes.map((serviceType) =>
          fetchJson(`${KMB_API}/eta/${encodeURIComponent(group.stop.stop)}/${encodeURIComponent(route)}/${encodeURIComponent(serviceType)}`)
        ));
        const successful = results.filter((result) => result.status === "fulfilled")
          .flatMap((result) => result.value.data || [])
          .filter((eta) => eta.eta && eta.dir === group.bound && new Date(eta.eta).getTime() >= Date.now() - 30000)
          .sort((first, second) => new Date(first.eta) - new Date(second.eta));
        const uniqueEtas = uniqueArrivalTimes(successful);
        const failed = results.some((result) => result.status === "rejected");
        if (failed) issues.push(`Some 九巴 ${route} arrival requests failed.`);
        return { group, etas: uniqueEtas, error: failed ? "九巴 arrival data unavailable." : "" };
      })),
      Promise.all([...citybusGroups.values()].map(async (group) => {
        try {
          const response = await fetchJson(
            `${CITYBUS_API}/eta/CTB/${encodeURIComponent(group.stop.stop)}/${encodeURIComponent(route)}`
          );
          const arrivals = (response.data || [])
            .filter((eta) => eta.eta && eta.dir === group.bound && new Date(eta.eta).getTime() >= Date.now() - 30000)
            .sort((first, second) => new Date(first.eta) - new Date(second.eta));
          return { group, etas: uniqueArrivalTimes(arrivals), error: "" };
        } catch (error) {
          issues.push(`城巴 ${route} arrival data: ${error.message}`);
          return { group, etas: [], error: "城巴 arrival data unavailable." };
        }
      }))
    ]);

    const displayRows = [];
    const usedCitybusGroups = new Set();
    kmbArrivals.forEach((kmb) => {
      const matches = citybusArrivals
        .filter((citybus) => !usedCitybusGroups.has(citybus))
        .map((citybus) => ({
          citybus,
          distance: distanceBetweenStops(kmb.group.stop, citybus.group.stop),
          destinationMatches: normalizeDestination(kmb.group.route.dest_tc)
            === normalizeDestination(citybus.group.destinationTc)
        }))
        .filter((match) => match.distance <= 120)
        .sort((first, second) =>
          Number(second.destinationMatches) - Number(first.destinationMatches) || first.distance - second.distance
        );
      const citybus = matches.find((match) => match.destinationMatches)?.citybus
        || (matches.length === 1 ? matches[0].citybus : null);
      if (citybus) usedCitybusGroups.add(citybus);
      displayRows.push({
        stop: kmb.group.stop,
        kmb,
        citybus
      });
    });
    citybusArrivals.forEach((citybus) => {
      if (!usedCitybusGroups.has(citybus)) {
        displayRows.push({
          stop: citybus.group.stop,
          kmb: null,
          citybus
        });
      }
    });

    if (!displayRows.length) {
      displayRows.push({
        stop: { name_tc: `${DEFAULT_STOP} / Shek Mun` },
        kmb: null,
        citybus: null
      });
      issues.push(`Route ${route} has no matching 石門 stop in either operator's route data.`);
    }

    elements.busResults.replaceChildren();
    displayRows.forEach((row) => {
      elements.busResults.append(makeBusCard(row, route));
    });
    localStorage.setItem("harbour-route", route);
    setError(elements.busError, issues.length ? issues.join(" ") : "");
  } catch (error) {
    elements.busResults.replaceChildren();
    setError(elements.busError, `Bus arrivals could not be loaded: ${error.message}`);
  } finally {
    elements.searchButton.disabled = false;
  }
}

async function getCitybusStop(stopId) {
  if (!citybusStopsById.has(stopId)) {
    const request = fetchJson(`${CITYBUS_API}/stop/${encodeURIComponent(stopId)}`)
      .catch((error) => {
        citybusStopsById.delete(stopId);
        throw error;
      });
    citybusStopsById.set(stopId, request);
  }
  return citybusStopsById.get(stopId);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

function distanceBetweenStops(first, second) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDifference = toRadians(Number(second.lat) - Number(first.lat));
  const longitudeDifference = toRadians(Number(second.long) - Number(first.long));
  const firstLatitude = toRadians(Number(first.lat));
  const secondLatitude = toRadians(Number(second.lat));
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDifference / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isNearShekMun(stop, shekMunStops) {
  if (stop.name_tc?.includes(DEFAULT_STOP) || stop.name_en?.toLowerCase().includes("shek mun")) return true;
  return shekMunStops.some((anchor) => distanceBetweenStops(stop, anchor) <= 150);
}

function normalizeDestination(destination) {
  return (destination || "").toLowerCase().replace(/station|站|[()（）\s-]/g, "");
}

function uniqueArrivalTimes(arrivals) {
  return arrivals.filter((eta, index, all) =>
    all.findIndex((other) => other.eta === eta.eta && other.dest_tc === eta.dest_tc) === index
  ).slice(0, 3);
}

function refresh() {
  loadWeather();
  loadBus(elements.routeInput.value || DEFAULT_ROUTE);
}

elements.routeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadBus(elements.routeInput.value);
});

elements.refreshButton.addEventListener("click", refresh);

const savedRoute = localStorage.getItem("harbour-route");
elements.routeInput.value = savedRoute || DEFAULT_ROUTE;
elements.selectedRouteLabel.textContent = elements.routeInput.value;
loadWeather();
loadBus(elements.routeInput.value);

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("The offline app shell could not be registered.", error);
    });
  });
}
