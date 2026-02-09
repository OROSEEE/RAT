// ---------- Helpers ----------
function qs(id) { return document.getElementById(id); }
function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

// ---------- Leaflet map ----------
const map = L.map("myMap").setView([48.8278, 2.36489], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);

// ---------- Geocoding (Nominatim) ----------
async function geocodeAddress(address) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Erreur géocodage");
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// ---------- Firebase wiring ----------
let db, auth, uid;
let firestore; // module firestore

async function initFirebase() {
  const fb = window.__FIREBASE__;
  if (!fb) throw new Error("Firebase non chargé (vérifie index.html)");

  db = fb.db;
  auth = fb.auth;

  // imports firestore en module (CDN)
  firestore = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js");

  // Auth anonyme => uid unique par utilisateur
  const { user } = await fb.signInAnonymously(auth);
  uid = user.uid;
}

// ---------- Firestore ops ----------
function reportsCol() {
  return firestore.collection(db, "reports");
}

async function addReport(report) {
  // createdAt sert au tri
  return await firestore.addDoc(reportsCol(), {
    ...report,
    uid,
    createdAt: firestore.serverTimestamp()
  });
}

async function deleteReport(docId) {
  await firestore.deleteDoc(firestore.doc(db, "reports", docId));
}

function listenReports() {
  // Tri: plus récent d’abord
  const q = firestore.query(reportsCol(), firestore.orderBy("createdAt", "desc"));

  return firestore.onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
    render(rows);
  });
}

// ---------- Render ----------
function render(reports) {
  const tbody = qs("myReportsBody");
  tbody.innerHTML = "";
  markersLayer.clearLayers();

  for (const r of reports) {
    const tr = document.createElement("tr");
    const canDelete = r.uid === uid;

    tr.innerHTML = `
      <td>${escapeHtml(r.date || "")}</td>
      <td>${escapeHtml(r.address || "")}</td>
      <td>${escapeHtml(r.comment || "")}</td>
      <td>${r.lat ?? ""}</td>
      <td>${r.lon ?? ""}</td>
      <td>
        ${canDelete ? `<button class="actions-btn" data-id="${r.id}">Supprimer</button>` : ""}
      </td>
    `;
    tbody.appendChild(tr);

    if (typeof r.lat === "number" && typeof r.lon === "number") {
      const m = L.marker([r.lat, r.lon]).addTo(markersLayer);
      m.bindPopup(
        `<strong>${escapeHtml(r.address)}</strong><br/>${escapeHtml(r.date)}<br/>${escapeHtml(r.comment)}`
      );
    }
  }
}

// delete click
qs("myReportsBody").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;

  const id = btn.getAttribute("data-id");
  try {
    await deleteReport(id);
  } catch (err) {
    alert("Suppression impossible.");
  }
});

// form submit
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
      status.textContent = "Adresse introuvable. Ajoute code postal + ville.";
      return;
    }

    await addReport({
      address,
      date,
      comment,
      lat: geo.lat,
      lon: geo.lon
    });

    status.textContent = "Signalement ajouté ✅";
    map.setView([geo.lat, geo.lon], 16);
    // e.target.reset();
  } catch {
    status.textContent = "Erreur (réessaie).";
  }
});

// ---------- Boot ----------
(async function boot() {
  const status = qs("formStatus");
  try {
    status.textContent = "Connexion…";
    await initFirebase();
    status.textContent = "OK ✅";
    listenReports();
  } catch (e) {
    status.textContent = "Firebase KO (config / scripts).";
    console.error(e);
  }
})();
