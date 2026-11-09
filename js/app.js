// Global variables
let map;
let markersCluster;
let allGrantees = [];
let filteredGrantees = [];
let visibleMarkers = [];
let currentMarkerIndex = 0;

// Hard-coded impact totals (source of truth from NJCIC)
const IMPACT_TOTAL_FUNDING = 11880438;
const IMPACT_TOTAL_GRANTS = 135;

console.log('App.js loaded - version 17');

// Data written daily by sync.php from Airtable
const DATA_URL = 'data/grantees.json';

// Focus areas offered in the filter. These match the options of the
// "Focus Area" field in Airtable.
const FOCUS_AREAS = [
    'Civic Engagement',
    'Civic News & Information',
    'Journalism Pipeline',
    'Capacity Building'
];

// Older Airtable labels mapped to the new Focus Area options, so grantees
// still filter correctly until every record carries the new values.
const LEGACY_FOCUS_AREA_MAP = {
    'civic engagement in nj communities': 'Civic Engagement',
    'community engagement': 'Civic Engagement',
    'civic news and information reporting': 'Civic News & Information',
    'journalism pipeline': 'Journalism Pipeline',
    'blue engine tech & sustainability accelerator grant': 'Capacity Building'
};

// Map any focus area label (new or legacy) to one of FOCUS_AREAS.
function normalizeFocusArea(value) {
    const label = String(value || '').trim();
    if (!label) return null;
    const exact = FOCUS_AREAS.find(a => a.toLowerCase() === label.toLowerCase());
    if (exact) return exact;
    return LEGACY_FOCUS_AREA_MAP[label.toLowerCase()] || label;
}

// Split a focus area value (string joined with "; ", or an array) into
// normalized labels with duplicates removed.
function parseFocusAreas(value) {
    const parts = Array.isArray(value) ? value : String(value || '').split(';');
    const result = [];
    parts.forEach(part => {
        const area = normalizeFocusArea(part);
        if (area && !result.includes(area)) result.push(area);
    });
    return result;
}

// Interpret the Airtable "Current" field: a checkbox (true), or a text,
// select or formula value such as "Yes" / "Current".
function isTruthyFlag(value) {
    if (Array.isArray(value)) return value.some(isTruthyFlag);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
        return ['yes', 'y', 'true', '1', 'current', 'checked', 'x'].includes(value.trim().toLowerCase());
    }
    return false;
}

let usingCurrentFallback = false;

async function fetchJson(url) {
    const response = await fetch(`${url}?v=${Date.now()}`);   // cache-bust after each sync
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
}

async function loadGranteeData() {
    return fetchJson(DATA_URL);
}

// "$100,000"-style label
function money(n) {
    return `$${Number(n || 0).toLocaleString()}`;
}

// Year tiles from an awardsByYear object ("Awarded in YEAR" fields): one tile
// per year with the amount and a bar sized relative to the largest year.
// Returns '' for fewer than two years (the amount/years rows already say it).
function awardTilesHtml(awards, size = 'sm') {
    const years = Object.keys(awards || {}).sort();
    if (years.length < 2) return '';
    const max = Math.max(...years.map(y => awards[y]));
    const label = size === 'lg' ? 'text-sm font-medium text-gray-600' : 'text-xs text-gray-600';
    const amount = size === 'lg' ? 'text-sm' : 'text-xs';
    const tiles = years.map(y => `
        <div class="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-center" title="Awarded in ${y}: ${money(awards[y])}">
            <div class="text-[11px] font-medium text-gray-500 leading-tight">${y}</div>
            <div class="${amount} font-semibold leading-tight mt-0.5" style="color: #183642;">${money(awards[y])}</div>
            <div class="h-1 mt-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                <div class="h-1 rounded-full" style="width: ${Math.max(6, Math.round(awards[y] / max * 100))}%; background: #2dc8d2;"></div>
            </div>
        </div>`).join('');
    return `
        <div class="my-2">
            <div class="${label} mb-1.5">Awarded by year</div>
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">${tiles}</div>
        </div>`;
}

