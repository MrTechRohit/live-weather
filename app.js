// ==============================================================
// 1. CONFIGURATION
// ==============================================================
const API_KEY ="YOUR_API_KEY_HERE"; 

let currentUnit = 'metric';
let currentCoords = null;

// DOM Elements
const searchForm = document.getElementById('searchForm');
const cityInput = document.getElementById('cityInput');
const voiceSearchBtn = document.getElementById('voiceSearchBtn');
const locationBtn = document.getElementById('locationBtn');
const unitCelsius = document.getElementById('unitCelsius');
const unitFahrenheit = document.getElementById('unitFahrenheit');
const recentSearchesContainer = document.getElementById('recentSearches');
const statusBanner = document.getElementById('statusBanner');
const weatherAlert = document.getElementById('weatherAlert');
const alertMessage = document.getElementById('alertMessage');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');

// Main Card Elements
const mainCityName = document.getElementById('mainCityName');
const mainDate = document.getElementById('mainDate');
const mainCondition = document.getElementById('mainCondition');
const aqiBadge = document.getElementById('aqiBadge');
const mainTemp = document.getElementById('mainTemp');
const mainTempUnit = document.getElementById('mainTempUnit');
const mainIcon = document.getElementById('mainIcon');
const lifestyleTip = document.getElementById('lifestyleTip');

// Metrics Elements
const mainFeelsLike = document.getElementById('mainFeelsLike');
const mainHumidity = document.getElementById('mainHumidity');
const mainWind = document.getElementById('mainWind');
const mainPressure = document.getElementById('mainPressure');
const mainSunrise = document.getElementById('mainSunrise');
const mainSunset = document.getElementById('mainSunset');
const mainVisibility = document.getElementById('mainVisibility');
const mainAqiStatus = document.getElementById('mainAqiStatus');

// Grids
const forecastGrid = document.getElementById('forecastGrid');
const nearbyGrid = document.getElementById('nearbyGrid');

// ==============================================================
// 2. LIFECYCLE & EVENT LISTENERS
// ==============================================================
window.addEventListener('DOMContentLoaded', () => {
    renderRecentSearches();

    // Default city loads immediately so dashboard is populated
    fetchByCityName('Delhi');

    // Attempt GPS detection in background
    if (navigator.geolocation && window.location.protocol !== 'file:') {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                currentCoords = { lat: latitude, lon: longitude };
                loadByCoords(latitude, longitude);
            },
            () => {
                console.log('GPS not granted or unavailable; using fallback city.');
            },
            { timeout: 7000 }
        );
    }
});

if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const city = cityInput.value.trim();
        if (city) {
            fetchByCityName(city);
            cityInput.value = '';
        }
    });
}

if (locationBtn) {
    locationBtn.addEventListener('click', () => {
        fetchCurrentLocation();
    });
}

if (unitCelsius && unitFahrenheit) {
    unitCelsius.addEventListener('click', () => {
        if (currentUnit !== 'metric') {
            currentUnit = 'metric';
            unitCelsius.classList.add('active');
            unitFahrenheit.classList.remove('active');
            refreshView();
        }
    });

    unitFahrenheit.addEventListener('click', () => {
        if (currentUnit !== 'imperial') {
            currentUnit = 'imperial';
            unitFahrenheit.classList.add('active');
            unitCelsius.classList.remove('active');
            refreshView();
        }
    });
}

// Voice Search
if (voiceSearchBtn) {
    voiceSearchBtn.addEventListener('click', () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showError("Voice recognition is not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        showLoader("Listening... Speak a city name.");

        recognition.onresult = (event) => {
            hideLoader();
            const transcript = event.results[0][0].transcript.replace(/[.,]/g, '').trim();
            if (transcript) {
                cityInput.value = transcript;
                fetchByCityName(transcript);
            }
        };

        recognition.onerror = () => {
            hideLoader();
            showError("Voice input failed. Please type manually.");
        };

        recognition.start();
    });
}

// ==============================================================
// 3. CORE FETCH FUNCTIONS
// ==============================================================

function fetchCurrentLocation() {
    if (!navigator.geolocation) {
        showError("Geolocation unsupported in your browser.");
        fetchByCityName('Delhi');
        return;
    }

    showLoader("Detecting GPS location...");

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            currentCoords = { lat: latitude, lon: longitude };
            loadByCoords(latitude, longitude);
        },
        () => {
            hideLoader();
            showError("Location access denied or unavailable.");
        },
        { timeout: 7000 }
    );
}

