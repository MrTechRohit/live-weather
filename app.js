// ==========================================
// 1. CONFIGURATION
// ==========================================
const API_KEY = 'acc0ed2a261226588640eacefba06a89'; // Replace with your active 32-character key

// DOM Elements
const searchForm = document.getElementById('searchForm');
const cityInput = document.getElementById('cityInput');
const locationBtn = document.getElementById('locationBtn');
const statusBanner = document.getElementById('statusBanner');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');

// Main Display Elements
const mainCityName = document.getElementById('mainCityName');
const mainDate = document.getElementById('mainDate');
const mainCondition = document.getElementById('mainCondition');
const mainTemp = document.getElementById('mainTemp');
const mainIcon = document.getElementById('mainIcon');
const mainFeelsLike = document.getElementById('mainFeelsLike');
const mainHumidity = document.getElementById('mainHumidity');
const mainWind = document.getElementById('mainWind');
const mainPressure = document.getElementById('mainPressure');
const nearbyGrid = document.getElementById('nearbyGrid');

// ==========================================
// 2. LIFECYCLE & EVENT LISTENERS
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    fetchCurrentLocation();
});

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const city = cityInput.value.trim();
    if (city) {
        fetchByCityName(city);
        cityInput.value = '';
    }
});

locationBtn.addEventListener('click', () => {
    fetchCurrentLocation();
});

// ==========================================
// 3. CORE FETCH FUNCTIONS
// ==========================================

// Geolocation Check
function fetchCurrentLocation() {
    if (!navigator.geolocation) {
        showError("Geolocation is not supported by your browser.");
        fetchByCityName('Delhi');
        return;
    }

    showLoader("Detecting your exact GPS location...");

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                showLoader("Fetching local & regional weather...");
                const data = await fetchJson(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${API_KEY}`
                );
                renderMainWeather(data);
                await findDynamicNearbyCities(latitude, longitude, data.name);
            } catch (err) {
                showError(err.message);
            } finally {
                hideLoader();
            }
        },
        (err) => {
            hideLoader();
            console.warn("Location access denied/unavailable:", err.message);
            showError("Location access denied. Displaying default city.");
            fetchByCityName('Delhi');
        },
        { timeout: 9000 }
    );
}

// City Search
async function fetchByCityName(city) {
    showLoader(`Searching weather for "${city}"...`);
    try {
        const data = await fetchJson(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`
        );
        renderMainWeather(data);
        await findDynamicNearbyCities(data.coord.lat, data.coord.lon, data.name);
    } catch (err) {
        showError(err.message);
    } finally {
        hideLoader();
    }
}

// Dynamic Radial calculation of 3 neighboring cities
async function findDynamicNearbyCities(centerLat, centerLon, originCityName) {
    nearbyGrid.innerHTML = '';
    
    // Calculate 3 triangular radial points around coordinates (~25km to 35km distance)
    const latRad = centerLat * (Math.PI / 180);
    const lonFactor = Math.cos(latRad) || 1;

    const radialPoints = [
        { lat: centerLat + 0.22, lon: centerLon + (0.15 / lonFactor) }, // Northeast
        { lat: centerLat - 0.20, lon: centerLon - (0.20 / lonFactor) }, // Southwest
        { lat: centerLat + 0.05, lon: centerLon - (0.26 / lonFactor) }  // West-Northwest
    ];

    const cleanOrigin = (originCityName || '').toLowerCase().trim();
    const resolvedCities = [];
    const seenNames = new Set([cleanOrigin]);

    for (const pt of radialPoints) {
        try {
            const res = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?lat=${pt.lat}&lon=${pt.lon}&units=metric&appid=${API_KEY}`
            );
            if (!res.ok) continue;
            
            const cityData = await res.json();
            const cityNameLower = (cityData.name || '').toLowerCase().trim();

            if (cityNameLower && !seenNames.has(cityNameLower)) {
                seenNames.add(cityNameLower);
                resolvedCities.push(cityData);
            }
        } catch (e) {
            console.warn("Could not query regional point:", e);
        }
    }

    if (resolvedCities.length > 0) {
        renderNearbyCards(resolvedCities);
    } else {
        nearbyGrid.innerHTML = `<p style="color: rgba(255,255,255,0.6); grid-column: 1/-1;">No nearby stations found within 35 km.</p>`;
    }
}

// ==========================================
// 4. RENDERING FUNCTIONS
// ==========================================
function renderMainWeather(data) {
    hideError();

    const country = (data.sys && data.sys.country) ? `, ${data.sys.country}` : '';
    mainCityName.textContent = `${data.name}${country}`;
    mainDate.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
    });

    if (data.weather && data.weather[0]) {
        mainCondition.textContent = data.weather[0].description;
        const iconCode = data.weather[0].icon;
        mainIcon.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        mainIcon.alt = data.weather[0].description;
    }

    mainTemp.textContent = Math.round(data.main.temp);
    mainFeelsLike.textContent = `${Math.round(data.main.feels_like)}°C`;
    mainHumidity.textContent = `${data.main.humidity}%`;
    mainWind.textContent = `${data.wind.speed} m/s`;
    mainPressure.textContent = `${data.main.pressure} hPa`;
}

function renderNearbyCards(cities) {
    nearbyGrid.innerHTML = '';

    cities.forEach(city => {
        const country = (city.sys && city.sys.country) ? `, ${city.sys.country}` : '';
        const desc = (city.weather && city.weather[0]) ? city.weather[0].description : '';
        const temp = Math.round(city.main.temp);

        const card = document.createElement('div');
        card.className = 'nearby-card';
        card.innerHTML = `
            <div>
                <h4>${city.name}${country}</h4>
                <p>${desc}</p>
            </div>
            <div class="nearby-temp">${temp}°C</div>
        `;

        card.addEventListener('click', () => {
            renderMainWeather(city);
            findDynamicNearbyCities(city.coord.lat, city.coord.lon, city.name);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        nearbyGrid.appendChild(card);
    });
}

// ==========================================
// 5. UTILITY FUNCTIONS
// ==========================================
async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 401) throw new Error("Invalid or unactivated API key.");
        if (res.status === 404) throw new Error("City or location not found.");
        throw new Error(`API Error: ${res.statusText}`);
    }
    return res.json();
}

function showLoader(msg) {
    loaderText.textContent = msg;
    loader.classList.remove('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}

function showError(msg) {
    statusBanner.textContent = msg;
    statusBanner.classList.remove('hidden');
    setTimeout(() => {
        statusBanner.classList.add('hidden');
    }, 6000);
}

function hideError() {
    statusBanner.classList.add('hidden');
    statusBanner.textContent = '';
}