// Add computed fields used by the filters, markers and popups:
//   isCurrent      - true when the grantee has a current grant (Airtable "Current")
//   focusAreaList  - normalized focus areas for filtering/display
function prepareGrantees(grantees) {
    const hasCurrentField = grantees.some(g =>
        'isCurrent' in g || (g.grants || []).some(gr => 'isCurrent' in gr)
    );
    usingCurrentFallback = !hasCurrentField;
    if (usingCurrentFallback) {
        console.warn('grantees.json has no "isCurrent" values (sync.php not reading the Airtable ' +
            '"Current" field). Falling back to status === "active".');
    }

    grantees.forEach(grantee => {
        if (grantee.grants) {
            grantee.grants.forEach(grant => {
                grant.isCurrent = hasCurrentField ? isTruthyFlag(grant.isCurrent) : grant.status === 'active';
                grant.focusAreaList = parseFocusAreas(grant.focusAreas || grant.focusArea);
            });
        }

        if (hasCurrentField) {
            grantee.isCurrent = isTruthyFlag(grantee.isCurrent) ||
                (grantee.grants || []).some(gr => gr.isCurrent);
        } else {
            grantee.isCurrent = grantee.status === 'active';
        }

        grantee.focusAreaList = parseFocusAreas(grantee.focusAreas || grantee.focusArea);
    });
    return grantees;
}

// Initialize the application
async function init() {
    try {
        // Load grantee data (cache-busted; see loadGranteeData)
        const data = await loadGranteeData();

        if (!data.grantees || !Array.isArray(data.grantees)) {
            throw new Error('Invalid data format: grantees array not found');
        }

        allGrantees = prepareGrantees(data.grantees);
        filteredGrantees = [...allGrantees];

        // Initialize map
        initMap();

        // Populate filters
        populateCountyFilter();
        populateFocusAreaFilter();

        // Add markers
        updateMarkers();

        // Update stats
        updateStats();

        // Setup event listeners
        setupEventListeners();

        // Check for URL parameters to load specific grantee
        handleUrlParameters();

    } catch (error) {
        console.error('Error initializing app:', error);
        showErrorState(error.message);
    }
}

