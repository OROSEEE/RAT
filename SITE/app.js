// --- Config ---
const STORAGE_KEY = "my_reports_v1";

// --- Helpers ---
function qs(id) { return document.getElementById(id); }

function loadReports() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReports(reports) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

// --- Leaflet map ---
const map = L.map("myMap").setView([48.8278, 2.36489], 14);

// Tiles OpenStreetMap (simple & gratuit)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);

// --- Render table & markers ---
function render() {
  const reports = loadReports();
  const tbody = qs("myReportsBody");
  tbody.innerHTML = "";

  markersLayer.clearLayers();

  for (const r of reports) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.address)}</td>
      <td>${escapeHtml(r.comment)}</td>
      <td>${String(r.lat)}</td>
      <td>${String(r.lon)}</td>
      <td><button class="actions-btn" data-id="${r.id}">Supprimer</button></td>
    `;
    tbody.appendChild(tr);

    const m = L.marker([r.lat, r.lon]).addTo(markersLayer);
    m.bindPopup(
      `<strong>${escapeHtml(r.address)}</strong><br/>${escapeHtml(r.date)}<br/>${escapeHtml(r.comment)}`
    );
  }
}

render();

// Delete handler
qs("myReportsBody").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;

  const id = btn.getAttribute("data-id");
  const reports = loadReports().filter(r => r.id !== id);
  saveReports(reports);
  render();
});

// --- Geocoding (Nominatim) ---
async function geocodeAddress(address) {
  // Nominatim: respecte les limites (évite d’enchaîner les requêtes)
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: {
      // Important: un user-agent / referrer correct en prod (Nominatim aime bien)
      "Accept": "application/json"
    }
  });

  if (!res.ok) throw new Error("Erreur géocodage");
  const data = await res.json();
  if (!data.length) return null;

  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// --- Form submit ---
qs("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = qs("formStatus");
  status.textContent = "Recherche de l’adresse…";

  const address = qs("address").value.trim();
  const date = qs("date").value;
  const comment = qs("comment").value.trim();

  try {
    const geo = await geocodeAddress(address);
    if (!geo) {
      status.textContent = "Adresse introuvable. Essaie plus précis (code postal, ville).";
      return;
    }

    const report = {
      id: crypto.randomUUID(),
      address,
      date,
      comment,
      lat: geo.lat,
      lon: geo.lon
    };

    const reports = loadReports();
    reports.unshift(report);
    saveReports(reports);

    status.textContent = "Point ajouté ✅";
    render();

    // Zoom sur le point
    map.setView([report.lat, report.lon], 16);

    // reset form (optionnel)
    // e.target.reset();
  } catch (err) {
    status.textContent = "Impossible de géocoder l’adresse (réessaie).";
  }
});
