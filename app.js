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
  stopSearch: document.querySelector("#stop-search"),
  stopSuggestions: document.querySelector("#stop-suggestions"),
  selectedStopLabel: document.querySelector("#selected-stop-label"),
  locationStatus: document.querySelector("#location-status"),
  useLocationButton: document.querySelector("#use-location-button"),
  busResults: document.querySelector("#bus-results"),
  busError: document.querySelector("#bus-error"),
  searchButton: document.querySelector(".search-button"),
  refreshButton: document.querySelector("#refresh-button")
};

let stopsByIdPromise;
const citybusStopsById = new Map();
let currentStopChoices = [];
let selectedStopKey = null;
let currentRoute = DEFAULT_ROUTE;
let searchGeneration = 0;

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

function temperatureClass(value) {
  const temperature = Number(value);
  if (temperature > 30) return "temperature-warm";
  if (temperature < 25) return "temperature-cool";
  return "";
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
    high.className = `forecast-high ${temperatureClass(day.forecastMaxtemp.value)}`;
    high.textContent = `${day.forecastMaxtemp.value}°`;

    const low = document.createElement("span");
    low.className = `forecast-low ${temperatureClass(day.forecastMintemp.value)}`;
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
    elements.currentTemperature.className = temperatureClass(observatory.value);
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

function setBusLoading(route, stopName = "available stops") {
  const loading = document.createElement("div");
  loading.className = "bus-loading";
  const spinner = document.createElement("span");
  spinner.className = "loading-line";
  spinner.setAttribute("aria-hidden", "true");
  const text = document.createElement("p");
  text.textContent = `Finding route ${route} at ${stopName}…`;
  loading.append(spinner, text);
  elements.busResults.replaceChildren(loading);
}

function createStopChoices(kmbGroups, citybusGroups) {
  const choices = [];
  const matchedCitybus = new Set();

  [...kmbGroups.values()].forEach((group) => {
    const possibleMatches = [...citybusGroups.values()]
      .filter((candidate) => candidate.bound === group.bound && !matchedCitybus.has(candidate))
      .map((candidate) => ({
        candidate,
        distance: distanceBetweenStops(group.stop, candidate.stop),
        destinationMatches: normalizeDestination(group.route.dest_tc)
          === normalizeDestination(candidate.destinationTc)
      }))
      .filter((match) => match.distance <= 150)
      .sort((first, second) =>
        Number(second.destinationMatches) - Number(first.destinationMatches) || first.distance - second.distance
      );
    const matched = possibleMatches.find((match) => match.destinationMatches)?.candidate
      || (possibleMatches.length === 1 ? possibleMatches[0].candidate : null);
    if (matched) matchedCitybus.add(matched);
    choices.push({
      key: `kmb:${group.bound}:${group.stop.stop}`,
      stop: group.stop,
      bound: group.bound,
      kmb: { group },
      citybus: matched ? { group: matched } : null
    });
  });

  [...citybusGroups.values()].forEach((group) => {
    if (matchedCitybus.has(group)) return;
    choices.push({
      key: `ctb:${group.bound}:${group.stop.stop}`,
      stop: group.stop,
      bound: group.bound,
      kmb: null,
      citybus: { group }
    });
  });

  return choices.sort((first, second) =>
    (first.bound === "O" ? 0 : 1) - (second.bound === "O" ? 0 : 1)
      || first.stop.name_tc.localeCompare(second.stop.name_tc)
  );
}

function stopChoiceLabel(choice) {
  const operators = [
    choice.kmb ? "九巴" : "",
    choice.citybus ? "城巴" : ""
  ].filter(Boolean).join("、");
  return `${choice.stop.name_tc} · ${directionLabel(choice.bound)} · ${operators}`;
}

function editDistance(first, second) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= second.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (first[row - 1] === second[column - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[second.length];
}

function fuzzyStopScore(choice, query, queryWordCount) {
  const normalize = (name) => name.toLowerCase().replace(/[\s，,、\-()（）]/g, "");
  const parts = [choice.stop.name_tc, choice.stop.name_en || ""]
    .flatMap((name) => name.toLowerCase().split(/[\s，,、\-()（）]+/))
    .filter(Boolean)
    .map(normalize);
  const searchable = [normalize(choice.stop.name_tc), normalize(choice.stop.name_en || "")];
  if (searchable.some((name) => name.includes(query))) return 0;

  const candidates = [...parts];
  const maxWindow = Math.min(4, queryWordCount + 1);
  for (let windowSize = 2; windowSize <= maxWindow; windowSize += 1) {
    for (let index = 0; index <= parts.length - windowSize; index += 1) {
      candidates.push(parts.slice(index, index + windowSize).join(""));
    }
  }
  return Math.min(...candidates.map((name) => editDistance(name, query)));
}

function renderStopSuggestions(query = "") {
  const normalizedQuery = query.toLowerCase().trim().replace(/[\s，,、\-()（）]/g, "");
  const queryWordCount = query.trim().split(/[\s，,、\-()（）]+/).filter(Boolean).length;
  const ranked = currentStopChoices.map((choice) => ({
    choice,
    score: normalizedQuery ? fuzzyStopScore(choice, normalizedQuery, queryWordCount) : 0
  })).filter(({ score }) =>
    !normalizedQuery || score === 0 || score <= Math.max(1, Math.floor(normalizedQuery.length * .35))
  ).sort((first, second) =>
    first.score - second.score || first.choice.stop.name_tc.localeCompare(second.choice.stop.name_tc)
  ).slice(0, 8);

  elements.stopSuggestions.replaceChildren();
  if (!ranked.length) {
    const empty = document.createElement("p");
    empty.className = "suggestion-empty";
    empty.textContent = "No close matches. Clear your search to browse the available stops.";
    elements.stopSuggestions.append(empty);
    elements.stopSuggestions.hidden = false;
    return;
  }

  ranked.forEach(({ choice }) => {
    const option = document.createElement("button");
    option.className = "stop-suggestion";
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(choice.key === selectedStopKey));

    const name = document.createElement("span");
    name.className = "suggestion-name";
    name.textContent = choice.stop.name_tc;

    const detail = document.createElement("span");
    detail.className = "suggestion-detail";
    detail.textContent = `${choice.stop.name_en || ""} · ${directionLabel(choice.bound)} · ${choice.kmb ? "九巴" : ""}${choice.kmb && choice.citybus ? " / " : ""}${choice.citybus ? "城巴" : ""}`;

    option.append(name, detail);
    option.addEventListener("click", () => chooseStop(choice));
    elements.stopSuggestions.append(option);
  });
  elements.stopSuggestions.hidden = false;
}

function chooseStop(choice) {
  selectedStopKey = choice.key;
  elements.stopSearch.value = choice.stop.name_tc;
  elements.selectedStopLabel.textContent = `Selected: ${stopChoiceLabel(choice)}`;
  elements.stopSuggestions.hidden = true;
  setError(elements.locationStatus, "");
  loadSelectedStop(currentRoute, choice);
  try {
    localStorage.setItem("harbour-stop", choice.key);
  } catch (error) {
    console.warn("The selected bus stop could not be saved.", error);
  }
}

function selectDefaultStop() {
  const storedKey = localStorage.getItem("harbour-stop");
  const preferred = currentStopChoices.find((choice) => choice.key === storedKey);
  const defaultShekMun = currentStopChoices.find((choice) =>
    choice.bound === "O" && choice.stop.name_tc.includes(DEFAULT_STOP)
  ) || currentStopChoices.find((choice) => choice.stop.name_tc.includes(DEFAULT_STOP));
  const choice = preferred || defaultShekMun || currentStopChoices[0];

  if (choice) {
    selectedStopKey = choice.key;
    elements.stopSearch.value = choice.stop.name_tc;
    elements.selectedStopLabel.textContent = preferred
      ? `Selected: ${stopChoiceLabel(choice)}`
      : defaultShekMun
        ? `Default stop: ${stopChoiceLabel(choice)}`
        : `No 石門 stop on this route. Showing ${stopChoiceLabel(choice)}.`;
    elements.stopSuggestions.hidden = true;
    loadSelectedStop(currentRoute, choice);
    return;
  }

  selectedStopKey = null;
  elements.stopSearch.value = "";
  elements.selectedStopLabel.textContent = "No stops were found for this route.";
  elements.busResults.replaceChildren();
}

async function useCurrentLocation() {
  setError(elements.locationStatus, "");
  if (!navigator.geolocation) {
    setError(elements.locationStatus, "Location is not available in this browser. You can still search for or choose a stop.");
    return;
  }

  elements.useLocationButton.disabled = true;
  elements.useLocationButton.textContent = "Finding nearest stop…";
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 60000,
        timeout: 15000
      });
    });
    if (!currentStopChoices.length) {
      throw new Error("No stops are available for this route yet.");
    }

    const location = { lat: position.coords.latitude, long: position.coords.longitude };
    const nearest = currentStopChoices.reduce((best, choice) => {
      const distance = distanceBetweenStops(location, choice.stop);
      return distance < best.distance ? { choice, distance } : best;
    }, { choice: currentStopChoices[0], distance: Infinity });
    chooseStop(nearest.choice);
    elements.locationStatus.textContent = `Nearest stop: ${nearest.choice.stop.name_tc} (${formatDistance(nearest.distance)} away).`;
    elements.locationStatus.classList.add("location-success");
    elements.locationStatus.hidden = false;
  } catch (error) {
    const message = error.code === 1
      ? "Location permission was denied. You can still search for or choose a stop."
      : error.code === 3
        ? "Your location could not be determined in time. You can still search for or choose a stop."
        : `Could not find the nearest stop: ${error.message} You can still choose a stop below.`;
    setError(elements.locationStatus, message);
    elements.locationStatus.classList.remove("location-success");
    renderStopSuggestions(elements.stopSearch.value);
  } finally {
    elements.useLocationButton.disabled = false;
    elements.useLocationButton.innerHTML = '<span aria-hidden="true">⌖</span> Use my location';
  }
}