// Show user-friendly error state
function showErrorState(message) {
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full bg-gray-100 rounded-xl p-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 class="text-xl font-semibold text-gray-700 mb-2">Unable to load map data</h3>
                <p class="text-gray-500 mb-4">${message}</p>
                <button onclick="location.reload()" class="px-4 py-2 bg-[#2dc8d2] text-white rounded-lg hover:bg-[#183642] transition-colors">
                    Try again
                </button>
            </div>
        `;
    }

    // Update stats to show zeros (if elements exist)
    const totalGranteesEl = document.getElementById('total-grantees');
    const totalFundingEl = document.getElementById('total-funding');
    const activeProjectsEl = document.getElementById('active-projects');

    if (totalGranteesEl) totalGranteesEl.textContent = '0';
    if (totalFundingEl) totalFundingEl.textContent = '$0';
    if (activeProjectsEl) activeProjectsEl.textContent = '0';
}

// Initialize the Leaflet map
function initMap() {
    // Center on New Jersey - allow dragging but disable scroll wheel zoom
    map = L.map('map', {
        scrollWheelZoom: false,
        dragging: true,  // Enable click and drag
        touchZoom: true,  // Enable pinch zoom on mobile
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false,
        trackResize: true
    }).setView([40.0583, -74.4057], 8);

    // Ensure zoom is enabled programmatically even though user interactions are disabled
    map.options.zoomAnimation = true;

    // Add CARTO Voyager tile layer (requires API key as of CARTO's basemap policy change)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2rjo_1_fc3cba129a9f8f68d22d8a29', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Initialize marker cluster group
    markersCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        spiderfyOnMaxZoom: true,
        removeOutsideVisibleBounds: true,
        maxClusterRadius: 50,
        spiderfyDistanceMultiplier: 1.5,
        animate: true,
        animateAddingMarkers: false,
        disableClusteringAtZoom: 15,
        spiderfyOnEveryZoom: false
    });

    // Track currently spiderfied cluster
    let currentlySpiderfied = null;

    // Auto-expand clusters on hover with better cleanup
    markersCluster.on('clustermouseover', function(e) {
        // If there's a previously spiderfied cluster, unspiderfy it first
        if (currentlySpiderfied && currentlySpiderfied !== e.layer) {
            currentlySpiderfied.unspiderfy();
        }
        e.layer.spiderfy();
        currentlySpiderfied = e.layer;
    });

    markersCluster.on('clustermouseout', function(e) {
        // Wait 3 seconds before collapsing to allow users to click expanded markers
        setTimeout(function() {
            if (currentlySpiderfied === e.layer) {
                e.layer.unspiderfy();
                currentlySpiderfied = null;
            }
        }, 3000);
    });

    // Clean up on zoom
    map.on('zoomstart', function() {
        if (currentlySpiderfied) {
            currentlySpiderfied.unspiderfy();
            currentlySpiderfied = null;
        }
    });

    // Clean up on drag
    map.on('dragstart', function() {
        if (currentlySpiderfied) {
            currentlySpiderfied.unspiderfy();
            currentlySpiderfied = null;
        }
    });

    map.addLayer(markersCluster);
}

// Populate county filter dropdown
function populateCountyFilter() {
    const counties = new Set();
    allGrantees.forEach(grantee => {
        if (grantee.county && grantee.county !== 'Statewide' && grantee.county !== 'South Jersey' && grantee.county !== 'North Jersey' && grantee.county !== 'Central Jersey') {
            counties.add(grantee.county);
        }
    });

    const countyFilter = document.getElementById('county-filter');
    const sortedCounties = Array.from(counties).sort();

    sortedCounties.forEach(county => {
        const option = document.createElement('option');
        option.value = county;
        option.textContent = county;
        countyFilter.appendChild(option);
    });

    // Add special categories
    ['Statewide', 'North Jersey', 'Central Jersey', 'South Jersey'].forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        countyFilter.appendChild(option);
    });
}

// Populate focus area filter dropdown with the fixed Airtable options
function populateFocusAreaFilter() {
    const focusFilter = document.getElementById('focus-filter');

    const extras = new Set();
    allGrantees.forEach(g => g.focusAreaList.forEach(a => { if (!FOCUS_AREAS.includes(a)) extras.add(a); }));

    [...FOCUS_AREAS, ...Array.from(extras).sort()].forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        focusFilter.appendChild(option);
    });
}

// Create marker icon with initials
function createCustomIcon(grantee) {
    // Handle edge cases: empty words, no uppercase, special characters
    let initials = grantee.name.split(' ')
        .filter(word => word.length > 0)  // Remove empty words from trailing spaces
        .map(word => word[0])
        .filter(letter => letter && /[A-Za-z]/.test(letter))  // Allow lowercase too
        .map(letter => letter.toUpperCase())  // Convert to uppercase
        .slice(0, 2)
        .join('');

    // Fallback if no letters found (e.g., "70and73.com")
    if (initials.length === 0) {
        initials = grantee.name.slice(0, 2).toUpperCase();
    }

    // Orange marker for grantees with a current grant (Airtable "Current" field)
    const currentClass = grantee.isCurrent ? ' current-grant' : '';
    const iconHtml = `<div class="custom-marker${currentClass}">${initials}</div>`;

    return L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
}

// Create tooltip content
function createTooltipContent(grantee) {
    const currentBadge = grantee.isCurrent ? '<span class="tooltip-new-badge">Current grant</span>' : '';
    return `
        <div class="tooltip-title">${grantee.name}${currentBadge}</div>
        <div class="tooltip-info">${grantee.county}</div>
        <div class="tooltip-info">$${grantee.amount.toLocaleString()}</div>
    `;
}

// Update markers on the map
function updateMarkers() {
    // Clear existing markers
    markersCluster.clearLayers();
    visibleMarkers = [];

    // Add markers for filtered grantees
    filteredGrantees.forEach(grantee => {
        const customIcon = createCustomIcon(grantee);
        const marker = L.marker([grantee.lat, grantee.lng], {
            icon: customIcon,
            title: grantee.name
        });

        marker.bindTooltip(createTooltipContent(grantee), {
            className: 'custom-leaflet-tooltip',
            direction: 'right',
            offset: L.point(30, 0),
            permanent: false
        });

        // Tooltip auto-close behavior
        let tooltipTimeout;

        marker.on('mouseover', () => {
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = null;
            }
            marker.openTooltip();
        });

        marker.on('mouseout', () => {
            tooltipTimeout = setTimeout(() => {
                marker.closeTooltip();
            }, 3000);
        });

        marker.on('click', () => {
            flyToMarker(marker, grantee);
            setTimeout(() => openModal(grantee), 500);
        });

        markersCluster.addLayer(marker);
        visibleMarkers.push({ marker, grantee });
    });

    currentMarkerIndex = 0;
    updateGranteeCounter();
}

// Update the grantee counter display
function updateGranteeCounter() {
    const currentIndexEl = document.getElementById('current-index');
    const totalCountEl = document.getElementById('total-count');

    if (currentIndexEl && totalCountEl) {
        currentIndexEl.textContent = visibleMarkers.length > 0 ? currentMarkerIndex + 1 : 0;
        totalCountEl.textContent = visibleMarkers.length;
    }
}

// Update statistics
function updateStats() {
    const totalGrantees = filteredGrantees.length;
    const activeProjects = filteredGrantees.filter(g => g.isCurrent).length;

    // Check if we're showing all data (no filters applied)
    const isShowingAll = filteredGrantees.length === allGrantees.length;

    // Use hard-coded impact total when showing all, calculated total when filtered
    const totalFunding = isShowingAll
        ? IMPACT_TOTAL_FUNDING
        : filteredGrantees.reduce((sum, g) => sum + g.amount, 0);

    const totalGranteesEl = document.getElementById('total-grantees');
    const totalFundingEl = document.getElementById('total-funding');
    const activeProjectsEl = document.getElementById('active-projects');

    if (totalGranteesEl) totalGranteesEl.textContent = totalGrantees;
    if (totalFundingEl) totalFundingEl.textContent = `$${totalFunding.toLocaleString()}`;
    if (activeProjectsEl) activeProjectsEl.textContent = activeProjects;
}

// Apply filters
function applyFilters() {
    const yearFilter = document.getElementById('year-filter').value;
    const countyFilter = document.getElementById('county-filter').value;
    const focusFilter = document.getElementById('focus-filter').value;
    const statusFilter = document.getElementById('status-filter').value;

    filteredGrantees = allGrantees.filter(grantee => {
        if (yearFilter !== 'all' && !grantee.years.includes(yearFilter)) return false;
        if (countyFilter !== 'all' && grantee.county !== countyFilter) return false;
        if (focusFilter !== 'all' && !grantee.focusAreaList.includes(focusFilter)) return false;
        if (statusFilter === 'current' && !grantee.isCurrent) return false;
        return true;
    });

    updateMarkers();
    updateStats();

    // Fit map to filtered markers if any exist
    if (filteredGrantees.length > 0) {
        const bounds = L.latLngBounds(filteredGrantees.map(g => [g.lat, g.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Reset filters
function resetFilters() {
    document.getElementById('year-filter').value = 'all';
    document.getElementById('county-filter').value = 'all';
    document.getElementById('focus-filter').value = 'all';
    document.getElementById('status-filter').value = 'all';

    filteredGrantees = [...allGrantees];
    updateMarkers();
    updateStats();

    // Reset map view to New Jersey
    map.flyTo([40.0583, -74.4057], 8, {
        duration: 1.5
    });
}

// Fly to specific marker
function flyToMarker(marker, grantee) {
    const latlng = marker.getLatLng();
    // Pan to marker without changing zoom level - smoother and slower
    map.panTo(latlng, {
        animate: true,
        duration: 2.0,
        easeLinearity: 0.25
    });
    setTimeout(() => marker.openTooltip(), 1000);
}

// Navigate to next marker
function nextMarker() {
    if (visibleMarkers.length === 0) return;

    currentMarkerIndex = (currentMarkerIndex + 1) % visibleMarkers.length;
    const { marker, grantee } = visibleMarkers[currentMarkerIndex];

    updateGranteeCounter();

    // Check if modal is already open
    const overlay = document.getElementById('modal-overlay');
    const isModalOpen = !overlay.classList.contains('hidden');

    flyToMarker(marker, grantee);

    if (isModalOpen) {
        // Modal is open, update it immediately
        openModal(grantee);
    } else {
        // Modal is closed, open after pan animation
        setTimeout(() => openModal(grantee), 2000);
    }
}

// Navigate to previous marker
function prevMarker() {
    if (visibleMarkers.length === 0) return;

    currentMarkerIndex = (currentMarkerIndex - 1 + visibleMarkers.length) % visibleMarkers.length;
    const { marker, grantee } = visibleMarkers[currentMarkerIndex];

    updateGranteeCounter();

    // Check if modal is already open
    const overlay = document.getElementById('modal-overlay');
    const isModalOpen = !overlay.classList.contains('hidden');

    flyToMarker(marker, grantee);

    if (isModalOpen) {
        // Modal is open, update it immediately
        openModal(grantee);
    } else {
        // Modal is closed, open after pan animation
        setTimeout(() => openModal(grantee), 2000);
    }
}

// Go home (reset view)
function goHome() {
    closeModal();
    // Return to NJ overview
    map.setView([40.0583, -74.4057], 8);
}

// Open modal with grantee details
function openModal(grantee) {
    const yearsText = grantee.years.join(', ');

    // Set modal title with optional "Current grant" badge
    const modalTitle = document.getElementById('modal-title');
    if (grantee.isCurrent) {
        modalTitle.innerHTML = `${grantee.name} <span class="modal-new-badge">Current grant</span>`;
    } else {
        modalTitle.textContent = grantee.name;
    }
    document.getElementById('modal-location').textContent = grantee.city ? `${grantee.city}, ${grantee.county}` : grantee.county;

    // Handle multiple grants if present
    if (grantee.hasMultipleGrants && grantee.grants) {
        // Show combined description at top
        document.getElementById('modal-description').textContent = `This organization received ${grantee.grantCount} grants totaling $${grantee.totalAmount.toLocaleString()} over ${yearsText}.`;

        // Build details for each grant
        let detailsHtml = `
            <div class="flex items-center justify-between py-2 border-b border-gray-200">
                <span class="text-sm font-medium text-gray-600">Total funding:</span>
                <span class="text-sm font-semibold" style="color: #2dc8d2;">$${grantee.totalAmount.toLocaleString()}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b border-gray-200">
                <span class="text-sm font-medium text-gray-600">Grant years:</span>
                <span class="text-sm font-semibold text-gray-800">${yearsText}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b-2 border-gray-300 mb-3">
                <span class="text-sm font-medium text-gray-600">Number of grants:</span>
                <span class="text-sm font-semibold text-gray-800">${grantee.grantCount}</span>
            </div>
        `;

        // Add details for each individual grant
        detailsHtml += '<div class="text-sm font-semibold text-gray-700 mb-2">Grant details:</div>';
        grantee.grants.forEach((grant, index) => {
            const statusClass = grant.isCurrent ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800';
            const statusText = grant.isCurrent ? 'Current' : 'Completed';

            // Title each grant with its Airtable "Project Name"; number it only if missing
            const projectName = String(grant.projectName || grant.project || '').trim();
            const projectTitle = projectName || `Grant #${index + 1}`;

            detailsHtml += `
                <div class="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div class="font-medium text-gray-800 mb-2">${projectTitle}</div>
                    ${grant.description ? `<div class="text-xs text-gray-700 mb-2">${grant.description}</div>` : ''}
                    <div class="flex items-center justify-between text-xs mb-1">
                        <span class="text-gray-600">Amount:</span>
                        <span class="font-semibold" style="color: #2dc8d2;">$${grant.amount.toLocaleString()}</span>
                    </div>
                    ${awardTilesHtml(grant.awardsByYear) || `
                    <div class="flex items-center justify-between text-xs mb-1">
                        <span class="text-gray-600">Years:</span>
                        <span class="font-semibold text-gray-800">${grant.years.join(', ')}</span>
                    </div>`}
                    <div class="flex items-center justify-between text-xs mb-1">
                        <span class="text-gray-600">Focus:</span>
                        <span class="text-gray-700">${grant.focusAreaList.join(', ')}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-gray-600">Status:</span>
                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass}">${statusText}</span>
                    </div>
                </div>
            `;
        });

        document.getElementById('modal-details').innerHTML = detailsHtml;
    } else {
        // Single grant - original format
        const statusClass = grantee.isCurrent ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800';
        const statusText = grantee.isCurrent ? 'Current' : 'Completed';

        document.getElementById('modal-description').textContent = grantee.description || '';

        const detailsHtml = `
            ${grantee.projectName ? `
            <div class="flex items-center justify-between gap-4 py-2 border-b border-gray-200">
                <span class="text-sm font-medium text-gray-600">Project:</span>
                <span class="text-sm font-semibold text-gray-800 text-right">${grantee.projectName}</span>
            </div>
            ` : ''}
            <div class="flex items-center justify-between py-2 border-b border-gray-200">
                <span class="text-sm font-medium text-gray-600">Funding:</span>
                <span class="text-sm font-semibold" style="color: #2dc8d2;">$${grantee.amount.toLocaleString()}</span>
            </div>
            ${awardTilesHtml(grantee.awardsByYear, 'lg')
                ? `<div class="py-1 border-b border-gray-200">${awardTilesHtml(grantee.awardsByYear, 'lg')}</div>`
                : `
            <div class="flex items-center justify-between py-2 border-b border-gray-200">
                <span class="text-sm font-medium text-gray-600">Years:</span>
                <span class="text-sm font-semibold text-gray-800">${yearsText}</span>
            </div>`}
            ${grantee.focusAreaList.length ? `
            <div class="flex items-center justify-between py-2 border-b border-gray-200">
                <span class="text-sm font-medium text-gray-600">Focus area:</span>
                <span class="text-sm text-gray-800">${grantee.focusAreaList.join(', ')}</span>
            </div>
            ` : ''}
            <div class="flex items-center justify-between py-2">
                <span class="text-sm font-medium text-gray-600">Status:</span>
                <span class="text-xs font-semibold px-3 py-1 rounded-full ${statusClass}">${statusText}</span>
            </div>
        `;

        document.getElementById('modal-details').innerHTML = detailsHtml;
    }

    const modalLink = document.getElementById('modal-link');
    if (grantee.website) {
        const url = grantee.website.startsWith('http') ? grantee.website : 'https://' + grantee.website;
        modalLink.href = url;
        modalLink.style.display = 'inline-block';
    } else {
        modalLink.style.display = 'none';
    }

    // Update share buttons with current grantee data
    const shareButtons = document.getElementById('share-buttons');
    if (shareButtons) {
        shareButtons.innerHTML = `
            <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200">
                <span class="text-sm text-gray-500 w-full mb-1">Share this grantee:</span>
                <button id="copy-link-btn" onclick="copyShareLink(window.currentModalGrantee)" class="px-3 py-1.5 bg-gray-600 text-white text-xs rounded-lg hover:bg-gray-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>Copy link
                </button>
                <button onclick="shareOnTwitter(window.currentModalGrantee)" class="px-3 py-1.5 bg-black text-white text-xs rounded-lg hover:bg-gray-800 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>X
                </button>
                <button onclick="shareOnFacebook(window.currentModalGrantee)" class="px-3 py-1.5 bg-[#1877f2] text-white text-xs rounded-lg hover:bg-[#166fe5] transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Facebook
                </button>
                <button onclick="shareOnLinkedIn(window.currentModalGrantee)" class="px-3 py-1.5 bg-[#0a66c2] text-white text-xs rounded-lg hover:bg-[#004182] transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>LinkedIn
                </button>
                <button onclick="shareViaEmail(window.currentModalGrantee)" class="px-3 py-1.5 bg-[#2dc8d2] text-white text-xs rounded-lg hover:bg-[#183642] transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>Email
                </button>
            </div>
        `;
    }

    // Store current grantee for share functions
    window.currentModalGrantee = grantee;

    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    setTimeout(() => {
        overlay.style.opacity = '1';
        content.classList.remove('scale-95', 'opacity-0');
    }, 10);
}

