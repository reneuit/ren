/* =====================================================================
   AP Repair CRM - Mobile Web App (GitHub Pages + Turso HTTP API)
   Phase 1: Login, Role-based Nav, Dashboard, Customers, Jobs, Tasks
   ===================================================================== */

/* ========================= CONFIG ========================= */
const TURSO_URL = "https://ren-reneuit.aws-ap-south-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODc1NjExMzgsImlkIjoiMDFhMDMyZWYtNTUwMS03MDUzLWI4NTMtMDUyYWJiMmUxYjg5Iiwia2lkIjoidXAxUkptTmREX1VfcVUwVTNxWUU5QUxsUnNxQTNZam5IQ2VUc0xKSGZLRSIsInJpZCI6Ijg4MmIyOTY1LWRiYzgtNDczNS1hYTk5LTc2OGZiMmExOGQ0MyJ9.FmIfcVR36MLpovTqvzg3AEos-5BtoRAfusI_DJh6DV_HcbsDAGLUUTdBxpEe92UG1GDlGwF7wuf7YzKgtAw4Cw";
const DESKTOP_ID = "W1"; // sequence prefix (same convention as desktop Dxx) so web numbers never clash

/* ========================= DB LAYER ========================= */
function _encArg(v) {
  /* NOTE: this Turso endpoint requires integer/float values serialized
     as JSON STRINGS — sending raw numbers returns HTTP 400. */
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: String(v) };
  return { type: "text", value: String(v) };
}
function _decCell(c) {
  if (!c || c.type === "null") return null;
  if (c.type === "integer") return parseInt(c.value, 10);
  if (c.type === "float") return parseFloat(c.value);
  if (c.type === "blob") return c.value;
  return c.value;
}

async function _pipeline(stmts) {
  const body = {
    requests: stmts.map(s => ({
      type: "execute",
      stmt: { sql: s.sql, args: (s.args || []).map(_encArg) },
      want_rows: true
    }))
  };
  const r = await fetch(TURSO_URL + "/v2/pipeline", {
    method: "POST",
    headers: { "Authorization": "Bearer " + TURSO_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("Turso HTTP " + r.status);
  const data = await r.json();
  const out = [];
  for (const res of data.results) {
    const resp = res.response || {};
    if (resp.type === "error") throw new Error(resp.error && resp.error.message || "DB error");
    const result = resp.result || { rows: [], cols: [] };
    const names = (result.cols || []).map(c => c.name);
    const rows = (result.rows || []).map(row => {
      const o = {};
      names.forEach((n, i) => o[n] = _decCell(row[i]));
      return o;
    });
    out.push(rows);
  }
  return out;
}

async function q(sql, args) { return (await _pipeline([{ sql, args }]))[0]; }
async function q1(sql, args) { const rows = await q(sql, args); return rows[0] || null; }
async function exec(sql, args) { await _pipeline([{ sql, args }]); }
async function batch(stmts) { return _pipeline(stmts); }

/* sequence numbers, same pattern as desktop: WEB-TAG-YYMM-0001 */
async function nextNumber(tag, table, column) {
  const ym = new Date();
  const yymm = String(ym.getFullYear()).slice(2) + String(ym.getMonth() + 1).padStart(2, "0");
  const prefix = DESKTOP_ID + "-" + tag + "-" + yymm + "-";
  const row = await q1("SELECT " + column + " AS n FROM " + table + " WHERE " + column + " LIKE ? ORDER BY " + column + " DESC LIMIT 1", [prefix + "%"]);
  let seq = 1;
  if (row && row.n) { const p = String(row.n).split("-"); seq = (parseInt(p[p.length - 1], 10) || 0) + 1; }
  return prefix + String(seq).padStart(4, "0");
}

/* ========================= UTILS ========================= */
function esc(s) { return s === null || s === undefined ? "" : String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function nowStr() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
function todayStr() { return nowStr().slice(0, 10); }
function fmtDT(s) { if (!s) return "-"; return String(s).slice(0, 16).replace("T", " "); }
function fmtD(s) { if (!s) return "-"; return String(s).slice(0, 10); }
function fmtMoney(n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); })); }

/* pure-JS SHA-256 (UTF-8 safe, works from file:// too, not just https) */
function sha256hex(str) {
  const msg = unescape(encodeURIComponent(str));
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H0 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  const l = msg.length, bitLen = l * 8;
  const words = [];
  for (let i = 0; i < l; i++) words[i >> 2] = (words[i >> 2] || 0) | (msg.charCodeAt(i) << (24 - (i % 4) * 8));
  words[l >> 2] = (words[l >> 2] || 0) | (0x80 << (24 - (l % 4) * 8));
  const totalWords = (((l + 8) >> 6) + 1) * 16;
  for (let i = words.length; i < totalWords; i++) words[i] = 0;
  words[totalWords - 1] = bitLen | 0;
  words[totalWords - 2] = Math.floor(bitLen / 0x100000000) | 0;
  const w = new Array(64);
  const H = H0.slice();
  for (let j = 0; j < totalWords; j += 16) {
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      w[i] = i < 16 ? (words[j + i] || 0)
        : (rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) + w[i - 7] + (rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 16] | 0;
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => ("00000000" + (x >>> 0).toString(16)).slice(-8)).join("");
}
function verifyPassword(password, stored) {
  try {
    const i = stored.indexOf("$");
    const salt = stored.slice(0, i), hash = stored.slice(i + 1);
    return sha256hex(salt + password) === hash;
  } catch (e) { return false; }
}

/* ========================= UI HELPERS ========================= */
let toastTimer;
function toast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast show " + (type || "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = "toast", 2600);
}
function openModal(html) {
  document.getElementById("modal").innerHTML = html;
  document.getElementById("modal-backdrop").style.display = "flex";
}
function closeModal() { document.getElementById("modal-backdrop").style.display = "none"; }
function modalHead(title) {
  return '<div class="modal-head"><h2>' + title + '</h2><button class="modal-x" onclick="closeModal()">✕</button></div>';
}
function confirmBox(msg, onYes) {
  window._confirmCb = onYes;
  openModal(modalHead("Confirm") + '<p style="padding:6px 0 4px">' + esc(msg) + '</p>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn red" onclick="closeModal();window._confirmCb()">Confirm</button></div>');
}
function spinner() { return '<div class="spinner"></div>'; }
const STATUS_COLORS = {
  open: "b-blue", assigned: "b-cyan", tech_accepted: "b-cyan", diagnosis: "b-cyan",
  waiting_approval: "b-amber", repairing: "b-amber", outsourced: "b-purple", qc: "b-purple",
  billing: "b-blue", delivery: "b-blue", completed: "b-green", delivered: "b-green",
  closed: "b-gray", cancelled: "b-red", unrepairable: "b-red",
  INWARD: "b-blue", AT_FACTORY: "b-amber", BACK_IN_STORE: "b-purple", DELIVERED: "b-green",
  pending: "b-amber", in_progress: "b-cyan", done: "b-green",
  confirmed: "b-cyan", assembling: "b-amber", testing: "b-purple", ready: "b-blue",
  picked: "b-cyan", in_transit: "b-amber",
  scheduled: "b-blue", resolved: "b-green",
  new: "b-blue", contacted: "b-cyan", followup: "b-amber", quotation_sent: "b-purple",
  negotiation: "b-amber", converted: "b-green", not_interested: "b-red", won: "b-green", lost: "b-red",
  active: "b-green"
};
function badge(s) { if (!s) return ""; return '<span class="badge ' + (STATUS_COLORS[s] || "b-gray") + '">' + esc(String(s).replace(/_/g, " ")) + "</span>"; }

/* ========================= AUTH / SESSION ========================= */
let SESSION = null;
/* Current desktop permission defaults (src/auth/auth.py get_default_permissions).
   Cloud role_permissions rows may be stale (older key set), so we layer them
   OVER these defaults: cloud value wins when the key exists there. */
function _basePerms() {
  return {
    dashboard_view: true,
    customers_view: true, customers_create: false, customers_edit: false, customers_delete: false,
    leads_view: true, leads_create: false, leads_edit: false, leads_delete: false, lead_convert: false,
    orders_view: true, orders_create: false, orders_edit: false, orders_delete: false,
    jobs_view: true, jobs_create: false, jobs_edit: false, jobs_delete: false, jobs_assign: false,
    tasks_view: true, tasks_create: false, tasks_edit: false,
    technician_view: true,
    outsource_view: true, outsource_create: false,
    pickup_view: true, pickup_create: false, pickup_edit: false,
    delivery_view: true, delivery_create: false,
    amc_view: true, amc_create: false, amc_edit: false, amc_delete: false,
    inventory_view: true, inventory_create: false, inventory_edit: false, inventory_delete: false,
    billing_view: true, billing_create: false, billing_edit: false, billing_delete: false,
    accounting_view: true, accounting_create: false,
    reports_view: true,
    users_view: false, users_create: false, users_edit: false, users_delete: false, user_manage: false,
    settings_view: false, settings_edit: false,
    attendance_view: true,
    sync_manage: false, backup_manage: false
  };
}
function defaultRolePerms(role) {
  const b = _basePerms();
  const roles = {
    admin: { customers_create: 1, customers_edit: 1, customers_delete: 1, leads_create: 1, leads_edit: 1, leads_delete: 1, lead_convert: 1, orders_create: 1, orders_edit: 1, orders_delete: 1, jobs_create: 1, jobs_edit: 1, jobs_delete: 1, jobs_assign: 1, tasks_create: 1, tasks_edit: 1, outsource_create: 1, pickup_create: 1, pickup_edit: 1, delivery_create: 1, amc_create: 1, amc_edit: 1, amc_delete: 1, inventory_create: 1, inventory_edit: 1, inventory_delete: 1, billing_create: 1, billing_edit: 1, billing_delete: 1, accounting_create: 1, users_view: 1, user_manage: 1, settings_view: 1, settings_edit: 1, backup_manage: 1 },
    receptionist: { customers_create: 1, customers_edit: 1, leads_create: 1, leads_edit: 1, lead_convert: 1, orders_create: 1, orders_edit: 1, jobs_create: 1, jobs_edit: 1, pickup_create: 1, pickup_edit: 1, amc_create: 1, billing_create: 1, billing_edit: 1 },
    technician: { jobs_edit: 1, tasks_edit: 1, technician_view: 1 },
    accounts: { customers_edit: 1, orders_edit: 1, billing_create: 1, billing_edit: 1, accounting_create: 1 },
    store: { inventory_create: 1, inventory_edit: 1, inventory_delete: 1 },
    delivery_exec: { jobs_edit: 1, orders_view: 1, pickup_edit: 1, delivery_create: 1 },
    pickup_exec: { customers_view: 1, pickup_create: 1, pickup_edit: 1 },
    amc_manager: { amc_create: 1, amc_edit: 1, amc_delete: 1 },
    sales: { customers_create: 1, customers_edit: 1, leads_create: 1, leads_edit: 1, leads_delete: 1, lead_convert: 1, orders_create: 1, orders_edit: 1 },
    operations: { jobs_edit: 1, jobs_assign: 1, orders_edit: 1, tasks_create: 1, tasks_edit: 1 }
  };
  return { ...b, ...(roles[role] || {}) };
}
function hasPerm(p) {
  if (!SESSION) return false;
  if (SESSION.user.role === "super_admin") return true;
  const perms = SESSION.effectivePerms || {};
  return !!perms[p];
}
const NAV_ITEMS = [
  ["dashboard", "📊", "Dashboard", "dashboard_view"],
  ["customers", "👥", "Customers", "customers_view"],
  ["leads", "🎯", "Leads", "leads_view"],
  ["orders", "📦", "Orders", "orders_view"],
  ["jobs", "🔧", "Jobs", "jobs_view"],
  ["tasks", "📋", "Tasks", "tasks_view"],
  ["outsource", "📤", "Outsource", "outsource_view"],
  ["amc", "📋", "AMC", "amc_view"],
  ["attendance", "⏰", "Attendance", "attendance_view"],
  ["employees", "🧑‍💼", "Employees", "settings_view"],
  ["billing", "💰", "Billing", "billing_view"],
  ["reports", "📈", "Reports", "reports_view"],
  ["recycle_bin", "🗑️", "Recycle Bin", "settings_view"],
  ["settings", "⚙️", "Settings", "settings_view"]
];

async function doLogin() {
  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value;
  const err = document.getElementById("login-err");
  const btn = document.getElementById("login-btn");
  if (!u || !p) { err.textContent = "Enter username and password"; return; }
  btn.disabled = true; btn.textContent = "Signing in..."; err.textContent = "";
  try {
    const user = await q1("SELECT * FROM users WHERE username = ? AND is_active = 1 LIMIT 1", [u]);
    if (!user || !verifyPassword(p, user.password_hash || "")) {
      err.textContent = "Invalid username or password";
      return;
    }
    let rolePerms = {};
    const rp = await q1("SELECT permissions FROM role_permissions WHERE role = ? LIMIT 1", [user.role]);
    if (rp && rp.permissions) rolePerms = typeof rp.permissions === "string" ? JSON.parse(rp.permissions) : rp.permissions;
    if (user.permissions && typeof user.permissions === "string") user.permissions = JSON.parse(user.permissions);
    const effectivePerms = { ...defaultRolePerms(user.role), ...rolePerms };
    SESSION = { user, rolePerms, effectivePerms };
    localStorage.setItem("crm_session", JSON.stringify(SESSION));
    try { await exec("UPDATE users SET last_login = ? WHERE id = ?", [nowStr(), user.id]); } catch (e) {}
    showApp();
  } catch (e) {
    err.textContent = "Connection error: " + e.message;
  } finally {
    btn.disabled = false; btn.textContent = "Sign In";
  }
}
function doLogout() {
  localStorage.removeItem("crm_session");
  location.reload();
}
function toggleUserMenu() {
  const m = document.getElementById("user-menu");
  m.style.display = m.style.display === "none" ? "block" : "none";
}

/* ========================= APP SHELL ========================= */
let CURRENT_VIEW = "dashboard";
function showApp() {
  document.getElementById("login-view").style.display = "none";
  document.getElementById("app-view").style.display = "flex";
  const u = SESSION.user;
  document.getElementById("user-name").textContent = u.full_name || u.username;
  document.getElementById("user-role").textContent = (u.role || "").replace(/_/g, " ");
  document.getElementById("user-avatar").textContent = (u.full_name || u.username || "U")[0].toUpperCase();
  document.getElementById("menu-company").textContent = "RENUIT · " + (u.role || "").replace(/_/g, " ") + " login";
  renderNav();
  navigate("dashboard");
}
function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = NAV_ITEMS.filter(n => hasPerm(n[3]))
    .map(n => '<button class="nav-chip" id="nav-' + n[0] + '" onclick="navigate(\'' + n[0] + '\')">' + n[1] + " " + n[2] + "</button>").join("");
}
function navigate(view) {
  CURRENT_VIEW = view;
  document.querySelectorAll(".nav-chip").forEach(b => b.classList.remove("active"));
  const el = document.getElementById("nav-" + view);
  if (el) el.classList.add("active");
  document.getElementById("user-menu").style.display = "none";
  const c = document.getElementById("content");
  c.innerHTML = spinner();
  const renderers = {
    dashboard: viewDashboard, customers: viewCustomers, jobs: viewJobs, tasks: viewTasks,
    leads: viewLeads, billing: viewBilling, inventory: viewInventory, attendance: viewAttendance,
    orders: viewOrders, amc: viewAMC, outsource: viewOutsource,
    pickup: viewPickups, delivery: viewDeliveries, reports: viewReports,
    employees: viewEmployees, settings: viewSettings, recycle_bin: viewRecycleBin
  };
  const fn = renderers[view];
  if (fn) fn().catch(e => { c.innerHTML = '<div class="empty">⚠️ ' + esc(e.message) + "</div>"; });
  else c.innerHTML = '<div class="placeholder"><div class="big">🚧</div><b>' + esc((NAV_ITEMS.find(n => n[0] === view) || ["", "", view])[2]) + '</b><br><br>This section is coming in the next phase update.</div>';
}
function refreshAll() { navigate(CURRENT_VIEW); }
async function refreshAllBtn() { toast("Refreshing..."); refreshAll(); }

/* ========================= DASHBOARD ========================= */
async function viewDashboard() {
  const uid = SESSION.user.id, role = SESSION.user.role;
  const isAdminish = ["super_admin", "admin", "receptionist", "reception"].includes(role);
  const t = todayStr();
  const techFilter = isAdminish ? "" : " AND assigned_tech = " + uid;
  const stmts = [
    { sql: "SELECT COUNT(*) n FROM tickets WHERE status IN ('open','assigned','diagnosis','repairing','qc')" + techFilter },
    { sql: "SELECT COUNT(*) n FROM tickets WHERE created_at >= ?", args: [t] },
    { sql: "SELECT COUNT(*) n FROM tickets WHERE completed_date >= ?", args: [t] },
    { sql: "SELECT COALESCE(SUM(grand_total),0) n FROM invoices WHERE created_at >= ?", args: [t] },
    { sql: "SELECT COALESCE(SUM(balance),0) n FROM invoices WHERE balance > 0" },
    { sql: "SELECT COUNT(*) n FROM customers WHERE is_active = 1 OR is_active IS NULL" },
    { sql: "SELECT COUNT(*) n FROM tasks WHERE status IN ('pending','in_progress')" },
    { sql: "SELECT COUNT(*) n FROM users WHERE is_active = 1" },
    { sql: "SELECT COUNT(*) n FROM leads WHERE status = 'new'" },
    { sql: "SELECT COUNT(*) n FROM amc_contracts WHERE status = 'active'" },
    { sql: "SELECT COUNT(*) n FROM tickets WHERE is_outsourced = 1 AND status != 'completed'" },
    { sql: "SELECT COUNT(*) n FROM products WHERE current_stock <= min_stock" },
    { sql: "SELECT t.ticket_number, t.brand, t.model, t.status, t.created_at, c.name cname FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id WHERE 1=1" + techFilter + " ORDER BY t.created_at DESC LIMIT 8" },
    { sql: "SELECT t.title, t.status, t.due_date, t.priority FROM tasks t WHERE t.status IN ('pending','in_progress')" + (["super_admin", "admin"].includes(role) ? "" : " AND t.assignee_id = " + uid) + " ORDER BY t.created_at DESC LIMIT 6" }
  ];
  const [openJ, todayJ, compT, revT, pendP, custs, pendTasks, emps, newLeads, actAMC, outP, lowS, recent, myTasks] = await batch(stmts);
  const g = i => (i[0] ? i[0].n : 0);
  const stats = [
    ["🔧", "Open Jobs", g(openJ), ""], ["🆕", "Jobs Today", g(todayJ), "green"],
    ["✅", "Done Today", g(compT), "green"], ["💰", "Revenue Today", fmtMoney(g(revT)), "cyan"],
    ["💳", "Pending Payments", fmtMoney(g(pendP)), "red"], ["👥", "Customers", g(custs), ""],
    ["📋", "Pending Tasks", g(pendTasks), "amber"], ["🧑‍💼", "Employees", g(emps), ""],
    ["🎯", "New Leads", g(newLeads), "purple"], ["📜", "Active AMC", g(actAMC), "cyan"],
    ["📤", "Outsource Pending", g(outP), "amber"], ["📦", "Low Stock", g(lowS), "red"]
  ];
  let html = '<div class="stat-grid">' + stats.map(s =>
    '<div class="stat ' + s[3] + '"><div class="v">' + s[2] + '</div><div class="t">' + s[1] + "</div></div>").join("") + "</div>";

  html += '<div class="card"><h3>Recent Jobs <button class="link" onclick="navigate(\'jobs\')">View all →</button></h3>';
  html += recent.length ? recent.map(r =>
    '<div class="list-item" onclick="openJob(\'' + esc(r.ticket_number) + '\')"><div class="li-icon">🔧</div><div class="li-main">' +
    '<div class="li-title">' + esc(r.ticket_number) + " · " + esc(r.cname || "-") + "</div>" +
    '<div class="li-sub">' + esc((r.brand || "") + " " + (r.model || "")) + "</div></div>" + badge(r.status) + "</div>").join("")
    : '<div class="empty">No jobs yet</div>';
  html += "</div>";

  html += '<div class="card"><h3>My Tasks <button class="link" onclick="navigate(\'tasks\')">View all →</button></h3>';
  html += myTasks.length ? myTasks.map(r =>
    '<div class="list-item"><div class="li-icon">📋</div><div class="li-main">' +
    '<div class="li-title">' + esc(r.title) + "</div>" +
    '<div class="li-sub">Due: ' + fmtD(r.due_date) + "</div></div>" + badge(r.status) + "</div>").join("")
    : '<div class="empty">No pending tasks</div>';
  html += "</div>";

  document.getElementById("content").innerHTML = html;
}