function formatDistance(metres) {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
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

  const generation = ++searchGeneration;
  currentRoute = route;
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
      issues.push(`九巴 stop data: ${allStopsResult.reason.message}`);
    }

    const allStops = allStopsResult.status === "fulfilled" ? allStopsResult.value : new Map();
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
        if (!stop) return;
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
        if (!stop) return;
        const key = `${bound}:${routeStop.stop}`;
        if (!citybusGroups.has(key)) {
          citybusGroups.set(key, { stop, bound, destinationTc, route: variant });
        }
      });
    });

    if (generation !== searchGeneration) return;
    currentStopChoices = createStopChoices(kmbGroups, citybusGroups);
    setError(elements.busError, issues.length ? issues.join(" ") : "");
    if (!currentStopChoices.length) {
      elements.stopSuggestions.replaceChildren();
      elements.stopSuggestions.hidden = true;
      elements.selectedStopLabel.textContent = `No stops were found for route ${route}.`;
      elements.busResults.replaceChildren();
      if (!issues.length) setError(elements.busError, `Route ${route} has no available KMB or Citybus stops.`);
      return;
    }

    elements.searchButton.disabled = false;
    renderStopSuggestions(elements.stopSearch.value);
    selectDefaultStop();
    try {
      localStorage.setItem("harbour-route", route);
    } catch (error) {
      console.warn("The selected bus route could not be saved.", error);
    }
  } catch (error) {
    elements.busResults.replaceChildren();
    setError(elements.busError, `Bus arrivals could not be loaded: ${error.message}`);
  } finally {
    if (generation === searchGeneration) elements.searchButton.disabled = false;
  }
}