// Close modal
function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');

    overlay.style.opacity = '0';
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }, 300);
}

// Make closeModal available globally
window.closeModal = closeModal;

// Zoom in
function zoomIn() {
    console.log('Zoom in clicked');
    if (!map) {
        console.error('Map not initialized');
        return;
    }
    const currentZoom = map.getZoom();
    const currentCenter = map.getCenter();
    console.log('Current zoom:', currentZoom, 'Zooming to:', currentZoom + 1);

    // Try multiple methods
    try {
        map.setView(currentCenter, currentZoom + 1, { animate: true });
    } catch (e) {
        console.error('Zoom error:', e);
    }
}

// Zoom out
function zoomOut() {
    console.log('Zoom out clicked');
    if (!map) {
        console.error('Map not initialized');
        return;
    }
    const currentZoom = map.getZoom();
    const currentCenter = map.getCenter();
    console.log('Current zoom:', currentZoom, 'Zooming to:', currentZoom - 1);

    // Try multiple methods
    try {
        map.setView(currentCenter, currentZoom - 1, { animate: true });
    } catch (e) {
        console.error('Zoom error:', e);
    }
}

// Setup event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');

    // Helper function to safely add event listener
    function addListener(id, event, handler, description) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
            console.log(`✓ ${description} listener added`);
        } else {
            console.error(`✗ Element with id '${id}' not found!`);
        }
    }

    addListener('year-filter', 'change', applyFilters, 'Year filter');
    addListener('county-filter', 'change', applyFilters, 'County filter');
    addListener('focus-filter', 'change', applyFilters, 'Focus filter');
    addListener('status-filter', 'change', applyFilters, 'Status filter');
    addListener('reset-filters', 'click', resetFilters, 'Reset filters');
    addListener('next-marker', 'click', nextMarker, 'Next marker');
    addListener('prev-marker', 'click', prevMarker, 'Prev marker');
    addListener('home-button', 'click', goHome, 'Home button');
    addListener('zoom-in', 'click', zoomIn, 'Zoom in');
    addListener('zoom-out', 'click', zoomOut, 'Zoom out');

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboardNavigation);

    console.log('Event listener setup complete');
}