/* ========================= CUSTOMERS ========================= */
let _custSearch = "";
async function viewCustomers() {
  const c = document.getElementById("content");
  const rows = await q("SELECT * FROM customers WHERE (is_active = 1 OR is_active IS NULL) ORDER BY created_at DESC LIMIT 400");
  window._custs = rows;
  const list = rows.filter(r =>
    !_custSearch || (r.name || "").toLowerCase().includes(_custSearch) ||
    (r.phone_primary || "").includes(_custSearch) || (r.customer_code || "").toLowerCase().includes(_custSearch));
  let html = '<input class="search-box" placeholder="🔍 Search name / phone / code" value="' + esc(_custSearch) + '" oninput="_custSearch=this.value.toLowerCase();renderCustList()">';
  html += '<div id="cust-list"></div>';
  html += hasPerm("customers_create") ? '<button class="fab" onclick="custForm()">＋</button>' : "";
  c.innerHTML = html;
  renderCustList();
}
function renderCustList() {
  const rows = window._custs || [];
  const list = rows.filter(r =>
    !_custSearch || (r.name || "").toLowerCase().includes(_custSearch) ||
    (r.phone_primary || "").includes(_custSearch) || (r.customer_code || "").toLowerCase().includes(_custSearch));
  document.getElementById("cust-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="custDetail(' + r.id + ')"><div class="li-icon">👤</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.name) + "</div>" +
    '<div class="li-sub">' + esc(r.phone_primary || "-") + " · " + esc(r.city || "-") + " · " + esc(r.customer_code || "") + "</div></div>" +
    '<div class="li-right"><div class="amt" style="color:' + ((r.balance || 0) > 0 ? "var(--red)" : "var(--green)") + '">' + fmtMoney(r.balance) + "</div></div></div>").join("")
    : '<div class="empty"><div class="big">👥</div>No customers found</div>';
}
async function custDetail(id) {
  const r = (window._custs || []).find(x => x.id === id);
  if (!r) return;
  const [tj, jb] = await batch([
    { sql: "SELECT COUNT(*) n FROM tickets WHERE customer_id = ?", args: [id] },
    { sql: "SELECT COUNT(*) n FROM master_repair_jobs WHERE customer_id = ?", args: [id] }
  ]);
  openModal(modalHead("👤 " + esc(r.name)) +
    '<div class="kv"><span class="k">Code</span><span class="v">' + esc(r.customer_code || "-") + "</span></div>" +
    '<div class="kv"><span class="k">Phone</span><span class="v">' + esc(r.phone_primary || "-") + "</span></div>" +
    '<div class="kv"><span class="k">Email</span><span class="v">' + esc(r.email || "-") + "</span></div>" +
    '<div class="kv"><span class="k">Company</span><span class="v">' + esc(r.company || "-") + "</span></div>" +
    '<div class="kv"><span class="k">GSTIN</span><span class="v">' + esc(r.gstin || "-") + "</span></div>" +
    '<div class="kv"><span class="k">Address</span><span class="v">' + esc([r.address, r.city, r.state, r.pincode].filter(Boolean).join(", ") || "-") + "</span></div>" +
    '<div class="kv"><span class="k">Type</span><span class="v">' + esc(r.customer_type || "retail") + "</span></div>" +
    '<div class="kv"><span class="k">Balance</span><span class="v" style="color:' + ((r.balance || 0) > 0 ? "var(--red)" : "var(--green)") + '">' + fmtMoney(r.balance) + "</span></div>" +
    '<div class="kv"><span class="k">Repair Tickets</span><span class="v">' + tj[0].n + "</span></div>" +
    '<div class="kv"><span class="k">Inward/Outward Jobs</span><span class="v">' + jb[0].n + "</span></div>" +
    '<div class="kv"><span class="k">Since</span><span class="v">' + fmtD(r.created_at) + "</span></div>" +
    (hasPerm("customers_edit") ? '<div class="modal-actions"><button class="btn primary" onclick="custForm(' + r.id + ')">✏️ Edit</button></div>' : ""));
}
function custForm(id) {
  const r = id ? (window._custs || []).find(x => x.id === id) : null;
  const f = (label, key, type, req) =>
    '<div class="field"><label>' + label + (req ? " *" : "") + '</label><input id="cf-' + key + '" type="' + (type || "text") + '" value="' + esc(r ? r[key] : "") + '"></div>';
  openModal(modalHead(r ? "Edit Customer" : "New Customer") +
    f("Name", "name", "text", 1) +
    '<div class="field-row">' + f("Phone", "phone_primary") + f("Alt Phone", "phone_secondary") + "</div>" +
    f("Email", "email") +
    '<div class="field-row">' + f("Company", "company") + f("GSTIN", "gstin") + "</div>" +
    f("Address", "address") +
    '<div class="field-row">' + f("City", "city") + f("State", "state") + f("Pincode", "pincode") + "</div>" +
    '<div class="field"><label>Type</label><select id="cf-customer_type">' +
    ["retail", "corporate", "reseller", "amc"].map(t => "<option " + (r && r.customer_type === t ? "selected" : "") + ">" + t + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Notes</label><textarea id="cf-notes">' + esc(r ? r.notes : "") + "</textarea></div>" +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn primary" id="cf-save">' + (r ? "Save" : "Create") + "</button></div>");
  document.getElementById("cf-save").onclick = () => saveCustomer(r ? r.id : null);
}
async function saveCustomer(id) {
  const v = k => document.getElementById("cf-" + k).value.trim();
  if (!v("name")) { toast("Name is required", "err"); return; }
  try {
    if (id) {
      await exec("UPDATE customers SET name=?, phone_primary=?, phone_secondary=?, email=?, company=?, gstin=?, address=?, city=?, state=?, pincode=?, customer_type=?, notes=?, updated_at=? WHERE id=?",
        [v("name"), v("phone_primary"), v("phone_secondary"), v("email"), v("company"), v("gstin"), v("address"), v("city"), v("state"), v("pincode"), v("customer_type"), v("notes"), nowStr(), id]);
      toast("Customer updated", "ok");
    } else {
      const code = await nextNumber("CUST", "customers", "customer_code");
      await exec("INSERT INTO customers (uuid, customer_code, name, phone_primary, phone_secondary, email, company, gstin, address, city, state, pincode, customer_type, notes, balance, total_visits, is_active, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,1,?,?,?, 'pending')",
        [uuid(), code, v("name"), v("phone_primary"), v("phone_secondary"), v("email"), v("company"), v("gstin"), v("address"), v("city"), v("state"), v("pincode"), v("customer_type"), v("notes"), SESSION.user.id, nowStr(), nowStr()]);
      toast("Customer created", "ok");
    }
    closeModal(); navigate("customers");
  } catch (e) { toast(e.message, "err"); }
}

/* ========================= JOBS (TICKETS) ========================= */
let _jobFilter = "active", _jobSearch = "";
const ACTIVE_STATUSES = "('open','assigned','tech_accepted','diagnosis','waiting_approval','repairing','outsourced','qc','billing','delivery')";
const FROZEN_STATUSES = ["delivered", "closed", "cancelled"];
async function viewJobs() {
  const c = document.getElementById("content");
  const isAdminish = ["super_admin", "admin", "receptionist", "reception"].includes(SESSION.user.role);
  const sql = "SELECT t.*, c.name cname, c.phone_primary cphone, u.full_name techname FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN users u ON u.id = t.assigned_tech" +
    (isAdminish ? "" : " WHERE t.assigned_tech = " + SESSION.user.id) + " ORDER BY t.created_at DESC LIMIT 400";
  const rows = await q(sql);
  window._jobs = rows;
  const chips = [["active", "Active"], ["all", "All"], ["open", "Open"], ["repairing", "Repairing"], ["qc", "QC"], ["completed", "Completed"], ["delivered", "Delivered"], ["closed", "Closed"]];
  let html = '<input class="search-box" placeholder="🔍 Search job # / customer / device" value="' + esc(_jobSearch) + '" oninput="_jobSearch=this.value.toLowerCase();renderJobList()">';
  html += '<div class="filter-row">' + chips.map(ch => '<button class="fchip ' + (_jobFilter === ch[0] ? "active" : "") + '" onclick="_jobFilter=\'' + ch[0] + '\';renderJobList()">' + ch[1] + "</button>").join("") + "</div>";
  html += '<div id="job-list"></div>';
  html += hasPerm("jobs_create") ? '<button class="fab" onclick="jobForm()">＋</button>' : "";
  c.innerHTML = html;
  renderJobList();
}
function renderJobList() {
  const rows = window._jobs || [];
  let list = rows;
  if (_jobFilter === "active") list = list.filter(r => ACTIVE_STATUSES.includes("'" + r.status + "'"));
  else if (_jobFilter !== "all") list = list.filter(r => r.status === _jobFilter);
  if (_jobSearch) list = list.filter(r =>
    (r.ticket_number || "").toLowerCase().includes(_jobSearch) || (r.cname || "").toLowerCase().includes(_jobSearch) ||
    ((r.brand || "") + " " + (r.model || "")).toLowerCase().includes(_jobSearch) || (r.serial_number || "").toLowerCase().includes(_jobSearch));
  document.getElementById("job-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="openJob(\'' + esc(r.ticket_number) + '\')"><div class="li-icon">🔧</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.ticket_number) + " · " + esc(r.cname || "-") + "</div>" +
    '<div class="li-sub">' + esc((r.device_type || "") + " · " + (r.brand || "") + " " + (r.model || "")) + (r.techname ? " · 👨‍🔧 " + esc(r.techname) : "") + "</div></div>" +
    '<div class="li-right">' + badge(r.status) + '<div class="amt" style="margin-top:3px">' + fmtMoney(r.net_amount || r.estimated_cost) + "</div></div></div>").join("")
    : '<div class="empty"><div class="big">🔧</div>No jobs found</div>';
}
async function openJob(num) {
  const t = await q1("SELECT t.*, c.name cname, c.phone_primary cphone, u.full_name techname FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN users u ON u.id=t.assigned_tech WHERE t.ticket_number = ? LIMIT 1", [num]);
  if (!t) { toast("Job not found", "err"); return; }
  const [acts, parts] = await batch([
    { sql: "SELECT a.*, u.full_name uname FROM ticket_activities a LEFT JOIN users u ON u.id=a.created_by WHERE a.ticket_id = ? ORDER BY a.created_at DESC LIMIT 50", args: [t.id] },
    { sql: "SELECT * FROM ticket_parts WHERE ticket_id = ? ORDER BY id DESC", args: [t.id] }
  ]);
  const frozen = FROZEN_STATUSES.includes(t.status);
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  let html = modalHead("🔧 " + esc(t.ticket_number) + " " + badge(t.status)) +
    kv("Customer", esc(t.cname || "-") + (t.cphone ? ' <a href="tel:' + esc(t.cphone) + '">📞</a>' : "")) +
    kv("Device", esc([t.device_type, t.brand, t.model].filter(Boolean).join(" · ") || "-")) +
    kv("Serial #", esc(t.serial_number || "-")) +
    kv("Complaint", esc(t.complaint || "-")) +
    kv("Diagnosis", esc(t.technician_diagnosis || "-")) +
    kv("Priority", esc(t.priority || "medium")) +
    kv("Technician", esc(t.techname || "Unassigned")) +
    kv("Est. Cost", fmtMoney(t.estimated_cost)) +
    kv("Charges", fmtMoney(t.total_charges) + " − disc " + fmtMoney(t.discount) + " = <b>" + fmtMoney(t.net_amount) + "</b>") +
    kv("Advance / Balance", fmtMoney(t.advance_paid) + " / " + fmtMoney(t.balance)) +
    kv("Created", fmtDT(t.created_at)) +
    (t.delivered_date ? kv("Delivered", fmtDT(t.delivered_date)) : "");
  if (parts.length) {
    html += '<div class="section-label">Parts Used</div>' + parts.map(p =>
      '<div class="kv"><span class="k">' + esc(p.part_name) + " × " + p.quantity + '</span><span class="v">' + fmtMoney(p.total_price) + "</span></div>").join("");
  }
  html += '<div class="section-label">Activity</div><div class="timeline">' + (acts.length ? acts.map(a =>
    '<div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">' + esc((a.activity_type || "").replace(/_/g, " ")) +
    (a.old_status ? " · " + esc(a.old_status) + " → " + esc(a.new_status) : "") + '</div><div class="tl-sub">' + esc(a.note || "") + "</div>" +
    '<div class="tl-sub" style="opacity:.7">' + esc(a.uname || "") + " · " + fmtDT(a.created_at) + "</div></div></div>").join("") : '<div class="empty">No activity</div>') + "</div>";

  const btns = [];
  if (!frozen && hasPerm("jobs_edit")) btns.push('<button class="btn primary" onclick="jobEditForm(' + t.id + ')">✏️ Update Job</button>');
  if (!frozen && hasPerm("jobs_edit")) btns.push('<button class="btn" onclick="jobPartForm(' + t.id + ')">🔩 Add Part</button>');
  if (!frozen) btns.push('<button class="btn green" onclick="jobCommentForm(' + t.id + ')">💬 Comment</button>');
  if (btns.length) html += '<div class="modal-actions">' + btns.join("") + "</div>";
  window._curJob = t;
  openModal(html);
}
function _findJob(id) { return (window._jobs || []).find(x => x.id === id) || window._curJob; }
async function jobEditForm(id) {
  const t = _findJob(id);
  const techs = await q("SELECT id, full_name FROM users WHERE role = 'technician' AND is_active = 1 ORDER BY full_name");
  const statuses = ["open", "assigned", "tech_accepted", "diagnosis", "waiting_approval", "repairing", "outsourced", "qc", "billing", "delivery", "completed", "delivered", "closed", "cancelled"];
  openModal(modalHead("Update " + esc(t.ticket_number)) +
    '<div class="field"><label>Status</label><select id="je-status">' + statuses.map(s => "<option " + (t.status === s ? "selected" : "") + ">" + s + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Assign Technician</label><select id="je-tech"><option value="">— Unassigned —</option>' + techs.map(u => '<option value="' + u.id + '" ' + (t.assigned_tech === u.id ? "selected" : "") + ">" + esc(u.full_name) + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Diagnosis / Work Done</label><textarea id="je-diag">' + esc(t.technician_diagnosis || "") + "</textarea></div>" +
    '<div class="field-row"><div class="field"><label>Est. Cost</label><input id="je-est" type="number" step="0.01" value="' + (t.estimated_cost || 0) + '"></div>' +
    '<div class="field"><label>Priority</label><select id="je-pri">' + ["low", "medium", "high", "urgent"].map(p => "<option " + (t.priority === p ? "selected" : "") + ">" + p + "</option>").join("") + "</select></div></div>" +
    '<div class="field-row"><div class="field"><label>Charges</label><input id="je-chg" type="number" step="0.01" value="' + (t.total_charges || 0) + '"></div>' +
    '<div class="field"><label>Discount</label><input id="je-disc" type="number" step="0.01" value="' + (t.discount || 0) + '"></div></div>' +
    '<div class="field-row"><div class="field"><label>Advance Paid</label><input id="je-adv" type="number" step="0.01" value="' + (t.advance_paid || 0) + '"></div></div>' +
    '<div class="modal-actions"><button class="btn" onclick="openJob(\'' + esc(t.ticket_number) + '\')">Back</button><button class="btn primary" id="je-save">Save</button></div>');
  document.getElementById("je-save").onclick = () => saveJobEdit(t);
}
async function saveJobEdit(t) {
  const g = k => document.getElementById("je-" + k).value;
  const newStatus = g("status"), techId = g("tech") ? parseInt(g("tech"), 10) : null;
  const chg = parseFloat(g("chg")) || 0, disc = parseFloat(g("disc")) || 0, adv = parseFloat(g("adv")) || 0;
  const net = Math.max(0, chg - disc);
  let status = newStatus, assignedDate = t.assigned_date, completedDate = t.completed_date, deliveredDate = t.delivered_date;
  if (techId && t.status === "open" && newStatus === "open") status = "assigned";
  if (techId && !t.assigned_date) assignedDate = nowStr();
  if (newStatus === "completed" && !t.completed_date) completedDate = nowStr();
  if (newStatus === "delivered" && !t.delivered_date) deliveredDate = nowStr();
  try {
    await exec("UPDATE tickets SET status=?, assigned_tech=?, assigned_date=?, technician_diagnosis=?, estimated_cost=?, priority=?, total_charges=?, discount=?, net_amount=?, advance_paid=?, balance=?, payment_status=?, completed_date=?, delivered_date=?, updated_at=? WHERE id=?",
      [status, techId, assignedDate, g("diag"), parseFloat(g("est")) || 0, g("pri"), chg, disc, net, adv, net - adv, net - adv > 0 ? "pending" : "paid", completedDate, deliveredDate, nowStr(), t.id]);
    const logs = [{ sql: "INSERT INTO ticket_activities (ticket_id, activity_type, note, old_status, new_status, created_by, created_at) VALUES (?,?,?,?,?,?,?)", args: [t.id, "updated", "Job updated via web", t.status, status, SESSION.user.id, nowStr()] }];
    if (techId && techId !== t.assigned_tech) logs.push({ sql: "INSERT INTO ticket_activities (ticket_id, activity_type, note, created_by, created_at) VALUES (?,?,?,?,?)", args: [t.id, "assigned", "Technician assigned", SESSION.user.id, nowStr()] });
    await batch(logs);
    toast("Job updated", "ok"); closeModal(); navigate("jobs");
  } catch (e) { toast(e.message, "err"); }
}
function jobCommentForm(id) {
  const t = _findJob(id);
  openModal(modalHead("💬 Comment · " + esc(t.ticket_number)) +
    '<div class="field"><label>Note</label><textarea id="jc-note" placeholder="Add a comment..."></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="openJob(\'' + esc(t.ticket_number) + '\')">Back</button><button class="btn green" id="jc-save">Post</button></div>');
  document.getElementById("jc-save").onclick = async () => {
    const note = document.getElementById("jc-note").value.trim();
    if (!note) return;
    try {
      await exec("INSERT INTO ticket_activities (ticket_id, activity_type, note, created_by, created_at) VALUES (?,?,?,?,?)", [t.id, "comment", note, SESSION.user.id, nowStr()]);
      toast("Comment added", "ok"); openJob(t.ticket_number);
    } catch (e) { toast(e.message, "err"); }
  };
}
function jobPartForm(id) {
  const t = _findJob(id);
  openModal(modalHead("🔩 Add Part · " + esc(t.ticket_number)) +
    '<div class="field"><label>Part Name *</label><input id="jp-name" placeholder="e.g. Keyboard"></div>' +
    '<div class="field-row"><div class="field"><label>Qty</label><input id="jp-qty" type="number" value="1" min="1"></div>' +
    '<div class="field"><label>Unit Price</label><input id="jp-price" type="number" step="0.01" value="0"></div></div>' +
    '<div class="modal-actions"><button class="btn" onclick="openJob(\'' + esc(t.ticket_number) + '\')">Back</button><button class="btn primary" id="jp-save">Add</button></div>');
  document.getElementById("jp-save").onclick = async () => {
    const name = document.getElementById("jp-name").value.trim();
    const qty = parseInt(document.getElementById("jp-qty").value, 10) || 1;
    const price = parseFloat(document.getElementById("jp-price").value) || 0;
    if (!name) { toast("Part name required", "err"); return; }
    try {
      await batch([
        { sql: "INSERT INTO ticket_parts (ticket_id, part_name, quantity, unit_price, total_price, is_warranty, created_at) VALUES (?,?,?,?,?,0,?)", args: [t.id, name, qty, price, qty * price, nowStr()] },
        { sql: "INSERT INTO ticket_activities (ticket_id, activity_type, note, created_by, created_at) VALUES (?,?,?,?,?)", args: [t.id, "part_added", "Part: " + name + " × " + qty + " (" + fmtMoney(qty * price) + ")", SESSION.user.id, nowStr()] }
      ]);
      toast("Part added", "ok"); openJob(t.ticket_number);
    } catch (e) { toast(e.message, "err"); }
  };
}
async function jobForm() {
  const [custs, techs, devTypes] = await batch([
    { sql: "SELECT id, name, phone_primary FROM customers WHERE is_active = 1 OR is_active IS NULL ORDER BY name LIMIT 1000" },
    { sql: "SELECT id, full_name FROM users WHERE role = 'technician' AND is_active = 1 ORDER BY full_name" },
    { sql: "SELECT name FROM device_type_options WHERE is_active = 1 ORDER BY sort_order, name" }
  ]);
  window._jobCusts = custs;
  const devList = devTypes.length ? devTypes.map(d => d.name) : ["laptop", "desktop", "printer", "cctv", "networking", "monitor", "ups", "scanner", "tablet", "mobile", "gaming", "other"];
  openModal(modalHead("🔧 New Job Ticket") +
    '<div class="field"><label>Customer *</label><select id="jf-cust"><option value="">— Select customer —</option>' + custs.map(c => '<option value="' + c.id + '">' + esc(c.name) + (c.phone_primary ? " · " + esc(c.phone_primary) : "") + "</option>").join("") + "</select></div>" +
    '<div class="field-row"><div class="field"><label>Device Type</label><select id="jf-dev">' + devList.map(d => "<option>" + esc(d) + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Priority</label><select id="jf-pri"><option>low</option><option selected>medium</option><option>high</option><option>urgent</option></select></div></div>' +
    '<div class="field-row"><div class="field"><label>Brand</label><input id="jf-brand"></div><div class="field"><label>Model</label><input id="jf-model"></div></div>' +
    '<div class="field"><label>Serial Number</label><input id="jf-serial"></div>' +
    '<div class="field"><label>Complaint *</label><textarea id="jf-complaint" placeholder="Reported problem..."></textarea></div>' +
    '<div class="field"><label>Accessories Received</label><input id="jf-acc" placeholder="e.g. Charger, Bag"></div>' +
    '<div class="field-row"><div class="field"><label>Est. Cost</label><input id="jf-est" type="number" step="0.01" value="0"></div>' +
    '<div class="field"><label>Assign Tech</label><select id="jf-tech"><option value="">— Later —</option>' + techs.map(u => '<option value="' + u.id + '">' + esc(u.full_name) + "</option>").join("") + "</select></div></div>" +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="jf-save">Create Job</button></div>');
  document.getElementById("jf-save").onclick = saveNewJob;
}
async function saveNewJob() {
  const g = k => document.getElementById("jf-" + k).value;
  const custId = parseInt(g("cust"), 10);
  const complaint = g("complaint").trim();
  if (!custId) { toast("Select a customer", "err"); return; }
  if (!complaint) { toast("Complaint is required", "err"); return; }
  try {
    const num = await nextNumber("DW", "tickets", "ticket_number");
    const techId = g("tech") ? parseInt(g("tech"), 10) : null;
    const status = techId ? "assigned" : "open";
    await batch([
      { sql: "INSERT INTO tickets (uuid, ticket_number, customer_id, job_type, device_type, brand, model, serial_number, accessories_received, complaint, estimated_cost, priority, status, assigned_tech, assigned_date, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')",
        args: [uuid(), num, custId, "service", g("dev"), g("brand"), g("model"), g("serial"), g("acc"), complaint, parseFloat(g("est")) || 0, g("pri"), status, techId, techId ? nowStr() : null, SESSION.user.id, nowStr(), nowStr()] },
      { sql: "INSERT INTO ticket_activities (ticket_id, activity_type, note, new_status, created_by, created_at) SELECT id, 'created', ?, ?, ?, ? FROM tickets WHERE ticket_number = ?", args: ["Job created via web", status, SESSION.user.id, nowStr(), num] }
    ]);
    toast("Job " + num + " created", "ok"); closeModal(); navigate("jobs");
  } catch (e) { toast(e.message, "err"); }
}

/* ========================= TASKS (INWARD / OUTWARD WORKFLOW) ========================= */
let _taskTab = "inward", _taskFilter = "all", _taskSearch = "";
let _genStatus = "all", _genSearch = "";
async function viewTasks() {
  const c = document.getElementById("content");
  if (_taskTab === "general") {
    const rows = await q("SELECT t.*, c.name cname, u.full_name aname FROM tasks t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN users u ON u.id=t.assignee_id ORDER BY t.created_at DESC LIMIT 300");
    window._gtasks = rows;
    let html = '<div class="filter-row">' +
      [["general", "📝 General"], ["inward", "📥 Inward"], ["outward", "📤 Outward"]].map(t =>
        '<button class="fchip ' + (_taskTab === t[0] ? "active" : "") + '" onclick="_taskTab=\'' + t[0] + '\';_taskFilter=\'all\';navigate(\'tasks\')">' + t[1] + "</button>").join("") + "</div>";
    html += '<input class="search-box" placeholder="🔍 Search title / customer" value="' + esc(_genSearch) + '" oninput="_genSearch=this.value.toLowerCase();renderGenList()">';
    html += '<div class="filter-row">' + [["all", "All"], ["pending", "Pending"], ["in_progress", "In Progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]].map(ch =>
      '<button class="fchip ' + (_genStatus === ch[0] ? "active" : "") + '" onclick="_genStatus=\'' + ch[0] + '\';renderGenList()">' + ch[1] + "</button>").join("") + "</div>";
    html += '<div id="gen-list"></div>';
    if (hasPerm("tasks_create")) html += '<button class="fab" onclick="genTaskForm()">＋</button>';
    c.innerHTML = html;
    renderGenList();
    return;
  }
  const rows = await q("SELECT * FROM master_repair_jobs ORDER BY created_at DESC LIMIT 400");
  window._mrjs = rows;
  let html = '<div class="filter-row">' +
    [["general", "📝 General"], ["inward", "📥 Inward"], ["outward", "📤 Outward"]].map(t =>
      '<button class="fchip ' + (_taskTab === t[0] ? "active" : "") + '" onclick="_taskTab=\'' + t[0] + '\';_taskFilter=\'all\';navigate(\'tasks\')">' + t[1] + "</button>").join("") + "</div>";
  html += '<input class="search-box" placeholder="🔍 Search entry # / customer / device" value="' + esc(_taskSearch) + '" oninput="_taskSearch=this.value.toLowerCase();renderTaskList()">';
  html += '<div class="filter-row">' + [["all", "All"], ["INWARD", "In Store"], ["AT_FACTORY", "At Factory"], ["BACK_IN_STORE", "Back In Store"], ["DELIVERED", "Delivered"]].map(ch =>
    '<button class="fchip ' + (_taskFilter === ch[0] ? "active" : "") + '" onclick="_taskFilter=\'' + ch[0] + '\';renderTaskList()">' + ch[1] + "</button>").join("") + "</div>";
  html += '<div id="task-list"></div>';
  if (hasPerm("tasks_create")) html += '<button class="fab" onclick="taskNewMenu()">＋</button>';
  c.innerHTML = html;
  renderTaskList();
}
function renderGenList() {
  const rows = window._gtasks || [];
  let list = rows;
  if (_genStatus !== "all") list = list.filter(r => r.status === _genStatus);
  if (_genSearch) list = list.filter(r =>
    (r.title || "").toLowerCase().includes(_genSearch) || (r.cname || "").toLowerCase().includes(_genSearch));
  document.getElementById("gen-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="openGenTask(' + r.id + ')"><div class="li-icon">' +
    (r.status === "completed" ? "✅" : r.task_type === "pickup" ? "🛵" : "📝") + "</div>" +
    '<div class="li-main"><div class="li-title">' + esc(r.title) + "</div>" +
    '<div class="li-sub">' + (r.cname ? "👤 " + esc(r.cname) + " · " : "") + (r.aname ? "→ " + esc(r.aname) + " · " : "") + "Due: " + fmtD(r.due_date) + "</div></div>" +
    '<div class="li-right">' + badge(r.status) + "</div></div>").join("")
    : '<div class="empty"><div class="big">📝</div>No tasks</div>';
}
async function openGenTask(id) {
  const r = (window._gtasks || []).find(x => x.id === id) || await q1("SELECT t.*, c.name cname, u.full_name aname FROM tasks t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=? LIMIT 1", [id]);
  if (!r) return;
  const acts = await q("SELECT a.*, u.full_name uname FROM task_activities a LEFT JOIN users u ON u.id=a.created_by WHERE a.task_id = ? ORDER BY a.created_at DESC LIMIT 30", [id]);
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  let html = modalHead("📝 " + esc(r.title) + " " + badge(r.status)) +
    kv("Description", esc(r.description || "-")) +
    kv("Customer", esc(r.cname || "-")) +
    kv("Assignee", esc(r.aname || "Unassigned")) +
    kv("Priority", esc(r.priority || "medium")) +
    kv("Due Date", fmtDT(r.due_date)) +
    (r.delivery_address ? kv("Delivery Address", esc(r.delivery_address)) : "") +
    kv("Created", fmtDT(r.created_at));
  html += '<div class="section-label">Activity</div><div class="timeline">' + (acts.length ? acts.map(a =>
    '<div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">' + esc((a.activity_type || "").replace(/_/g, " ")) +
    (a.old_status ? " · " + esc(a.old_status) + " → " + esc(a.new_status) : "") + '</div><div class="tl-sub">' + esc(a.note || "") + '</div>' +
    '<div class="tl-sub" style="opacity:.7">' + esc(a.uname || "") + " · " + fmtDT(a.created_at) + "</div></div></div>").join("") : '<div class="empty">No activity</div>') + "</div>";
  const btns = [];
  if (["pending", "in_progress"].includes(r.status)) btns.push('<button class="btn green" onclick="genSetStatus(' + r.id + ',\'completed\')">✅ Mark Completed</button>');
  if (r.status === "pending") btns.push('<button class="btn amber" onclick="genSetStatus(' + r.id + ',\'in_progress\')">▶ Start</button>');
  if (hasPerm("tasks_edit") && !["completed", "cancelled"].includes(r.status)) btns.push('<button class="btn primary" onclick="genTaskForm(' + r.id + ')">✏️ Edit</button>');
  if (btns.length) html += '<div class="modal-actions" style="flex-wrap:wrap"><button class="btn" onclick="genCommentForm(' + r.id + ')">💬 Comment</button>' + btns.join("") + "</div>";
  openModal(html);
}
async function genSetStatus(id, status) {
  try {
    const r = await q1("SELECT status FROM tasks WHERE id=? LIMIT 1", [id]);
    await batch([
      { sql: "UPDATE tasks SET status=?, updated_at=? WHERE id=?", args: [status, nowStr(), id] },
      { sql: "INSERT INTO task_activities (task_id, activity_type, old_status, new_status, note, created_by, created_at) VALUES (?, 'status_change', ?, ?, ?, ?, ?)", args: [id, r?.status, status, "Status changed to " + status, SESSION.user.id, nowStr()] }
    ]);
    toast("Task " + status.replace("_", " "), "ok"); closeModal(); navigate("tasks");
  } catch (e) { toast(e.message, "err"); }
}
function genCommentForm(id) {
  openModal(modalHead("💬 Comment") +
    '<div class="field"><label>Note</label><textarea id="gc-note"></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="openGenTask(' + id + ')">Back</button><button class="btn green" id="gc-save">Post</button></div>');
  document.getElementById("gc-save").onclick = async () => {
    const note = document.getElementById("gc-note").value.trim();
    if (!note) return;
    try {
      await exec("INSERT INTO task_activities (task_id, activity_type, note, created_by, created_at) VALUES (?,?,?,?,?)", [id, "comment", note, SESSION.user.id, nowStr()]);
      toast("Comment added", "ok"); openGenTask(id);
    } catch (e) { toast(e.message, "err"); }
  };
}
async function genTaskForm(id) {
  const r = id ? ((window._gtasks || []).find(x => x.id === id) || await q1("SELECT * FROM tasks WHERE id=?", [id])) : null;
  if (!window._allCusts) window._allCusts = await q("SELECT id, name, phone_primary FROM customers WHERE is_active = 1 OR is_active IS NULL ORDER BY name LIMIT 1000");
  const staff = await q("SELECT id, full_name FROM users WHERE is_active=1 ORDER BY full_name");
  const ro = r && ["completed", "cancelled"].includes(r.status);
  const dis = ro ? "disabled" : "";
  openModal(modalHead(ro ? "Task (Read Only)" : r ? "Edit Task" : "New Task") +
    '<div class="field"><label>Title *</label><input id="gf-title" ' + dis + ' value="' + esc(r?.title || "") + '"></div>' +
    '<div class="field"><label>Description</label><textarea id="gf-desc" ' + dis + ">" + esc(r?.description || "") + "</textarea></div>" +
    '<div class="field-row"><div class="field"><label>Customer</label><select id="gf-cust" ' + dis + '><option value="">— None —</option>' +
    window._allCusts.map(cu => '<option value="' + cu.id + '" ' + (r?.customer_id === cu.id ? "selected" : "") + ">" + esc(cu.name) + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Assign To</label><select id="gf-assign" ' + dis + '><option value="">— Unassigned —</option>' + staff.map(s => '<option value="' + s.id + '" ' + (r?.assignee_id === s.id ? "selected" : "") + ">" + esc(s.full_name) + "</option>").join("") + "</select></div></div>" +
    '<div class="field-row"><div class="field"><label>Status</label><select id="gf-status" ' + dis + ">" + ["pending", "in_progress", "completed", "cancelled"].map(s => "<option " + (r?.status === s || (!r && s === "pending") ? "selected" : "") + ">" + s + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Priority</label><select id="gf-pri" ' + dis + ">" + ["low", "medium", "high", "urgent"].map(p => "<option " + (r?.priority === p || (!r && p === "medium") ? "selected" : "") + ">" + p + "</option>").join("") + "</select></div></div>" +
    '<div class="field"><label>Due Date</label><input id="gf-due" type="datetime-local" ' + dis + ' value="' + (r?.due_date ? String(r.due_date).slice(0, 16).replace(" ", "T") : "") + '"></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">' + (ro ? "Close" : "Cancel") + "</button>" +
    (ro ? "" : '<button class="btn primary" id="gf-save">' + (r ? "Save" : "Create Task") + "</button>") + "</div>");
  if (ro) return;
  document.getElementById("gf-save").onclick = async () => {
    const g = k => document.getElementById("gf-" + k)?.value?.trim() || "";
    const title = g("title");
    if (!title) { toast("Title required", "err"); return; }
    const due = g("due") ? g("due").replace("T", " ") + ":00" : null;
    const assignee = g("assign") ? parseInt(g("assign"), 10) : null;
    const customer = g("cust") ? parseInt(g("cust"), 10) : null;
    try {
      if (r) {
        const oldStatus = r.status;
        const newStatus = g("status");
        const stmts = [
          { sql: "UPDATE tasks SET title=?, description=?, customer_id=?, assignee_id=?, status=?, priority=?, due_date=?, updated_at=? WHERE id=?", args: [title, g("desc"), customer, assignee, newStatus, g("pri"), due, nowStr(), r.id] }
        ];
        if (oldStatus !== newStatus) stmts.push({ sql: "INSERT INTO task_activities (task_id, activity_type, old_status, new_status, note, created_by, created_at) VALUES (?, 'status_change', ?, ?, ?, ?, ?)", args: [r.id, oldStatus, newStatus, "Updated via web", SESSION.user.id, nowStr()] });
        await batch(stmts);
        toast("Task updated", "ok");
      } else {
        const tu = uuid();
        await batch([
          { sql: "INSERT INTO tasks (uuid, title, description, customer_id, assignee_id, status, priority, due_date, task_type, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'general',?,?,?)",
            args: [tu, title, g("desc"), customer, assignee, g("status") || "pending", g("pri") || "medium", due, SESSION.user.id, nowStr(), nowStr()] },
          { sql: "INSERT INTO task_activities (task_id, activity_type, note, created_by, created_at) SELECT id, 'created', ?, ?, ? FROM tasks WHERE uuid = ?", args: ["Task created: " + title, SESSION.user.id, nowStr(), tu] }
        ]);
        toast("Task created", "ok");
      }
      closeModal(); navigate("tasks");
    } catch (e) { toast(e.message, "err"); }
  };
}
function renderTaskList() {
  const rows = window._mrjs || [];
  let list = rows.filter(r => (r.source_tab || "inward") === _taskTab);
  if (_taskFilter !== "all") list = list.filter(r => r.current_status === _taskFilter);
  if (_taskSearch) list = list.filter(r =>
    (r.entry_number || "").toLowerCase().includes(_taskSearch) || (r.customer_name || "").toLowerCase().includes(_taskSearch) ||
    ((r.brand || "") + " " + (r.model || "")).toLowerCase().includes(_taskSearch) || (r.serial_number || "").toLowerCase().includes(_taskSearch));
  document.getElementById("task-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="openTask(' + r.id + ')"><div class="li-icon">' + (r.current_status === "DELIVERED" ? "✅" : "📋") + "</div>" +
    '<div class="li-main"><div class="li-title">' + esc(r.entry_number) + " · " + esc(r.customer_name || "-") + "</div>" +
    '<div class="li-sub">' + esc((r.device_type || "") + " · " + (r.brand || "") + " " + (r.model || "")) + "</div></div>" +
    '<div class="li-right">' + badge(r.current_status) + "</div></div>").join("")
    : '<div class="empty"><div class="big">📋</div>No entries</div>';
}
function taskNewMenu() {
  openModal(modalHead("📋 New Entry") +
    '<div class="modal-actions" style="flex-direction:column">' +
    '<button class="btn primary" onclick="taskInwardForm()">📥 New Inward (customer device came in)</button>' +
    '<button class="btn amber" onclick="taskOutwardForm()">📤 New Outward (send to factory)</button></div>');
}
async function _taskCustField(pre) {
  if (!window._allCusts) window._allCusts = await q("SELECT id, name, phone_primary FROM customers WHERE is_active = 1 OR is_active IS NULL ORDER BY name LIMIT 1000");
  return '<div class="field"><label>Customer</label><select id="' + pre + '-cust"><option value="">— Walk-in / select —</option>' +
    window._allCusts.map(c => '<option value="' + c.id + '">' + esc(c.name) + (c.phone_primary ? " · " + esc(c.phone_primary) : "") + "</option>").join("") + "</select></div>" +
    '<div class="field-row"><div class="field"><label>Walk-in Name</label><input id="' + pre + '-cname"></div><div class="field"><label>Phone</label><input id="' + pre + '-cphone"></div></div>';
}
function _taskDevFields(pre) {
  return '<div class="field-row"><div class="field"><label>Device Type</label><input id="' + pre + '-dev" value="laptop"></div>' +
    '<div class="field"><label>Brand</label><input id="' + pre + '-brand"></div></div>' +
    '<div class="field-row"><div class="field"><label>Model</label><input id="' + pre + '-model"></div>' +
    '<div class="field"><label>Serial #</label><input id="' + pre + '-serial"></div></div>' +
    '<div class="field"><label>Complaint / Notes *</label><textarea id="' + pre + '-complaint"></textarea></div>';
}
async function taskInwardForm() {
  let html = modalHead("📥 New Inward Entry") + await _taskCustField("ti") + _taskDevFields("ti");
  let standby = [];
  try { standby = await q("SELECT id, asset_code, model_name FROM standby_inventory_pool WHERE status = 'AVAILABLE' ORDER BY model_name"); } catch (e) {}
  html += '<div class="field"><label>Standby Loaner (optional)</label><select id="ti-standby"><option value="">— None —</option>' +
    standby.map(s => '<option value="' + s.id + '">' + esc(s.model_name) + " (" + esc(s.asset_code) + ")</option>").join("") + "</select></div>" +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="ti-save">Create Inward</button></div>';
  openModal(html);
  document.getElementById("ti-save").onclick = saveTaskInward;
}
async function saveTaskInward() {
  const g = k => document.getElementById(k).value.trim();
  const custId = g("ti-cust") ? parseInt(g("ti-cust"), 10) : null;
  const cname = custId ? ((window._allCusts.find(c => c.id === custId) || {}).name || g("ti-cname")) : g("ti-cname");
  const cphone = custId ? ((window._allCusts.find(c => c.id === custId) || {}).phone_primary || g("ti-cphone")) : g("ti-cphone");
  if (!cname) { toast("Select customer or enter walk-in name", "err"); return; }
  if (!g("ti-complaint")) { toast("Complaint is required", "err"); return; }
  try {
    const num = await nextNumber("IN", "master_repair_jobs", "entry_number");
    const sb = g("ti-standby") ? parseInt(g("ti-standby"), 10) : null;
    const stmts = [
      { sql: "INSERT INTO master_repair_jobs (uuid, entry_number, customer_id, customer_name, customer_phone, device_type, brand, model, serial_number, complaint, current_status, linked_standby_id, standby_issued_date, inward_date, inward_notes, created_by, source_tab, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')",
        args: [uuid(), num, custId, cname, cphone, g("ti-dev"), g("ti-brand"), g("ti-model"), g("ti-serial"), g("ti-complaint"), "INWARD", sb, sb ? nowStr() : null, nowStr(), g("ti-complaint"), SESSION.user.id, _taskTab === "outward" ? "outward" : "inward", nowStr(), nowStr()] },
      { sql: "INSERT INTO material_movement_ledger (uuid, job_id, movement_type, party_name, movement_date, created_by, created_at, sync_status) SELECT uuid(), id, 'INWARD_FROM_CLIENT', ?, ?, ?, ?, 'pending' FROM master_repair_jobs WHERE entry_number = ?", args: [cname, nowStr(), SESSION.user.id, nowStr(), num] }
    ];
    if (sb) stmts.push(
      { sql: "UPDATE standby_inventory_pool SET status = 'LOANED', updated_at = ? WHERE id = ?", args: [nowStr(), sb] },
      { sql: "INSERT INTO material_movement_ledger (uuid, job_id, movement_type, party_name, movement_date, created_by, created_at, sync_status) SELECT uuid(), id, 'STANDBY_ISSUED', ?, ?, ?, ?, 'pending' FROM master_repair_jobs WHERE entry_number = ?", args: [cname + " - standby issued", nowStr(), SESSION.user.id, nowStr(), num] });
    await batch(stmts);
    toast("Inward " + num + " created", "ok"); closeModal(); navigate("tasks");
  } catch (e) { toast(e.message, "err"); }
}
async function taskOutwardForm() {
  let html = modalHead("📤 New Outward Entry") + await _taskCustField("to") + _taskDevFields("to") +
    '<div class="field"><label>Factory / Service Center *</label><input id="to-factory"></div>' +
    '<div class="field"><label>Courier Tracking #</label><input id="to-courier"></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn amber" id="to-save">Create & Send</button></div>';
  openModal(html);
  document.getElementById("to-save").onclick = async () => {
    const g = k => document.getElementById(k).value.trim();
    const custId = g("to-cust") ? parseInt(g("to-cust"), 10) : null;
    const cname = custId ? ((window._allCusts.find(c => c.id === custId) || {}).name || g("to-cname")) : g("to-cname");
    if (!cname) { toast("Select customer or enter name", "err"); return; }
    if (!g("to-complaint")) { toast("Complaint is required", "err"); return; }
    if (!g("to-factory")) { toast("Factory name is required", "err"); return; }
    try {
      const num = await nextNumber("OUT", "master_repair_jobs", "entry_number");
      const notes = "Sent to " + g("to-factory");
      await batch([
        { sql: "INSERT INTO master_repair_jobs (uuid, entry_number, customer_id, customer_name, customer_phone, device_type, brand, model, serial_number, complaint, current_status, factory_name, courier_tracking_no, outward_date, outward_notes, created_by, source_tab, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')",
          args: [uuid(), num, custId, cname, g("to-cphone"), g("to-dev"), g("to-brand"), g("to-model"), g("to-serial"), g("to-complaint"), "AT_FACTORY", g("to-factory"), g("to-courier"), nowStr(), notes, SESSION.user.id, "outward", nowStr(), nowStr()] },
        { sql: "INSERT INTO material_movement_ledger (uuid, job_id, movement_type, party_name, courier_tracking_no, technician_notes, movement_date, created_by, created_at, sync_status) SELECT uuid(), id, 'OUTWARD_TO_FACTORY', ?, ?, ?, ?, ?, ?, 'pending' FROM master_repair_jobs WHERE entry_number = ?", args: [g("to-factory"), g("to-courier"), g("to-complaint"), nowStr(), SESSION.user.id, nowStr(), num] }
      ]);
      toast("Outward " + num + " created", "ok"); closeModal(); _taskTab = "outward"; navigate("tasks");
    } catch (e) { toast(e.message, "err"); }
  };
}
async function openTask(id) {
  const j = await q1("SELECT * FROM master_repair_jobs WHERE id = ? LIMIT 1", [id]);
  if (!j) { toast("Entry not found", "err"); return; }
  const [ledger, acts, standbyRow] = await batch([
    { sql: "SELECT l.*, u.full_name uname FROM material_movement_ledger l LEFT JOIN users u ON u.id=l.created_by WHERE l.job_id = ? ORDER BY l.movement_date DESC", args: [id] },
    { sql: "SELECT a.*, u.full_name uname FROM master_repair_job_activities a LEFT JOIN users u ON u.id=a.created_by WHERE a.job_id = ? ORDER BY a.created_at DESC LIMIT 50", args: [id] },
    { sql: "SELECT * FROM standby_inventory_pool WHERE id = ?", args: [j.linked_standby_id || 0] }
  ]);
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  const sb = standbyRow[0];
  let html = modalHead("📋 " + esc(j.entry_number) + " " + badge(j.current_status)) +
    kv("Customer", esc(j.customer_name || "-") + (j.customer_phone ? ' <a href="tel:' + esc(j.customer_phone) + '">📞</a>' : "")) +
    kv("Device", esc([j.device_type, j.brand, j.model].filter(Boolean).join(" · ") || "-")) +
    kv("Serial #", esc(j.serial_number || "-")) +
    kv("Complaint", esc(j.complaint || "-")) +
    kv("Type", esc((j.source_tab || "inward") === "outward" ? "Outward" : "Inward")) +
    (sb ? kv("Standby Loaned", esc(sb.model_name) + " (" + esc(sb.asset_code) + ")") : "") +
    (j.factory_name ? kv("Factory", esc(j.factory_name)) : "") +
    (j.courier_tracking_no ? kv("Courier #", esc(j.courier_tracking_no)) : "") +
    (j.repair_cost ? kv("Repair Cost", fmtMoney(j.repair_cost)) : "") +
    (j.customer_charge ? kv("Customer Charge", fmtMoney(j.customer_charge)) : "") +
    kv("Inward Date", fmtDT(j.inward_date)) +
    (j.delivered_date ? kv("Delivered", fmtDT(j.delivered_date)) : "");

  const tl = [];
  ledger.forEach(l => tl.push({ d: l.movement_date, t: (l.movement_type || "").replace(/_/g, " "), s: (l.party_name || "") + (l.technician_notes ? " — " + l.technician_notes : "") + (l.cost_or_charge ? " · " + fmtMoney(l.cost_or_charge) : "") + (l.courier_tracking_no ? " · AWB " + l.courier_tracking_no : ""), u: l.uname }));
  acts.forEach(a => tl.push({ d: a.created_at, t: "💬 " + (a.activity_type || "comment"), s: a.note || "", u: a.uname }));
  tl.sort((a, b) => String(b.d || "").localeCompare(String(a.d || "")));
  html += '<div class="section-label">Movement Timeline</div><div class="timeline">' + (tl.length ? tl.map(x =>
    '<div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">' + esc(x.t) + '</div><div class="tl-sub">' + esc(x.s) + '</div><div class="tl-sub" style="opacity:.7">' + esc(x.u || "") + " · " + fmtDT(x.d) + "</div></div></div>").join("") : '<div class="empty">No movements</div>') + "</div>";

  const btns = [];
  const editable = hasPerm("tasks_edit");
  if (editable && j.current_status === "INWARD")
    btns.push('<button class="btn amber" onclick="taskSendFactory(' + j.id + ')">📤 Send to Factory</button>');
  if (editable && j.current_status === "AT_FACTORY")
    btns.push('<button class="btn primary" onclick="taskReceive(' + j.id + ')">📥 Receive from Factory</button>');
  if (editable && j.current_status === "BACK_IN_STORE")
    btns.push('<button class="btn green" onclick="taskDeliver(' + j.id + ')">✅ Deliver to Customer</button>');
  if (editable && j.linked_standby_id && j.current_status !== "DELIVERED")
    btns.push('<button class="btn" onclick="taskReturnStandby(' + j.id + ')">🔄 Return Standby</button>');
  if (j.current_status !== "DELIVERED")
    btns.push('<button class="btn green" onclick="taskCommentForm(' + j.id + ')">💬 Comment</button>');
  if (btns.length) html += '<div class="modal-actions" style="flex-wrap:wrap">' + btns.join("") + "</div>";
  openModal(html);
}
async function _getTask(id) { return q1("SELECT * FROM master_repair_jobs WHERE id = ? LIMIT 1", [id]); }
async function taskSendFactory(id) {
  const j = await _getTask(id);
  openModal(modalHead("📤 Send to Factory · " + esc(j.entry_number)) +
    '<div class="field"><label>Factory / Service Center *</label><input id="sf-factory" value="' + esc(j.factory_name || "") + '"></div>' +
    '<div class="field"><label>Courier Tracking #</label><input id="sf-courier" value="' + esc(j.courier_tracking_no || "") + '"></div>' +
    '<div class="field"><label>Notes</label><textarea id="sf-notes">' + esc(j.outward_notes || "") + "</textarea></div>" +
    '<div class="modal-actions"><button class="btn" onclick="openTask(' + j.id + ')">Back</button><button class="btn amber" id="sf-save">Send</button></div>');
  document.getElementById("sf-save").onclick = async () => {
    const factory = document.getElementById("sf-factory").value.trim();
    if (!factory) { toast("Factory is required", "err"); return; }
    const courier = document.getElementById("sf-courier").value.trim();
    const notes = document.getElementById("sf-notes").value.trim();
    try {
      await batch([
        { sql: "UPDATE master_repair_jobs SET current_status='AT_FACTORY', factory_name=?, courier_tracking_no=?, outward_date=?, outward_notes=?, updated_at=? WHERE id=? AND current_status='INWARD'", args: [factory, courier, nowStr(), notes, nowStr(), id] },
        { sql: "INSERT INTO material_movement_ledger (uuid, job_id, movement_type, party_name, courier_tracking_no, technician_notes, movement_date, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?, 'pending')", args: [uuid(), id, "OUTWARD_TO_FACTORY", factory, courier, notes, nowStr(), SESSION.user.id, nowStr()] }
      ]);
      toast("Sent to factory", "ok"); closeModal(); navigate("tasks");
    } catch (e) { toast(e.message, "err"); }
  };
}
async function taskReceive(id) {
  const j = await _getTask(id);
  openModal(modalHead("📥 Receive from Factory · " + esc(j.entry_number)) +
    '<div class="field"><label>Repair Cost (₹)</label><input id="rf-cost" type="number" step="0.01" value="0"></div>' +
    '<div class="field"><label>Received Notes</label><textarea id="rf-notes">' + esc(j.received_notes || "") + "</textarea></div>" +
    '<div class="modal-actions"><button class="btn" onclick="openTask(' + j.id + ')">Back</button><button class="btn primary" id="rf-save">Receive</button></div>');
  document.getElementById("rf-save").onclick = async () => {
    const cost = parseFloat(document.getElementById("rf-cost").value) || 0;
    const notes = document.getElementById("rf-notes").value.trim();
    try {
      await batch([
        { sql: "UPDATE master_repair_jobs SET current_status='BACK_IN_STORE', repair_cost=?, received_date=?, received_notes=?, updated_at=? WHERE id=? AND current_status='AT_FACTORY'", args: [cost, nowStr(), notes, nowStr(), id] },
        { sql: "INSERT INTO material_movement_ledger (uuid, job_id, movement_type, party_name, cost_or_charge, technician_notes, movement_date, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?, 'pending')", args: [uuid(), id, "INWARD_FROM_FACTORY", j.factory_name || "Factory", cost, notes, nowStr(), SESSION.user.id, nowStr()] }
      ]);
      toast("Received in store", "ok"); closeModal(); navigate("tasks");
    } catch (e) { toast(e.message, "err"); }
  };
}
async function taskDeliver(id) {
  const j = await _getTask(id);
  let standbyBlock = "";
  if (j.linked_standby_id) {
    const rec = await q1("SELECT COUNT(*) n FROM material_movement_ledger WHERE job_id = ? AND movement_type = 'STANDBY_RECLAIMED'", [id]);
    if (rec.n === 0) {
      const asset = await q1("SELECT model_name, asset_code FROM standby_inventory_pool WHERE id = ?", [j.linked_standby_id]);
      standbyBlock = '<div class="card" style="background:var(--red-soft);border:1px solid var(--red)"><b style="color:var(--red)">⚠️ Standby asset ' + esc(asset ? asset.model_name + " (" + asset.asset_code + ")" : "") + ' is still loaned. Return it first.</b></div>';
    }
  }
  openModal(modalHead("✅ Deliver · " + esc(j.entry_number)) + standbyBlock +
    '<div class="field"><label>Customer Charge (₹)</label><input id="dl-charge" type="number" step="0.01" value="0"></div>' +
    '<div class="field"><label>Delivery Notes (include "Collected by: name")</label><textarea id="dl-notes"></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="openTask(' + j.id + ')">Back</button><button class="btn green" id="dl-save" ' + (standbyBlock ? "disabled" : "") + '>Deliver</button></div>');
  if (standbyBlock) return;
  document.getElementById("dl-save").onclick = async () => {
    const charge = parseFloat(document.getElementById("dl-charge").value) || 0;
    const notes = document.getElementById("dl-notes").value.trim();
    try {
      const stmts = [
        { sql: "UPDATE master_repair_jobs SET current_status='DELIVERED', customer_charge=?, received_notes=CASE WHEN ? != '' THEN ? ELSE received_notes END, delivered_date=?, updated_at=? WHERE id=? AND current_status='BACK_IN_STORE'", args: [charge, notes, notes, nowStr(), nowStr(), id] },
        { sql: "INSERT INTO material_movement_ledger (uuid, job_id, movement_type, party_name, cost_or_charge, technician_notes, movement_date, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?, 'pending')", args: [uuid(), id, "OUTWARD_TO_CLIENT", j.customer_name, charge, notes, nowStr(), SESSION.user.id, nowStr()] }
      ];
      if (j.linked_standby_id) stmts.push(
        { sql: "UPDATE standby_inventory_pool SET status='AVAILABLE', updated_at=? WHERE id=?", args: [nowStr(), j.linked_standby_id] },
        { sql: "UPDATE master_repair_jobs SET linked_standby_id=NULL, standby_issued_date=NULL WHERE id=?", args: [id] },
        { sql: "INSERT INTO material_movement_ledger (uuid, job_id, movement_type, party_name, movement_date, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?, 'pending')", args: [uuid(), id, "STANDBY_RECLAIMED", (j.customer_name || "") + " - returned", nowStr(), SESSION.user.id, nowStr()] });
      await batch(stmts);
      toast("Delivered", "ok"); closeModal(); navigate("tasks");
    } catch (e) { toast(e.message, "err"); }
  };
}
async function taskReturnStandby(id) {
  const j = await _getTask(id);
  confirmBox("Return standby asset to store for " + (j.entry_number || "") + "?", async () => {
    try {
      const asset = await q1("SELECT model_name FROM standby_inventory_pool WHERE id = ?", [j.linked_standby_id]);
      await batch([
        { sql: "UPDATE standby_inventory_pool SET status='AVAILABLE', updated_at=? WHERE id=?", args: [nowStr(), j.linked_standby_id] },
        { sql: "UPDATE master_repair_jobs SET linked_standby_id=NULL, standby_issued_date=NULL, updated_at=? WHERE id=?", args: [nowStr(), id] },
        { sql: "INSERT INTO material_movement_ledger (uuid, job_id, movement_type, party_name, movement_date, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?, 'pending')", args: [uuid(), id, "STANDBY_RECLAIMED", (j.customer_name || "") + " - returned " + (asset ? asset.model_name : ""), nowStr(), SESSION.user.id, nowStr()] }
      ]);
      toast("Standby returned", "ok"); navigate("tasks");
    } catch (e) { toast(e.message, "err"); }
  });
}
function taskCommentForm(id) {
  openModal(modalHead("💬 Comment") +
    '<div class="field"><label>Note</label><textarea id="tc-note"></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="openTask(' + id + ')">Back</button><button class="btn green" id="tc-save">Post</button></div>');
  document.getElementById("tc-save").onclick = async () => {
    const note = document.getElementById("tc-note").value.trim();
    if (!note) return;
    try {
      await exec("INSERT INTO master_repair_job_activities (uuid, job_id, activity_type, note, created_by, created_at) VALUES (?,?,?,?,?,?)", [uuid(), id, "comment", note, SESSION.user.id, nowStr()]);
      toast("Comment added", "ok"); openTask(id);
    } catch (e) { toast(e.message, "err"); }
  };
}

/* ========================= LEADS ========================= */
let _leadFilter = "all", _leadSearch = "";
async function viewLeads() {
  const c = document.getElementById("content");
  const rows = await q("SELECT l.*, u.full_name assigned_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to ORDER BY l.created_at DESC LIMIT 400");
  window._leads = rows;
  const chips = [["all", "All"], ["new", "New"], ["contacted", "Contacted"], ["followup", "Follow-up"], ["quotation_sent", "Quote"], ["negotiation", "Negotiation"], ["converted", "Won"], ["not_interested", "Lost"]];
  let html = '<input class="search-box" placeholder="🔍 Search name / phone / email" value="' + esc(_leadSearch) + '" oninput="_leadSearch=this.value.toLowerCase();renderLeadList()">';
  html += '<div class="filter-row">' + chips.map(ch => '<button class="fchip ' + (_leadFilter === ch[0] ? "active" : "") + '" onclick="_leadFilter=\'' + ch[0] + '\';renderLeadList()">' + ch[1] + "</button>").join("") + "</div>";
  html += '<div id="lead-list"></div>';
  if (hasPerm("leads_create")) html += '<button class="fab" onclick="leadForm()">＋</button>';
  c.innerHTML = html;
  renderLeadList();
}
function renderLeadList() {
  const rows = window._leads || [];
  let list = rows;
  if (_leadFilter !== "all") list = list.filter(r => r.status === _leadFilter);
  if (_leadSearch) list = list.filter(r =>
    (r.name || "").toLowerCase().includes(_leadSearch) || (r.phone || "").includes(_leadSearch) || (r.email || "").toLowerCase().includes(_leadSearch));
  document.getElementById("lead-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="openLead(' + r.id + ')"><div class="li-icon">🎯</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.name) + '</div>' +
    '<div class="li-sub">' + esc(r.phone || "-") + " · " + esc(r.source || "") + (r.assigned_name ? " · 👤 " + esc(r.assigned_name) : "") + '</div></div>' +
    '<div class="li-right">' + badge(r.status) + (r.next_followup ? '<div class="li-sub">📅 ' + fmtD(r.next_followup) + '</div>' : '') + '</div></div>').join("")
    : '<div class="empty"><div class="big">🎯</div>No leads found</div>';
}
async function openLead(id) {
  const r = (window._leads || []).find(x => x.id === id);
  if (!r) { r = await q1("SELECT l.*, u.full_name assigned_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE l.id=? LIMIT 1", [id]); }
  if (!r) { toast("Lead not found", "err"); return; }
  const acts = await q("SELECT a.*, u.full_name uname FROM lead_activities a LEFT JOIN users u ON u.id=a.created_by WHERE a.lead_id = ? ORDER BY a.created_at DESC LIMIT 30", [id]);
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
  let html = modalHead("🎯 " + esc(r.name) + " " + badge(r.status)) +
    kv("Phone", esc(r.phone || "-")) +
    kv("Email", esc(r.email || "-")) +
    kv("Source", esc(r.source || "-")) +
    kv("Type", esc(r.lead_type || "end_user")) +
    kv("Assigned To", esc(r.assigned_name || "Unassigned")) +
    kv("Device", esc([r.device_type, r.device_brand, r.device_model].filter(Boolean).join(" · ") || "-")) +
    kv("Requirement", esc(r.requirement || "-")) +
    kv("Est. Value", fmtMoney(r.estimated_value)) +
    kv("Next Follow-up", fmtDT(r.next_followup)) +
    kv("Follow-up Count", r.followup_count || 0) +
    (r.converted_to_customer ? kv("✅", "Converted to customer") : "") +
    (r.lost_reason ? kv("Lost Reason", esc(r.lost_reason)) : "") +
    kv("Created", fmtDT(r.created_at));
  if (acts.length) {
    html += '<div class="section-label">Activity History</div><div class="timeline">' + acts.map(a =>
      '<div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">' + esc((a.activity_type || "").replace(/_/g, " ")) +
      '</div><div class="tl-sub">' + esc(a.note || "") + '</div><div class="tl-sub" style="opacity:.7">' + esc(a.uname || "") + " · " + fmtDT(a.created_at) + "</div></div></div>").join("") + "</div>";
  }
  const btns = [];
  if (hasPerm("leads_edit") && !r.converted_to_customer) btns.push('<button class="btn primary" onclick="leadForm(' + r.id + ')">✏️ Edit</button>');
  if (hasPerm("leads_edit") && !r.converted_to_customer) btns.push('<button class="btn" onclick="leadFollowupForm(' + r.id + ')">📅 Follow-up</button>');
  if (hasPerm("lead_convert") && !r.converted_to_customer && r.status !== "not_interested") btns.push('<button class="btn green" onclick="leadConvert(' + r.id + ')">🔄 Convert to Customer</button>');
  if (btns.length) html += '<div class="modal-actions" style="flex-wrap:wrap">' + btns.join("") + '</div>';
  openModal(html);
}
function leadForm(id) {
  const r = id ? (window._leads || []).find(x => x.id === id) : null;
  const sources = ["walkin", "phone", "whatsapp", "website", "google", "facebook", "instagram", "referral", "existing_customer", "email"];
  const statuses = ["new", "contacted", "followup", "quotation_sent", "negotiation", "not_interested"];
  const f = (label, key, type, req) =>
    '<div class="field"><label>' + label + (req ? " *" : "") + '</label><input id="lf-' + key + '" type="' + (type || "text") + '" value="' + esc(r ? r[key] || "" : "") + '"></div>';
  openModal(modalHead(r ? "Edit Lead" : "New Lead") +
    f("Name", "name", "text", 1) +
    '<div class="field-row">' + f("Phone", "phone") + f("Email", "email") + '</div>' +
    '<div class="field-row">' + f("Company", "company") + f("Contact Person", "contact_person") + '</div>' +
    '<div class="field"><label>Source</label><select id="lf-source">' + sources.map(s => '<option value="' + s + '" ' + (r && r.source === s ? "selected" : "") + '>' + s + '</option>').join("") + '</select></div>' +
    '<div class="field"><label>Status</label><select id="lf-status">' + statuses.map(s => '<option value="' + s + '" ' + (r && r.status === s ? "selected" : "") + '>' + s + '</option>').join("") + '</select></div>' +
    '<div class="field"><label>Lead Type</label><select id="lf-lead_type"><option value="end_user" ' + (r && r.lead_type === "end_user" ? "selected" : "") + '>End User</option><option value="business" ' + (r && r.lead_type === "business" ? "selected" : "") + '>Business</option></select></div>' +
    '<div class="field-row">' + f("Device Type", "device_type") + f("Brand", "device_brand") + '</div>' +
    f("Device Model", "device_model") +
    f("Requirement", "requirement") +
    f("Address", "address") +
    '<div class="field"><label>Est. Value (₹)</label><input id="lf-estimated_value" type="number" step="0.01" value="' + (r ? r.estimated_value || 0 : 0) + '"></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="lf-save">' + (r ? "Save" : "Create") + '</button></div>');
  document.getElementById("lf-save").onclick = () => saveLead(r ? r.id : null);
}
async function saveLead(id) {
  const g = k => document.getElementById("lf-" + k).value.trim();
  if (!g("name")) { toast("Name is required", "err"); return; }
  try {
    if (id) {
      await exec("UPDATE leads SET name=?, phone=?, email=?, company=?, contact_person=?, source=?, status=?, lead_type=?, device_type=?, device_brand=?, device_model=?, requirement=?, address=?, estimated_value=?, updated_at=? WHERE id=?",
        [g("name"), g("phone"), g("email"), g("company"), g("contact_person"), g("source"), g("status"), g("lead_type"), g("device_type"), g("device_brand"), g("device_model"), g("requirement"), g("address"), parseFloat(g("estimated_value")) || 0, nowStr(), id]);
      await exec("INSERT INTO lead_activities (lead_id, activity_type, note, created_by, created_at) VALUES (?,?,?,?,?)", [id, "edited", "Lead updated via web", SESSION.user.id, nowStr()]);
      toast("Lead updated", "ok");
    } else {
      const num = await nextNumber("LD", "leads", "lead_number");
      await exec("INSERT INTO leads (uuid, lead_number, source, status, lead_type, name, phone, email, company, contact_person, device_type, device_brand, device_model, requirement, address, estimated_value, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')",
        [uuid(), num, g("source"), g("status"), g("lead_type"), g("name"), g("phone"), g("email"), g("company"), g("contact_person"), g("device_type"), g("device_brand"), g("device_model"), g("requirement"), g("address"), parseFloat(g("estimated_value")) || 0, SESSION.user.id, nowStr(), nowStr()]);
      toast("Lead created", "ok");
    }
    closeModal(); navigate("leads");
  } catch (e) { toast(e.message, "err"); }
}
function leadFollowupForm(id) {
  openModal(modalHead("📅 Follow-up") +
    '<div class="field"><label>Next Follow-up Date</label><input id="lfp-date" type="datetime-local" value="' + new Date().toISOString().slice(0, 16) + '"></div>' +
    '<div class="field"><label>Status</label><select id="lfp-status"><option value="followup">Follow-up</option><option value="contacted">Contacted</option><option value="quotation_sent">Quote Sent</option><option value="negotiation">Negotiation</option><option value="not_interested">Not Interested</option></select></div>' +
    '<div class="field"><label>Note *</label><textarea id="lfp-note" placeholder="Follow-up details..."></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="openLead(' + id + ')">Back</button><button class="btn primary" id="lfp-save">Save</button></div>');
  document.getElementById("lfp-save").onclick = async () => {
    const note = document.getElementById("lfp-note").value.trim();
    const date = document.getElementById("lfp-date").value;
    const status = document.getElementById("lfp-status").value;
    if (!note) { toast("Note is required", "err"); return; }
    try {
      await exec("UPDATE leads SET next_followup=?, followup_count=followup_count+1, last_contacted=?, last_followup_comment=?, status=?, updated_at=? WHERE id=?",
        [date ? date.replace("T", " ") + ":00" : null, nowStr(), note, status, nowStr(), id]);
      await exec("INSERT INTO lead_activities (lead_id, activity_type, note, followup_date, created_by, created_at) VALUES (?,?,?,?,?,?)",
        [id, "followup", note, date ? date.replace("T", " ") + ":00" : null, SESSION.user.id, nowStr()]);
      toast("Follow-up saved", "ok"); closeModal(); navigate("leads");
    } catch (e) { toast(e.message, "err"); }
  };
}
async function leadConvert(id) {
  confirmBox("Convert this lead to a customer? This will create a new customer record.", async () => {
    try {
      const lead = (window._leads || []).find(x => x.id === id);
      const code = await nextNumber("CUST", "customers", "customer_code");
      await batch([
        { sql: "INSERT INTO customers (uuid, customer_code, name, phone_primary, email, company, address, balance, total_visits, is_active, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,0,0,1,?,?,?, 'pending')",
          args: [uuid(), code, lead.name, lead.phone, lead.email, lead.company, lead.address, SESSION.user.id, nowStr(), nowStr()] },
        { sql: "UPDATE leads SET converted_to_customer=1, status='converted', updated_at=? WHERE id=?", args: [nowStr(), id] },
        { sql: "INSERT INTO lead_activities (lead_id, activity_type, note, created_by, created_at) VALUES (?,?,?,?,?)",
          args: [id, "converted", "Converted to customer " + code, SESSION.user.id, nowStr()] }
      ]);
      toast("Lead converted to customer " + code, "ok"); closeModal(); navigate("leads");
    } catch (e) { toast(e.message, "err"); }
  });
}

/* ========================= BILLING (POS + SALES REGISTER) ========================= */
let _billTab = "pos", _cart = [], _cartCustomer = null, _cartTicket = null;
async function viewBilling() {
  const c = document.getElementById("content");
  if (_billTab === "pos") { await renderPOS(); return; }
  if (_billTab === "register") { await renderSalesRegister(); return; }
  let html = '<div class="filter-row">' +
    [["pos", "🛒 POS"], ["register", "📋 Sales Register"]].map(t =>
      '<button class="fchip ' + (_billTab === t[0] ? "active" : "") + '" onclick="_billTab=\'' + t[0] + '\';viewBilling()">' + t[1] + '</button>').join("") + '</div>';
  c.innerHTML = html;
}
async function renderPOS() {
  const c = document.getElementById("content");
  let html = '<div class="filter-row">' +
    [["pos", "🛒 POS"], ["register", "📋 Sales Register"]].map(t =>
      '<button class="fchip ' + (_billTab === t[0] ? "active" : "") + '" onclick="_billTab=\'' + t[0] + '\';viewBilling()">' + t[1] + '</button>').join("") + '</div>';
  html += '<div class="card"><h3>🛒 Point of Sale</h3>';
  html += '<div class="field"><label>Customer</label><div style="display:flex;gap:6px"><input id="pos-cust-search" placeholder="Search customer..." oninput="posSearchCust(this.value)" style="flex:1"><button class="btn sm" onclick="posSearchCust(document.getElementById(\'pos-cust-search\').value)">🔍</button></div><div id="pos-cust-results"></div>';
  if (_cartCustomer) html += '<div style="margin-top:4px;font-size:12px;color:var(--green)">✅ ' + esc(_cartCustomer.name) + ' <span onclick="_cartCustomer=null;renderPOS()" style="cursor:pointer;color:var(--red)">✕</span></div>';
  html += '</div>';
  html += '<div class="field"><label>Search Product</label><div style="display:flex;gap:6px"><input id="pos-prod-search" placeholder="Search product..." oninput="posSearchProd(this.value)" style="flex:1"><button class="btn sm" onclick="posSearchProd(document.getElementById(\'pos-prod-search\').value)">🔍</button></div><div id="pos-prod-results"></div></div>';
  html += '<div class="section-label">Cart (' + _cart.length + ' items)</div>';
  if (_cart.length) {
    html += '<table style="width:100%;font-size:12px;border-collapse:collapse"><tr style="background:var(--bg)"><th style="text-align:left;padding:6px">Item</th><th style="padding:6px">Qty</th><th style="padding:6px">Rate</th><th style="padding:6px">Total</th><th style="padding:6px"></th></tr>';
    _cart.forEach((item, i) => {
      html += '<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px">' + esc(item.name) + '</td><td style="text-align:center;padding:6px">' + item.qty + '</td><td style="text-align:right;padding:6px">' + fmtMoney(item.rate) + '</td><td style="text-align:right;padding:6px;font-weight:700">' + fmtMoney(item.qty * item.rate) + '</td><td style="text-align:center"><button style="border:none;background:none;color:var(--red);cursor:pointer" onclick="_cart.splice(' + i + ',1);renderPOS()">✕</button></td></tr>';
    });
    html += '</table>';
  } else html += '<div class="empty" style="padding:16px">Cart is empty</div>';
  const subtotal = _cart.reduce((s, i) => s + i.qty * i.rate, 0);
  html += '<div class="kv"><span class="k">Subtotal</span><span class="v">' + fmtMoney(subtotal) + '</span></div>';
  html += '<div class="kv"><span class="k" style="font-weight:700;font-size:15px">Total</span><span class="v" style="font-weight:800;font-size:15px">' + fmtMoney(subtotal) + '</span></div>';
  html += '<div class="field-row"><div class="field"><label>Discount (₹)</label><input id="pos-disc" type="number" step="0.01" value="0" oninput="posUpdateTotal()"></div>' +
    '<div class="field"><label>Pay Mode</label><select id="pos-paymode"><option>cash</option><option>upi</option><option>card</option><option>netbanking</option></select></div></div>';
  html += '<div class="field"><label>Paid Amount (₹)</label><input id="pos-paid" type="number" step="0.01" value="' + subtotal + '"></div>';
  html += '<button class="btn primary block" id="pos-save" onclick="posSave()" ' + (!_cart.length ? 'disabled' : '') + '>💾 Save & Print</button>';
  html += '</div>';
  c.innerHTML = html;
  posUpdateTotal();
}
async function posSearchCust(q) {
  if (!q || q.length < 1) { document.getElementById("pos-cust-results").innerHTML = ""; return; }
  const rows = await q("SELECT id, name, phone_primary FROM customers WHERE (is_active = 1 OR is_active IS NULL) AND (name LIKE ? OR phone_primary LIKE ?) ORDER BY name LIMIT 10", ["%" + q + "%", "%" + q + "%"]);
  document.getElementById("pos-cust-results").innerHTML = rows.map(r =>
    '<div class="list-item" style="padding:6px 0;border-bottom:1px solid var(--line)" onclick="_cartCustomer=' + JSON.stringify(r).replace(/"/g, '&quot;') + ';renderPOS()"><div class="li-icon" style="width:28px;height:28px;font-size:12px">👤</div><div class="li-main"><div class="li-title" style="font-size:13px">' + esc(r.name) + '</div><div class="li-sub">' + esc(r.phone_primary || "") + '</div></div></div>').join("");
}
async function posSearchProd(q) {
  if (!q || q.length < 1) { document.getElementById("pos-prod-results").innerHTML = ""; return; }
  const rows = await q("SELECT id, name, code, selling_price, current_stock FROM products WHERE is_active = 1 AND (name LIKE ? OR code LIKE ?) ORDER BY name LIMIT 10", ["%" + q + "%", "%" + q + "%"]);
  document.getElementById("pos-prod-results").innerHTML = rows.map(r =>
    '<div class="list-item" style="padding:6px 0;border-bottom:1px solid var(--line)" onclick=\'posAddItem(' + JSON.stringify(r).replace(/'/g, "\\'") + ')\'><div class="li-icon" style="width:28px;height:28px;font-size:12px">📦</div><div class="li-main"><div class="li-title" style="font-size:13px">' + esc(r.name) + ' (' + esc(r.code || "") + ')</div><div class="li-sub">' + fmtMoney(r.selling_price) + ' · Stock: ' + (r.current_stock || 0) + '</div></div></div>').join("");
}
function posAddItem(p) {
  const existing = _cart.find(c => c.id === p.id);
  if (existing) existing.qty++;
  else _cart.push({ id: p.id, name: p.name, code: p.code, rate: p.selling_price || 0, qty: 1, stock: p.current_stock || 0 });
  document.getElementById("pos-prod-search").value = "";
  document.getElementById("pos-prod-results").innerHTML = "";
  renderPOS();
}
function posUpdateTotal() {
  const subtotal = _cart.reduce((s, i) => s + i.qty * i.rate, 0);
  const disc = parseFloat(document.getElementById("pos-disc")?.value) || 0;
  const total = Math.max(0, subtotal - disc);
  const paid = document.getElementById("pos-paid");
  if (paid) paid.value = total;
}
async function posSave() {
  if (!_cart.length) { toast("Cart is empty", "err"); return; }
  const disc = parseFloat(document.getElementById("pos-disc")?.value) || 0;
  const paid = parseFloat(document.getElementById("pos-paid")?.value) || 0;
  const paymode = document.getElementById("pos-paymode").value;
  const subtotal = _cart.reduce((s, i) => s + i.qty * i.rate, 0);
  const total = Math.max(0, subtotal - disc);
  const custId = _cartCustomer ? _cartCustomer.id : null;
  try {
    const invNum = await nextNumber("INV", "invoices", "invoice_number");
    const invUuid = uuid();
    const stmts = [
      { sql: "INSERT INTO invoices (uuid, invoice_number, invoice_type, invoice_date, customer_id, subtotal, discount_amount, taxable_amount, grand_total, paid_amount, balance, payment_mode, payment_status, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')",
        args: [invUuid, invNum, "invoice", todayStr(), custId, subtotal, disc, subtotal - disc, total, paid, Math.max(0, total - paid), paymode, total - paid <= 0 ? "paid" : "partial", SESSION.user.id, nowStr(), nowStr()] }
    ];
    for (const item of _cart) {
      stmts.push({ sql: "INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_amount) VALUES ((SELECT id FROM invoices WHERE invoice_number=?),?,?,?,?,?)",
        args: [invNum, item.id, item.name, item.qty, item.rate, item.qty * item.rate] });
      stmts.push({ sql: "UPDATE products SET current_stock = current_stock - ? WHERE id = ?", args: [item.qty, item.id] });
      stmts.push({ sql: "INSERT INTO stock_movements (product_id, movement_type, quantity, unit_price, total_price, reference_type, notes, created_by, created_at, sync_status) VALUES (?, 'sale', ?, ?, ?, 'invoice', ?, ?, ?, 'pending')",
        args: [item.id, item.qty, item.rate, item.qty * item.rate, "POS sale " + invNum, SESSION.user.id, nowStr()] });
    }
    if (paid > 0 && custId) stmts.push({ sql: "UPDATE customers SET balance = balance - ? WHERE id = ?", args: [paid, custId] });
    if (paid > 0) stmts.push({ sql: "INSERT INTO payments (receipt_number, invoice_id, customer_id, amount, payment_mode, payment_date, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?,?,'pending')",
      args: [await nextNumber("RCP", "payments", "receipt_number"), null, custId, paid, paymode, todayStr(), SESSION.user.id, nowStr()] });
    await batch(stmts);
    toast("Invoice " + invNum + " saved", "ok");
    _cart = []; _cartCustomer = null;
    navigate("billing");
  } catch (e) { toast(e.message, "err"); }
}
async function renderSalesRegister() {
  const c = document.getElementById("content");
  const rows = await q("SELECT i.*, c.name cname FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id ORDER BY i.created_at DESC LIMIT 200");
  let html = '<div class="filter-row">' +
    [["pos", "🛒 POS"], ["register", "📋 Sales Register"]].map(t =>
      '<button class="fchip ' + (_billTab === t[0] ? "active" : "") + '" onclick="_billTab=\'' + t[0] + '\';viewBilling()">' + t[1] + '</button>').join("") + '</div>';
  const totalAll = rows.reduce((s, r) => s + (r.grand_total || 0), 0);
  const pendingAll = rows.reduce((s, r) => s + (r.balance || 0), 0);
  html += '<div class="stat-grid"><div class="stat"><div class="v">' + fmtMoney(totalAll) + '</div><div class="t">Total Sales</div></div><div class="stat red"><div class="v">' + fmtMoney(pendingAll) + '</div><div class="t">Outstanding</div></div><div class="stat green"><div class="v">' + rows.length + '</div><div class="t">Invoices</div></div></div>';
  html += rows.length ? rows.map(r =>
    '<div class="list-item" onclick="openInvoice(\'' + esc(r.invoice_number) + '\')"><div class="li-icon">📄</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.invoice_number) + " · " + esc(r.cname || "Walk-in") + '</div>' +
    '<div class="li-sub">' + fmtD(r.invoice_date) + " · " + fmtMoney(r.grand_total) + '</div></div>' +
    '<div class="li-right">' + badge(r.payment_status) + '<div class="amt">' + fmtMoney(r.balance) + '</div></div></div>').join("")
    : '<div class="empty"><div class="big">📋</div>No invoices yet</div>';
  c.innerHTML = html;
}
async function openInvoice(num) {
  const r = await q1("SELECT i.*, c.name cname FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.invoice_number = ? LIMIT 1", [num]);
  if (!r) { toast("Invoice not found", "err"); return; }
  const items = await q("SELECT * FROM invoice_items WHERE invoice_id = ?", [r.id]);
  const payments = await q("SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC", [r.id]);
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
  let html = modalHead("📄 " + esc(r.invoice_number) + " " + badge(r.payment_status)) +
    kv("Customer", esc(r.cname || "Walk-in")) +
    kv("Date", fmtD(r.invoice_date)) +
    kv("Type", esc(r.invoice_type || "invoice")) +
    kv("Subtotal", fmtMoney(r.subtotal)) +
    kv("Discount", fmtMoney(r.discount_amount)) +
    kv("Grand Total", "<b>" + fmtMoney(r.grand_total) + "</b>") +
    kv("Paid", fmtMoney(r.paid_amount)) +
    kv("Balance", "<b style='color:" + ((r.balance || 0) > 0 ? "var(--red)" : "var(--green)") + "'>" + fmtMoney(r.balance) + "</b>") +
    kv("Pay Mode", esc(r.payment_mode || "-"));
  if (items.length) {
    html += '<div class="section-label">Items</div>';
    items.forEach(it => { html += '<div class="kv"><span class="k">' + esc(it.description) + " × " + it.quantity + '</span><span class="v">' + fmtMoney(it.total_amount) + '</span></div>'; });
  }
  if (payments.length) {
    html += '<div class="section-label">Payments</div>';
    payments.forEach(p => { html += '<div class="kv"><span class="k">' + fmtD(p.payment_date) + " · " + esc(p.payment_mode || "") + '</span><span class="v">' + fmtMoney(p.amount) + '</span></div>'; });
  }
  if (r.balance > 0 && hasPerm("billing_create")) html += '<div class="modal-actions"><button class="btn green" onclick="invoicePayForm(' + r.id + ',' + r.balance + ')">💰 Add Payment</button></div>';
  openModal(html);
}
function invoicePayForm(invId, balance) {
  openModal(modalHead("💰 Add Payment") +
    '<div class="field"><label>Amount (₹)</label><input id="pay-amt" type="number" step="0.01" value="' + balance + '"></div>' +
    '<div class="field"><label>Mode</label><select id="pay-mode"><option>cash</option><option>upi</option><option>card</option><option>netbanking</option></select></div>' +
    '<div class="field"><label>Reference #</label><input id="pay-ref"></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn green" id="pay-save">Save</button></div>');
  document.getElementById("pay-save").onclick = async () => {
    const amt = parseFloat(document.getElementById("pay-amt").value) || 0;
    const mode = document.getElementById("pay-mode").value;
    const ref = document.getElementById("pay-ref").value.trim();
    if (amt <= 0) { toast("Enter amount", "err"); return; }
    try {
      const inv = await q1("SELECT * FROM invoices WHERE id = ?", [invId]);
      await batch([
        { sql: "UPDATE invoices SET paid_amount = paid_amount + ?, balance = balance - ?, payment_status = CASE WHEN balance - ? <= 0 THEN 'paid' ELSE 'partial' END, updated_at = ? WHERE id = ?",
          args: [amt, amt, amt, nowStr(), invId] },
        { sql: "INSERT INTO payments (receipt_number, invoice_id, customer_id, amount, payment_mode, reference_no, payment_date, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,'pending')",
          args: [await nextNumber("RCP", "payments", "receipt_number"), invId, inv.customer_id, amt, mode, ref, todayStr(), SESSION.user.id, nowStr()] }
      ]);
      if (inv.customer_id) await exec("UPDATE customers SET balance = balance - ? WHERE id = ?", [amt, inv.customer_id]);
      toast("Payment saved", "ok"); closeModal(); openInvoice(inv.invoice_number);
    } catch (e) { toast(e.message, "err"); }
  };
}

/* ========================= INVENTORY ========================= */
let _invSearch = "", _invCat = "";
const INV_CATEGORIES = ["laptop_parts", "desktop_parts", "printer_parts", "cables", "accessories", "tools", "consumables", "software", "other"];
async function viewInventory() {
  const c = document.getElementById("content");
  const rows = await q("SELECT * FROM products WHERE is_active = 1 ORDER BY name LIMIT 400");
  window._prods = rows;
  let html = '<input class="search-box" placeholder="🔍 Search name / code / brand / barcode" value="' + esc(_invSearch) + '" oninput="_invSearch=this.value.toLowerCase();renderInvList()">';
  html += '<div class="filter-row"><select class="fchip" onchange="_invCat=this.value;renderInvList()" style="flex:0 0 auto;padding:6px 10px;border-radius:999px;border:1.5px solid var(--line);font-size:12.5px"><option value="">All Categories</option>' + INV_CATEGORIES.map(c => '<option value="' + c + '">' + c + '</option>').join("") + '</select>' +
    '<button class="fchip" onclick="viewStockMovements()">📊 Stock Log</button></div>';
  html += '<div id="inv-list"></div>';
  if (hasPerm("inventory_create")) html += '<button class="fab" onclick="invForm()">＋</button>';
  c.innerHTML = html;
  renderInvList();
}
function renderInvList() {
  const rows = window._prods || [];
  let list = rows;
  if (_invCat) list = list.filter(r => r.category === _invCat);
  if (_invSearch) list = list.filter(r =>
    (r.name || "").toLowerCase().includes(_invSearch) || (r.code || "").toLowerCase().includes(_invSearch) ||
    (r.brand || "").toLowerCase().includes(_invSearch) || (r.barcode || "").includes(_invSearch));
  document.getElementById("inv-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="invDetail(' + r.id + ')"><div class="li-icon">📦</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.name) + ' <span style="color:var(--text2);font-weight:400">(' + esc(r.code || "") + ')</span></div>' +
    '<div class="li-sub">' + esc(r.category || "") + (r.brand ? " · " + esc(r.brand) : "") + ' · Min: ' + (r.min_stock || 0) + '</div></div>' +
    '<div class="li-right"><div class="amt" style="color:' + ((r.current_stock || 0) <= (r.min_stock || 0) ? "var(--red)" : "var(--green)") + '">' + (r.current_stock || 0) + ' ' + esc(r.unit || "pcs") + '</div>' +
    '<div class="amt">' + fmtMoney(r.selling_price) + '</div></div></div>').join("")
    : '<div class="empty"><div class="big">📦</div>No products found</div>';
}
async function invDetail(id) {
  const r = (window._prods || []).find(x => x.id === id);
  if (!r) return;
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
  let html = modalHead("📦 " + esc(r.name)) +
    kv("Code", esc(r.code || "-")) +
    kv("Category", esc(r.category || "-")) +
    kv("Brand", esc(r.brand || "-")) +
    kv("Model", esc(r.model || "-")) +
    kv("Barcode", esc(r.barcode || "-")) +
    kv("HSN", esc(r.hsn_code || "-")) +
    kv("Purchase Price", fmtMoney(r.purchase_price)) +
    kv("Selling Price", fmtMoney(r.selling_price)) +
    kv("MRP", fmtMoney(r.mrp)) +
    kv("GST %", (r.gst_percent || 0) + "%") +
    kv("Current Stock", '<b style="color:' + ((r.current_stock || 0) <= (r.min_stock || 0) ? "var(--red)" : "var(--green)") + '">' + (r.current_stock || 0) + " " + esc(r.unit || "pcs") + '</b>') +
    kv("Min Stock", r.min_stock || 0);
  if (hasPerm("inventory_edit")) html += '<div class="modal-actions"><button class="btn primary" onclick="invForm(' + r.id + ')">✏️ Edit</button></div>';
  openModal(html);
}
function invForm(id) {
  const r = id ? (window._prods || []).find(x => x.id === id) : null;
  const f = (label, key, type, req) =>
    '<div class="field"><label>' + label + (req ? " *" : "") + '</label><input id="invf-' + key + '" type="' + (type || "text") + '" value="' + esc(r ? r[key] || "" : "") + '"></div>';
  openModal(modalHead(r ? "Edit Product" : "New Product") +
    f("Code", "code") + f("Name", "name", "text", 1) +
    '<div class="field"><label>Category</label><select id="invf-category"><option value="">—</option>' + INV_CATEGORIES.map(c => '<option value="' + c + '" ' + (r && r.category === c ? "selected" : "") + '>' + c + '</option>').join("") + '</select></div>' +
    '<div class="field-row">' + f("Brand", "brand") + f("Model", "model") + '</div>' +
    '<div class="field-row">' + f("Barcode", "barcode") + f("HSN", "hsn_code") + '</div>' +
    '<div class="field-row">' + f("Purchase Price", "purchase_price", "number") + f("Selling Price", "selling_price", "number") + '</div>' +
    '<div class="field-row">' + f("MRP", "mrp", "number") + f("GST %", "gst_percent", "number") + '</div>' +
    '<div class="field-row">' + f("Current Stock", "current_stock", "number") + f("Min Stock", "min_stock", "number") + '</div>' +
    f("Unit", "unit") +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="invf-save">' + (r ? "Save" : "Create") + '</button></div>');
  document.getElementById("invf-save").onclick = () => saveInv(r ? r.id : null);
}
async function saveInv(id) {
  const g = k => document.getElementById("invf-" + k).value.trim();
  if (!g("name")) { toast("Name is required", "err"); return; }
  try {
    if (id) {
      const old = (window._prods || []).find(x => x.id === id);
      const newStock = parseFloat(g("current_stock")) || 0;
      const oldStock = old ? (old.current_stock || 0) : newStock;
      await exec("UPDATE products SET code=?, name=?, category=?, brand=?, model=?, barcode=?, hsn_code=?, purchase_price=?, selling_price=?, mrp=?, gst_percent=?, current_stock=?, min_stock=?, unit=?, updated_at=? WHERE id=?",
        [g("code"), g("name"), g("category"), g("brand"), g("model"), g("barcode"), g("hsn_code"), parseFloat(g("purchase_price")) || 0, parseFloat(g("selling_price")) || 0, parseFloat(g("mrp")) || 0, parseFloat(g("gst_percent")) || 0, newStock, parseFloat(g("min_stock")) || 0, g("unit") || "pcs", nowStr(), id]);
      if (newStock !== oldStock) {
        await exec("INSERT INTO stock_movements (product_id, movement_type, quantity, balance_before, balance_after, notes, created_by, created_at, sync_status) VALUES (?, 'adjustment', ?, ?, ?, 'Stock adjusted via web', ?, ?, 'pending')",
          [id, newStock - oldStock, oldStock, newStock, SESSION.user.id, nowStr()]);
      }
      toast("Product updated", "ok");
    } else {
      const code = g("code") || ("PRD-" + Date.now().toString(36).toUpperCase());
      const stock = parseFloat(g("current_stock")) || 0;
      await exec("INSERT INTO products (uuid, code, name, category, brand, model, barcode, hsn_code, purchase_price, selling_price, mrp, gst_percent, current_stock, min_stock, unit, is_active, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,'pending')",
        [uuid(), code, g("name"), g("category"), g("brand"), g("model"), g("barcode"), g("hsn_code"), parseFloat(g("purchase_price")) || 0, parseFloat(g("selling_price")) || 0, parseFloat(g("mrp")) || 0, parseFloat(g("gst_percent")) || 0, stock, parseFloat(g("min_stock")) || 0, g("unit") || "pcs", nowStr(), nowStr()]);
      if (stock > 0) {
        const prod = await q1("SELECT id FROM products WHERE code = ? LIMIT 1", [code]);
        if (prod) await exec("INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_by, created_at, sync_status) VALUES (?, 'purchase', ?, ?, 'Opening stock', ?, ?, 'pending')",
          [prod.id, stock, stock, SESSION.user.id, nowStr()]);
      }
      toast("Product created", "ok");
    }
    closeModal(); navigate("inventory");
  } catch (e) { toast(e.message, "err"); }
}
async function viewStockMovements() {
  const c = document.getElementById("content");
  const rows = await q("SELECT s.*, p.name pname FROM stock_movements s LEFT JOIN products p ON p.id = s.product_id ORDER BY s.created_at DESC LIMIT 200");
  let html = '<input class="search-box" placeholder="🔍 Filter by product..." id="sm-search" oninput="filterStockMovements()">';
  html += '<div id="sm-list"></div>';
  c.innerHTML = html;
  window._stockMovs = rows;
  filterStockMovements();
}
function filterStockMovements() {
  const q = (document.getElementById("sm-search")?.value || "").toLowerCase();
  const rows = (window._stockMovs || []).filter(r => !q || (r.pname || "").toLowerCase().includes(q));
  document.getElementById("sm-list").innerHTML = rows.length ? rows.map(r =>
    '<div class="list-item"><div class="li-icon" style="background:' + (r.movement_type === "sale" ? "var(--red-soft)" : "var(--green-soft)") + '">' + (r.movement_type === "sale" ? "📤" : "📥") + '</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.pname || "Product") + '</div>' +
    '<div class="li-sub">' + esc(r.movement_type || "") + " · Qty: " + (r.quantity || 0) + (r.notes ? " · " + esc(r.notes) : "") + '</div></div>' +
    '<div class="li-right"><div class="li-sub">' + fmtDT(r.created_at) + '</div><div class="amt">' + fmtMoney(r.total_price) + '</div></div></div>').join("")
    : '<div class="empty">No stock movements</div>';
}

/* ========================= ATTENDANCE ========================= */
let _attDate = todayStr(), _attEmpFilter = "";
async function viewAttendance() {
  const c = document.getElementById("content");
  const role = SESSION.user.role;
  const isAdmin = ["super_admin", "admin", "receptionist", "reception"].includes(role);
  if (isAdmin) { await renderAdminAttendance(); } else { await renderEmployeeAttendance(); }
}
async function renderEmployeeAttendance() {
  const uid = SESSION.user.id;
  const today = todayStr();
  const [todayRec, monthRecs] = await batch([
    { sql: "SELECT * FROM attendance WHERE user_id = ? AND date = ? LIMIT 1", args: [uid, today] },
    { sql: "SELECT * FROM attendance WHERE user_id = ? AND date >= ? ORDER BY date DESC LIMIT 31", args: [uid, today.slice(0, 7) + "-01"] }
  ]);
  const rec = todayRec[0];
  const punched = rec && rec.punch_in;
  const punchedOut = rec && rec.punch_out;
  let html = '<div class="card"><h3>⏰ Quick Punch</h3>';
  html += '<div style="text-align:center;padding:10px"><div style="font-size:14px;color:var(--text2)">Today: ' + fmtD(today) + '</div>';
  html += '<div style="font-size:20px;font-weight:700;margin:8px 0">' + (punched ? fmtDT(rec.punch_in).slice(11) : "Not punched in") + '</div>';
  if (punchedOut) html += '<div style="font-size:13px;color:var(--green)">Punched out: ' + fmtDT(rec.punch_out).slice(11) + ' · ' + (rec.total_hours || 0) + 'h</div>';
  html += '<div style="display:flex;gap:10px;justify-content:center;margin-top:12px">';
  if (!punched) html += '<button class="btn green" style="font-size:16px;padding:14px 28px" onclick="attPunchIn()">🟢 Punch In</button>';
  else if (!punchedOut) html += '<button class="btn red" style="font-size:16px;padding:14px 28px" onclick="attPunchOut()">🔴 Punch Out</button>';
  else html += '<span style="color:var(--green);font-weight:600">✅ Done for today</span>';
  html += '</div></div></div>';

  html += '<div class="card"><h3>My Attendance — ' + new Date().toLocaleString("en", { month: "long", year: "numeric" }) + '</h3>';
  html += monthRecs.length ? '<table style="width:100%;font-size:12px;border-collapse:collapse"><tr style="background:var(--bg)"><th style="text-align:left;padding:6px">Date</th><th style="padding:6px">In</th><th style="padding:6px">Out</th><th style="padding:6px">Type</th><th style="padding:6px">Hours</th><th style="padding:6px">Status</th></tr>' +
    monthRecs.map(r => '<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px">' + fmtD(r.date) + '</td><td style="text-align:center;padding:6px">' + (r.punch_in ? fmtDT(r.punch_in).slice(11) : "-") + '</td><td style="text-align:center;padding:6px">' + (r.punch_out ? fmtDT(r.punch_out).slice(11) : "-") + '</td><td style="text-align:center;padding:6px">' + esc((r.day_type || "").replace(/_/g, " ")) + '</td><td style="text-align:center;padding:6px;font-weight:700">' + (r.total_hours || 0) + '</td><td style="text-align:center;padding:6px">' + badge(r.status) + '</td></tr>').join("") + '</table>'
    : '<div class="empty" style="padding:16px">No records this month</div>';
  html += '</div>';
  document.getElementById("content").innerHTML = html;
}
async function attPunchIn() {
  try {
    await exec("INSERT INTO attendance (user_id, date, punch_in, status, created_at) VALUES (?, ?, ?, 'present', ?) ON CONFLICT(user_id, date) DO UPDATE SET punch_in = ?, status = 'present'",
      [SESSION.user.id, todayStr(), nowStr(), nowStr(), nowStr()]);
    toast("Punched in!", "ok"); navigate("attendance");
  } catch (e) {
    // SQLite UPSERT may not work — fallback
    try {
      const ex = await q1("SELECT id FROM attendance WHERE user_id = ? AND date = ? LIMIT 1", [SESSION.user.id, todayStr()]);
      if (ex) await exec("UPDATE attendance SET punch_in = ?, status = 'present' WHERE id = ?", [nowStr(), ex.id]);
      else await exec("INSERT INTO attendance (user_id, date, punch_in, status, created_at) VALUES (?,?,?,?,?)", [SESSION.user.id, todayStr(), nowStr(), "present", nowStr()]);
      toast("Punched in!", "ok"); navigate("attendance");
    } catch (e2) { toast(e2.message, "err"); }
  }
}
async function attPunchOut() {
  try {
    const rec = await q1("SELECT * FROM attendance WHERE user_id = ? AND date = ? LIMIT 1", [SESSION.user.id, todayStr()]);
    if (!rec || !rec.punch_in) { toast("No punch-in found", "err"); return; }
    const punchOut = nowStr();
    const inTime = new Date(rec.punch_in);
    const outTime = new Date(punchOut);
    const hours = Math.round((outTime - inTime) / 3600000 * 10) / 10;
    let dayType = "full_day", status = "present";
    if (hours >= 7) { dayType = "full_day"; status = "present"; }
    else if (hours >= 4) { dayType = "half_day"; status = "present"; }
    else { dayType = "leave"; status = "absent"; }
    await exec("UPDATE attendance SET punch_out=?, total_hours=?, day_type=?, status=? WHERE id=?", [punchOut, hours, dayType, status, rec.id]);
    toast("Punched out! " + hours + "h", "ok"); navigate("attendance");
  } catch (e) { toast(e.message, "err"); }
}
async function renderAdminAttendance() {
  const uid = SESSION.user.id;
  const date = _attDate || todayStr();
  const users = await q("SELECT id, full_name, role FROM users WHERE is_active = 1 ORDER BY full_name");
  const atts = await q("SELECT a.*, u.full_name uname FROM attendance a LEFT JOIN users u ON u.id = a.user_id WHERE a.date = ? ORDER BY u.full_name", [date]);
  const attMap = {};
  atts.forEach(a => { attMap[a.user_id] = a; });

  // Monthly summary
  const monthStart = date.slice(0, 7) + "-01";
  const monthAtts = await q("SELECT user_id, day_type, total_hours, status FROM attendance WHERE date >= ? AND date <= ?", [monthStart, date]);
  const summaryMap = {};
  users.forEach(u => { summaryMap[u.id] = { full_days: 0, half_days: 0, leaves: 0, total_hours: 0, count: 0 }; });
  monthAtts.forEach(a => {
    if (!summaryMap[a.user_id]) return;
    const s = summaryMap[a.user_id];
    s.count++;
    s.total_hours += a.total_hours || 0;
    if (a.day_type === "full_day") s.full_days++;
    else if (a.day_type === "half_day") s.half_days++;
    if (a.status === "leave" || a.status === "absent") s.leaves++;
  });

  // Working days = Mon-Sat in month up to date
  const d = new Date(date);
  let workDays = 0;
  for (let i = 1; i <= d.getDate(); i++) {
    const dt = new Date(d.getFullYear(), d.getMonth(), i);
    if (dt.getDay() !== 0) workDays++; // Mon-Sat
  }

  let html = '<div class="card"><h3>📅 Attendance — ' + date + '</h3>';
  html += '<div class="field-row"><div class="field" style="flex:2"><label>Select Date</label><input type="date" id="att-date" value="' + date + '" onchange="_attDate=this.value;renderAdminAttendance()"></div></div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse;min-width:500px"><tr style="background:var(--bg)"><th style="text-align:left;padding:6px">Employee</th><th style="padding:6px">Role</th><th style="padding:6px">In</th><th style="padding:6px">Out</th><th style="padding:6px">Hours</th><th style="padding:6px">Type</th><th style="padding:6px">Status</th><th style="padding:6px">Actions</th></tr>';
  users.forEach(u => {
    const a = attMap[u.id];
    html += '<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px;font-weight:600">' + esc(u.full_name || u.role) + '</td><td style="padding:6px;font-size:11px">' + esc(u.role) + '</td>';
    html += '<td style="text-align:center;padding:6px">' + (a && a.punch_in ? fmtDT(a.punch_in).slice(11) : "-") + '</td>';
    html += '<td style="text-align:center;padding:6px">' + (a && a.punch_out ? fmtDT(a.punch_out).slice(11) : "-") + '</td>';
    html += '<td style="text-align:center;padding:6px;font-weight:700">' + (a ? (a.total_hours || 0) : "-") + '</td>';
    html += '<td style="text-align:center;padding:6px">' + (a ? esc((a.day_type || "").replace(/_/g, " ")) : "-") + '</td>';
    html += '<td style="text-align:center;padding:6px">' + (a ? badge(a.status) : '-') + '</td>';
    html += '<td style="text-align:center;padding:6px;white-space:nowrap">';
    if (!a || !a.punch_in) html += '<button class="btn sm green" onclick="attAdminPunchIn(' + u.id + ')">Punch In</button> ';
    else if (!a.punch_out) html += '<button class="btn sm red" onclick="attAdminPunchOut(' + u.id + ')">Punch Out</button> ';
    else html += '<button class="btn sm" onclick="attEditForm(' + u.id + ')">Edit</button> ';
    html += '</td></tr>';
  });
  html += '</table></div></div>';

  // Monthly summary
  html += '<div class="card"><h3>📊 Monthly Summary</h3>';
  html += '<table style="width:100%;font-size:12px;border-collapse:collapse"><tr style="background:var(--bg)"><th style="text-align:left;padding:6px">Employee</th><th style="padding:6px">Full</th><th style="padding:6px">Half</th><th style="padding:6px">Leaves</th><th style="padding:6px">Hours</th><th style="padding:6px">Present %</th></tr>';
  users.forEach(u => {
    const s = summaryMap[u.id];
    const present = s.full_days + Math.floor(s.half_days / 2);
    const pct = workDays > 0 ? Math.round(present / workDays * 100) : 0;
    html += '<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px;font-weight:600">' + esc(u.full_name || u.role) + '</td><td style="text-align:center;padding:6px">' + s.full_days + '</td><td style="text-align:center;padding:6px">' + s.half_days + '</td><td style="text-align:center;padding:6px">' + s.leaves + '</td><td style="text-align:center;padding:6px">' + (s.count > 0 ? Math.round(s.total_hours / s.count * 10) / 10 : 0) + '</td><td style="text-align:center;padding:6px;font-weight:700">' + pct + '%</td></tr>';
  });
  html += '</table></div>';
  document.getElementById("content").innerHTML = html;
}
async function attAdminPunchIn(userId) {
  try {
    const date = _attDate || todayStr();
    const ex = await q1("SELECT id FROM attendance WHERE user_id = ? AND date = ? LIMIT 1", [userId, date]);
    const punchIn = date + " " + new Date().toTimeString().slice(0, 8);
    if (ex) await exec("UPDATE attendance SET punch_in=?, status='present' WHERE id=?", [punchIn, ex.id]);
    else await exec("INSERT INTO attendance (user_id, date, punch_in, status, created_at) VALUES (?,?,?,?,?)", [userId, date, punchIn, "present", nowStr()]);
    toast("Punched in", "ok"); renderAdminAttendance();
  } catch (e) { toast(e.message, "err"); }
}
async function attAdminPunchOut(userId) {
  try {
    const date = _attDate || todayStr();
    const rec = await q1("SELECT * FROM attendance WHERE user_id = ? AND date = ? LIMIT 1", [userId, date]);
    if (!rec || !rec.punch_in) { toast("No punch-in found", "err"); return; }
    const punchOut = date + " " + new Date().toTimeString().slice(0, 8);
    const inTime = new Date(rec.punch_in);
    const outTime = new Date(punchOut);
    const hours = Math.round((outTime - inTime) / 3600000 * 10) / 10;
    let dayType = "full_day", status = "present";
    if (hours >= 7) { dayType = "full_day"; status = "present"; }
    else if (hours >= 4) { dayType = "half_day"; status = "present"; }
    else { dayType = "leave"; status = "absent"; }
    await exec("UPDATE attendance SET punch_out=?, total_hours=?, day_type=?, status=? WHERE id=?", [punchOut, hours, dayType, status, rec.id]);
    toast("Punched out — " + hours + "h", "ok"); renderAdminAttendance();
  } catch (e) { toast(e.message, "err"); }
}
function attEditForm(userId) {
  const date = _attDate || todayStr();
  openModal(modalHead("✏️ Edit Attendance") +
    '<div class="field"><label>Punch In</label><input id="att-punchin" type="datetime-local" value="' + (date + "T09:00") + '"></div>' +
    '<div class="field"><label>Punch Out</label><input id="att-punchout" type="datetime-local" value="' + (date + "T18:00") + '"></div>' +
    '<div class="field"><label>Day Type</label><select id="att-daytype"><option value="full_day">Full Day</option><option value="half_day">Half Day</option><option value="leave">Leave</option></select></div>' +
    '<div class="field"><label>Status</label><select id="att-status"><option value="present">Present</option><option value="absent">Absent</option><option value="leave">Leave</option><option value="holiday">Holiday</option></select></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="att-save">Save</button></div>');
  document.getElementById("att-save").onclick = async () => {
    const punchIn = document.getElementById("att-punchin").value.replace("T", " ") + ":00";
    const punchOut = document.getElementById("att-punchout").value.replace("T", " ") + ":00";
    const dayType = document.getElementById("att-daytype").value;
    const status = document.getElementById("att-status").value;
    const inTime = new Date(punchIn), outTime = new Date(punchOut);
    const hours = Math.max(0, Math.round((outTime - inTime) / 3600000 * 10) / 10);
    try {
      const ex = await q1("SELECT id FROM attendance WHERE user_id = ? AND date = ? LIMIT 1", [userId, date]);
      if (ex) await exec("UPDATE attendance SET punch_in=?, punch_out=?, total_hours=?, day_type=?, status=? WHERE id=?", [punchIn, punchOut, hours, dayType, status, ex.id]);
      else await exec("INSERT INTO attendance (user_id, date, punch_in, punch_out, total_hours, day_type, status, created_at) VALUES (?,?,?,?,?,?,?,?)", [userId, date, punchIn, punchOut, hours, dayType, status, nowStr()]);
      toast("Attendance updated", "ok"); closeModal(); renderAdminAttendance();
    } catch (e) { toast(e.message, "err"); }
  };
}

/* ========================= RECYCLE BIN HELPERS ========================= */
const BIN_CHILD_MAP = {
  ticket_parts: "ticket_id", ticket_activities: "ticket_id", ticket_documents: "ticket_id",
  order_activities: "order_id", lead_activities: "lead_id", task_activities: "task_id",
  amc_visits: "contract_id", amc_complaints: "contract_id", customer_contacts: "customer_id",
  stock_movements: "product_id"
};
const BIN_TABLES = ["orders", "leads", "tickets", "tasks", "customers", "products", "amc_contracts", "invoices", "users", "amc_complaints"];
async function moveToBin(table, row, children) {
  const name = row.customer_name || row.name || row.order_number || row.lead_number || row.title || row.entry_number || String(row.id);
  const payload = { ...row, _children: children || {} };
  try {
    await exec("INSERT INTO recycle_bin (source_table, source_id, item_name, item_summary, json_data, deleted_by, deleted_at) VALUES (?,?,?,?,?,?,?)",
      [table, row.id, String(name), table + " deleted via web", JSON.stringify(payload), SESSION.user.id, nowStr()]);
    for (const ct of Object.keys(children || {})) await exec("DELETE FROM " + ct + " WHERE " + BIN_CHILD_MAP[ct] + " = ?", [row.id]);
    await exec("DELETE FROM " + table + " WHERE id = ?", [row.id]);
    return true;
  } catch (e) { toast(e.message, "err"); return false; }
}
async function binRestoreEntry(binId) {
  const e = await q1("SELECT * FROM recycle_bin WHERE id = ? LIMIT 1", [binId]);
  if (!e) return;
  let data;
  try { data = JSON.parse(e.json_data); } catch (err) { toast("Bad snapshot data", "err"); return; }
  if (!BIN_TABLES.includes(e.source_table)) { toast("Restore not supported for " + e.source_table, "err"); return; }
  const conflict = await q1("SELECT id FROM " + e.source_table + " WHERE id = ? LIMIT 1", [e.source_id]);
  if (conflict) { toast("A record with ID " + e.source_id + " already exists — removing bin entry", "err"); await exec("DELETE FROM recycle_bin WHERE id=?", [binId]); return; }
  const SKIP = ["id", "uuid", "created_at", "updated_at", "sync_status"];
  try {
    const cols = [], vals = [];
    Object.keys(data).forEach(k => {
      if (k === "_children" || k.startsWith("_") || SKIP.includes(k) || data[k] === undefined) return;
      cols.push(k); vals.push(data[k] === null ? null : data[k]);
    });
    if (!cols.length) { toast("Nothing to restore", "err"); return; }
    await exec("INSERT INTO " + e.source_table + " (" + cols.join(",") + ") VALUES (" + cols.map(() => "?").join(",") + ")", vals);
    const kids = data._children || {};
    for (const ct of Object.keys(kids)) {
      const fk = BIN_CHILD_MAP[ct];
      if (!fk) continue;
      for (const child of (kids[ct] || [])) {
        const ccols = [], cvals = [];
        Object.keys(child).forEach(k => {
          if (k === "_children" || k.startsWith("_") || SKIP.includes(k) || child[k] === undefined) return;
          ccols.push(k); cvals.push(child[k] === null ? null : child[k]);
        });
        // remap FK to the (re-created) parent id
        const fki = ccols.indexOf(fk);
        if (fki >= 0) cvals[fki] = e.source_id;
        if (!ccols.length) continue;
        await exec("INSERT INTO " + ct + " (" + ccols.join(",") + ") VALUES (" + ccols.map(() => "?").join(",") + ")", cvals);
      }
    }
    await exec("DELETE FROM recycle_bin WHERE id = ?", [binId]);
    toast("Restored " + (e.item_name || e.source_table), "ok");
    navigate(CURRENT_VIEW);
  } catch (err) { toast(err.message, "err"); }
}

/* ========================= ORDERS ========================= */
let _ordFilter = "active", _ordSearch = "";
const ORDER_FLOW = ["new", "confirmed", "assembling", "testing", "ready", "delivered"];
async function viewOrders() {
  const c = document.getElementById("content");
  const rows = await q("SELECT o.*, u.full_name assigned_name FROM orders o LEFT JOIN users u ON u.id=o.assigned_to ORDER BY o.created_at DESC LIMIT 300");
  window._orders = rows;
  let html = '<input class="search-box" placeholder="🔍 Search order # / customer / device" value="' + esc(_ordSearch) + '" oninput="_ordSearch=this.value.toLowerCase();renderOrdList()">';
  html += '<div class="filter-row">' + [["active", "Active"], ["all", "All"], ["new", "New"], ["assembling", "Assembling"], ["ready", "Ready"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]].map(ch =>
    '<button class="fchip ' + (_ordFilter === ch[0] ? "active" : "") + '" onclick="_ordFilter=\'' + ch[0] + '\';renderOrdList()">' + ch[1] + "</button>").join("") + "</div>";
  html += '<div id="ord-list"></div>';
  if (hasPerm("orders_create")) html += '<button class="fab" onclick="orderForm()">＋</button>';
  c.innerHTML = html;
  renderOrdList();
}
function renderOrdList() {
  const rows = window._orders || [];
  let list = rows;
  if (_ordFilter === "active") list = list.filter(r => !["delivered", "cancelled"].includes(r.status));
  else if (_ordFilter !== "all") list = list.filter(r => r.status === _ordFilter);
  if (_ordSearch) list = list.filter(r =>
    (r.order_number || "").toLowerCase().includes(_ordSearch) || (r.customer_name || "").toLowerCase().includes(_ordSearch) ||
    ((r.device_brand || "") + " " + (r.device_model || "")).toLowerCase().includes(_ordSearch));
  document.getElementById("ord-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="openOrder(' + r.id + ')"><div class="li-icon">🛠️</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.order_number) + " · " + esc(r.customer_name || "-") + "</div>" +
    '<div class="li-sub">' + esc([r.device_type, r.device_brand, r.device_model].filter(Boolean).join(" · ") || "-") + ' · Qty ' + (r.quantity || 1) + "</div></div>" +
    '<div class="li-right">' + badge(r.status) + '<div class="amt">' + fmtMoney(r.estimated_value) + "</div></div></div>").join("")
    : '<div class="empty"><div class="big">🛠️</div>No orders found</div>';
}
async function openOrder(id) {
  const r = (window._orders || []).find(x => x.id === id) || await q1("SELECT o.*, u.full_name assigned_name FROM orders o LEFT JOIN users u ON u.id=o.assigned_to WHERE o.id=? LIMIT 1", [id]);
  if (!r) return;
  const acts = await q("SELECT a.*, u.full_name uname FROM order_activities a LEFT JOIN users u ON u.id=a.created_by WHERE a.order_id=? ORDER BY a.created_at DESC LIMIT 30", [id]);
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  let specs = "";
  try { const s = typeof r.specifications === "string" && r.specifications ? JSON.parse(r.specifications) : (r.specifications || {}); specs = Object.entries(s).filter(e => e[1]).map(e => e[0] + ": " + e[1]).join(" · "); } catch (e) {}
  let html = modalHead("🛠️ " + esc(r.order_number) + " " + badge(r.status)) +
    kv("Customer", esc(r.customer_name || "-") + (r.phone ? ' <a href="tel:' + esc(r.phone) + '">📞</a>' : "")) +
    kv("Device", esc([r.device_type, r.device_brand, r.device_model].filter(Boolean).join(" · ") || "-")) +
    (specs ? kv("Specs", esc(specs)) : "") +
    kv("Requirement", esc(r.requirement || "-")) +
    kv("Qty × Est Value", (r.quantity || 1) + " × " + fmtMoney(r.estimated_value)) +
    kv("Advance Paid", fmtMoney(r.advance_paid)) +
    kv("Priority", esc(r.priority || "medium")) +
    kv("Assigned To", esc(r.assigned_name || "Unassigned")) +
    (r.expected_delivery ? kv("Expected Delivery", fmtD(r.expected_delivery)) : "") +
    (r.delivered_at ? kv("Delivered At", fmtDT(r.delivered_at)) : "") +
    kv("Source", esc(r.source || "walkin")) +
    kv("Created", fmtDT(r.created_at));
  html += '<div class="section-label">Activity</div><div class="timeline">' + (acts.length ? acts.map(a =>
    '<div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">' + esc((a.activity_type || "").replace(/_/g, " ")) +
    (a.old_status ? " · " + esc(a.old_status) + " → " + esc(a.new_status) : "") + '</div><div class="tl-sub">' + esc(a.note || "") + '</div>' +
    '<div class="tl-sub" style="opacity:.7">' + esc(a.uname || "") + " · " + fmtDT(a.created_at) + "</div></div></div>").join("") : '<div class="empty">No activity</div>') + "</div>";
  const btns = [];
  const open = !["delivered", "cancelled"].includes(r.status);
  if (open && hasPerm("orders_edit")) btns.push('<button class="btn primary" onclick="orderStatusForm(' + r.id + ')">🔄 Update Status</button>');
  if (open && hasPerm("orders_edit")) btns.push('<button class="btn" onclick="orderForm(' + r.id + ')">✏️ Edit</button>');
  if (open && hasPerm("orders_delete")) btns.push('<button class="btn red" onclick="orderDelete(' + r.id + ')">🗑️ Delete</button>');
  if (btns.length) html += '<div class="modal-actions" style="flex-wrap:wrap">' + btns.join("") + "</div>";
  openModal(html);
}
function orderStatusForm(id) {
  const r = (window._orders || []).find(x => x.id === id);
  if (!r) return;
  const idx = ORDER_FLOW.indexOf(r.status);
  const nexts = idx >= 0 ? ORDER_FLOW.slice(idx + 1) : [];
  if (r.status !== "cancelled") nexts.push("cancelled");
  if (!nexts.length) { toast("Order is already finished", "err"); return; }
  openModal(modalHead("Update Status · " + esc(r.order_number)) +
    '<div class="field"><label>New Status</label><select id="os-status">' + nexts.map(s => "<option>" + s + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Note *</label><textarea id="os-note" placeholder="Reason / details..."></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="openOrder(' + r.id + ')">Back</button><button class="btn primary" id="os-save">Save</button></div>');
  document.getElementById("os-save").onclick = async () => {
    const ns = document.getElementById("os-status").value;
    const note = document.getElementById("os-note").value.trim();
    if (!note) { toast("Note is required", "err"); return; }
    try {
      await batch([
        { sql: "UPDATE orders SET status=?, delivered_at=CASE WHEN ?='delivered' THEN ? ELSE delivered_at END, updated_at=? WHERE id=?", args: [ns, ns, nowStr(), nowStr(), id] },
        { sql: "INSERT INTO order_activities (order_id, activity_type, old_status, new_status, note, created_by, created_at) VALUES (?,?,?,?,?,?,?)", args: [id, "status_change", r.status, ns, note, SESSION.user.id, nowStr()] }
      ]);
      toast("Status updated", "ok"); closeModal(); navigate("orders");
    } catch (e) { toast(e.message, "err"); }
  };
}
async function orderForm(id) {
  const r = id ? ((window._orders || []).find(x => x.id === id) || await q1("SELECT * FROM orders WHERE id=?", [id])) : null;
  if (!window._allCusts) window._allCusts = await q("SELECT id, name, phone_primary FROM customers WHERE is_active = 1 OR is_active IS NULL ORDER BY name LIMIT 1000");
  let specs = {};
  try { specs = typeof r?.specifications === "string" && r.specifications ? JSON.parse(r.specifications) : (r?.specifications || {}); } catch (e) {}
  const f = (label, key, val, type, req) =>
    '<div class="field"><label>' + label + (req ? " *" : "") + '</label><input id="of-' + key + '" type="' + (type || "text") + '" value="' + esc(val || "") + '"></div>';
  openModal(modalHead(r ? "Edit Order" : "New Order") +
    (r ? "" : '<div class="field"><label>Customer</label><select id="of-cust"><option value="">— Walk-in —</option>' +
      window._allCusts.map(cu => '<option value="' + cu.id + '">' + esc(cu.name) + (cu.phone_primary ? " · " + esc(cu.phone_primary) : "") + "</option>").join("") + "</select></div>") +
    f("Customer Name *", "customer_name", r ? r.customer_name : "", "text", 1) +
    '<div class="field-row">' + f("Phone", "phone", r?.phone) + f("Email", "email", r?.email) + "</div>" +
    f("Address", "address", r?.address) +
    '<div class="field-row">' + f("Device Type", "device_type", r?.device_type || "desktop") + f("Brand", "device_brand", r?.device_brand) + "</div>" +
    f("Model", "device_model", r?.device_model) +
    '<div class="field-row">' + f("CPU", "cpu", specs.cpu) + f("RAM", "ram", specs.ram) + "</div>" +
    '<div class="field-row">' + f("Storage", "storage", specs.storage) + f("GPU", "gpu", specs.gpu) + "</div>" +
    '<div class="field-row">' + f("Screen", "screen", specs.screen) + f("Condition", "condition", specs.condition) + "</div>" +
    f("Requirement", "requirement", r?.requirement) +
    '<div class="field-row">' + f("Est. Value (₹)", "estimated_value", r ? r.estimated_value : 0, "number") + f("Advance (₹)", "advance_paid", r ? r.advance_paid : 0, "number") + "</div>" +
    '<div class="field-row">' + f("Quantity", "quantity", r ? r.quantity : 1, "number") + f("Expected Delivery", "expected_delivery", r?.expected_delivery ? String(r.expected_delivery).slice(0, 10) : "", "date") + "</div>" +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="of-save">' + (r ? "Save" : "Create Order") + "</button></div>");
  document.getElementById("of-save").onclick = () => saveOrder(r ? r.id : null);
}
async function saveOrder(id) {
  const g = k => { const el = document.getElementById("of-" + k); return el ? el.value.trim() : ""; };
  let custId = g("cust") ? parseInt(g("cust"), 10) : null;
  const cname = custId ? ((window._allCusts.find(c => c.id === custId) || {}).name || g("customer_name")) : g("customer_name");
  if (!cname) { toast("Customer name required", "err"); return; }
  const specs = {};
  ["cpu", "ram", "storage", "gpu", "screen", "condition"].forEach(k => { if (g(k)) specs[k] = g(k); });
  const phone = custId ? ((window._allCusts.find(c => c.id === custId) || {}).phone_primary || g("phone")) : g("phone");
  try {
    if (id) {
      await exec("UPDATE orders SET customer_name=?, phone=?, email=?, address=?, device_type=?, device_brand=?, device_model=?, specifications=?, requirement=?, estimated_value=?, advance_paid=?, quantity=?, expected_delivery=?, updated_at=? WHERE id=?",
        [cname, phone, g("email"), g("address"), g("device_type"), g("device_brand"), g("device_model"), JSON.stringify(specs), g("requirement"), parseFloat(g("estimated_value")) || 0, parseFloat(g("advance_paid")) || 0, parseInt(g("quantity"), 10) || 1, g("expected_delivery") || null, nowStr(), id]);
      toast("Order updated", "ok");
    } else {
      const num = await nextNumber("ORD", "orders", "order_number");
      await batch([
        { sql: "INSERT INTO orders (uuid, order_number, customer_id, customer_name, phone, email, address, device_type, device_brand, device_model, specifications, requirement, estimated_value, advance_paid, status, priority, quantity, source, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new','medium',?,'walkin',?,?,?, 'pending')",
          args: [uuid(), num, custId, cname, phone, g("email"), g("address"), g("device_type"), g("device_brand"), g("device_model"), JSON.stringify(specs), g("requirement"), parseFloat(g("estimated_value")) || 0, parseFloat(g("advance_paid")) || 0, parseInt(g("quantity"), 10) || 1, SESSION.user.id, nowStr(), nowStr()] },
        { sql: "INSERT INTO order_activities (order_id, activity_type, new_status, note, created_by, created_at) SELECT id, 'created', 'new', 'Order created via web', ?, ? FROM orders WHERE order_number=?", args: [SESSION.user.id, nowStr(), num] }
      ]);
      toast("Order " + num + " created", "ok");
    }
    closeModal(); navigate("orders");
  } catch (e) { toast(e.message, "err"); }
}
async function orderDelete(id) {
  const r = (window._orders || []).find(x => x.id === id);
  confirmBox("Delete order " + (r ? r.order_number : "") + "? It moves to Recycle Bin.", async () => {
    const acts = await q("SELECT * FROM order_activities WHERE order_id = ?", [id]);
    const ok = await moveToBin("orders", r, { order_activities: acts });
    if (ok) { toast("Moved to Recycle Bin", "ok"); navigate("orders"); }
  });
}

/* ========================= AMC ========================= */
let _amcSearch = "";
const AMC_FREQS = [["Monthly", 30], ["Quarterly", 90], ["Half Yearly", 180], ["Yearly", 365]];
async function viewAMC() {
  const c = document.getElementById("content");
  const rows = await q("SELECT a.*, c.name cname FROM amc_contracts a LEFT JOIN customers c ON c.id=a.customer_id ORDER BY a.created_at DESC LIMIT 300");
  window._contracts = rows;
  let html = '<input class="search-box" placeholder="🔍 Search contract # / customer" value="' + esc(_amcSearch) + '" oninput="_amcSearch=this.value.toLowerCase();renderAmcList()">';
  html += '<div id="amc-list"></div>';
  if (hasPerm("amc_create")) html += '<button class="fab" onclick="amcContractForm()">＋</button>';
  c.innerHTML = html;
  renderAmcList();
}
function renderAmcList() {
  const rows = window._contracts || [];
  const today = todayStr();
  let list = rows;
  if (_amcSearch) list = list.filter(r =>
    (r.contract_number || "").toLowerCase().includes(_amcSearch) || (r.cname || "").toLowerCase().includes(_amcSearch));
  document.getElementById("amc-list").innerHTML = list.length ? list.map(r => {
    const expired = r.end_date < today;
    const soon = !expired && r.end_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const st = r.status !== "active" ? badge("closed") : expired ? badge("cancelled") : soon ? badge("waiting_approval") : badge("active");
    return '<div class="list-item" onclick="openContract(' + r.id + ')"><div class="li-icon">📜</div>' +
      '<div class="li-main"><div class="li-title">' + esc(r.contract_number) + " · " + esc(r.cname || "-") + "</div>" +
      '<div class="li-sub">' + fmtD(r.start_date) + " → " + fmtD(r.end_date) + ' · ₹' + (r.visit_frequency_days || 30) + "d cycle</div></div>" +
      '<div class="li-right">' + st + '<div class="amt">' + fmtMoney(r.contract_value) + "</div></div></div>";
  }).join("") : '<div class="empty"><div class="big">📜</div>No contracts</div>';
}
async function openContract(id) {
  const r = (window._contracts || []).find(x => x.id === id) || await q1("SELECT a.*, c.name cname FROM amc_contracts a LEFT JOIN customers c ON c.id=a.customer_id WHERE a.id=? LIMIT 1", [id]);
  if (!r) return;
  const [visits, complaints] = await batch([
    { sql: "SELECT v.*, u.full_name ename FROM amc_visits v LEFT JOIN users u ON u.id=v.engineer_id WHERE v.contract_id=? ORDER BY v.visit_number", args: [id] },
    { sql: "SELECT cm.*, u.full_name aname FROM amc_complaints cm LEFT JOIN users u ON u.id=cm.assigned_to WHERE cm.contract_id=? ORDER BY cm.created_at DESC", args: [id] }
  ]);
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  let html = modalHead("📜 " + esc(r.contract_number) + " " + badge(r.status)) +
    kv("Customer", esc(r.cname || "-")) +
    kv("Machines Covered", esc(r.machines_covered || "-")) +
    kv("Period", fmtD(r.start_date) + " → " + fmtD(r.end_date)) +
    kv("Visit Cycle / SLA", (r.visit_frequency_days || 30) + " days / " + (r.sla_hours || 48) + "h") +
    kv("Visits", visits.filter(v => v.status === "completed").length + " done / " + (r.visits_count > 0 ? r.visits_count : "∞")) +
    kv("Value / Charges", fmtMoney(r.contract_value) + " / " + fmtMoney(r.service_charges)) +
    (r.included_services ? kv("Included", esc(r.included_services)) : "") +
    (r.excluded_services ? kv("Excluded", esc(r.excluded_services)) : "");
  html += '<div class="section-label">Visits</div>' + (visits.length ? visits.map(v =>
    '<div class="kv"><span class="k">#' + v.visit_number + " · " + fmtD(v.scheduled_date) + (v.ename ? " · 👨‍🔧 " + esc(v.ename) : "") + '</span><span class="v">' + badge(v.status) + "</span></div>").join("") : '<div class="empty">No visits scheduled</div>');
  html += '<div class="section-label">Complaints</div>' + (complaints.length ? complaints.map(cm =>
    '<div class="list-item" style="padding:7px 0" onclick="amcComplaintForm(' + cm.contract_id + "," + cm.id + ')"><div class="li-main"><div class="li-title" style="font-size:13px">' + esc(cm.description || "") + '</div><div class="li-sub">' + (cm.aname ? "👤 " + esc(cm.aname) + " · " : "") + fmtDT(cm.created_at) + '</div></div>' + badge(cm.status) + "</div>").join("") : '<div class="empty">No complaints</div>');
  const btns = [];
  if (hasPerm("amc_edit")) {
    btns.push('<button class="btn amber" onclick="amcScheduleVisit(' + r.id + ')">📅 Schedule Visit</button>');
    btns.push('<button class="btn" onclick="amcComplaintForm(' + r.id + ',null)">➕ Complaint</button>');
    btns.push('<button class="btn primary" onclick="amcContractForm(' + r.id + ')">✏️ Edit</button>');
  }
  if (hasPerm("amc_delete")) btns.push('<button class="btn red" onclick="amcDelete(' + r.id + ')">🗑️ Delete</button>');
  if (btns.length) html += '<div class="modal-actions" style="flex-wrap:wrap">' + btns.join("") + "</div>";
  openModal(html);
}
async function amcContractForm(id) {
  const r = id ? ((window._contracts || []).find(x => x.id === id) || await q1("SELECT * FROM amc_contracts WHERE id=?", [id])) : null;
  if (!window._allCusts) window._allCusts = await q("SELECT id, name, phone_primary FROM customers WHERE is_active = 1 OR is_active IS NULL ORDER BY name LIMIT 1000");
  const engineers = await q("SELECT id, full_name FROM users WHERE role='technician' AND is_active=1 ORDER BY full_name");
  const freqLabel = AMC_FREQS.find(f => f[1] === (r?.visit_frequency_days || 30));
  openModal(modalHead(r ? "Edit Contract" : "New AMC Contract") +
    '<div class="field"><label>Customer *</label><select id="ac-cust"><option value="">— Select —</option>' +
    window._allCusts.map(cu => '<option value="' + cu.id + '" ' + (r?.customer_id === cu.id ? "selected" : "") + ">" + esc(cu.name) + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Machines Covered</label><input id="ac-machines" value="' + esc(r?.machines_covered || "") + '" placeholder="e.g. 3 desktops, 2 printers"></div>' +
    '<div class="field-row"><div class="field"><label>Start Date *</label><input id="ac-start" type="date" value="' + (r ? String(r.start_date).slice(0, 10) : todayStr()) + '"></div>' +
    '<div class="field"><label>End Date *</label><input id="ac-end" type="date" value="' + (r ? String(r.end_date).slice(0, 10) : "") + '"></div></div>' +
    '<div class="field-row"><div class="field"><label>Visit Cycle</label><select id="ac-freq">' + AMC_FREQS.map(f => "<option value=\"" + f[1] + "\" " + (freqLabel && freqLabel[1] === f[1] ? "selected" : "") + ">" + f[0] + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>SLA Hours</label><input id="ac-sla" type="number" value="' + (r?.sla_hours ?? 48) + '"></div></div>' +
    '<div class="field-row"><div class="field"><label>Visits Count (0=∞)</label><input id="ac-count" type="number" value="' + (r?.visits_count ?? 0) + '"></div>' +
    '<div class="field"><label>Status</label><select id="ac-status"><option ' + (r?.status === "active" || !r ? "selected" : "") + '>active</option><option ' + (r?.status === "cancelled" ? "selected" : "") + '>cancelled</option></select></div></div>' +
    '<div class="field-row"><div class="field"><label>Contract Value (₹)</label><input id="ac-value" type="number" step="0.01" value="' + (r?.contract_value ?? 0) + '"></div>' +
    '<div class="field"><label>Service Charges (₹)</label><input id="ac-charges" type="number" step="0.01" value="' + (r?.service_charges ?? 0) + '"></div></div>' +
    '<div class="field"><label>Assigned Engineer</label><select id="ac-eng"><option value="">— None —</option>' + engineers.map(u => '<option value="' + u.id + '" ' + (r?.assigned_engineer === u.id ? "selected" : "") + ">" + esc(u.full_name) + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Included Services</label><textarea id="ac-incl">' + esc(r?.included_services || "") + "</textarea></div>" +
    '<div class="field"><label>Excluded Services</label><textarea id="ac-excl">' + esc(r?.excluded_services || "") + "</textarea></div>" +
    '<div class="field"><label>Notes</label><textarea id="ac-notes">' + esc(r?.notes || "") + "</textarea></div>" +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="ac-save">' + (r ? "Save" : "Create Contract") + "</button></div>");
  document.getElementById("ac-save").onclick = async () => {
    const g = k => document.getElementById("ac-" + k)?.value?.trim() || "";
    const custId = parseInt(g("cust"), 10);
    if (!custId) { toast("Select customer", "err"); return; }
    if (!g("start") || !g("end")) { toast("Start and end dates required", "err"); return; }
    try {
      const vals = [custId, g("machines"), g("start"), g("end"), parseInt(g("freq"), 10) || 30, parseInt(g("sla"), 10) || 48, parseInt(g("count"), 10) || 0, g("status") || "active", parseFloat(g("value")) || 0, parseFloat(g("charges")) || 0, g("eng") ? parseInt(g("eng"), 10) : null, g("incl"), g("excl"), g("notes")];
      if (r) {
        await exec("UPDATE amc_contracts SET customer_id=?, machines_covered=?, start_date=?, end_date=?, visit_frequency_days=?, sla_hours=?, visits_count=?, status=?, contract_value=?, service_charges=?, assigned_engineer=?, included_services=?, excluded_services=?, notes=?, updated_at=? WHERE id=?",
          [...vals, nowStr(), r.id]);
        toast("Contract updated", "ok");
      } else {
        const num = await nextNumber("CN", "amc_contracts", "contract_number");
        await exec("INSERT INTO amc_contracts (uuid, contract_number, customer_id, machines_covered, start_date, end_date, visit_frequency_days, sla_hours, visits_count, status, contract_value, service_charges, assigned_engineer, included_services, excluded_services, notes, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')",
          [uuid(), num, ...vals, SESSION.user.id, nowStr(), nowStr()]);
        toast("Contract " + num + " created", "ok");
      }
      closeModal(); navigate("amc");
    } catch (e) { toast(e.message, "err"); }
  };
}
async function amcScheduleVisit(cid) {
  const r = (window._contracts || []).find(x => x.id === cid);
  if (!r) return;
  const visits = await q("SELECT * FROM amc_visits WHERE contract_id=? ORDER BY visit_number DESC LIMIT 1", [cid]);
  const last = visits[0];
  if (r.visits_count > 0 && last && last.visit_number >= r.visits_count) { toast("Visit limit reached — sell a paid service", "err"); return; }
  const vnum = last ? last.visit_number + 1 : 1;
  const baseDate = last?.scheduled_date || r.start_date;
  let next = new Date(baseDate); next.setDate(next.getDate() + (last ? (r.visit_frequency_days || 30) : 0));
  const sched = next.toISOString().slice(0, 10);
  const engineers = await q("SELECT id, full_name FROM users WHERE role='technician' AND is_active=1 ORDER BY full_name");
  openModal(modalHead("📅 Schedule Visit #" + vnum) +
    '<div class="field"><label>Scheduled Date</label><input id="sv-date" type="date" value="' + sched + '"></div>' +
    '<div class="field"><label>Engineer</label><select id="sv-eng"><option value="">— None —</option>' + engineers.map(u => '<option value="' + u.id + '">' + esc(u.full_name) + "</option>").join("") + "</select></div>" +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn amber" id="sv-save">Schedule</button></div>');
  document.getElementById("sv-save").onclick = async () => {
    try {
      await exec("INSERT INTO amc_visits (contract_id, visit_number, scheduled_date, status, engineer_id, created_at) VALUES (?,?,?,?,?,?)",
        [cid, vnum, document.getElementById("sv-date").value, "scheduled", document.getElementById("sv-eng").value ? parseInt(document.getElementById("sv-eng").value, 10) : null, nowStr()]);
      toast("Visit scheduled", "ok"); closeModal(); navigate("amc");
    } catch (e) { toast(e.message, "err"); }
  };
}
function amcComplaintForm(cid, complaintId) {
  (async () => {
    let cm = null;
    if (complaintId) cm = await q1("SELECT * FROM amc_complaints WHERE id=? LIMIT 1", [complaintId]);
    const ro = cm && ["resolved", "closed"].includes(cm.status);
    const engineers = await q("SELECT id, full_name FROM users WHERE role='technician' AND is_active=1 ORDER BY full_name");
    openModal(modalHead(ro ? "Complaint (Read Only)" : complaintId ? "Edit Complaint" : "New Complaint") +
      '<div class="field"><label>Description *</label><textarea id="cp-desc" ' + (ro ? "disabled" : "") + ">" + esc(cm?.description || "") + "</textarea></div>" +
      '<div class="field"><label>Assigned To</label><select id="cp-assign" ' + (ro ? "disabled" : "") + '><option value="">— None —</option>' + engineers.map(u => '<option value="' + u.id + '" ' + (cm?.assigned_to === u.id ? "selected" : "") + ">" + esc(u.full_name) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Status</label><select id="cp-status" ' + (ro ? "disabled" : "") + ">" + ["in_progress", "open", "resolved", "closed"].map(s => "<option " + (cm?.status === s ? "selected" : "") + ">" + s + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Resolution Notes</label><textarea id="cp-res" ' + (ro ? "disabled" : "") + ">" + esc(cm?.resolution_notes || "") + "</textarea></div>" +
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">' + (ro ? "Close" : "Cancel") + "</button>" +
      (ro ? "" : '<button class="btn primary" id="cp-save">Save</button>') + "</div>");
    if (ro) return;
    document.getElementById("cp-save").onclick = async () => {
      const desc = document.getElementById("cp-desc").value.trim();
      const status = document.getElementById("cp-status").value;
      const assign = document.getElementById("cp-assign").value ? parseInt(document.getElementById("cp-assign").value, 10) : null;
      const resNotes = document.getElementById("cp-res").value.trim();
      if (!desc) { toast("Description required", "err"); return; }
      try {
        if (cm) {
          await exec("UPDATE amc_complaints SET description=?, status=?, assigned_to=?, resolution_notes=?, resolved_at=CASE WHEN ? IN ('resolved','closed') AND resolved_at IS NULL THEN ? ELSE resolved_at END, updated_at=? WHERE id=?",
            [desc, status, assign, resNotes, status, nowStr(), nowStr(), cm.id]);
          toast("Complaint updated", "ok");
        } else {
          await exec("INSERT INTO amc_complaints (contract_id, assigned_to, description, status, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            [cid, assign, desc, status || "in_progress", nowStr(), nowStr()]);
          toast("Complaint added", "ok");
        }
        closeModal(); navigate("amc");
      } catch (e) { toast(e.message, "err"); }
    };
  })();
}
async function amcDelete(id) {
  const r = (window._contracts || []).find(x => x.id === id);
  confirmBox("Delete contract " + (r ? r.contract_number : "") + "? Visits & complaints move to Recycle Bin with it.", async () => {
    const [visits, comps] = await batch([
      { sql: "SELECT * FROM amc_visits WHERE contract_id = ?", args: [id] },
      { sql: "SELECT * FROM amc_complaints WHERE contract_id = ?", args: [id] }
    ]);
    const ok = await moveToBin("amc_contracts", r, { amc_visits: visits, amc_complaints: comps });
    if (ok) { toast("Moved to Recycle Bin", "ok"); navigate("amc"); }
  });
}

/* ========================= OUTSOURCE ========================= */
let _outTab = "jobs";
async function viewOutsource() {
  const c = document.getElementById("content");
  let html = '<div class="filter-row">' + [["jobs", "📤 Jobs"], ["vendors", "🏭 Vendors"]].map(t =>
    '<button class="fchip ' + (_outTab === t[0] ? "active" : "") + '" onclick="_outTab=\'' + t[0] + '\';viewOutsource()">' + t[1] + "</button>").join("") + "</div>";
  if (_outTab === "jobs") {
    const rows = await q("SELECT t.*, v.name vendor_name FROM tickets t LEFT JOIN outsource_vendors v ON v.id=t.outsource_vendor_id WHERE t.is_outsourced = 1 ORDER BY t.outsource_sent_date DESC LIMIT 200");
    const today = todayStr();
    html += rows.length ? rows.map(r => {
      let st = "At Vendor";
      if (r.outsource_received_date) st = r.status === "unrepairable" ? "Completed" : "Received";
      else if (r.outsource_expected_return && r.outsource_expected_return < today) st = "Overdue";
      const stColor = { "At Vendor": "b-amber", "Received": "b-green", "Completed": "b-green", "Overdue": "b-red" }[st];
      html += '<div class="list-item" onclick="openJob(\'' + esc(r.ticket_number) + '\')"><div class="li-icon">📤</div>' +
        '<div class="li-main"><div class="li-title">' + esc(r.ticket_number) + " · " + esc(r.brand || "") + " " + esc(r.model || "") + '</div>' +
        '<div class="li-sub">🏭 ' + esc(r.vendor_name || "-") + " · sent " + fmtD(r.outsource_sent_date) + " · due " + fmtD(r.outsource_expected_return) + '</div></div>' +
        '<div class="li-right"><span class="badge ' + stColor + '">' + st + "</span>" + badge(r.status) +
        (!r.outsource_received_date && hasPerm("outsource_create") ? '<button class="btn sm green" style="margin-top:4px;width:100%" onclick="event.stopPropagation();outsReceiveForm(\'' + esc(r.ticket_number) + '\')">📥 Receive</button>' : "") + "</div></div>";
    }).join("") : '<div class="empty"><div class="big">📤</div>No outsourced jobs</div>';
    if (hasPerm("outsource_create")) html += '<button class="fab" onclick="outsMarkForm()">＋</button>';
  } else {
    const vendors = await q("SELECT * FROM outsource_vendors ORDER BY name LIMIT 200");
    window._vendors = vendors;
    html += vendors.length ? vendors.map(v =>
      '<div class="list-item" onclick="vendorForm(' + v.id + ')"><div class="li-icon">🏭</div>' +
      '<div class="li-main"><div class="li-title">' + esc(v.name) + '</div>' +
      '<div class="li-sub">' + esc(v.mobile || "-") + (v.specialization ? " · " + esc(v.specialization) : "") + '</div></div>' +
      '<div class="li-right"><div class="amt">' + (v.total_devices_sent || 0) + '</div><div class="li-sub">sent</div></div></div>').join("")
      : '<div class="empty"><div class="big">🏭</div>No vendors yet</div>';
    if (hasPerm("outsource_create")) html += '<button class="fab" onclick="vendorForm()">＋</button>';
  }
  c.innerHTML = html;
}
async function outsMarkForm(presetTicket) {
  const eligible = await q("SELECT t.ticket_number, t.brand, t.model, c.name cname FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id WHERE (t.is_outsourced = 0 OR t.is_outsourced IS NULL) AND t.status IN ('diagnosis','repairing','tech_accepted','assigned','unrepairable') ORDER BY t.created_at DESC LIMIT 100");
  const vendors = window._vendors || await q("SELECT id, name FROM outsource_vendors ORDER BY name");
  if (!eligible.length) { toast("No eligible tickets", "err"); return; }
  if (!vendors.length) { toast("Add a vendor first", "err"); _outTab = "vendors"; viewOutsource(); return; }
  openModal(modalHead("📤 Mark Outsourced") +
    '<div class="field"><label>Ticket *</label><select id="mo-ticket">' + eligible.map(t =>
      '<option value="' + esc(t.ticket_number) + '" ' + (presetTicket === t.ticket_number ? "selected" : "") + ">" + esc(t.ticket_number) + " · " + esc(t.cname || "-") + " · " + esc(t.brand || "") + " " + esc(t.model || "") + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Vendor *</label><select id="mo-vendor">' + vendors.map(v => '<option value="' + v.id + '">' + esc(v.name) + "</option>").join("") + "</select></div>" +
    '<div class="field-row"><div class="field"><label>Sent Date</label><input id="mo-sent" type="date" value="' + todayStr() + '"></div>' +
    '<div class="field"><label>Expected Return</label><input id="mo-due" type="date" value="' + new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) + '"></div></div>' +
    '<div class="field"><label>Outsourced Cost (₹)</label><input id="mo-cost" type="number" step="0.01" value="0"></div>' +
    '<div class="field"><label>Notes</label><textarea id="mo-notes"></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="mo-save">Send to Vendor</button></div>');
  document.getElementById("mo-save").onclick = async () => {
    const tnum = document.getElementById("mo-ticket").value;
    const vid = parseInt(document.getElementById("mo-vendor").value, 10);
    const cost = parseFloat(document.getElementById("mo-cost").value) || 0;
    const sent = document.getElementById("mo-sent").value;
    const due = document.getElementById("mo-due").value || null;
    const notes = document.getElementById("mo-notes").value.trim();
    try {
      const t = await q1("SELECT id, status FROM tickets WHERE ticket_number = ? LIMIT 1", [tnum]);
      const vname = ((await q1("SELECT name FROM outsource_vendors WHERE id=?", [vid])) || {}).name;
      await batch([
        { sql: "UPDATE tickets SET is_outsourced=1, outsource_vendor_id=?, outsource_sent_date=?, outsource_expected_return=?, outsourced_cost=?, status='outsourced', updated_at=? WHERE id=?", args: [vid, sent, due, cost, nowStr(), t.id] },
        { sql: "UPDATE outsource_vendors SET total_devices_sent = COALESCE(total_devices_sent,0)+1, updated_at=? WHERE id=?", args: [nowStr(), vid] },
        { sql: "INSERT INTO ticket_activities (ticket_id, activity_type, note, old_status, new_status, created_by, created_at) VALUES (?,?,?,?,?,?,?)", args: [t.id, "outsourced", (notes ? notes + "\n" : "") + "Outsourced to " + vname, t.status, "outsourced", SESSION.user.id, nowStr()] }
      ]);
      toast("Ticket outsourced", "ok"); closeModal(); viewOutsource();
    } catch (e) { toast(e.message, "err"); }
  };
}
async function outsReceiveForm(tnum) {
  const t = await q1("SELECT t.*, v.name vendor_name FROM tickets t LEFT JOIN outsource_vendors v ON v.id=t.outsource_vendor_id WHERE t.ticket_number=? LIMIT 1", [tnum]);
  if (!t) return;
  openModal(modalHead("📥 Receive from Vendor · " + esc(tnum)) +
    '<div class="field"><label>Condition *</label><select id="rc-cond"><option value="repaired">Repaired</option><option value="not_repaired">Not Repaired</option><option value="partial">Partial</option></select></div>' +
    '<div class="field"><label>Cost Charged by Vendor (₹)</label><input id="rc-cost" type="number" step="0.01" value="' + (t.outsourced_cost || 0) + '"></div>' +
    '<div class="field"><label>Notes</label><textarea id="rc-notes"></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn green" id="rc-save">Receive</button></div>');
  document.getElementById("rc-save").onclick = async () => {
    const cond = document.getElementById("rc-cond").value;
    const cost = parseFloat(document.getElementById("rc-cost").value) || 0;
    const notes = document.getElementById("rc-notes").value.trim();
    const newStatus = cond === "repaired" ? "qc" : cond === "not_repaired" ? "unrepairable" : "repairing";
    try {
      await batch([
        { sql: "UPDATE tickets SET outsource_received_date=?, outsourced_cost=?, status=?, updated_at=? WHERE id=?", args: [nowStr(), cost, newStatus, nowStr(), t.id] },
        { sql: "INSERT INTO ticket_activities (ticket_id, activity_type, note, old_status, new_status, created_by, created_at) VALUES (?,?,?,?,?,?,?)", args: [t.id, "outsourced_received", (notes ? notes + "\n" : "") + "Received from vendor. Condition: " + cond, t.status, newStatus, SESSION.user.id, nowStr()] }
      ]);
      toast("Received — status → " + newStatus, "ok"); closeModal(); viewOutsource();
    } catch (e) { toast(e.message, "err"); }
  };
}
function vendorForm(id) {
  const v = id ? (window._vendors || []).find(x => x.id === id) : null;
  const f = (label, key, req) =>
    '<div class="field"><label>' + label + (req ? " *" : "") + '</label><input id="vf-' + key + '" value="' + esc(v ? v[key] || "" : "") + '"></div>';
  openModal(modalHead(v ? "Edit Vendor" : "New Vendor") +
    f("Name *", "name", 1) + f("Mobile", "mobile") + f("GSTIN", "gstin") + f("Specialization", "specialization") +
    '<div class="field"><label>Address</label><textarea id="vf-address">' + esc(v ? v.address || "" : "") + "</textarea></div>" +
    '<div class="field"><label>Notes</label><textarea id="vf-notes">' + esc(v ? v.notes || "" : "") + "</textarea></div>" +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="vf-save">' + (v ? "Save" : "Create") + "</button></div>");
  document.getElementById("vf-save").onclick = async () => {
    const g = k => document.getElementById("vf-" + k).value.trim();
    if (!g("name")) { toast("Name required", "err"); return; }
    try {
      if (v) {
        await exec("UPDATE outsource_vendors SET name=?, mobile=?, gstin=?, specialization=?, address=?, notes=?, updated_at=? WHERE id=?",
          [g("name"), g("mobile"), g("gstin"), g("specialization"), g("address"), g("notes"), nowStr(), v.id]);
        toast("Vendor updated", "ok");
      } else {
        const dup = await q1("SELECT id FROM outsource_vendors WHERE name = ? LIMIT 1", [g("name")]);
        if (dup) { toast("Vendor name already exists", "err"); return; }
        await exec("INSERT INTO outsource_vendors (name, mobile, gstin, specialization, address, notes, total_devices_sent, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,0,?,?, 'pending')",
          [g("name"), g("mobile"), g("gstin"), g("specialization"), g("address"), g("notes"), nowStr(), nowStr()]);
        toast("Vendor created", "ok");
      }
      closeModal(); _outTab = "vendors"; navigate("outsource");
    } catch (e) { toast(e.message, "err"); }
  };
}

/* ========================= PICKUP ========================= */
let _pkFilter = "all";
async function viewPickups() {
  const c = document.getElementById("content");
  const role = SESSION.user.role;
  const scoped = ["delivery_exec", "pickup_exec", "technician"].includes(role) ? " WHERE p.assigned_to = " + SESSION.user.id : "";
  const rows = await q("SELECT p.*, c.name cname, u.full_name aname FROM pickups p LEFT JOIN customers c ON c.id=p.customer_id LEFT JOIN users u ON u.id=p.assigned_to" + scoped + " ORDER BY p.created_at DESC LIMIT 200");
  window._pickups = rows;
  let html = '<div class="filter-row">' + [["all", "All"], ["pending", "Pending"], ["picked", "Picked"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]].map(ch =>
    '<button class="fchip ' + (_pkFilter === ch[0] ? "active" : "") + '" onclick="_pkFilter=\'' + ch[0] + '\';renderPkList()">' + ch[1] + "</button>").join("") + "</div>";
  html += '<div id="pk-list"></div>';
  if (hasPerm("pickup_create")) html += '<button class="fab" onclick="pickupForm()">＋</button>';
  c.innerHTML = html;
  renderPkList();
}
function renderPkList() {
  const rows = window._pickups || [];
  let list = rows;
  if (_pkFilter !== "all") list = list.filter(r => r.status === _pkFilter);
  document.getElementById("pk-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="pickupForm(' + r.id + ')"><div class="li-icon">🛵</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.pickup_number) + " · " + esc(r.cname || "-") + "</div>" +
    '<div class="li-sub">' + fmtD(r.scheduled_date) + (r.is_onsite_repair ? " · 🔧 onsite" : "") + (r.aname ? " · 👤 " + esc(r.aname) : "") + "</div></div>" +
    '<div class="li-right">' + badge(r.status) + "</div></div>").join("")
    : '<div class="empty"><div class="big">🛵</div>No pickups</div>';
}
async function pickupForm(id) {
  const r = id ? ((window._pickups || []).find(x => x.id === id) || await q1("SELECT * FROM pickups WHERE id=?", [id])) : null;
  if (!window._allCusts) window._allCusts = await q("SELECT id, name, phone_primary FROM customers WHERE is_active = 1 OR is_active IS NULL ORDER BY name LIMIT 1000");
  const staff = await q("SELECT id, full_name FROM users WHERE is_active=1 ORDER BY full_name");
  const editable = !r || !["delivered", "cancelled"].includes(r.status);
  const dis = editable ? "" : "disabled";
  openModal(modalHead(r ? "Pickup " + esc(r.pickup_number) + " " + badge(r.status) : "New Pickup") +
    '<div class="field"><label>Customer *</label><select id="pk-cust" ' + dis + '><option value="">— Select —</option>' +
    window._allCusts.map(cu => '<option value="' + cu.id + '" ' + (r?.customer_id === cu.id ? "selected" : "") + ">" + esc(cu.name) + (cu.phone_primary ? " · " + esc(cu.phone_primary) : "") + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Pickup Address *</label><textarea id="pk-address" ' + dis + ">" + esc(r?.pickup_address || "") + "</textarea></div>" +
    '<div class="field-row"><div class="field"><label>Contact Phone</label><input id="pk-phone" ' + dis + ' value="' + esc(r?.contact_phone || "") + '"></div>' +
    '<div class="field"><label>Device Type</label><input id="pk-dev" ' + dis + ' value="' + esc(r?.device_type || "") + '"></div></div>' +
    '<div class="field-row"><div class="field"><label>Scheduled Date</label><input id="pk-sched" type="date" ' + dis + ' value="' + (r ? String(r.scheduled_date || "").slice(0, 10) : todayStr()) + '"></div>' +
    '<div class="field"><label>Due Date</label><input id="pk-due" type="date" ' + dis + ' value="' + (r ? String(r.due_date || "").slice(0, 10) : "") + '"></div></div>' +
    '<div class="field"><label>Assign To</label><select id="pk-assign" ' + dis + '><option value="">— Unassigned —</option>' + staff.map(s => '<option value="' + s.id + '" ' + (r?.assigned_to === s.id ? "selected" : "") + ">" + esc(s.full_name) + "</option>").join("") + "</select></div>" +
    '<div class="field"><label><input type="checkbox" id="pk-onsite" ' + dis + " " + (r?.is_onsite_repair ? "checked" : "") + '> Onsite repair at location</label></div>' +
    '<div id="pk-onsite-extra" style="display:' + (r?.is_onsite_repair ? "block" : "none") + '">' +
    '<div class="field"><label>Amount Collected Onsite (₹)</label><input id="pk-amt" type="number" step="0.01" ' + dis + ' value="' + (r?.onsite_amount_collected ?? 0) + '"></div>' +
    '<div class="field"><label>Issues Resolved</label><textarea id="pk-issues" ' + dis + ">" + esc(r?.onsite_issues_resolved || "") + "</textarea></div></div>" +
    '<div class="field"><label>Notes</label><textarea id="pk-notes" ' + dis + ">" + esc(r?.notes || r?.device_description || "") + "</textarea></div>" +
    (editable ? '<div class="modal-actions" style="flex-wrap:wrap"><button class="btn" onclick="closeModal()">Cancel</button>' +
      '<button class="btn green" id="pk-save">' + (r ? "Save" : "Create Pickup") + "</button>" +
      (r && r.status === "pending" ? '<button class="btn amber" id="pk-picked">✅ Mark Picked</button>' : "") +
      (r && r.status === "picked" ? '<button class="btn primary" id="pk-deliver">📦 Deliver</button>' : "") +
      (r && !["delivered", "cancelled"].includes(r.status) ? '<button class="btn red" id="pk-cancel">Cancel Pickup</button>' : "") +
      "</div>" : '<div class="modal-actions"><button class="btn" onclick="closeModal()">Close</button></div>'));
  const onsiteCb = document.getElementById("pk-onsite");
  if (onsiteCb) onsiteCb.onchange = () => document.getElementById("pk-onsite-extra").style.display = onsiteCb.checked ? "block" : "none";
  const saveBtn = document.getElementById("pk-save");
  if (saveBtn) saveBtn.onclick = async () => savePickup(r ? r.id : null);
  const pickedBtn = document.getElementById("pk-picked");
  if (pickedBtn) pickedBtn.onclick = async () => { try { await exec("UPDATE pickups SET status='picked', picked_date=?, updated_at=? WHERE id=?", [nowStr(), nowStr(), r.id]); toast("Marked picked", "ok"); closeModal(); navigate("pickup"); } catch (e) { toast(e.message, "err"); } };
  const delBtn = document.getElementById("pk-deliver");
  if (delBtn) delBtn.onclick = async () => { try { await exec("UPDATE pickups SET status='delivered', updated_at=? WHERE id=?", [nowStr(), r.id]); toast("Delivered", "ok"); closeModal(); navigate("pickup"); } catch (e) { toast(e.message, "err"); } };
  const cancelBtn = document.getElementById("pk-cancel");
  if (cancelBtn) cancelBtn.onclick = async () => { try { await exec("UPDATE pickups SET status='cancelled', updated_at=? WHERE id=?", [nowStr(), r.id]); toast("Cancelled", "ok"); closeModal(); navigate("pickup"); } catch (e) { toast(e.message, "err"); } };
}
async function savePickup(id) {
  const g = k => document.getElementById("pk-" + k)?.value?.trim() || "";
  const custId = parseInt(g("cust"), 10);
  if (!custId) { toast("Select customer", "err"); return; }
  if (!g("address")) { toast("Address required", "err"); return; }
  const onsite = document.getElementById("pk-onsite").checked;
  try {
    const vals = [custId, g("address"), g("phone"), g("dev"), g("sched") || null, g("due") || null, g("assign") ? parseInt(g("assign"), 10) : null, onsite ? 1 : 0, onsite ? parseFloat(g("amt")) || 0 : 0, onsite ? g("issues") : "", g("notes")];
    if (id) {
      await exec("UPDATE pickups SET customer_id=?, pickup_address=?, contact_phone=?, device_type=?, scheduled_date=?, due_date=?, assigned_to=?, is_onsite_repair=?, onsite_amount_collected=?, onsite_issues_resolved=?, notes=?, updated_at=? WHERE id=?",
        [...vals, nowStr(), id]);
      toast("Pickup updated", "ok");
    } else {
      const num = await nextNumber("PU", "pickups", "pickup_number");
      await exec("INSERT INTO pickups (uuid, pickup_number, customer_id, pickup_address, contact_phone, device_type, scheduled_date, due_date, assigned_to, is_onsite_repair, onsite_amount_collected, onsite_issues_resolved, notes, status, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?, 'pending')",
        [uuid(), num, ...vals, SESSION.user.id, nowStr(), nowStr()]);
      toast("Pickup " + num + " created", "ok");
    }
    closeModal(); navigate("pickup");
  } catch (e) { toast(e.message, "err"); }
}

/* ========================= DELIVERY ========================= */
let _dlFilter = "active";
async function viewDeliveries() {
  const c = document.getElementById("content");
  const rows = await q("SELECT d.*, c.name cname, t.ticket_number FROM deliveries d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN tickets t ON t.id=d.ticket_id ORDER BY d.created_at DESC LIMIT 200");
  window._deliveries = rows;
  let html = '<div class="filter-row">' + [["active", "Active"], ["all", "All"], ["pending", "Pending"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]].map(ch =>
    '<button class="fchip ' + (_dlFilter === ch[0] ? "active" : "") + '" onclick="_dlFilter=\'' + ch[0] + '\';renderDlList()">' + ch[1] + "</button>").join("") + "</div>";
  html += '<div id="dl-list"></div>';
  if (hasPerm("delivery_create")) html += '<button class="fab" onclick="deliveryForm()">＋</button>';
  c.innerHTML = html;
  renderDlList();
}
function renderDlList() {
  const rows = window._deliveries || [];
  let list = rows;
  if (_dlFilter === "active") list = list.filter(r => ["pending", "in_transit"].includes(r.status));
  else if (_dlFilter !== "all") list = list.filter(r => r.status === _dlFilter);
  document.getElementById("dl-list").innerHTML = list.length ? list.map(r =>
    '<div class="list-item" onclick="openDelivery(' + r.id + ')"><div class="li-icon">📦</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.delivery_number) + " · " + esc(r.cname || "-") + "</div>" +
    '<div class="li-sub">' + (r.ticket_number ? "🎫 " + esc(r.ticket_number) + " · " : "") + "🚚 " + esc(r.logistics_name || "hand delivery") + (r.otp_verified ? " · ✅ OTP verified" : "") + "</div></div>" +
    '<div class="li-right">' + badge(r.status) + "</div></div>").join("")
    : '<div class="empty"><div class="big">📦</div>No deliveries</div>';
}
async function openDelivery(id) {
  const r = (window._deliveries || []).find(x => x.id === id) || await q1("SELECT * FROM deliveries WHERE id=?", [id]);
  if (!r) return;
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  let html = modalHead("📦 " + esc(r.delivery_number) + " " + badge(r.status)) +
    kv("Customer", esc(r.cname || "-")) +
    (r.ticket_number ? kv("Ticket", esc(r.ticket_number)) : "") +
    kv("Address", esc(r.delivery_address || "-")) +
    kv("Contact", esc((r.contact_person || "") + " " + (r.contact_phone || ""))) +
    kv("Logistics", esc(r.logistics_name || "-")) +
    (r.lr_number ? kv("LR Number", esc(r.lr_number)) : "") +
    (r.package_details ? kv("Package", esc(r.package_details)) : "") +
    kv("OTP Verified", r.otp_verified ? "✅ Yes at " + fmtDT(r.otp_verified_at) : "❌ No") +
    (r.delivered_at ? kv("Delivered At", fmtDT(r.delivered_at)) : "") +
    (r.notes ? kv("Notes", esc(r.notes)) : "");
  if (["pending", "in_transit"].includes(r.status)) {
    html += '<div class="modal-actions" style="flex-wrap:wrap">';
    if (hasPerm("delivery_create")) {
      html += '<button class="btn green" onclick="dlVerifyOtp(' + r.id + ')">🔑 Verify OTP & Deliver</button>' +
        '<button class="btn" onclick="dlSetTransit(' + r.id + ')">🚚 In Transit</button>';
    }
    html += "</div>";
  }
  openModal(html);
}
async function dlSetTransit(id) {
  try { await exec("UPDATE deliveries SET status='in_transit', updated_at=? WHERE id=?", [nowStr(), id]); toast("In transit", "ok"); closeModal(); navigate("delivery"); } catch (e) { toast(e.message, "err"); }
}
async function dlVerifyOtp(id) {
  const r = await q1("SELECT d.*, t.id tid FROM deliveries d LEFT JOIN tickets t ON t.id=d.ticket_id WHERE d.id=? LIMIT 1", [id]);
  openModal(modalHead("🔑 Verify OTP · " + esc(r.delivery_number)) +
    '<p style="font-size:12px;color:var(--text2)">Ask the customer for the 6-digit OTP shared at dispatch.</p>' +
    '<div class="field"><label>OTP</label><input id="vo-otp" inputmode="numeric" maxlength="6" placeholder="- - - - - -" style="font-size:20px;letter-spacing:8px;text-align:center"></div>' +
    '<div class="field"><label>Delivery Notes</label><textarea id="vo-notes"></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn green" id="vo-save">Verify & Deliver</button></div>');
  document.getElementById("vo-save").onclick = async () => {
    const otp = document.getElementById("vo-otp").value.trim();
    const notes = document.getElementById("vo-notes").value.trim();
    if (otp !== String(r.otp_code || "")) { toast("Invalid OTP", "err"); return; }
    if (r.otp_verified) { toast("Already verified", "err"); return; }
    try {
      const stmts = [
        { sql: "UPDATE deliveries SET otp_verified=1, otp_verified_at=?, status='delivered', delivered_at=?, notes=CASE WHEN ? != '' THEN ? ELSE notes END, updated_at=? WHERE id=?", args: [nowStr(), nowStr(), notes, notes, nowStr(), r.id] }
      ];
      if (r.tid) stmts.push({ sql: "UPDATE tickets SET status='delivered', delivered_date=?, updated_at=? WHERE id=?", args: [nowStr(), nowStr(), r.tid] });
      await batch(stmts);
      toast("Delivered! Ticket closed.", "ok"); closeModal(); navigate("delivery");
    } catch (e) { toast(e.message, "err"); }
  };
}
async function deliveryForm() {
  const eligible = await q("SELECT t.id, t.ticket_number, t.delivery_address, c.name cname, c.id cid, c.phone_primary cphone FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id WHERE t.status IN ('completed','qc','delivery') ORDER BY t.updated_at DESC LIMIT 100");
  if (!eligible.length) { toast("No completed jobs ready for delivery", "err"); return; }
  openModal(modalHead("📦 New Delivery") +
    '<div class="field"><label>Job Ticket *</label><select id="df-ticket" onchange="dfFillCust(this.value)">' + eligible.map(t =>
      '<option value="' + t.id + '" data-cid="' + t.cid + '" data-cname="' + esc(t.cname || "") + '">' + esc(t.ticket_number) + " · " + esc(t.cname || "-") + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Delivery Address *</label><textarea id="df-address"></textarea></div>' +
    '<div class="field-row"><div class="field"><label>Contact Person</label><input id="df-person"></div>' +
    '<div class="field"><label>Contact Phone</label><input id="df-phone"></div></div>' +
    '<div class="field-row"><div class="field"><label>Logistics Name *</label><input id="df-logistics" placeholder="or hand delivery"></div>' +
    '<div class="field"><label>LR Number</label><input id="df-lr"></div></div>' +
    '<div class="field"><label>Package Details</label><input id="df-package" placeholder="e.g. 1 laptop + charger"></div>' +
    '<div class="field"><label>Notes</label><textarea id="df-notes"></textarea></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="df-save">Create Delivery</button></div>');
  window._dfEligible = eligible;
  setTimeout(() => dfFillCust(String(eligible[0].id)), 0);
  document.getElementById("df-save").onclick = async () => {
    const g = k => document.getElementById("df-" + k).value.trim();
    const tid = parseInt(g("ticket"), 10);
    const t = window._dfEligible.find(x => x.id === tid);
    if (!tid || !t) { toast("Select ticket", "err"); return; }
    if (!g("address")) { toast("Address required", "err"); return; }
    try {
      const num = await nextNumber("DLV", "deliveries", "delivery_number");
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await batch([
        { sql: "INSERT INTO deliveries (uuid, delivery_number, ticket_id, customer_id, delivery_address, contact_person, contact_phone, logistics_name, lr_number, package_details, notes, otp_code, status, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending',?,?,?, 'pending')",
          args: [uuid(), num, tid, t.cid, g("address"), g("person"), g("phone"), g("logistics") || "hand delivery", g("lr"), g("package"), g("notes"), otp, SESSION.user.id, nowStr(), nowStr()] },
        { sql: "UPDATE tickets SET status='delivery', updated_at=? WHERE id=?", args: [nowStr(), tid] }
      ]);
      openModal(modalHead("✅ Delivery Created") +
        '<p><b>' + esc(num) + '</b></p><div class="kv"><span class="k">Share this OTP with customer</span><span class="v" style="font-size:22px;font-weight:800;letter-spacing:6px">' + otp + "</span></div>" +
        '<div class="modal-actions"><button class="btn primary" onclick="closeModal();navigate(\'delivery\')">Done</button></div>');
    } catch (e) { toast(e.message, "err"); }
  };
}
function dfFillCust(tid) {
  const t = (window._dfEligible || []).find(x => String(x.id) === String(tid));
  if (!t) return;
  document.getElementById("df-address").value = t.delivery_address || "";
  document.getElementById("df-phone").value = t.cphone || "";
  document.getElementById("df-person").value = t.cname || "";
}

/* ========================= REPORTS ========================= */
let _repType = "sales", _repFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), _repTo = todayStr();
async function viewReports() {
  const c = document.getElementById("content");
  let html = '<div class="card" style="padding:10px"><div class="field-row">' +
    '<div class="field"><label>From</label><input type="date" id="rep-from" value="' + _repFrom + '" onchange="_repFrom=this.value;viewReports()"></div>' +
    '<div class="field"><label>To</label><input type="date" id="rep-to" value="' + _repTo + '" onchange="_repTo=this.value;viewReports()"></div></div>' +
    '<div class="filter-row">' + [["sales", "💰 Sales"], ["tech", "👨‍🔧 Technician"], ["customer", "👥 Customer"], ["amc", "📜 AMC"], ["lead", "🎯 Lead"], ["inventory", "📦 Inventory"]].map(t =>
      '<button class="fchip ' + (_repType === t[0] ? "active" : "") + '" onclick="_repType=\'' + t[0] + '\';viewReports()">' + t[1] + "</button>").join("") + "</div></div>";
  html += '<div id="rep-body">' + spinner() + "</div>";
  c.innerHTML = html;
  renderReport();
}
function repTable(headers, rows) {
  return '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:480px"><tr style="background:var(--bg)">' +
    headers.map(h => "<th style='padding:8px 6px;" + (headers.indexOf(h) === 0 ? "text-align:left;padding-left:12px" : "text-align:center") + "'>" + h + "</th>").join("") + "</tr>" +
    (rows.length ? rows.map(cells => "<tr style='border-bottom:1px solid var(--line)'>" + cells.map((cellval, ci) =>
      "<td style='" + (ci === 0 ? "text-align:left;padding-left:12px" : "text-align:center") + "padding:7px 6px'>" + cellval + "</td>").join("") + "</tr>").join("")
      : "<tr><td colspan='" + headers.length + "'><div class='empty'>No data for this range</div></td></tr>") + "</table></div>";
}
async function renderReport() {
  const body = document.getElementById("rep-body");
  const fr = _repFrom, to = _repTo;
  try {
    let html = "";
    if (_repType === "sales") {
      const rows = await q("SELECT i.invoice_number, i.invoice_date, i.grand_total, i.paid_amount, i.balance, i.payment_status, c.name cname FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.invoice_date BETWEEN ? AND ? AND i.invoice_type='invoice' ORDER BY i.invoice_date DESC", [fr, to]);
      const tg = rows.reduce((s, r) => s + (r.grand_total || 0), 0), tp = rows.reduce((s, r) => s + (r.paid_amount || 0), 0), tb = rows.reduce((s, r) => s + (r.balance || 0), 0);
      html += '<div class="stat-grid"><div class="stat"><div class="v">' + fmtMoney(tg) + '</div><div class="t">Total Sales</div></div><div class="stat green"><div class="v">' + fmtMoney(tp) + '</div><div class="t">Collected</div></div><div class="stat red"><div class="v">' + fmtMoney(tb) + '</div><div class="t">Outstanding</div></div></div>';
      html += repTable(["Invoice #", "Date", "Customer", "Total", "Paid", "Balance", "Status"],
        rows.map(r => [esc(r.invoice_number), fmtD(r.invoice_date), esc(r.cname || "-"), fmtMoney(r.grand_total), fmtMoney(r.paid_amount), fmtMoney(r.balance), badge(r.payment_status)]));
    } else if (_repType === "tech") {
      const techs = await q("SELECT id, full_name FROM users WHERE role='technician' AND is_active=1 ORDER BY full_name");
      const stats = await q("SELECT assigned_tech, COUNT(*) n, SUM(CASE WHEN status IN ('completed','closed','delivery') THEN 1 ELSE 0 END) done FROM tickets WHERE assigned_tech IS NOT NULL AND created_at BETWEEN ? AND ? GROUP BY assigned_tech", [fr + " 00:00:00", to + " 23:59:59"]);
      const m = {}; stats.forEach(s => m[s.assigned_tech] = s);
      html += repTable(["Technician", "Total Jobs", "Completed", "Pending", "% Done"],
        techs.map(t => { const s = m[t.id] || { n: 0, done: 0 }; return [esc(t.full_name), s.n, s.done, s.n - s.done, (s.n ? Math.round(s.done / s.n * 100) : 0) + "%"]; }));
    } else if (_repType === "customer") {
      const rows = await q("SELECT c.name, c.balance, (SELECT COUNT(*) FROM tickets t WHERE t.customer_id=c.id AND t.created_at BETWEEN ? AND ?) jobs, (SELECT COUNT(*) FROM invoices i WHERE i.customer_id=c.id AND i.invoice_date BETWEEN ? AND ?) inv, (SELECT COALESCE(SUM(i2.grand_total),0) FROM invoices i2 WHERE i2.customer_id=c.id AND i2.invoice_date BETWEEN ? AND ?) spent FROM customers c WHERE (c.is_active=1 OR c.is_active IS NULL) ORDER BY spent DESC LIMIT 100", [fr + " 00:00:00", to + " 23:59:59", fr, to, fr, to]);
      html += repTable(["Customer", "Jobs", "Invoices", "Spent", "Balance Due"],
        rows.map(r => [esc(r.name), r.jobs, r.inv, fmtMoney(r.spent), '<span style="color:' + ((r.balance || 0) > 0 ? "var(--red)" : "var(--green)") + '">' + fmtMoney(r.balance) + "</span>"]));
    } else if (_repType === "amc") {
      const rows = await q("SELECT a.contract_number, a.start_date, a.end_date, a.contract_value, a.status, c.name cname FROM amc_contracts a LEFT JOIN customers c ON c.id=a.customer_id WHERE a.start_date BETWEEN ? AND ? ORDER BY a.start_date DESC", [fr, to]);
      const today = todayStr();
      html += repTable(["Contract", "Customer", "Start", "End", "Value", "Status"],
        rows.map(r => [esc(r.contract_number), esc(r.cname || "-"), fmtD(r.start_date), fmtD(r.end_date), fmtMoney(r.contract_value), badge(r.status === "active" && r.end_date >= today ? "active" : "closed")]));
    } else if (_repType === "lead") {
      const rows = await q("SELECT l.lead_number, l.name, l.source, l.status, l.estimated_value, u.full_name aname, l.created_at FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE l.created_at BETWEEN ? AND ? ORDER BY l.created_at DESC", [fr + " 00:00:00", to + " 23:59:59"]);
      html += repTable(["Lead #", "Name", "Source", "Status", "Est. Value", "Assigned", "Created"],
        rows.map(r => [esc(r.lead_number), esc(r.name), esc(r.source), badge(r.status), fmtMoney(r.estimated_value), esc(r.aname || "-"), fmtD(r.created_at)]));
    } else if (_repType === "inventory") {
      const rows = await q("SELECT code, name, category, current_stock, min_stock, selling_price FROM products WHERE is_active=1 ORDER BY name");
      html += repTable(["Code", "Product", "Category", "Stock", "Min", "Price", "State"],
        rows.map(r => [esc(r.code || "-"), esc(r.name), esc(r.category || "-"), r.current_stock || 0, r.min_stock || 0, fmtMoney(r.selling_price),
          (r.current_stock || 0) <= (r.min_stock || 0) ? badge("cancelled").replace(">cancelled<", ">LOW<") : badge("completed").replace(">completed<", ">OK<")]));
    }
    body.innerHTML = html;
  } catch (e) { body.innerHTML = '<div class="empty">⚠️ ' + esc(e.message) + "</div>"; }
}

/* ========================= EMPLOYEES ========================= */
let _empShowDisabled = false;
const EMP_ROLES = ["admin", "receptionist", "technician", "accounts", "store", "delivery_exec", "pickup_exec", "amc_manager", "sales", "operations"];
function hashPassword(password) {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const salt = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  return salt + "$" + sha256hex(salt + password);
}
async function viewEmployees() {
  const c = document.getElementById("content");
  const rows = await q("SELECT id, username, full_name, display_name, phone, email, gender, role, is_active FROM users ORDER BY is_active DESC, full_name LIMIT 200");
  window._emps = rows;
  const list = rows.filter(r => _empShowDisabled || r.is_active);
  let html = '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px"><input type="checkbox" ' + (_empShowDisabled ? "checked" : "") + ' onchange="_empShowDisabled=this.checked;viewEmployees()"> Show disabled employees</label>';
  html += list.length ? list.map(r =>
    '<div class="list-item" onclick="employeeForm(' + r.id + ')"><div class="li-icon">' + (r.is_active ? "🧑‍💼" : "🚫") + "</div>" +
    '<div class="li-main"><div class="li-title">' + esc(r.full_name || r.username) + ' <span style="font-weight:400;color:var(--text2)">(@' + esc(r.username) + ')</span></div>' +
    '<div class="li-sub">' + esc((r.role || "").replace(/_/g, " ")) + (r.phone ? " · 📞 " + esc(r.phone) : "") + "</div></div>" +
    '<div class="li-right">' + (r.is_active ? badge("active").replace(">active<", ">Active<").replace("b-green", "b-green") : badge("cancelled").replace(">cancelled<", ">Disabled<")) + badge(r.role) + "</div></div>").join("")
    : '<div class="empty">No employees</div>';
  html += '<button class="fab" onclick="employeeForm()">＋</button>';
  c.innerHTML = html;
}
async function employeeForm(id) {
  const r = id ? ((window._emps || []).find(x => x.id === id)) : null;
  const isNew = !r;
  openModal(modalHead(isNew ? "New Employee" : "Edit Employee") +
    (isNew ? '<div class="field"><label>Username *</label><input id="ef-username" autocapitalize="none"></div>' +
      '<div class="field"><label>Password * (min 4 chars)</label><input id="ef-password" type="password"></div>'
      : '<div class="kv"><span class="k">Username</span><span class="v">@' + esc(r.username) + "</span></div>" +
        '<div class="field"><label>New Password (leave blank to keep)</label><input id="ef-newpassword" type="password"></div>') +
    '<div class="field"><label>Full Name *</label><input id="ef-fullname" value="' + esc(r ? r.full_name || "" : "") + '"></div>' +
    '<div class="field-row"><div class="field"><label>Display Name</label><input id="ef-displayname" value="' + esc(r ? r.display_name || "" : "") + '"></div>' +
    '<div class="field"><label>Phone</label><input id="ef-phone" value="' + esc(r ? r.phone || "" : "") + '"></div></div>' +
    '<div class="field-row"><div class="field"><label>Email</label><input id="ef-email" value="' + esc(r ? r.email || "" : "") + '"></div>' +
    '<div class="field"><label>Gender</label><select id="ef-gender"><option ' + (r?.gender === "Male" ? "selected" : "") + '>Male</option><option ' + (r?.gender === "Female" ? "selected" : "") + '>Female</option><option ' + (!r || r.gender === "Other" ? "selected" : "") + '>Other</option></select></div></div>' +
    '<div class="field-row"><div class="field"><label>Role *</label><select id="ef-role">' + EMP_ROLES.map(ro => "<option " + (r?.role === ro ? "selected" : "") + ">" + ro + "</option>").join("") + "</select></div>" +
    '<div class="field"><label>Status</label><select id="ef-active"><option value="1" ' + (!r || r.is_active ? "selected" : "") + ">Active</option><option value=\"0\" " + (r && !r.is_active ? "selected" : "") + ">Disabled</option></select></div></div>" +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="ef-save">' + (isNew ? "Create Employee" : "Save") + "</button></div>");
  document.getElementById("ef-save").onclick = async () => {
    const g = k => document.getElementById("ef-" + k)?.value?.trim() || "";
    const fullname = g("fullname");
    if (!fullname) { toast("Full name required", "err"); return; }
    try {
      if (isNew) {
        const username = g("username");
        if (!username) { toast("Username required", "err"); return; }
        const pwd = g("password");
        if (pwd.length < 4) { toast("Password min 4 chars", "err"); return; }
        const dup = await q1("SELECT id FROM users WHERE username = ? LIMIT 1", [username]);
        if (dup) { toast("Username already exists", "err"); return; }
        await exec("INSERT INTO users (username, password_hash, full_name, display_name, phone, email, gender, role, is_active, permissions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)",
          [username, hashPassword(pwd), fullname, g("displayname"), g("phone"), g("email"), g("gender"), g("role"), parseInt(g("active"), 10) || 0, nowStr(), nowStr()]);
        toast("Employee created", "ok");
      } else {
        const np = g("newpassword");
        if (np && np.length < 4) { toast("Password min 4 chars", "err"); return; }
        const stmts = [
          { sql: "UPDATE users SET full_name=?, display_name=?, phone=?, email=?, gender=?, role=?, is_active=? WHERE id=?", args: [fullname, g("displayname"), g("phone"), g("email"), g("gender"), g("role"), parseInt(g("active"), 10) || 0, r.id] }
        ];
        if (np) stmts.push({ sql: "UPDATE users SET password_hash=? WHERE id=?", args: [hashPassword(np), r.id] });
        await batch(stmts);
        toast("Employee updated", "ok");
      }
      closeModal(); navigate("employees");
    } catch (e) { toast(e.message, "err"); }
  };
}

/* ========================= SETTINGS ========================= */
const SETTING_FIELDS = [
  ["company", "Business Name"], ["company_address", "Address"], ["company_phone", "Phone"],
  ["company_email", "Email"], ["gstin", "GSTIN"], ["upi_id", "UPI ID"], ["upi_name", "UPI Name"]
];
async function viewSettings() {
  const c = document.getElementById("content");
  const rows = await q("SELECT key, value FROM settings");
  const map = {};
  rows.forEach(r => map[r.key] = r.value == null ? "" : String(r.value));
  let html = '<div class="card"><h3>⚙️ Business Details <span style="font-weight:400;font-size:11px">(used in prints)</span></h3>';
  SETTING_FIELDS.forEach(f => {
    html += '<div class="field"><label>' + f[1] + '</label><input id="set-' + f[0] + '" value="' + esc(map[f[0]] || "") + '"></div>';
  });
  html += '<button class="btn primary block" id="set-save">💾 Save Settings</button></div>';
  html += '<div class="card"><h3>Other Keys (' + Math.max(0, rows.length - SETTING_FIELDS.length) + ')</h3>' +
    rows.filter(r => !SETTING_FIELDS.some(f => f[0] === r.key)).slice(0, 40).map(r =>
      '<div class="kv"><span class="k">' + esc(r.key) + '</span><span class="v" style="max-width:60%;word-break:break-all">' + esc(String(r.value == null ? "" : r.value)).slice(0, 80) + "</span></div>").join("") + "</div>";
  c.innerHTML = html;
  document.getElementById("set-save").onclick = async () => {
    try {
      for (const f of SETTING_FIELDS) {
        const val = document.getElementById("set-" + f[0]).value.trim();
        const ex = await q1("SELECT id FROM settings WHERE key = ? LIMIT 1", [f[0]]);
        if (ex) await exec("UPDATE settings SET value=?, updated_at=? WHERE id=?", [val, nowStr(), ex.id]);
        else await exec("INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)", [f[0], val, nowStr()]);
      }
      toast("Settings saved", "ok");
    } catch (e) { toast(e.message, "err"); }
  };
}

/* ========================= RECYCLE BIN ========================= */
async function viewRecycleBin() {
  const c = document.getElementById("content");
  const rows = await q("SELECT * FROM recycle_bin ORDER BY deleted_at DESC LIMIT 200");
  window._binRows = rows;
  c.innerHTML = rows.length ? rows.map(r =>
    '<div class="list-item"><div class="li-icon">🗑️</div>' +
    '<div class="li-main"><div class="li-title">' + esc(r.item_name || "(unnamed)") + ' <span class="badge b-gray">' + esc(r.source_table) + "</span></div>" +
    '<div class="li-sub">deleted ' + fmtDT(r.deleted_at) + "</div></div>" +
    '<div class="li-right" style="white-space:nowrap">' +
    '<button class="btn sm green" onclick="confirmBox(\'Restore this item?\',()=>binRestoreEntry(' + r.id + '))">♻️ Restore</button> ' +
    '<button class="btn sm red" onclick="confirmBox(\'Permanently delete? Cannot undo.\',()=>binDeleteForever(' + r.id + '))">✕</button></div></div>').join("")
    : '<div class="empty"><div class="big">🗑️</div>Recycle bin is empty</div>';
}
async function binDeleteForever(binId) {
  try { await exec("DELETE FROM recycle_bin WHERE id=?", [binId]); toast("Deleted forever", "ok"); navigate("recycle_bin"); } catch (e) { toast(e.message, "err"); }
}

/* ========================= BOOT ========================= */
document.getElementById("login-pass").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
document.getElementById("login-user").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
(function boot() {
  try {
    const s = localStorage.getItem("crm_session");
    if (s) {
      SESSION = JSON.parse(s);
      SESSION.effectivePerms = { ...defaultRolePerms(SESSION.user.role), ...(SESSION.rolePerms || {}) };
      showApp();
    }
  } catch (e) {}
})();
