# My Love, Yoanna

My Love, Yoanna is an installable Android-friendly web app with Hong Kong Observatory weather and live KMB and Citybus arrivals at stops matching **石門 (Shek Mun)**. The default bus route is **680**.

## Run locally

Serve this folder over HTTP from a computer:

```powershell
py -m http.server 8000
```

Open `http://localhost:8000` on that computer, or open `http://<computer-LAN-address>:8000` on an Android phone connected to the same Wi-Fi. For a home-screen installation, publish the folder to an HTTPS host, open it in Android Chrome, then choose **Install app** or **Add to Home screen** from the browser menu. The service worker keeps the app shell available offline; live weather and bus data still require an internet connection.

## Data sources

- Hong Kong Observatory current weather: `rhrread` open data API.
- Hong Kong Observatory seven-day forecast: `fnd` open data API (the API provides nine days; My Love, Yoanna displays the next seven).
- KMB route, stop and ETA data: Transport Department / KMB API.
- Citybus route, stop and ETA data: [DATA.GOV.HK Citybus real-time ETA API](https://data.gov.hk/en-data/dataset/ctb-eta-transport-realtime-eta).

Forecast wind direction and Beaufort force come directly from the Observatory. The displayed km/h values are approximate ranges corresponding to the forecast Beaufort force, not separate measured wind-speed readings. The [daily mean wind-speed dataset](https://data.gov.hk/en-data/dataset/hk-hko-rss-daily-mean-wind-speed) contains observations rather than forward forecasts, so it is not used to fill future days.

Bus arrivals show **九巴** and **城巴** side by side. A `--` means that the operator has no upcoming ETA reported for that route and stop. Citybus stops are matched to the Shek Mun stops by stop name or location.