// Handle keyboard navigation
function handleKeyboardNavigation(e) {
    const overlay = document.getElementById('modal-overlay');
    const isModalOpen = overlay && !overlay.classList.contains('hidden');

    // Don't capture keys when user is typing in a form field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    switch (e.key) {
        case 'Escape':
            if (isModalOpen) {
                closeModal();
                e.preventDefault();
            }
            break;
        case 'ArrowLeft':
            prevMarker();
            e.preventDefault();
            break;
        case 'ArrowRight':
            nextMarker();
            e.preventDefault();
            break;
        case 'Home':
            goHome();
            e.preventDefault();
            break;
        case '+':
        case '=':
            zoomIn();
            e.preventDefault();
            break;
        case '-':
        case '_':
            zoomOut();
            e.preventDefault();
            break;
    }
}

// Handle URL parameters for direct linking to grantees
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const granteeName = urlParams.get('grantee');

    if (granteeName) {
        // Find the grantee by name (URL decoded)
        const decodedName = decodeURIComponent(granteeName);
        const granteeIndex = visibleMarkers.findIndex(
            item => item.grantee.name.toLowerCase() === decodedName.toLowerCase()
        );

        if (granteeIndex !== -1) {
            currentMarkerIndex = granteeIndex;
            const { marker, grantee } = visibleMarkers[granteeIndex];
            updateGranteeCounter();

            // Wait for map to be ready, then navigate
            setTimeout(() => {
                flyToMarker(marker, grantee);
                setTimeout(() => openModal(grantee), 1000);
            }, 500);
        }
    }
}