async function loadSelectedStop(route, choice) {
  const generation = ++searchGeneration;
  setBusLoading(route, choice.stop.name_tc);
  const [kmbResult, citybusResult] = await Promise.all([
    choice.kmb
      ? Promise.allSettled(choice.kmb.group.serviceTypes.map((serviceType) =>
        fetchJson(`${KMB_API}/eta/${encodeURIComponent(choice.kmb.group.stop.stop)}/${encodeURIComponent(route)}/${encodeURIComponent(serviceType)}`)
      ))
      : Promise.resolve([]),
    choice.citybus
      ? fetchJson(`${CITYBUS_API}/eta/CTB/${encodeURIComponent(choice.citybus.group.stop.stop)}/${encodeURIComponent(route)}`)
        .then((response) => ({ status: "fulfilled", value: response }))
        .catch((reason) => ({ status: "rejected", reason }))
      : Promise.resolve(null)
  ]);
  if (generation !== searchGeneration) return;

  const kmbEtas = Array.isArray(kmbResult)
    ? kmbResult.filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value.data || [])
      .filter((eta) => eta.eta && eta.dir === choice.kmb.group.bound && new Date(eta.eta).getTime() >= Date.now() - 30000)
      .sort((first, second) => new Date(first.eta) - new Date(second.eta))
    : [];
  const kmbFailed = Array.isArray(kmbResult) && kmbResult.length > 0
    && kmbResult.every((result) => result.status === "rejected");
  const citybusEtas = citybusResult?.status === "fulfilled"
    ? (citybusResult.value.data || [])
      .filter((eta) => eta.eta && eta.dir === choice.citybus.group.bound && new Date(eta.eta).getTime() >= Date.now() - 30000)
      .sort((first, second) => new Date(first.eta) - new Date(second.eta))
    : [];
  const row = {
    stop: choice.stop,
    kmb: choice.kmb ? {
      group: choice.kmb.group,
      etas: uniqueArrivalTimes(kmbEtas),
      error: kmbFailed ? "九巴 arrival data unavailable." : ""
    } : null,
    citybus: choice.citybus ? {
      group: choice.citybus.group,
      etas: uniqueArrivalTimes(citybusEtas),
      error: citybusResult?.status === "rejected" ? "城巴 arrival data unavailable." : ""
    } : null
  };
  elements.busResults.replaceChildren(makeBusCard(row, route));
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

elements.stopSearch.addEventListener("input", () => {
  renderStopSuggestions(elements.stopSearch.value);
});

elements.stopSearch.addEventListener("focus", () => {
  renderStopSuggestions(elements.stopSearch.value);
});

elements.stopSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !elements.stopSuggestions.hidden) {
    const firstSuggestion = elements.stopSuggestions.querySelector(".stop-suggestion");
    if (firstSuggestion) {
      event.preventDefault();
      firstSuggestion.click();
    }
  }
  if (event.key === "Escape") elements.stopSuggestions.hidden = true;
});

elements.useLocationButton.addEventListener("click", useCurrentLocation);

elements.refreshButton.addEventListener("click", refresh);

const savedRoute = localStorage.getItem("harbour-route");
elements.routeInput.value = savedRoute || DEFAULT_ROUTE;
elements.selectedRouteLabel.textContent = elements.routeInput.value;
elements.stopSearch.value = DEFAULT_STOP;
elements.selectedStopLabel.textContent = `Default stop: ${DEFAULT_STOP}`;
loadWeather();
loadBus(elements.routeInput.value);

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("The offline app shell could not be registered.", error);
    });
  });
}