async function fetchByCityName(city) {
    showLoader(`Fetching weather for "${city}"...`);
    try {
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${currentUnit}&appid=${API_KEY}`;
        const data = await fetchJson(weatherUrl);

        currentCoords = { lat: data.coord.lat, lon: data.coord.lon };
        saveToRecentSearches(data.name);

        renderMainWeather(data);
        hideLoader();

        loadSecondaryData(data.coord.lat, data.coord.lon, data.name, data);
    } catch (err) {
        hideLoader();
        showError(err.message);
    }
}

async function loadByCoords(lat, lon) {
    showLoader("Updating weather...");
    try {
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${API_KEY}`;
        const data = await fetchJson(weatherUrl);

        saveToRecentSearches(data.name);
        renderMainWeather(data);
        hideLoader();

        loadSecondaryData(lat, lon, data.name, data);
    } catch (err) {
        hideLoader();
        showError(err.message);
    }
}

function refreshView() {
    if (currentCoords) {
        loadByCoords(currentCoords.lat, currentCoords.lon);
    } else {
        fetchByCityName('Delhi');
    }
}

async function loadSecondaryData(lat, lon, cityName, mainData) {
    applyDynamicTheme(mainData);
    checkWeatherAlerts(mainData);

    // 1. Air Quality Index (AQI)
    try {
        const aqiRes = await fetchJson(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
        renderAqi(aqiRes);
        generateLifestyleAdvice(mainData, aqiRes);
    } catch (e) {
        renderAqi(null);
        generateLifestyleAdvice(mainData, null);
    }

    // 2. 5-Day Extended Forecast
    try {
        const forecastRes = await fetchJson(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${API_KEY}`);
        renderForecast(forecastRes);
    } catch (e) {
        console.warn("Forecast data unavailable:", e);
    }

    // 3. Dynamic Nearby Cities
    findDynamicNearbyCities(lat, lon, cityName);
}

// ==============================================================
// 4. RENDERING FUNCTIONS
// ==============================================================

function renderMainWeather(data) {
    hideError();

    const country = (data.sys && data.sys.country) ? `, ${data.sys.country}` : '';
    if (mainCityName) mainCityName.textContent = `${data.name}${country}`;

    if (mainDate) {
        mainDate.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
        });
    }

    const desc = data.weather[0].description;
    if (mainCondition) mainCondition.textContent = desc;
    if (mainTemp) mainTemp.textContent = Math.round(data.main.temp);
    if (mainTempUnit) mainTempUnit.textContent = currentUnit === 'metric' ? '°C' : '°F';

    const unitTemp = currentUnit === 'metric' ? '°C' : '°F';
    const unitSpeed = currentUnit === 'metric' ? 'm/s' : 'mph';

    if (mainFeelsLike) mainFeelsLike.textContent = `${Math.round(data.main.feels_like)}${unitTemp}`;
    if (mainHumidity) mainHumidity.textContent = `${data.main.humidity}%`;
    if (mainWind) mainWind.textContent = `${data.wind.speed} ${unitSpeed}`;
    if (mainPressure) mainPressure.textContent = `${data.main.pressure} hPa`;
    if (mainVisibility) mainVisibility.textContent = `${(data.visibility / 1000).toFixed(1)} km`;

    if (mainSunrise) mainSunrise.textContent = formatSunTime(data.sys.sunrise, data.timezone);
    if (mainSunset) mainSunset.textContent = formatSunTime(data.sys.sunset, data.timezone);

    if (mainIcon) {
        const iconCode = data.weather[0].icon;
        mainIcon.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        mainIcon.alt = desc;
    }
}

function renderAqi(aqiData) {
    if (!aqiBadge || !mainAqiStatus) return;

    if (!aqiData || !aqiData.list || aqiData.list.length === 0) {
        aqiBadge.textContent = "AQI: Normal";
        mainAqiStatus.textContent = "Moderate";
        return;
    }

    const aqiIndex = aqiData.list[0].main.aqi;
    const aqiMap = {
        1: { label: "AQI: Good", class: "", status: "Healthy" },
        2: { label: "AQI: Fair", class: "moderate", status: "Fair" },
        3: { label: "AQI: Moderate", class: "moderate", status: "Moderate" },
        4: { label: "AQI: Poor", class: "unhealthy", status: "Unhealthy" },
        5: { label: "AQI: Hazardous", class: "unhealthy", status: "Hazardous" }
    };

    const currentAqi = aqiMap[aqiIndex] || aqiMap[3];
    aqiBadge.textContent = currentAqi.label;
    aqiBadge.className = `aqi-badge ${currentAqi.class}`;
    mainAqiStatus.textContent = currentAqi.status;
}

function renderForecast(forecastData) {
    if (!forecastGrid) return;
    forecastGrid.innerHTML = '';
    if (!forecastData || !forecastData.list) return;

    const dailyItems = forecastData.list.filter(item => item.dt_txt.includes("12:00:00"));
    const unitSymbol = currentUnit === 'metric' ? '°C' : '°F';

    dailyItems.slice(0, 5).forEach(day => {
        const dateObj = new Date(day.dt * 1000);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const icon = day.weather[0].icon;
        const temp = Math.round(day.main.temp);
        const desc = day.weather[0].description;

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <span class="day-name">${dayName}</span>
            <span class="forecast-date">${dateStr}</span>
            <img src="https://openweathermap.org/img/wn/${icon}.png" alt="${desc}">
            <span class="forecast-temp">${temp}${unitSymbol}</span>
            <span class="forecast-desc">${desc}</span>
        `;
        forecastGrid.appendChild(card);
    });
}

async function findDynamicNearbyCities(centerLat, centerLon, originCityName) {
    if (!nearbyGrid) return;
    nearbyGrid.innerHTML = '';

    const latRad = centerLat * (Math.PI / 180);
    const lonFactor = Math.cos(latRad) || 1;

    const radialPoints = [
        { lat: centerLat + 0.22, lon: centerLon + (0.15 / lonFactor) },
        { lat: centerLat - 0.20, lon: centerLon - (0.20 / lonFactor) },
        { lat: centerLat + 0.05, lon: centerLon - (0.26 / lonFactor) }
    ];

    const cleanOrigin = (originCityName || '').toLowerCase().trim();
    const resolvedCities = [];
    const seenNames = new Set([cleanOrigin]);

    for (const pt of radialPoints) {
        try {
            const cityData = await fetchJson(
                `https://api.openweathermap.org/data/2.5/weather?lat=${pt.lat}&lon=${pt.lon}&units=${currentUnit}&appid=${API_KEY}`
            );
            const cityNameLower = (cityData.name || '').toLowerCase().trim();

            if (cityNameLower && !seenNames.has(cityNameLower)) {
                seenNames.add(cityNameLower);
                resolvedCities.push(cityData);
            }
        } catch (e) {
            // Keep going if one point fails
        }
    }

    if (resolvedCities.length > 0) {
        renderNearbyCards(resolvedCities);
    }
}

function renderNearbyCards(cities) {
    if (!nearbyGrid) return;
    nearbyGrid.innerHTML = '';
    const unitSymbol = currentUnit === 'metric' ? '°C' : '°F';

    cities.forEach(city => {
        const country = (city.sys && city.sys.country) ? `, ${city.sys.country}` : '';
        const desc = city.weather[0].description;
        const temp = Math.round(city.main.temp);

        const card = document.createElement('div');
        card.className = 'nearby-card';
        card.innerHTML = `
            <div>
                <h4>${city.name}${country}</h4>
                <p>${desc}</p>
            </div>
            <div class="nearby-temp">${temp}${unitSymbol}</div>
        `;

        card.addEventListener('click', () => {
            currentCoords = { lat: city.coord.lat, lon: city.coord.lon };
            renderMainWeather(city);
            loadSecondaryData(city.coord.lat, city.coord.lon, city.name, city);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        nearbyGrid.appendChild(card);
    });
}

function generateLifestyleAdvice(data, aqiData) {
    if (!lifestyleTip) return;

    const mainCondition = data.weather[0].main.toLowerCase();
    const tempC = currentUnit === 'metric' ? data.main.temp : ((data.main.temp - 32) * 5) / 9;
    const aqiIndex = aqiData?.list?.[0]?.main?.aqi || 1;

    let tip = "Weather conditions look comfortable. Enjoy your day outside!";

    if (mainCondition.includes('rain') || mainCondition.includes('drizzle')) {
        tip = "Precipitation expected today. Don't forget an umbrella!";
    } else if (mainCondition.includes('thunderstorm')) {
        tip = "Thunderstorms active in the area. Stay indoors.";
    } else if (tempC > 34) {
        tip = "Hot temperatures outside. Stay hydrated and use sun protection.";
    } else if (tempC < 12) {
        tip = "Chilly air outside. A jacket or warm layer is recommended.";
    } else if (aqiIndex >= 4) {
        tip = "Air pollution is elevated today. Consider wearing a mask outdoors.";
    }

    lifestyleTip.textContent = tip;
}

function applyDynamicTheme(data) {
    const mainCond = data.weather[0].main.toLowerCase();
    const isNight = data.weather[0].icon.includes('n');

    document.body.className = '';

    if (isNight) {
        document.body.classList.add('theme-thunderstorm');
    } else if (mainCond.includes('clear')) {
        document.body.classList.add('theme-clear');
    } else if (mainCond.includes('cloud')) {
        document.body.classList.add('theme-clouds');
    } else if (mainCond.includes('rain')) {
        document.body.classList.add('theme-rain');
    } else if (mainCond.includes('snow')) {
        document.body.classList.add('theme-snow');
    } else {
        document.body.classList.add('theme-default');
    }
}

function checkWeatherAlerts(data) {
    if (!alertMessage || !weatherAlert) return;
    const windThreshold = currentUnit === 'metric' ? 14 : 31;
    const mainCond = data.weather[0].main.toLowerCase();

    if (data.wind.speed > windThreshold) {
        alertMessage.textContent = `High Wind Alert: Speeds reaching ${data.wind.speed} ${currentUnit === 'metric' ? 'm/s' : 'mph'}.`;
        weatherAlert.className = 'alert-banner warning';
    } else if (mainCond.includes('thunderstorm')) {
        alertMessage.textContent = "Severe Alert: Active thunderstorm system detected in this sector.";
        weatherAlert.className = 'alert-banner';
    } else {
        weatherAlert.className = 'alert-banner hidden';
    }
}

function saveToRecentSearches(city) {
    if (!city) return;
    let saved = JSON.parse(localStorage.getItem('abhiro_recent_cities') || '[]');
    saved = saved.filter(c => c.toLowerCase() !== city.toLowerCase());
    saved.unshift(city);
    if (saved.length > 5) saved.pop();
    localStorage.setItem('abhiro_recent_cities', JSON.stringify(saved));
    renderRecentSearches();
}

function renderRecentSearches() {
    if (!recentSearchesContainer) return;
    recentSearchesContainer.innerHTML = '';
    const saved = JSON.parse(localStorage.getItem('abhiro_recent_cities') || '["Delhi", "Mumbai", "London"]');

    saved.forEach(city => {
        const chip = document.createElement('span');
        chip.className = 'recent-chip';
        chip.textContent = city;
        chip.addEventListener('click', () => fetchByCityName(city));
        recentSearchesContainer.appendChild(chip);
    });
}

function formatSunTime(timestamp, timezoneOffsetSeconds = 0) {
    if (!timestamp) return '--:--';
    const date = new Date((timestamp + timezoneOffsetSeconds) * 1000);
    return date.toUTCString().slice(17, 22) + (date.getUTCHours() >= 12 ? ' PM' : ' AM');
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 401) throw new Error("Invalid or unactivated API key.");
        if (res.status === 404) throw new Error("Location not found.");
        throw new Error(`API Error: ${res.statusText}`);
    }
    return res.json();
}

function showLoader(msg) {
    if (loaderText) loaderText.textContent = msg;
    if (loader) loader.classList.remove('hidden');
}

function hideLoader() {
    if (loader) loader.classList.add('hidden');
}

function showError(msg) {
    if (statusBanner) {
        statusBanner.textContent = msg;
        statusBanner.classList.remove('hidden');
        setTimeout(() => {
            statusBanner.classList.add('hidden');
        }, 6000);
    }
}

function hideError() {
    if (statusBanner) {
        statusBanner.classList.add('hidden');
        statusBanner.textContent = '';
    }
}