// Generate shareable URL for current grantee
function getShareableUrl(grantee) {
    const baseUrl = window.location.origin + window.location.pathname;
    const encodedName = encodeURIComponent(grantee.name);
    return `${baseUrl}?grantee=${encodedName}`;
}

// Copy share link to clipboard
function copyShareLink(grantee) {
    const url = getShareableUrl(grantee);
    navigator.clipboard.writeText(url).then(() => {
        // Show brief confirmation
        const btn = document.getElementById('copy-link-btn');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Copied!';
            btn.classList.add('bg-green-500');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('bg-green-500');
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Share on Twitter/X
function shareOnTwitter(grantee) {
    const url = getShareableUrl(grantee);
    const text = `Check out ${grantee.name}, an NJCIC grantee supporting local journalism in New Jersey!`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
}

// Share on Facebook
function shareOnFacebook(grantee) {
    const url = getShareableUrl(grantee);
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(fbUrl, '_blank', 'width=550,height=420');
}

// Share on LinkedIn
function shareOnLinkedIn(grantee) {
    const url = getShareableUrl(grantee);
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(linkedInUrl, '_blank', 'width=550,height=420');
}

// Share via email
function shareViaEmail(grantee) {
    const url = getShareableUrl(grantee);
    const subject = `NJCIC Grantee: ${grantee.name}`;
    const body = `Check out ${grantee.name}, an NJCIC grantee supporting local journalism in New Jersey!\n\n${url}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Make share functions available globally
window.copyShareLink = copyShareLink;
window.shareOnTwitter = shareOnTwitter;
window.shareOnFacebook = shareOnFacebook;
window.shareOnLinkedIn = shareOnLinkedIn;
window.shareViaEmail = shareViaEmail;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Register service worker for offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('ServiceWorker registered:', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}
