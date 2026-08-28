/* =====================================================================
   AP Repair CRM - Premium Web App (v3 - schema-verified)
   All queries use the EXACT column names from the live Turso schema:
     users:          id, uuid, username, password_hash, full_name, display_name,
                     email, phone, gender, role, is_active, can_login,
                     permissions (JSON), last_login, created_at, updated_at
     customers:      id, uuid, customer_code, name, company, gstin, address,
                     city, state, pincode, phone_primary, phone_secondary,
                     email, whatsapp, customer_type, notes, credit_limit,
                     balance, is_active, source, created_by, created_at, ...
     jobs:           id, uuid, job_number, customer_id, customer_name,
                     customer_phone, job_type, device_type, brand, model,
                      serial_number, imei, complaint, status, priority, assigned_tech,
                     assigned_tech_name, assigned_date, technician_diagnosis,
                     estimated_cost, total_charges, advance_paid, balance,
                     payment_status, completed_date, delivered_date, ...
     job_activities: id, job_id, activity_type, note, old_status, new_status,
                     created_by, created_by_name, created_at
     job_parts:      id, job_id, product_id, part_name, part_code, quantity,
                     unit_price, total_price, is_warranty, created_at
     leads:          id, uuid, lead_number, source, status, lead_type,
                     customer_id, name, company, phone, email, contact_person,
                     address, device_type, device_brand, device_model,
                     requirement, notes, estimated_value, assigned_to,
                     next_followup, followup_count, last_contacted,
                     converted_to_customer, converted_to_job, lost_reason,
                     created_by, created_at, updated_at
     orders:         id, uuid, order_number, customer_id, customer_name, phone,
                     email, address, device_type, device_brand, device_model,
                     specifications, requirement, estimated_value, advance_paid,
                     status, priority, assigned_to, expected_delivery,
                     delivered_at, notes, quantity, source, created_at
     amc_contracts:  id, uuid, contract_number, customer_id, machines_covered,
                     start_date, end_date, visit_frequency_days, sla_hours,
                     service_charges, contract_value, status, assigned_engineer,
                     notes, visits_count, created_at
     attendance:     id, user_id, user_name, date, punch_in, punch_out,
                     day_type, total_hours, status, notes, created_at
     products:       id, uuid, code, name, category, brand, model, unit,
                     purchase_price, selling_price, mrp, gst_percent, hsn_code,
                     min_stock, current_stock, barcode, location, is_part,
                     is_active, created_at, updated_at
     invoices:       id, uuid, invoice_number, invoice_type, invoice_date,
                     customer_id, job_id, subtotal, discount_amount,
                     tax_total, grand_total, paid_amount, balance, payment_mode,
                     payment_status, notes, created_at
     payments:       id, uuid, payment_number, invoice_id, customer_id, amount,
                     payment_mode, reference, notes, created_by, created_at
     pickups:        id, uuid, pickup_number, customer_id, assigned_to,
                     pickup_address, contact_phone, device_type, device_details,
                     scheduled_date, picked_at, status, notes, created_at
     deliveries:     id, uuid, delivery_number, job_id, customer_id,
                     assigned_to, delivery_address, contact_phone, delivered_at,
                     delivery_notes, status, notes, created_at
     settings:       id, key, value
     tasks:          id, uuid, task_number, title, description, assignee_id,
                     assignee_name, customer_id, due_date, status, priority,
                     task_type, ...
     expenses:       id, uuid, category, description, amount, payment_mode,
                     expense_date, created_by, created_at
     transactions:   id, uuid, transaction_type, category, amount, payment_mode,
                     transaction_date, created_by, created_at
     outsource_vendors: id, name, mobile, address, gstin, specialization,
                         notes, total_devices_sent, created_at
   ===================================================================== */

let TURSO_URL = "https://ren-reneuit.aws-ap-south-1.turso.io";
let TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODc5MjY3NjMsImlkIjoiMDFhMDQ4YmMtZjIwMS03ZjgxLTk3YWUtMTM5OTIxZTA0ZWU1Iiwia2lkIjoidXAxUkptTmREX1VfcVUwVTNxWUU5QUxsUnNxQTNZam5IQ2VUc0xKSGZLRSIsInJpZCI6IjM3NzMwZjUxLTlmNTYtNGQ2NS1iMTE0LTllNzZlZGJmMjNiZCJ9.gdD-bwAdtvtU5scXbCWvcu5DKbUQNPYrXPQ5J70ddZcu795GIQY3IbwGf5DHOlw86N3bWzRY9zLz4aUhPX5UAw";
const DESKTOP_ID = "W1";
try {
  const ovr = localStorage.getItem("turso_override");
  if (ovr) { const o = JSON.parse(ovr); if (o.url) TURSO_URL = o.url; if (o.token) TURSO_TOKEN = o.token; }
} catch (e) {}

/* ========================= DB LAYER ========================= */
function _encArg(v) {
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
    if (resp.type === "error") throw new Error((resp.error && resp.error.message) || "DB error");
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
async function q(sql, args) { try { return (await _pipeline([{ sql, args }]))[0] || []; } catch (e) { console.warn("q() failed:", sql, e); return []; } }
async function q1(sql, args) { try { const rows = await q(sql, args); return rows[0] || null; } catch (e) { console.warn("q1() failed:", sql, e); return null; } }
async function exec(sql, args) { try { await _pipeline([{ sql, args }]); return true; } catch (e) { console.warn("exec() failed:", sql, e); return false; } }
async function batch(stmts) { try { return await _pipeline(stmts); } catch (e) { console.warn("batch() failed:", e); return []; } }

async function nextNumber(tag, table, column) {
  try {
    const d = new Date();
    const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0");
    const prefix = DESKTOP_ID + "-" + tag + "-" + yymm + "-";
    const row = await q1("SELECT " + column + " AS n FROM " + table + " WHERE " + column + " LIKE ? ORDER BY " + column + " DESC LIMIT 1", [prefix + "%"]);
    let seq = 1;
    if (row && row.n) { const p = String(row.n).split("-"); seq = (parseInt(p[p.length - 1], 10) || 0) + 1; }
    return prefix + String(seq).padStart(4, "0");
  } catch (e) { return DESKTOP_ID + "-" + tag + "-" + Date.now(); }
}

/* ========================= UTILS ========================= */
function esc(s) { return s === null || s === undefined ? "" : String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c])); }
function nowStr() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
function todayStr() { return nowStr().slice(0, 10); }
function fmtDT(s) { if (!s) return "-"; return String(s).slice(0, 16).replace("T", " "); }
function fmtD(s) { if (!s) return "-"; return String(s).slice(0, 10); }
function fmtMoney(n) { return "\u20B9" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); })); }
function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function gv(id, v) { const e = document.getElementById(id); if (v !== undefined) { if (e) e.value = v; return; } return e ? e.value : ""; }

function sha256hex(str) {
  const msg = unescape(encodeURIComponent(str));
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
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
    if (!stored || stored.indexOf("$") < 0) return false;
    const i = stored.indexOf("$");
    return sha256hex(stored.slice(0, i) + password) === stored.slice(i + 1);
  } catch (e) { return false; }
}
function hashPassword(password) {
  const salt = uuid().replace(/-/g, "").slice(0, 16);
  return salt + "$" + sha256hex(salt + password);
}

/* ========================= UI HELPERS ========================= */
let toastTimer;
function toast(msg, type) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.className = "toast show " + (type || "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = "toast", 2600);
}
function openModal(html, size) {
  const m = document.getElementById("modal");
  m.className = "modal" + (size ? " " + size : "");
  m.innerHTML = html;
  document.getElementById("modal-backdrop").style.display = "flex";
  document.body.style.overflow = "hidden";
}
function closeModal() {
  document.getElementById("modal-backdrop").style.display = "none";
  document.body.style.overflow = "";
}
function modalHead(title) { return '<div class="modal-head"><h2>' + esc(title) + '</h2><button class="modal-x" onclick="closeModal()">\u2715</button></div>'; }
function modalBody(c) { return '<div class="modal-body">' + c + '</div>'; }
function modalActions(b) { return '<div class="modal-actions">' + b + '</div>'; }
function confirmBox(msg, onYes, title) {
  openModal(modalHead(title || "Confirm") + modalBody('<p style="padding:6px 0 4px">' + esc(msg) + '</p>') +
    modalActions('<button class="btn" onclick="closeModal()">Cancel</button><button class="btn red" id="confirm-yes">Confirm</button>'));
  document.getElementById("confirm-yes").onclick = () => { closeModal(); onYes(); };
}
function spinner() { return '<div class="spinner"></div>'; }
const STATUS_COLORS = {
  open: "b-blue", assigned: "b-cyan", diagnosis: "b-cyan", tech_accepted: "b-cyan",
  repairing: "b-amber", outsourced: "b-purple", qc: "b-purple",
  completed: "b-green", delivered: "b-green", closed: "b-gray", cancelled: "b-red",
  unrepairable: "b-red", pending: "b-amber", in_progress: "b-cyan", done: "b-green",
  confirmed: "b-cyan", assembling: "b-amber", testing: "b-purple", ready: "b-blue",
  picked: "b-cyan", in_transit: "b-amber", scheduled: "b-blue", resolved: "b-green",
  new: "b-blue", contacted: "b-cyan", followup: "b-amber", quotation_sent: "b-purple",
  negotiation: "b-amber", converted: "b-green", not_interested: "b-red", won: "b-green", lost: "b-red",
  active: "b-green", inactive: "b-gray", expired: "b-red",
  low: "b-green", medium: "b-amber", high: "b-red", urgent: "b-red",
  present: "b-green", absent: "b-red", leave: "b-amber", half_day: "b-amber"
};
function badge(s) { if (!s) return ""; return '<span class="badge ' + (STATUS_COLORS[s] || "b-gray") + '">' + esc(String(s).replace(/_/g, " ")) + "</span>"; }

/* ========================= AUTH / SESSION ========================= */
let SESSION = null;
function _basePerms() {
  return {
    dashboard_view: true, customers_view: true, customers_create: false, customers_edit: false, customers_delete: false,
    leads_view: true, leads_create: false, leads_edit: false, leads_delete: false, lead_convert: false,
    orders_view: true, orders_create: false, orders_edit: false, orders_delete: false,
    jobs_view: true, jobs_create: false, jobs_edit: false, jobs_delete: false, jobs_assign: false,
    tasks_view: true, tasks_create: false, tasks_edit: false, technician_view: true,
    outsource_view: true, outsource_create: false,
    pickup_view: true, pickup_create: false, pickup_edit: false,
    delivery_view: true, delivery_create: false,
    amc_view: true, amc_create: false, amc_edit: false, amc_delete: false,
    inventory_view: true, inventory_create: false, inventory_edit: false, inventory_delete: false,
    billing_view: true, billing_create: false, billing_edit: false, billing_delete: false,
    accounting_view: true, accounting_create: false,
    reports_view: true,
    users_view: false, user_manage: false,
    settings_view: false, settings_edit: false,
    attendance_view: true
  };
}
function defaultRolePerms(role) {
  const b = _basePerms();
  const roles = {
    admin: { customers_create: 1, customers_edit: 1, customers_delete: 1, leads_create: 1, leads_edit: 1, leads_delete: 1, lead_convert: 1, orders_create: 1, orders_edit: 1, orders_delete: 1, jobs_create: 1, jobs_edit: 1, jobs_delete: 1, jobs_assign: 1, tasks_create: 1, tasks_edit: 1, outsource_create: 1, pickup_create: 1, pickup_edit: 1, delivery_create: 1, amc_create: 1, amc_edit: 1, amc_delete: 1, inventory_create: 1, inventory_edit: 1, inventory_delete: 1, billing_create: 1, billing_edit: 1, billing_delete: 1, accounting_create: 1, users_view: 1, user_manage: 1, settings_view: 1, settings_edit: 1 },
    receptionist: { customers_create: 1, customers_edit: 1, leads_create: 1, leads_edit: 1, lead_convert: 1, orders_create: 1, orders_edit: 1, jobs_create: 1, jobs_edit: 1, pickup_create: 1, pickup_edit: 1, amc_create: 1, billing_create: 1, billing_edit: 1 },
    technician: { jobs_edit: 1, tasks_edit: 1, technician_view: 1 },
    accounts: { customers_edit: 1, orders_edit: 1, billing_create: 1, billing_edit: 1, accounting_create: 1 },
    store: { inventory_create: 1, inventory_edit: 1, inventory_delete: 1 },
    sales: { customers_create: 1, customers_edit: 1, leads_create: 1, leads_edit: 1, leads_delete: 1, lead_convert: 1, orders_create: 1, orders_edit: 1 },
    super_admin: { customers_create: 1, customers_edit: 1, customers_delete: 1, leads_create: 1, leads_edit: 1, leads_delete: 1, lead_convert: 1, orders_create: 1, orders_edit: 1, orders_delete: 1, jobs_create: 1, jobs_edit: 1, jobs_delete: 1, jobs_assign: 1, tasks_create: 1, tasks_edit: 1, outsource_create: 1, pickup_create: 1, pickup_edit: 1, delivery_create: 1, amc_create: 1, amc_edit: 1, amc_delete: 1, inventory_create: 1, inventory_edit: 1, inventory_delete: 1, billing_create: 1, billing_edit: 1, billing_delete: 1, accounting_create: 1, users_view: 1, user_manage: 1, settings_view: 1, settings_edit: 1 }
  };
  return Object.assign({}, b, roles[role] || {});
}
function hasPerm(p) {
  if (!SESSION) return false;
  if (SESSION.user.role === "super_admin") return true;
  return !!((SESSION.effectivePerms || {})[p]);
}
const NAV_ITEMS = [
  ["dashboard",   "\uD83D\uDCCA", "Dashboard",   "dashboard_view"],
  ["customers",   "\uD83D\uDC65", "Customers",   "customers_view"],
  ["leads",       "\uD83C\uDFAF", "Leads",       "leads_view"],
  ["orders",      "\uD83D\uDCE6", "Orders",      "orders_view"],
  ["jobs",        "\uD83D\uDD27", "Jobs",        "jobs_view"],
  ["tasks",       "\uD83D\uDCCB", "Tasks",       "tasks_view"],
  ["outsource",   "\uD83D\uDCE4", "Outsource",   "outsource_view"],
  ["amc",         "\uD83D\uDCC5", "AMC",         "amc_view"],
  ["pickup",      "\uD83D\uDE9E", "Pickup",      "pickup_view"],
  ["delivery",    "\uD83D\uDE9A", "Delivery",    "delivery_view"],
  ["inventory",   "\uD83D\uDCE6", "Inventory",   "inventory_view"],
  ["billing",     "\uD83D\uDCB0", "Billing",     "billing_view"],
  ["accounting",  "\uD83D\uDCB3", "Accounting",  "accounting_view"],
  ["attendance",  "\u23F0",        "Attendance",  "attendance_view"],
  ["reports",     "\uD83D\uDCC8", "Reports",     "reports_view"],
  ["recycle_bin", "\uD83D\uDDD1",  "Recycle Bin", "settings_view"],
  ["employees",   "\uD83D\uDC68", "Employees",   "settings_view"],
  ["settings",    "\u2699",        "Settings",    "settings_view"]
];

async function doLogin() {
  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value;
  const err = document.getElementById("login-err");
  const btn = document.getElementById("login-btn");
  if (!u || !p) { err.textContent = "Enter username and password"; return; }
  btn.disabled = true; btn.textContent = "Signing in..."; err.textContent = "";
  try {
    const user = await q1("SELECT * FROM users WHERE username = ? AND (is_active = 1 OR is_active IS NULL) LIMIT 1", [u]);
    if (!user || !verifyPassword(p, user.password_hash || "")) {
      err.textContent = "Invalid username or password";
      return;
    }
    let rolePerms = {};
    const rp = await q1("SELECT permissions FROM role_permissions WHERE role = ? LIMIT 1", [user.role]);
    if (rp && rp.permissions) {
      try { rolePerms = typeof rp.permissions === "string" ? JSON.parse(rp.permissions) : rp.permissions; } catch (e) {}
    }
    if (user.permissions && typeof user.permissions === "string") {
      try { user.permissions = JSON.parse(user.permissions); } catch (e) {}
    }
    const effectivePerms = Object.assign({}, defaultRolePerms(user.role), rolePerms);
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
function doLogout() { localStorage.removeItem("crm_session"); location.reload(); }
function toggleUserMenu() {
  const m = document.getElementById("user-menu");
  m.style.display = m.style.display === "none" ? "block" : "none";
}
document.addEventListener("click", e => {
  const m = document.getElementById("user-menu");
  if (m && m.style.display === "block" && !e.target.closest(".user-chip") && !e.target.closest(".user-menu")) m.style.display = "none";
});

/* ========================= APP SHELL ========================= */
let CURRENT_VIEW = "dashboard";
const VIEW_STATE = {};
function showApp() {
  document.getElementById("login-view").style.display = "none";
  document.getElementById("app-view").style.display = "flex";
  document.getElementById("user-name").textContent = SESSION.user.full_name || SESSION.user.username;
  document.getElementById("user-role").textContent = (SESSION.user.role || "user").replace(/_/g, " ");
  document.getElementById("user-avatar").textContent = initials(SESSION.user.full_name || SESSION.user.username);
  q1("SELECT value FROM settings WHERE key = 'company_name' LIMIT 1").then(r => {
    if (r && r.value) document.getElementById("menu-company").textContent = r.value;
  }).catch(() => {});
  renderNav();
  navigate("dashboard");
  installMaybeShow();
}
function renderNav() {
  const nav = document.getElementById("nav");
  const allowed = NAV_ITEMS.filter(it => hasPerm(it[3]));
  nav.innerHTML = allowed.map(([id, ico, label]) =>
    `<div class="chip ${CURRENT_VIEW === id ? "active" : ""}" data-view="${id}" onclick="navigate('${id}')"><span class="ico">${ico}</span><span>${esc(label)}</span></div>`
  ).join("");
}
async function navigate(view) {
  CURRENT_VIEW = view;
  VIEW_STATE[view] = VIEW_STATE[view] || {};
  renderNav();
  const el = document.getElementById("content");
  el.innerHTML = spinner();
  const fn = VIEWS[view];
  if (fn) {
    try { await fn(); }
    catch (e) {
      console.error("View error [" + view + "]:", e);
      el.innerHTML = '<div class="empty"><div class="big">!</div><div class="msg"><b>Error loading ' + esc(view) + '</b><br><span style="color:var(--danger);font-size:12px">' + esc(e.message || String(e)) + '</span><br><br><button class="btn primary" onclick="navigate(\'' + esc(view) + '\')">Retry</button></div></div>';
    }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function refreshAll() { navigate(CURRENT_VIEW); toast("Refreshed", "ok"); }
const VIEWS = {};

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.getElementById("login-view").style.display !== "none") doLogin();
});

try {
  const raw = localStorage.getItem("crm_session");
  if (raw) { SESSION = JSON.parse(raw); showApp(); }
} catch (e) {}

/* ========================= PWA INSTALL PROMPT ========================= */
let _installPromptEvent = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); _installPromptEvent = e; });
function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isInStandaloneMode() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
function installMaybeShow() {
  if (isInStandaloneMode()) return;
  if (localStorage.getItem("install_dismissed") === "1") return;
  const banner = document.getElementById("install-banner");
  const msg = document.getElementById("install-msg");
  const btn = document.getElementById("install-btn");
  if (_installPromptEvent) {
    msg.textContent = "Install for full-screen, offline access & a native app feel.";
    btn.textContent = "Install";
    btn.onclick = async () => {
      _installPromptEvent.prompt();
      const { outcome } = await _installPromptEvent.userChoice;
      if (outcome === "accepted") toast("Installing...", "ok");
      banner.style.display = "none";
    };
    banner.style.display = "flex";
  } else if (isIos()) {
    msg.textContent = "Tap Share \u2192 'Add to Home Screen' to install.";
    btn.textContent = "How";
    btn.onclick = () => openModal(modalHead("Install on iOS") + modalBody(
      '<ol style="line-height:2;padding-left:20px"><li>Tap the <b>Share</b> button at the bottom of Safari.</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b> in the top right.</li></ol>'
    ) + modalActions('<button class="btn primary" onclick="closeModal()">Got it</button>'));
    banner.style.display = "flex";
  }
}
function dismissInstall() {
  document.getElementById("install-banner").style.display = "none";
  localStorage.setItem("install_dismissed", "1");
}
window.addEventListener("appinstalled", () => { document.getElementById("install-banner").style.display = "none"; toast("App installed", "ok"); });

/* ========================= SERVER CONFIG OVERRIDE (tap logo 5x) ========================= */
let _logoTaps = 0;
document.addEventListener("DOMContentLoaded", () => {
  const logo = document.querySelector(".login-logo");
  if (logo) {
    logo.style.cursor = "pointer";
    logo.addEventListener("click", () => {
      _logoTaps++;
      if (_logoTaps >= 5) {
        _logoTaps = 0;
        const cur = JSON.parse(localStorage.getItem("turso_override") || "{}");
        openModal(modalHead("Server Configuration") + modalBody(
          '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Override the Turso database URL and token (stored in localStorage, takes effect on reload).</p>' +
          '<div class="field"><label>Turso URL</label><input class="input" id="ovr-url" value="' + esc(cur.url || TURSO_URL) + '" placeholder="https://your-db.turso.io"></div>' +
          '<div class="field"><label>Token</label><textarea class="textarea" id="ovr-token" rows="4" placeholder="eyJ...">' + esc(cur.token || TURSO_TOKEN) + '</textarea></div>' +
          '<p style="font-size:11px;color:var(--text-muted)">To find these: open the desktop app, Settings &rarr; Cloud Sync.</p>'
        ) + modalActions(
          '<button class="btn" onclick="localStorage.removeItem(\'turso_override\');closeModal();toast(\'Reset\',\'ok\')">Reset</button>' +
          '<button class="btn" onclick="closeModal()">Cancel</button>' +
          '<button class="btn primary" id="ovr-save">Save & Reload</button>'
        ));
        document.getElementById("ovr-save").onclick = () => {
          const o = { url: gv("ovr-url").trim(), token: gv("ovr-token").trim() };
          localStorage.setItem("turso_override", JSON.stringify(o));
          location.reload();
        };
      }
    });
  }
});

/* =====================================================
   DASHBOARD
   ===================================================== */
VIEWS.dashboard = async function () {
  const el = document.getElementById("content");
  const user = SESSION.user;
  const today = todayStr();
  const monthStart = today.slice(0, 7) + "-01";

  const safeCount = async (sql, ...args) => {
    try { const r = await q1(sql, args); return (r && typeof r.n === "number") ? r.n : 0; } catch (e) { return 0; }
  };
  const safeSum = async (sql, ...args) => {
    try { const r = await q1(sql, args); return (r && typeof r.t === "number") ? r.t : 0; } catch (e) { return 0; }
  };

  const [openJobs, todayJobs, activeCustomers, openAMC, lowStock, monthSales, pendingPickup, pendingDelivery, newLeads, todayAttendance] = await Promise.all([
    safeCount("SELECT COUNT(*) n FROM jobs WHERE status NOT IN ('delivered','completed','closed','cancelled')"),
    safeCount("SELECT COUNT(*) n FROM jobs WHERE DATE(created_at) = ?", today),
    safeCount("SELECT COUNT(*) n FROM customers WHERE is_active = 1 OR is_active IS NULL"),
    safeCount("SELECT COUNT(*) n FROM amc_contracts WHERE status = 'active'"),
    safeCount("SELECT COUNT(*) n FROM products WHERE current_stock <= min_stock AND (min_stock IS NOT NULL AND min_stock > 0) AND (is_active = 1 OR is_active IS NULL)"),
    safeSum("SELECT COALESCE(SUM(grand_total),0) t FROM invoices WHERE DATE(invoice_date) >= ?", monthStart),
    safeCount("SELECT COUNT(*) n FROM pickups WHERE status IN ('pending','scheduled')"),
    safeCount("SELECT COUNT(*) n FROM deliveries WHERE status IN ('pending','scheduled','in_transit')"),
    safeCount("SELECT COUNT(*) n FROM leads WHERE status IN ('new','contacted','followup')"),
    safeCount("SELECT COUNT(*) n FROM attendance WHERE date = ? AND status = 'present'", today)
  ]);

  let recentJobs = [];
  try { recentJobs = await q("SELECT j.*, c.name cname, c.phone_primary cphone, u.full_name techname FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.assigned_tech WHERE j.status NOT IN ('delivered','closed','cancelled') ORDER BY j.created_at DESC LIMIT 8"); } catch (e) {}

  el.innerHTML = `
    <div class="welcome">
      <div>
        <h2>Welcome, ${esc(user.full_name || user.username)}</h2>
        <p>Here's what's happening in your service center today.</p>
      </div>
      <div style="font-size:32px;opacity:0.5">\uD83D\uDC4B</div>
    </div>
    <div class="stats-grid">
      <div class="stat" style="--accent-color:var(--status-open)" onclick="navigate('jobs')">
        <div class="stat-label">Open Jobs</div>
        <div class="stat-value">${openJobs}</div>
        <div class="stat-sub">${todayJobs} new today</div>
      </div>
      <div class="stat" style="--accent-color:var(--success)" onclick="navigate('billing')">
        <div class="stat-label">Month Sales</div>
        <div class="stat-value" style="font-size:18px">${fmtMoney(monthSales)}</div>
      </div>
      <div class="stat" style="--accent-color:var(--info)" onclick="navigate('customers')">
        <div class="stat-label">Customers</div>
        <div class="stat-value">${activeCustomers}</div>
      </div>
      <div class="stat" style="--accent-color:var(--secondary)" onclick="navigate('leads')">
        <div class="stat-label">Open Leads</div>
        <div class="stat-value">${newLeads}</div>
      </div>
      <div class="stat" style="--accent-color:var(--accent)" onclick="navigate('amc')">
        <div class="stat-label">Active AMC</div>
        <div class="stat-value">${openAMC}</div>
      </div>
      <div class="stat" style="--accent-color:var(--warning)" onclick="navigate('inventory')">
        <div class="stat-label">Low Stock</div>
        <div class="stat-value">${lowStock}</div>
      </div>
      <div class="stat" style="--accent-color:var(--info-light)" onclick="navigate('pickup')">
        <div class="stat-label">Pending Pickups</div>
        <div class="stat-value">${pendingPickup}</div>
      </div>
      <div class="stat" style="--accent-color:var(--success-light)" onclick="navigate('delivery')">
        <div class="stat-label">Pending Deliveries</div>
        <div class="stat-value">${pendingDelivery}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">\uD83D\uDD17 Recent Jobs</div>
        <button class="link" onclick="navigate('jobs')" style="background:none;color:var(--primary);font-size:13px;font-weight:600">View all</button>
      </div>
      ${recentJobs.length ? `<div class="list">${recentJobs.map(r => `
        <div class="list-item" onclick="openJob(${r.id})">
          <div class="li-icon" style="background:var(--primary-container);color:var(--primary)">\uD83D\uDD27</div>
          <div class="li-main">
            <div class="li-title">${esc(r.job_number)} \u00B7 ${esc(r.brand || '')} ${esc(r.model || '')}</div>
            <div class="li-sub">${esc(r.cname || '-')} \u00B7 ${badge(r.status)}</div>
          </div>
          <div class="li-right"><div class="li-when">${fmtDT(r.created_at)}</div></div>
        </div>`).join("")}</div>` : '<div class="empty"><div class="big">\uD83D\uDCED</div><div class="msg">No recent jobs</div></div>'}
    </div>
  `;
};

/* =====================================================
   CUSTOMERS
   ===================================================== */
VIEWS.customers = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.customers.search) VIEW_STATE.customers.search = "";
  const rows = await q("SELECT c.*, (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id) job_count, (SELECT COALESCE(SUM(grand_total),0) FROM invoices i WHERE i.customer_id = c.id) spent FROM customers c WHERE (c.is_active = 1 OR c.is_active IS NULL) ORDER BY c.name");
  const filtered = VIEW_STATE.customers.search
    ? rows.filter(r => (r.name || "").toLowerCase().includes(VIEW_STATE.customers.search) || (r.phone_primary || "").includes(VIEW_STATE.customers.search) || (r.email || "").toLowerCase().includes(VIEW_STATE.customers.search))
    : rows;

  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Customers</div><div class="page-sub">${rows.length} total</div></div>
      <div class="page-actions">${hasPerm("customers_create") ? '<button class="btn primary" onclick="customerForm()">+ New</button>' : ""}</div>
    </div>
    <input class="search-box" placeholder="Search name, phone, email..." value="${esc(VIEW_STATE.customers.search)}" oninput="VIEW_STATE.customers.search=this.value.toLowerCase();renderCustomerList()" style="margin-bottom:14px">
    <div id="cust-list" class="list"></div>
    <div class="table-wrap hide-mobile">
      <table class="tbl">
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Jobs</th><th>Spent</th><th>Balance</th><th></th></tr></thead>
        <tbody>${filtered.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.phone_primary || '-')}</td><td>${esc(r.email || '-')}</td><td>${r.job_count || 0}</td><td class="num">${fmtMoney(r.spent || 0)}</td><td class="num">${fmtMoney(r.balance || 0)}</td><td><button class="btn sm" onclick="openCustomer(${r.id})">View</button></td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
  window._customers = filtered;
  renderCustomerList();
};
function renderCustomerList() {
  const filtered = window._customers || [];
  const s = VIEW_STATE.customers.search;
  const list = s ? filtered.filter(r => (r.name || "").toLowerCase().includes(s) || (r.phone_primary || "").includes(s)) : filtered;
  document.getElementById("cust-list").innerHTML = list.length ? list.map(r => `
    <div class="list-item" onclick="openCustomer(${r.id})">
      <div class="li-icon" style="background:var(--secondary-container);color:var(--secondary)">${initials(r.name)}</div>
      <div class="li-main"><div class="li-title">${esc(r.name)}</div><div class="li-sub">${esc(r.phone_primary || '')} \u00B7 ${r.job_count || 0} jobs \u00B7 bal ${fmtMoney(r.balance || 0)}</div></div>
      <div class="li-right"><div class="li-amount">${fmtMoney(r.spent || 0)}</div></div>
    </div>`).join("") : '<div class="empty"><div class="big">\uD83D\uDC65</div><div class="msg">No customers</div></div>';
}

async function openCustomer(id) {
  const c = await q1("SELECT * FROM customers WHERE id = ?", [id]);
  if (!c) return toast("Not found", "err");
  const jobs = await q("SELECT id, job_number, brand, model, status, created_at FROM jobs WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20", [id]);
  const invoices = await q("SELECT id, invoice_number, invoice_date, grand_total, paid_amount, balance FROM invoices WHERE customer_id = ? ORDER BY invoice_date DESC LIMIT 20", [id]);
  openModal(modalHead(c.name) + modalBody(`
    <div class="grid-2" style="margin-bottom:14px">
      <div class="kv"><span class="k">Phone</span><span class="v">${esc(c.phone_primary || '-')}</span></div>
      <div class="kv"><span class="k">Email</span><span class="v">${esc(c.email || '-')}</span></div>
      <div class="kv"><span class="k">Address</span><span class="v">${esc(c.address || '-')}</span></div>
      <div class="kv"><span class="k">GSTIN</span><span class="v">${esc(c.gstin || '-')}</span></div>
      <div class="kv"><span class="k">Balance</span><span class="v">${fmtMoney(c.balance || 0)}</span></div>
      <div class="kv"><span class="k">Created</span><span class="v">${fmtD(c.created_at)}</span></div>
    </div>
    <h3 style="font-size:14px;margin:14px 0 6px">Recent Jobs</h3>
    ${jobs.length ? jobs.map(j => `<div class="kv"><span class="k">${esc(j.job_number)} - ${esc(j.brand)} ${esc(j.model)}</span>${badge(j.status)}</div>`).join("") : '<div class="empty">No jobs</div>'}
    <h3 style="font-size:14px;margin:14px 0 6px">Invoices</h3>
    ${invoices.length ? invoices.map(i => `<div class="kv"><span class="k">${esc(i.invoice_number)} - ${fmtD(i.invoice_date)}</span><span class="v">${fmtMoney(i.grand_total)}</span></div>`).join("") : '<div class="empty">No invoices</div>'}
  `) + modalActions(
    (hasPerm("customers_edit") ? `<button class="btn" onclick="customerForm(${id})">Edit</button>` : "") +
    (hasPerm("jobs_create") ? `<button class="btn primary" onclick="closeModal();jobForm(null, ${id})">+ New Job</button>` : "") +
    `<button class="btn" onclick="closeModal()">Close</button>`
  ), "lg");
}

async function customerForm(id) {
  const c = id ? await q1("SELECT * FROM customers WHERE id = ?", [id]) : {};
  openModal(modalHead(id ? "Edit Customer" : "New Customer") + modalBody(`
    <div class="row">
      <div class="field"><label class="req">Name</label><input class="input" id="cf-name" value="${esc(c.name || '')}"></div>
      <div class="field"><label>Display Name</label><input class="input" id="cf-disp" value="${esc(c.display_name || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Phone</label><input class="input" id="cf-phone" value="${esc(c.phone_primary || '')}"></div>
      <div class="field"><label>Alt Phone</label><input class="input" id="cf-phone2" value="${esc(c.phone_secondary || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Email</label><input class="input" id="cf-email" value="${esc(c.email || '')}"></div>
      <div class="field"><label>GSTIN</label><input class="input" id="cf-gstin" value="${esc(c.gstin || '')}"></div>
    </div>
    <div class="field"><label>Address</label><textarea class="textarea" id="cf-addr">${esc(c.address || '')}</textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="cf-save">Save</button>`));
  document.getElementById("cf-save").onclick = async () => {
    const data = {
      name: gv("cf-name"), display_name: gv("cf-disp"), phone_primary: gv("cf-phone"),
      phone_secondary: gv("cf-phone2"), email: gv("cf-email"), gstin: gv("cf-gstin"),
      address: gv("cf-addr")
    };
    if (!data.name) return toast("Name required", "err");
    if (id) {
      await exec("UPDATE customers SET name=?, display_name=?, phone_primary=?, phone_secondary=?, email=?, gstin=?, address=?, updated_at=? WHERE id=?",
        [data.name, data.display_name, data.phone_primary, data.phone_secondary, data.email, data.gstin, data.address, nowStr(), id]);
    } else {
      const uuidv = uuid();
      await exec("INSERT INTO customers (uuid, name, display_name, phone_primary, phone_secondary, email, gstin, address, balance, is_active, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,0,1,?,?,?, 'pending')",
        [uuidv, data.name, data.display_name, data.phone_primary, data.phone_secondary, data.email, data.gstin, data.address, SESSION.user.id, nowStr(), nowStr()]);
    }
    toast(id ? "Updated" : "Created", "ok");
    closeModal();
    navigate("customers");
  };
}

/* =====================================================
   JOBS
   ===================================================== */
VIEWS.jobs = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.jobs.filter) VIEW_STATE.jobs.filter = "active";
  if (!VIEW_STATE.jobs.search) VIEW_STATE.jobs.search = "";
  const where = [];
  const args = [];
  if (VIEW_STATE.jobs.filter === "active") where.push("j.status NOT IN ('delivered','completed','closed','cancelled')");
  else if (VIEW_STATE.jobs.filter !== "all") { where.push("j.status = ?"); args.push(VIEW_STATE.jobs.filter); }
  if (VIEW_STATE.jobs.search) {
    where.push("(j.job_number LIKE ? OR c.name LIKE ? OR j.brand LIKE ? OR j.model LIKE ? OR j.serial_number LIKE ?)");
    const s = "%" + VIEW_STATE.jobs.search + "%";
    args.push(s, s, s, s, s);
  }
  const sql = `SELECT j.*, c.name cname, c.phone_primary cphone, u.full_name techname FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.assigned_tech ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY j.created_at DESC LIMIT 400`;
  const rows = await q(sql, args);

  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Jobs</div><div class="page-sub">${rows.length} shown</div></div>
      <div class="page-actions">
        <input class="search-box" placeholder="Search..." value="${esc(VIEW_STATE.jobs.search)}" oninput="VIEW_STATE.jobs.search=this.value;navigate('jobs')">
        ${hasPerm("jobs_create") ? '<button class="btn primary" onclick="jobForm()">+ New</button>' : ""}
      </div>
    </div>
    <div class="filter-row">
      ${["active","open","assigned","repairing","qc","completed","delivered","cancelled","all"].map(f => `<div class="filter-pill ${VIEW_STATE.jobs.filter===f?"active":""}" onclick="VIEW_STATE.jobs.filter='${f}';navigate('jobs')">${f}</div>`).join("")}
    </div>
    <div id="job-list" class="list list-mobile"></div>
    <div class="table-wrap hide-mobile">
      <table class="tbl">
        <thead><tr><th>Job #</th><th>Customer</th><th>Device</th><th>Status</th><th>Tech</th><th>Created</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr onclick="openJob(${r.id})" style="cursor:pointer">
          <td><b style="font-family:var(--font-mono)">${esc(r.job_number)}</b></td>
          <td>${esc(r.cname || '-')}</td>
          <td>${esc(r.brand || '')} ${esc(r.model || '')}</td>
          <td>${badge(r.status)}</td>
          <td>${esc(r.techname || '-')}</td>
          <td>${fmtDT(r.created_at)}</td>
          <td><button class="btn sm" onclick="event.stopPropagation();openJob(${r.id})">Open</button></td>
        </tr>`).join("")}</tbody>
      </table>
    </div>
    ${hasPerm("jobs_create") ? '<button class="fab" onclick="jobForm()">+</button>' : ""}
  `;
  document.getElementById("job-list").innerHTML = rows.length ? rows.map(r => `
    <div class="job-card" onclick="openJob(${r.id})">
      <div class="head">
        <div><div class="num">${esc(r.job_number)}</div><div class="device">${esc(r.brand || '')} ${esc(r.model || '')}</div><div class="cust">${esc(r.cname || '-')} \u00B7 ${esc(r.techname || 'unassigned')}</div></div>
        <div>${badge(r.status)}</div>
      </div>
      <div class="foot"><span>${esc(r.device_type || '-')}</span><span>${fmtDT(r.created_at)}</span></div>
    </div>`).join("") : '<div class="empty"><div class="big">\uD83D\uDD27</div><div class="msg">No jobs</div></div>';
};

async function openJob(id) {
  const t = await q1("SELECT j.*, c.name cname, c.phone_primary cphone, u.full_name techname FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.assigned_tech WHERE j.id = ?", [id]);
  if (!t) return toast("Not found", "err");
  const acts = await q("SELECT a.*, u.full_name uname FROM job_activities a LEFT JOIN users u ON u.id=a.created_by WHERE a.job_id = ? ORDER BY a.created_at DESC LIMIT 30", [id]);
  const parts = await q("SELECT * FROM job_parts WHERE job_id = ? ORDER BY id DESC", [id]);
  const editable = !["delivered","closed","cancelled"].includes(t.status);
  openModal(modalHead(`\uD83D\uDD27 ${esc(t.job_number)} ${badge(t.status)}`) + modalBody(`
    <div class="grid-2" style="margin-bottom:14px">
      <div class="kv"><span class="k">Customer</span><span class="v">${esc(t.cname || '-')}</span></div>
      <div class="kv"><span class="k">Phone</span><span class="v">${esc(t.cphone || '-')}</span></div>
      <div class="kv"><span class="k">Device</span><span class="v">${esc(t.brand || '')} ${esc(t.model || '')}</span></div>
      <div class="kv"><span class="k">Serial</span><span class="v">${esc(t.serial_number || '-')}</span></div>
      <div class="kv"><span class="k">Tech</span><span class="v">${esc(t.techname || 'unassigned')}</span></div>
      <div class="kv"><span class="k">Priority</span><span class="v">${badge(t.priority || 'medium')}</div>
    </div>
    <h3 style="font-size:13px;margin:10px 0 4px">Complaint</h3>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${esc(t.complaint || '-')}</p>
    ${t.technician_diagnosis ? `<h3 style="font-size:13px;margin:10px 0 4px">Diagnosis</h3><p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${esc(t.technician_diagnosis)}</p>` : ""}
    <div class="card" style="margin-top:12px;padding:10px">
      <div class="card-head"><div class="card-title" style="font-size:13px">Parts Used</div></div>
      ${parts.length ? parts.map(p => `<div class="kv"><span class="k">${esc(p.part_name)} \u00D7${p.quantity}</span><span class="v">${fmtMoney(p.total_price || 0)}</span></div>`).join("") : '<div class="empty">No parts</div>'}
    </div>
    <div class="card" style="margin-top:12px;padding:10px">
      <div class="card-head"><div class="card-title" style="font-size:13px">Activity</div></div>
      <div class="timeline">
        ${acts.map(a => `<div class="tl-item">
          <div class="tl-when">${fmtDT(a.created_at)} \u00B7 ${esc(a.uname || a.created_by_name || '-')}</div>
          <div class="tl-title">${esc(a.activity_type || '')} ${a.old_status ? esc(a.old_status + " \u2192 " + (a.new_status || '')) : ''}</div>
          ${a.note ? `<div class="tl-note">${esc(a.note)}</div>` : ''}
        </div>`).join("")}
      </div>
    </div>
  `) + modalActions(
    (editable && hasPerm("jobs_edit") ? `<button class="btn" onclick="jobEditForm(${id})">Edit</button>` : "") +
    (editable && hasPerm("jobs_edit") ? `<button class="btn" onclick="jobPartForm(${id})">+ Part</button>` : "") +
    (editable && hasPerm("jobs_edit") ? `<button class="btn" onclick="jobCommentForm(${id})">\uD83D\uDCAC Comment</button>` : "") +
    `<button class="btn primary" onclick="closeModal()">Close</button>`
  ), "lg");
}

async function jobForm(prefill, customerId) {
  const customers = await q("SELECT id, name, phone_primary FROM customers ORDER BY name");
  const techs = await q("SELECT id, full_name FROM users WHERE role IN ('technician','super_admin','admin') AND (is_active = 1 OR is_active IS NULL)");
  openModal(modalHead("\uD83D\uDD27 New Job") + modalBody(`
    <div class="field"><label class="req">Customer</label>
      <select class="select" id="jf-cust">
        <option value="">Select</option>
        ${customers.map(c => `<option value="${c.id}" ${customerId===c.id?"selected":""}>${esc(c.name)} - ${esc(c.phone_primary||'')}</option>`).join("")}
      </select>
    </div>
    <div class="row">
      <div class="field"><label>Device Type</label><input class="input" id="jf-type" value="Laptop"></div>
      <div class="field"><label>Brand</label><input class="input" id="jf-brand"></div>
    </div>
    <div class="row">
      <div class="field"><label>Model</label><input class="input" id="jf-model"></div>
      <div class="field"><label>Serial</label><input class="input" id="jf-serial"></div>
    </div>
    <div class="row">
      <div class="field"><label>Priority</label>
        <select class="select" id="jf-priority">
          <option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select>
      </div>
      <div class="field"><label>Assign Tech</label>
        <select class="select" id="jf-tech">
          <option value="">Unassigned</option>
          ${techs.map(t => `<option value="${t.id}">${esc(t.full_name)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label class="req">Complaint</label><textarea class="textarea" id="jf-complaint"></textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="jf-save">Create</button>`));
  document.getElementById("jf-save").onclick = async () => {
    const custId = gv("jf-cust");
    if (!custId) return toast("Select customer", "err");
    const c = customers.find(x => x.id == custId);
    const num = await nextNumber("DW", "jobs", "job_number");
    const uv = uuid();
    await batch([
      { sql: "INSERT INTO jobs (uuid, job_number, customer_id, customer_name, customer_phone, device_type, brand, model, serial_number, priority, assigned_tech, status, complaint, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')", args: [uv, num, parseInt(custId), c.name, c.phone_primary, gv("jf-type"), gv("jf-brand"), gv("jf-model"), gv("jf-serial"), gv("jf-priority"), gv("jf-tech") || null, "open", gv("jf-complaint"), SESSION.user.id, nowStr(), nowStr()] },
      { sql: "INSERT INTO job_activities (job_id, activity_type, new_status, note, created_by, created_by_name, created_at) SELECT id, 'created', 'open', 'Job created from webapp', ?, ?, ? FROM jobs WHERE job_number=?", args: [SESSION.user.id, SESSION.user.full_name, nowStr(), num] }
    ]);
    toast("Job " + num + " created", "ok");
    closeModal();
    navigate("jobs");
  };
}
async function jobEditForm(id) {
  const t = await q1("SELECT * FROM jobs WHERE id = ?", [id]);
  if (!t) return;
  const techs = await q("SELECT id, full_name FROM users WHERE role IN ('technician','super_admin','admin') AND (is_active = 1 OR is_active IS NULL)");
  openModal(modalHead("Edit " + t.job_number) + modalBody(`
    <div class="row">
      <div class="field"><label>Status</label>
        <select class="select" id="ef-status">
          ${["open","assigned","diagnosis","repairing","qc","completed","delivered","closed","cancelled","unrepairable"].map(s => `<option value="${s}" ${t.status===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Tech</label>
        <select class="select" id="ef-tech">
          <option value="">Unassigned</option>
          ${techs.map(tt => `<option value="${tt.id}" ${t.assigned_tech==tt.id?"selected":""}>${esc(tt.full_name)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label>Diagnosis</label><textarea class="textarea" id="ef-diag">${esc(t.technician_diagnosis || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>Est Cost</label><input class="input" type="number" id="ef-est" value="${t.estimated_cost || 0}"></div>
      <div class="field"><label>Priority</label>
        <select class="select" id="ef-priority">
          ${["low","medium","high","urgent"].map(s => `<option value="${s}" ${t.priority===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </div>
    </div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="ef-save">Save</button>`));
  document.getElementById("ef-save").onclick = async () => {
    const old = t.status;
    const newStatus = gv("ef-status");
    const techId = gv("ef-tech") || null;
    const techName = techId ? (techs.find(x => x.id == techId) || {}).full_name : null;
    await batch([
      { sql: "UPDATE jobs SET status=?, assigned_tech=?, assigned_tech_name=?, technician_diagnosis=?, estimated_cost=?, priority=?, updated_at=? WHERE id=?", args: [newStatus, techId, techName, gv("ef-diag"), parseFloat(gv("ef-est")) || 0, gv("ef-priority"), nowStr(), id] },
      { sql: "INSERT INTO job_activities (job_id, activity_type, old_status, new_status, note, created_by, created_by_name, created_at) VALUES (?,?,?,?,?,?,?,?)", args: [id, "status_change", old, newStatus, "Updated from webapp", SESSION.user.id, SESSION.user.full_name, nowStr()] }
    ]);
    toast("Updated", "ok"); closeModal(); navigate("jobs");
  };
}
async function jobPartForm(id) {
  const products = await q("SELECT id, name, selling_price FROM products WHERE (is_active = 1 OR is_active IS NULL) ORDER BY name");
  openModal(modalHead("Add Part") + modalBody(`
    <div class="field"><label>Product</label>
      <select class="select" id="pf-prod">
        <option value="">Custom</option>
        ${products.map(p => `<option value="${p.id}" data-price="${p.selling_price||0}">${esc(p.name)} (${fmtMoney(p.selling_price||0)})</option>`).join("")}
      </select>
    </div>
    <div class="row">
      <div class="field"><label>Part Name</label><input class="input" id="pf-name"></div>
      <div class="field"><label>Qty</label><input class="input" type="number" id="pf-qty" value="1"></div>
    </div>
    <div class="row">
      <div class="field"><label>Unit Price</label><input class="input" type="number" id="pf-price" value="0"></div>
      <div class="field"><label>Warranty</label>
        <select class="select" id="pf-warranty"><option value="0">No</option><option value="1">Yes</option></select>
      </div>
    </div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="pf-save">Add</button>`));
  document.getElementById("pf-prod").onchange = (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.dataset.price && !gv("pf-name")) gv("pf-name", opt.text.split(" (")[0]);
    if (opt && opt.dataset.price) gv("pf-price", opt.dataset.price);
  };
  document.getElementById("pf-save").onclick = async () => {
    const qty = parseInt(gv("pf-qty")) || 1;
    const price = parseFloat(gv("pf-price")) || 0;
    const productId = gv("pf-prod") || null;
    await batch([
      { sql: "INSERT INTO job_parts (job_id, product_id, part_name, quantity, unit_price, total_price, is_warranty, created_at) VALUES (?,?,?,?,?,?,?,?)", args: [id, productId, gv("pf-name") || "Part", qty, price, qty * price, parseInt(gv("pf-warranty")) || 0, nowStr()] },
      { sql: "INSERT INTO job_activities (job_id, activity_type, note, created_by, created_by_name, created_at) VALUES (?,?,?,?,?,?)", args: [id, "part_added", gv("pf-name") + " x" + qty, SESSION.user.id, SESSION.user.full_name, nowStr()] },
      { sql: "UPDATE jobs SET updated_at=? WHERE id=?", args: [nowStr(), id] }
    ]);
    toast("Part added", "ok"); closeModal(); openJob(id);
  };
}
async function jobCommentForm(id) {
  openModal(modalHead("Add Comment") + modalBody(`
    <div class="field"><label>Comment</label><textarea class="textarea" id="cf-note" rows="4"></textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="cf-save">Add</button>`));
  document.getElementById("cf-save").onclick = async () => {
    await batch([
      { sql: "INSERT INTO job_activities (job_id, activity_type, note, created_by, created_by_name, created_at) VALUES (?,?,?,?,?,?)", args: [id, "comment", gv("cf-note"), SESSION.user.id, SESSION.user.full_name, nowStr()] },
      { sql: "UPDATE jobs SET updated_at=? WHERE id=?", args: [nowStr(), id] }
    ]);
    toast("Comment added", "ok"); closeModal(); openJob(id);
  };
}

/* =====================================================
   TASKS (uses master_repair_jobs - inward/outward workflow)
   ===================================================== */
VIEWS.tasks = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.tasks.tab) VIEW_STATE.tasks.tab = "general";
  if (!VIEW_STATE.tasks.filter) VIEW_STATE.tasks.filter = "all";
  if (!VIEW_STATE.tasks.search) VIEW_STATE.tasks.search = "";
  const where = [];
  const args = [];
  const tab = VIEW_STATE.tasks.tab;
  if (tab === "inward") where.push("j.source_tab = 'inward'");
  else if (tab === "outward") where.push("j.source_tab = 'outward'");
  if (VIEW_STATE.tasks.filter !== "all") { where.push("j.current_status = ?"); args.push(VIEW_STATE.tasks.filter); }
  if (VIEW_STATE.tasks.search) { where.push("(j.entry_number LIKE ? OR c.name LIKE ? OR j.brand LIKE ?)"); const s = "%"+VIEW_STATE.tasks.search+"%"; args.push(s,s,s); }
  const sql = `SELECT j.*, c.name cname FROM master_repair_jobs j LEFT JOIN customers c ON c.id = j.customer_id ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY j.created_at DESC LIMIT 300`;
  const rows = await q(sql, args);
  el.innerHTML = `
    <div class="tabs">
      <div class="tab ${tab==='general'?'active':''}" onclick="VIEW_STATE.tasks.tab='general';navigate('tasks')">General</div>
      <div class="tab ${tab==='inward'?'active':''}" onclick="VIEW_STATE.tasks.tab='inward';navigate('tasks')">Inward</div>
      <div class="tab ${tab==='outward'?'active':''}" onclick="VIEW_STATE.tasks.tab='outward';navigate('tasks')">Outward</div>
    </div>
    <div class="page-head">
      <div><div class="page-title">${tab === 'general' ? 'All Tasks' : tab.charAt(0).toUpperCase() + tab.slice(1)}</div><div class="page-sub">${rows.length} entries</div></div>
      <div class="page-actions">
        <input class="search-box" placeholder="Search..." value="${esc(VIEW_STATE.tasks.search)}" oninput="VIEW_STATE.tasks.search=this.value;navigate('tasks')">
        <button class="btn primary" onclick="taskInwardForm()">+ Inward</button>
      </div>
    </div>
    <div class="filter-row">
      ${["all","INWARD","AT_FACTORY","BACK_IN_STORE","DELIVERED"].map(f => `<div class="filter-pill ${VIEW_STATE.tasks.filter===f?"active":""}" onclick="VIEW_STATE.tasks.filter='${f}';navigate('tasks')">${f}</div>`).join("")}
    </div>
    <div class="list">
      ${rows.length ? rows.map(r => `
        <div class="list-item" onclick="openTask(${r.id})">
          <div class="li-icon" style="background:var(--accent-container);color:var(--accent)">\uD83D\uDCE5</div>
          <div class="li-main">
            <div class="li-title">${esc(r.entry_number)} \u00B7 ${esc(r.brand || '')} ${esc(r.model || '')}</div>
            <div class="li-sub">${esc(r.cname || '-')} \u00B7 ${esc(r.factory_name || '')}</div>
          </div>
          <div class="li-right">${badge(r.current_status)}<div class="li-when">${fmtDT(r.created_at)}</div></div>
        </div>`).join("") : '<div class="empty"><div class="big">\uD83D\uDCCB</div><div class="msg">No tasks</div></div>'}
    </div>
  `;
};
async function openTask(id) {
  const t = await q1("SELECT j.*, c.name cname FROM master_repair_jobs j LEFT JOIN customers c ON c.id = j.customer_id WHERE j.id = ?", [id]);
  if (!t) return;
  const ledger = await q("SELECT * FROM material_movement_ledger WHERE job_id = ? ORDER BY movement_date DESC", [id]);
  openModal(modalHead(`\uD83D\uDCE5 ${esc(t.entry_number)} ${badge(t.current_status)}`) + modalBody(`
    <div class="grid-2" style="margin-bottom:14px">
      <div class="kv"><span class="k">Customer</span><span class="v">${esc(t.cname || '-')}</span></div>
      <div class="kv"><span class="k">Device</span><span class="v">${esc(t.brand || '')} ${esc(t.model || '')}</span></div>
      <div class="kv"><span class="k">Factory</span><span class="v">${esc(t.factory_name || '-')}</span></div>
      <div class="kv"><span class="k">Courier</span><span class="v">${esc(t.courier_tracking_no || '-')}</span></div>
      <div class="kv"><span class="k">Repair Cost</span><span class="v">${fmtMoney(t.repair_cost || 0)}</span></div>
      <div class="kv"><span class="k">Charge</span><span class="v">${fmtMoney(t.customer_charge || 0)}</span></div>
    </div>
    <h3 style="font-size:13px;margin:10px 0 6px">Material Movement</h3>
    <div class="timeline">
      ${ledger.length ? ledger.map(l => `<div class="tl-item">
        <div class="tl-when">${fmtDT(l.movement_date)}</div>
        <div class="tl-title">${esc(l.movement_type)} \u00B7 ${esc(l.party_name || '-')}</div>
        ${l.technician_notes ? `<div class="tl-note">${esc(l.technician_notes)}</div>` : ''}
      </div>`).join("") : '<div class="empty">No movements</div>'}
    </div>
  `) + modalActions(`<button class="btn primary" onclick="closeModal()">Close</button>`), "lg");
}
async function taskInwardForm() {
  const customers = await q("SELECT id, name, phone_primary FROM customers ORDER BY name");
  openModal(modalHead("\uD83D\uDCE5 New Inward") + modalBody(`
    <div class="field"><label class="req">Customer</label>
      <select class="select" id="ti-cust">
        <option value="">Select</option>
        ${customers.map(c => `<option value="${c.id}">${esc(c.name)} - ${esc(c.phone_primary||'')}</option>`).join("")}
      </select>
    </div>
    <div class="row">
      <div class="field"><label>Brand</label><input class="input" id="ti-brand"></div>
      <div class="field"><label>Model</label><input class="input" id="ti-model"></div>
    </div>
    <div class="row">
      <div class="field"><label>Serial</label><input class="input" id="ti-serial"></div>
      <div class="field"><label>Device Type</label><input class="input" id="ti-type" value="Laptop"></div>
    </div>
    <div class="field"><label>Complaint</label><textarea class="textarea" id="ti-complaint"></textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="ti-save">Create</button>`));
  document.getElementById("ti-save").onclick = async () => {
    const custId = gv("ti-cust");
    if (!custId) return toast("Select customer", "err");
    const c = customers.find(x => x.id == custId);
    const num = await nextNumber("IN", "master_repair_jobs", "entry_number");
    const uv = uuid();
    await batch([
      { sql: "INSERT INTO master_repair_jobs (uuid, entry_number, customer_id, customer_name, customer_phone, device_type, brand, model, serial_number, complaint, current_status, inward_date, inward_notes, created_by, source_tab, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')", args: [uv, num, parseInt(custId), c.name, c.phone_primary, gv("ti-type"), gv("ti-brand"), gv("ti-model"), gv("ti-serial"), gv("ti-complaint"), "INWARD", nowStr(), gv("ti-complaint"), SESSION.user.id, "inward", nowStr(), nowStr()] },
      { sql: "INSERT INTO material_movement_ledger (job_id, movement_type, party_name, movement_date, created_by, created_at, sync_status) SELECT id, 'INWARD_FROM_CLIENT', ?, ?, ?, ?, 'pending' FROM master_repair_jobs WHERE entry_number=?", args: [c.name, nowStr(), SESSION.user.id, nowStr(), num] }
    ]);
    toast("Inward " + num + " created", "ok"); closeModal(); navigate("tasks");
  };
}

/* =====================================================
   LEADS
   ===================================================== */
VIEWS.leads = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.leads.status) VIEW_STATE.leads.status = "all";
  if (!VIEW_STATE.leads.search) VIEW_STATE.leads.search = "";
  const where = [];
  const args = [];
  if (VIEW_STATE.leads.status !== "all") { where.push("status = ?"); args.push(VIEW_STATE.leads.status); }
  if (VIEW_STATE.leads.search) { where.push("(name LIKE ? OR phone LIKE ? OR email LIKE ? OR company LIKE ?)"); const s="%"+VIEW_STATE.leads.search+"%"; args.push(s,s,s,s); }
  const rows = await q("SELECT * FROM leads " + (where.length?"WHERE "+where.join(" AND "):"") + " ORDER BY created_at DESC LIMIT 200", args);
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Leads</div><div class="page-sub">${rows.length} leads</div></div>
      <div class="page-actions">
        <input class="search-box" placeholder="Search..." value="${esc(VIEW_STATE.leads.search)}" oninput="VIEW_STATE.leads.search=this.value;navigate('leads')">
        ${hasPerm("leads_create") ? '<button class="btn primary" onclick="leadForm()">+ New</button>' : ""}
      </div>
    </div>
    <div class="filter-row">
      ${["all","new","contacted","followup","quotation_sent","negotiation","converted","lost","not_interested"].map(s => `<div class="filter-pill ${VIEW_STATE.leads.status===s?"active":""}" onclick="VIEW_STATE.leads.status='${s}';navigate('leads')">${s.replace(/_/g," ")}</div>`).join("")}
    </div>
    <div class="list">
      ${rows.length ? rows.map(r => `
        <div class="list-item" onclick="openLead(${r.id})">
          <div class="li-icon" style="background:var(--accent-container);color:var(--accent)">${initials(r.name)}</div>
          <div class="li-main">
            <div class="li-title">${esc(r.name)}</div>
            <div class="li-sub">${esc(r.phone||'')} \u00B7 ${esc(r.source || '')} \u00B7 ${esc(r.company||'')}</div>
          </div>
          <div class="li-right">${badge(r.status)}</div>
        </div>`).join("") : '<div class="empty"><div class="big">\uD83C\uDFAF</div><div class="msg">No leads</div></div>'}
    </div>
  `;
};
async function leadForm(id) {
  const r = id ? await q1("SELECT * FROM leads WHERE id = ?", [id]) : {};
  openModal(modalHead(id ? "Edit Lead" : "New Lead") + modalBody(`
    <div class="row">
      <div class="field"><label class="req">Name</label><input class="input" id="lf-name" value="${esc(r.name||'')}"></div>
      <div class="field"><label>Company</label><input class="input" id="lf-company" value="${esc(r.company||'')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Phone</label><input class="input" id="lf-phone" value="${esc(r.phone||'')}"></div>
      <div class="field"><label>Email</label><input class="input" id="lf-email" value="${esc(r.email||'')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Source</label>
        <select class="select" id="lf-source">
          ${["walk_in","website","phone","referral","social_media","advertisement","other"].map(s => `<option value="${s}" ${r.source===s?"selected":""}>${s.replace(/_/g," ")}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Status</label>
        <select class="select" id="lf-status">
          ${["new","contacted","followup","quotation_sent","negotiation","converted","lost","not_interested"].map(s => `<option value="${s}" ${r.status===s||(!r.status && s==='new')?"selected":""}>${s.replace(/_/g," ")}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Value</label><input class="input" type="number" id="lf-value" value="${r.estimated_value || 0}"></div>
      <div class="field"><label>Next Followup</label><input class="input" type="date" id="lf-next" value="${fmtD(r.next_followup)}"></div>
    </div>
    <div class="field"><label>Notes</label><textarea class="textarea" id="lf-notes">${esc(r.notes||'')}</textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="lf-save">Save</button>`));
  document.getElementById("lf-save").onclick = async () => {
    const data = { name: gv("lf-name"), company: gv("lf-company"), phone: gv("lf-phone"), email: gv("lf-email"), source: gv("lf-source"), status: gv("lf-status"), estimated_value: parseFloat(gv("lf-value")) || 0, next_followup: gv("lf-next"), notes: gv("lf-notes") };
    if (!data.name) return toast("Name required", "err");
    if (id) await exec("UPDATE leads SET name=?, company=?, phone=?, email=?, source=?, status=?, estimated_value=?, next_followup=?, notes=?, updated_at=? WHERE id=?", [data.name, data.company, data.phone, data.email, data.source, data.status, data.estimated_value, data.next_followup, data.notes, nowStr(), id]);
    else {
      const num = await nextNumber("LD", "leads", "lead_number");
      await exec("INSERT INTO leads (uuid, lead_number, name, company, phone, email, source, status, estimated_value, next_followup, notes, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')", [uuid(), num, data.name, data.company, data.phone, data.email, data.source, data.status, data.estimated_value, data.next_followup, data.notes, SESSION.user.id, nowStr(), nowStr()]);
    }
    toast("Saved", "ok"); closeModal(); navigate("leads");
  };
}
async function openLead(id) {
  const r = await q1("SELECT * FROM leads WHERE id = ?", [id]);
  if (!r) return;
  openModal(modalHead(r.name) + modalBody(`
    <div class="grid-2" style="margin-bottom:14px">
      <div class="kv"><span class="k">Phone</span><span class="v">${esc(r.phone||'-')}</span></div>
      <div class="kv"><span class="k">Email</span><span class="v">${esc(r.email||'-')}</span></div>
      <div class="kv"><span class="k">Source</span><span class="v">${esc(r.source||'-')}</span></div>
      <div class="kv"><span class="k">Status</span>${badge(r.status)}</div>
      <div class="kv"><span class="k">Value</span><span class="v">${fmtMoney(r.estimated_value||0)}</span></div>
      <div class="kv"><span class="k">Next Followup</span><span class="v">${fmtD(r.next_followup)}</span></div>
    </div>
    ${r.notes ? `<h3 style="font-size:13px;margin:10px 0 4px">Notes</h3><p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${esc(r.notes)}</p>` : ''}
  `) + modalActions(
    `${hasPerm("leads_edit") ? `<button class="btn" onclick="closeModal();leadForm(${id})">Edit</button>` : ''}
    ${hasPerm("lead_convert") && r.status !== "converted" ? `<button class="btn success" onclick="convertLead(${id})">Convert</button>` : ''}
    ${hasPerm("leads_delete") ? `<button class="btn red" onclick="if(confirm('Delete?'))deleteLead(${id})">Delete</button>` : ''}
    <button class="btn primary" onclick="closeModal()">Close</button>`
  ), "lg");
}
async function convertLead(id) {
  const r = await q1("SELECT * FROM leads WHERE id = ?", [id]);
  if (!r) return;
  const uv = uuid();
  await exec("INSERT INTO customers (uuid, name, company, phone_primary, email, source, balance, is_active, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,0,1,?,?,?, 'pending')", [uv, r.name, r.company, r.phone, r.email, "converted_lead", SESSION.user.id, nowStr(), nowStr()]);
  await exec("UPDATE leads SET status='converted', converted_to_customer=1, updated_at=? WHERE id=?", [nowStr(), id]);
  toast("Converted", "ok"); closeModal(); navigate("leads");
}
async function deleteLead(id) {
  await exec("DELETE FROM leads WHERE id = ?", [id]);
  toast("Deleted", "ok"); closeModal(); navigate("leads");
}

/* =====================================================
   ORDERS
   ===================================================== */
VIEWS.orders = async function () {
  const el = document.getElementById("content");
  const rows = await q("SELECT o.*, c.name cname FROM orders o LEFT JOIN customers c ON c.id = o.customer_id ORDER BY o.created_at DESC LIMIT 200");
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Orders</div><div class="page-sub">${rows.length} orders</div></div>
      <div class="page-actions">${hasPerm("orders_create") ? '<button class="btn primary" onclick="orderForm()">+ New</button>' : ""}</div>
    </div>
    <div class="list">
      ${rows.length ? rows.map(r => `
        <div class="list-item" onclick="openOrder(${r.id})">
          <div class="li-icon" style="background:var(--secondary-container);color:var(--secondary)">\uD83D\uDCE6</div>
          <div class="li-main"><div class="li-title">${esc(r.order_number)} \u00B7 ${esc(r.device_brand || '')} ${esc(r.device_model || '')}</div><div class="li-sub">${esc(r.cname || '-')} \u00B7 ${fmtMoney(r.estimated_value || 0)}</div></div>
          <div class="li-right">${badge(r.status)}<div class="li-when">${fmtDT(r.created_at)}</div></div>
        </div>`).join("") : '<div class="empty"><div class="big">\uD83D\uDCE6</div><div class="msg">No orders</div></div>'}
    </div>
  `;
};
async function orderForm(id) {
  const r = id ? await q1("SELECT * FROM orders WHERE id = ?", [id]) : {};
  const customers = await q("SELECT id, name FROM customers ORDER BY name");
  openModal(modalHead(id ? "Edit Order" : "New Order") + modalBody(`
    <div class="field"><label class="req">Customer</label><select class="select" id="of-cust">${customers.map(c => `<option value="${c.id}" ${r.customer_id==c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div class="row">
      <div class="field"><label>Device</label><input class="input" id="of-device" value="${esc(r.device_type||'')}"></div>
      <div class="field"><label>Quantity</label><input class="input" type="number" id="of-qty" value="${r.quantity||1}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Value</label><input class="input" type="number" id="of-value" value="${r.estimated_value||0}"></div>
      <div class="field"><label>Status</label>
        <select class="select" id="of-status">
          ${["pending","confirmed","in_progress","assembling","testing","ready","delivered","cancelled"].map(s => `<option value="${s}" ${r.status===s||(!r.status && s==='pending')?"selected":""}>${s.replace(/_/g," ")}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label>Notes</label><textarea class="textarea" id="of-notes">${esc(r.notes||'')}</textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="of-save">Save</button>`));
  document.getElementById("of-save").onclick = async () => {
    const data = { customer_id: parseInt(gv("of-cust")), device_type: gv("of-device"), quantity: parseInt(gv("of-qty"))||1, estimated_value: parseFloat(gv("of-value"))||0, status: gv("of-status"), notes: gv("of-notes") };
    if (id) await exec("UPDATE orders SET customer_id=?, device_type=?, quantity=?, estimated_value=?, status=?, notes=?, updated_at=? WHERE id=?", [data.customer_id, data.device_type, data.quantity, data.estimated_value, data.status, data.notes, nowStr(), id]);
    else {
      const num = await nextNumber("ORD", "orders", "order_number");
      await exec("INSERT INTO orders (uuid, order_number, customer_id, device_type, quantity, estimated_value, status, notes, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')", [uuid(), num, data.customer_id, data.device_type, data.quantity, data.estimated_value, data.status, data.notes, SESSION.user.id, nowStr(), nowStr()]);
    }
    toast("Saved", "ok"); closeModal(); navigate("orders");
  };
}
async function openOrder(id) {
  const r = await q1("SELECT o.*, c.name cname FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?", [id]);
  if (!r) return;
  openModal(modalHead(r.order_number) + modalBody(`
    <div class="grid-2">
      <div class="kv"><span class="k">Customer</span><span class="v">${esc(r.cname||'-')}</span></div>
      <div class="kv"><span class="k">Device</span><span class="v">${esc(r.device_type||'-')}</span></div>
      <div class="kv"><span class="k">Qty</span><span class="v">${r.quantity||1}</span></div>
      <div class="kv"><span class="k">Value</span><span class="v">${fmtMoney(r.estimated_value||0)}</span></div>
      <div class="kv"><span class="k">Status</span>${badge(r.status)}</div>
      <div class="kv"><span class="k">Created</span><span class="v">${fmtD(r.created_at)}</span></div>
    </div>
    ${r.notes?`<h3 style="font-size:13px;margin:10px 0 4px">Notes</h3><p style="font-size:13px">${esc(r.notes)}</p>`:''}
  `) + modalActions(`${hasPerm("orders_edit")?`<button class="btn" onclick="closeModal();orderForm(${id})">Edit</button>`:''}<button class="btn primary" onclick="closeModal()">Close</button>`), "lg");
}

/* =====================================================
   OUTSOURCE
   ===================================================== */
VIEWS.outsource = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.outsource.tab) VIEW_STATE.outsource.tab = "jobs";
  const tab = VIEW_STATE.outsource.tab;
  let body = "";
  if (tab === "vendors") {
    const vendors = await q("SELECT * FROM outsource_vendors ORDER BY name");
    body = `
      <div class="page-head"><div><div class="page-title">Vendors</div></div><div class="page-actions"><button class="btn primary" onclick="vendorForm()">+ New</button></div></div>
      <div class="list">
        ${vendors.length ? vendors.map(v => `
          <div class="list-item" onclick="vendorForm(${v.id})">
            <div class="li-icon" style="background:var(--warning-container);color:var(--warning)">${initials(v.name)}</div>
            <div class="li-main"><div class="li-title">${esc(v.name)}</div><div class="li-sub">${esc(v.specialization||'')} \u00B7 ${v.total_devices_sent||0} devices</div></div>
          </div>`).join("") : '<div class="empty">No vendors</div>'}
      </div>`;
  } else {
    const rows = await q("SELECT j.*, c.name cname, v.name vendor_name FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN outsource_vendors v ON v.id=j.outsource_vendor_id WHERE j.is_outsourced = 1 ORDER BY j.outsource_sent_date DESC LIMIT 100");
    body = `
      <div class="page-head"><div><div class="page-title">Outsourced Jobs</div><div class="page-sub">${rows.length} jobs</div></div></div>
      <div class="list">
        ${rows.length ? rows.map(r => `
          <div class="list-item" onclick="openJob(${r.id})">
            <div class="li-icon" style="background:var(--warning-container);color:var(--warning)">\uD83D\uDCE4</div>
            <div class="li-main"><div class="li-title">${esc(r.job_number)} \u00B7 ${esc(r.vendor_name||'-')}</div><div class="li-sub">${esc(r.cname||'-')} \u00B7 ${fmtMoney(r.outsourced_cost||0)}</div></div>
            <div class="li-right">${badge(r.status)}</div>
          </div>`).join("") : '<div class="empty">No outsourced jobs</div>'}
      </div>`;
  }
  el.innerHTML = `<div class="tabs"><div class="tab ${tab==='jobs'?'active':''}" onclick="VIEW_STATE.outsource.tab='jobs';navigate('outsource')">Jobs</div><div class="tab ${tab==='vendors'?'active':''}" onclick="VIEW_STATE.outsource.tab='vendors';navigate('outsource')">Vendors</div></div>${body}`;
};
async function vendorForm(id) {
  const v = id ? await q1("SELECT * FROM outsource_vendors WHERE id = ?", [id]) : {};
  openModal(modalHead(id ? "Edit Vendor" : "New Vendor") + modalBody(`
    <div class="field"><label class="req">Name</label><input class="input" id="vf-name" value="${esc(v.name||'')}"></div>
    <div class="row">
      <div class="field"><label>Mobile</label><input class="input" id="vf-mobile" value="${esc(v.mobile||'')}"></div>
      <div class="field"><label>GSTIN</label><input class="input" id="vf-gstin" value="${esc(v.gstin||'')}"></div>
    </div>
    <div class="field"><label>Specialization</label><input class="input" id="vf-spec" value="${esc(v.specialization||'')}"></div>
    <div class="field"><label>Address</label><textarea class="textarea" id="vf-addr">${esc(v.address||'')}</textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="vf-save">Save</button>`));
  document.getElementById("vf-save").onclick = async () => {
    const data = { name: gv("vf-name"), mobile: gv("vf-mobile"), gstin: gv("vf-gstin"), specialization: gv("vf-spec"), address: gv("vf-addr") };
    if (!data.name) return toast("Name required", "err");
    if (id) await exec("UPDATE outsource_vendors SET name=?, mobile=?, gstin=?, specialization=?, address=?, updated_at=? WHERE id=?", [data.name, data.mobile, data.gstin, data.specialization, data.address, nowStr(), id]);
    else await exec("INSERT INTO outsource_vendors (name, mobile, gstin, specialization, address, total_devices_sent, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,0,?,?, 'pending')", [data.name, data.mobile, data.gstin, data.specialization, data.address, nowStr(), nowStr()]);
    toast("Saved", "ok"); closeModal(); navigate("outsource");
  };
}

/* =====================================================
   AMC
   ===================================================== */
VIEWS.amc = async function () {
  const el = document.getElementById("content");
  const rows = await q("SELECT a.*, c.name cname FROM amc_contracts a LEFT JOIN customers c ON c.id = a.customer_id ORDER BY a.created_at DESC LIMIT 200");
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">AMC Contracts</div><div class="page-sub">${rows.length} contracts</div></div>
      <div class="page-actions">${hasPerm("amc_create") ? '<button class="btn primary" onclick="amcForm()">+ New</button>' : ""}</div>
    </div>
    <div class="list">
      ${rows.length ? rows.map(r => `
        <div class="list-item" onclick="openAMC(${r.id})">
          <div class="li-icon" style="background:var(--success-container);color:var(--success)">\uD83D\uDCC5</div>
          <div class="li-main"><div class="li-title">${esc(r.contract_number)} \u00B7 ${esc(r.cname||'-')}</div><div class="li-sub">${fmtD(r.start_date)} \u2192 ${fmtD(r.end_date)} \u00B7 ${fmtMoney(r.contract_value||0)}</div></div>
          <div class="li-right">${badge(r.status)}</div>
        </div>`).join("") : '<div class="empty"><div class="big">\uD83D\uDCC5</div><div class="msg">No AMC</div></div>'}
    </div>
  `;
};
async function amcForm(id) {
  const r = id ? await q1("SELECT * FROM amc_contracts WHERE id = ?", [id]) : {};
  const customers = await q("SELECT id, name FROM customers ORDER BY name");
  openModal(modalHead(id ? "Edit AMC" : "New AMC") + modalBody(`
    <div class="field"><label class="req">Customer</label><select class="select" id="af-cust">${customers.map(c => `<option value="${c.id}" ${r.customer_id==c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div class="row">
      <div class="field"><label>Machines</label><input class="input" type="number" id="af-machines" value="${r.machines_covered||1}"></div>
      <div class="field"><label>Frequency (days)</label><input class="input" type="number" id="af-freq" value="${r.visit_frequency_days||90}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Start</label><input class="input" type="date" id="af-start" value="${fmtD(r.start_date)}"></div>
      <div class="field"><label>End</label><input class="input" type="date" id="af-end" value="${fmtD(r.end_date)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Value</label><input class="input" type="number" id="af-value" value="${r.contract_value||0}"></div>
      <div class="field"><label>Status</label>
        <select class="select" id="af-status">
          ${["active","expired","cancelled"].map(s => `<option value="${s}" ${r.status===s||(!r.status && s==='active')?"selected":""}>${s}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label>Notes</label><textarea class="textarea" id="af-notes">${esc(r.notes||'')}</textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="af-save">Save</button>`));
  document.getElementById("af-save").onclick = async () => {
    const data = { customer_id: parseInt(gv("af-cust")), machines_covered: parseInt(gv("af-machines"))||1, visit_frequency_days: parseInt(gv("af-freq"))||90, start_date: gv("af-start"), end_date: gv("af-end"), contract_value: parseFloat(gv("af-value"))||0, status: gv("af-status"), notes: gv("af-notes") };
    if (id) await exec("UPDATE amc_contracts SET customer_id=?, machines_covered=?, visit_frequency_days=?, start_date=?, end_date=?, contract_value=?, status=?, notes=?, updated_at=? WHERE id=?", [data.customer_id, data.machines_covered, data.visit_frequency_days, data.start_date, data.end_date, data.contract_value, data.status, data.notes, nowStr(), id]);
    else {
      const num = await nextNumber("AMC", "amc_contracts", "contract_number");
      await exec("INSERT INTO amc_contracts (uuid, contract_number, customer_id, machines_covered, start_date, end_date, visit_frequency_days, contract_value, status, notes, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')", [uuid(), num, data.customer_id, data.machines_covered, data.start_date, data.end_date, data.visit_frequency_days, data.contract_value, data.status, data.notes, SESSION.user.id, nowStr(), nowStr()]);
    }
    toast("Saved", "ok"); closeModal(); navigate("amc");
  };
}
async function openAMC(id) {
  const r = await q1("SELECT a.*, c.name cname FROM amc_contracts a LEFT JOIN customers c ON c.id = a.customer_id WHERE a.id = ?", [id]);
  if (!r) return;
  openModal(modalHead(r.contract_number) + modalBody(`
    <div class="grid-2">
      <div class="kv"><span class="k">Customer</span><span class="v">${esc(r.cname||'-')}</span></div>
      <div class="kv"><span class="k">Status</span>${badge(r.status)}</div>
      <div class="kv"><span class="k">Start</span><span class="v">${fmtD(r.start_date)}</span></div>
      <div class="kv"><span class="k">End</span><span class="v">${fmtD(r.end_date)}</span></div>
      <div class="kv"><span class="k">Value</span><span class="v">${fmtMoney(r.contract_value||0)}</span></div>
      <div class="kv"><span class="k">Machines</span><span class="v">${r.machines_covered||1}</span></div>
    </div>
  `) + modalActions(`${hasPerm("amc_edit")?`<button class="btn" onclick="closeModal();amcForm(${id})">Edit</button>`:''}<button class="btn primary" onclick="closeModal()">Close</button>`), "lg");
}

/* =====================================================
   PICKUP & DELIVERY
   ===================================================== */
VIEWS.pickup = async function () {
  const el = document.getElementById("content");
  const rows = await q("SELECT p.*, c.name cname FROM pickups p LEFT JOIN customers c ON c.id=p.customer_id ORDER BY p.created_at DESC LIMIT 200");
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Pickups</div></div>
      <div class="page-actions">${hasPerm("pickup_create")?'<button class="btn primary" onclick="pickupForm()">+ New</button>':''}</div>
    </div>
    <div class="list">
      ${rows.length ? rows.map(r => `<div class="list-item"><div class="li-icon" style="background:var(--info-container);color:var(--info)">\uD83D\uDE9E</div><div class="li-main"><div class="li-title">${esc(r.pickup_number)} \u00B7 ${esc(r.cname||'-')}</div><div class="li-sub">${esc(r.device_type||'')} \u00B7 ${fmtDT(r.scheduled_date)}</div></div><div class="li-right">${badge(r.status)}</div></div>`).join("") : '<div class="empty">No pickups</div>'}
    </div>`;
};
async function pickupForm() {
  const customers = await q("SELECT id, name FROM customers ORDER BY name");
  openModal(modalHead("New Pickup") + modalBody(`
    <div class="field"><label>Customer</label><select class="select" id="pk-cust">${customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
    <div class="row">
      <div class="field"><label>Device</label><input class="input" id="pk-dev" placeholder="Laptop / Mobile"></div>
      <div class="field"><label>Scheduled</label><input class="input" type="datetime-local" id="pk-date"></div>
    </div>
    <div class="row">
      <div class="field"><label>Contact Phone</label><input class="input" id="pk-phone"></div>
    </div>
    <div class="field"><label>Address</label><textarea class="textarea" id="pk-addr"></textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="pk-save">Save</button>`));
  document.getElementById("pk-save").onclick = async () => {
    const num = await nextNumber("PU", "pickups", "pickup_number");
    await exec("INSERT INTO pickups (uuid, pickup_number, customer_id, device_type, device_details, pickup_address, contact_phone, status, scheduled_date, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending')", [uuid(), num, gv("pk-cust"), gv("pk-dev"), gv("pk-dev"), gv("pk-addr"), gv("pk-phone"), "pending", gv("pk-date"), SESSION.user.id, nowStr(), nowStr()]);
    toast("Pickup created", "ok"); closeModal(); navigate("pickup");
  };
}
VIEWS.delivery = async function () {
  const el = document.getElementById("content");
  const rows = await q("SELECT d.*, c.name cname FROM deliveries d LEFT JOIN customers c ON c.id=d.customer_id ORDER BY d.created_at DESC LIMIT 200");
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Deliveries</div></div>
      <div class="page-actions">${hasPerm("delivery_create")?'<button class="btn primary" onclick="deliveryForm()">+ New</button>':''}</div>
    </div>
    <div class="list">
      ${rows.length ? rows.map(r => `<div class="list-item"><div class="li-icon" style="background:var(--success-container);color:var(--success)">\uD83D\uDE9A</div><div class="li-main"><div class="li-title">${esc(r.delivery_number)} \u00B7 ${esc(r.cname||'-')}</div><div class="li-sub">${fmtDT(r.scheduled_date||r.created_at)}</div></div><div class="li-right">${badge(r.status)}</div></div>`).join("") : '<div class="empty">No deliveries</div>'}
    </div>`;
};
async function deliveryForm() {
  const customers = await q("SELECT id, name FROM customers ORDER BY name");
  const eligible = await q("SELECT id, job_number FROM jobs WHERE status IN ('completed','qc') ORDER BY created_at DESC LIMIT 50");
  openModal(modalHead("New Delivery") + modalBody(`
    <div class="field"><label>Customer</label><select class="select" id="df-cust">${customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Job</label><select class="select" id="df-job">${eligible.map(j=>`<option value="${j.id}">${esc(j.job_number)}</option>`).join("")}</select></div>
    <div class="row">
      <div class="field"><label>Scheduled</label><input class="input" type="datetime-local" id="df-date"></div>
      <div class="field"><label>Contact</label><input class="input" id="df-phone"></div>
    </div>
    <div class="field"><label>Address</label><textarea class="textarea" id="df-addr"></textarea></div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="df-save">Save</button>`));
  document.getElementById("df-save").onclick = async () => {
    const num = await nextNumber("DL", "deliveries", "delivery_number");
    await exec("INSERT INTO deliveries (uuid, delivery_number, job_id, customer_id, delivery_address, contact_phone, status, scheduled_date, created_by, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')", [uuid(), num, gv("df-job") || null, gv("df-cust"), gv("df-addr"), gv("df-phone"), "scheduled", gv("df-date"), SESSION.user.id, nowStr(), nowStr()]);
    toast("Delivery created", "ok"); closeModal(); navigate("delivery");
  };
}

/* =====================================================
   INVENTORY (uses current_stock + selling_price)
   ===================================================== */
VIEWS.inventory = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.inventory.search) VIEW_STATE.inventory.search = "";
  const s = "%" + VIEW_STATE.inventory.search + "%";
  const rows = await q("SELECT * FROM products WHERE (is_active = 1 OR is_active IS NULL) AND (name LIKE ? OR code LIKE ?) ORDER BY name", [s, s]);
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Inventory</div><div class="page-sub">${rows.length} products</div></div>
      <div class="page-actions"><input class="search-box" placeholder="Search..." value="${esc(VIEW_STATE.inventory.search)}" oninput="VIEW_STATE.inventory.search=this.value;navigate('inventory')">${hasPerm("inventory_create")?'<button class="btn primary" onclick="productForm()">+ New</button>':''}</div>
    </div>
    <div class="list">
      ${rows.length ? rows.map(p => `<div class="list-item" onclick="productForm(${p.id})">
        <div class="li-icon" style="background:${p.current_stock<=p.min_stock?'var(--danger-container)':'var(--bg-tertiary)'};color:${p.current_stock<=p.min_stock?'var(--danger)':'var(--text-secondary)'}">\uD83D\uDCE6</div>
        <div class="li-main"><div class="li-title">${esc(p.name)}</div><div class="li-sub">${esc(p.code||'')} \u00B7 Stock: <b>${p.current_stock||0}</b> / Min: ${p.min_stock||0}</div></div>
        <div class="li-right"><div class="li-amount">${fmtMoney(p.selling_price||0)}</div></div>
      </div>`).join("") : '<div class="empty">No products</div>'}
    </div>
  `;
};
async function productForm(id) {
  const p = id ? await q1("SELECT * FROM products WHERE id = ?", [id]) : {};
  openModal(modalHead(id ? "Edit Product" : "New Product") + modalBody(`
    <div class="row">
      <div class="field"><label class="req">Name</label><input class="input" id="pf-name" value="${esc(p.name||'')}"></div>
      <div class="field"><label>Code</label><input class="input" id="pf-code" value="${esc(p.code||'')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Price</label><input class="input" type="number" id="pf-price" value="${p.selling_price||0}"></div>
      <div class="field"><label>Stock</label><input class="input" type="number" id="pf-stock" value="${p.current_stock||0}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Min Stock</label><input class="input" type="number" id="pf-min" value="${p.min_stock||0}"></div>
      <div class="field"><label>Category</label><input class="input" id="pf-cat" value="${esc(p.category||'')}"></div>
    </div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="pf-save">Save</button>`));
  document.getElementById("pf-save").onclick = async () => {
    const data = { name: gv("pf-name"), code: gv("pf-code"), selling_price: parseFloat(gv("pf-price"))||0, current_stock: parseFloat(gv("pf-stock"))||0, min_stock: parseFloat(gv("pf-min"))||0, category: gv("pf-cat") };
    if (!data.name) return toast("Name required", "err");
    if (id) await exec("UPDATE products SET name=?, code=?, selling_price=?, current_stock=?, min_stock=?, category=?, updated_at=? WHERE id=?", [data.name, data.code, data.selling_price, data.current_stock, data.min_stock, data.category, nowStr(), id]);
    else await exec("INSERT INTO products (uuid, name, code, selling_price, current_stock, min_stock, category, is_active, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,1,?,?, 'pending')", [uuid(), data.name, data.code, data.selling_price, data.current_stock, data.min_stock, data.category, nowStr(), nowStr()]);
    toast("Saved", "ok"); closeModal(); navigate("inventory");
  };
}

/* =====================================================
   BILLING / POS (uses payments table)
   ===================================================== */
VIEWS.billing = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.billing.cart) VIEW_STATE.billing.cart = [];
  if (!VIEW_STATE.billing.cartCustomer) VIEW_STATE.billing.cartCustomer = null;
  if (!VIEW_STATE.billing.discount) VIEW_STATE.billing.discount = 0;
  const cart = VIEW_STATE.billing.cart;
  const subtotal = cart.reduce((s, i) => s + (i.selling_price * i.qty), 0);
  const total = Math.max(0, subtotal - (parseFloat(VIEW_STATE.billing.discount) || 0));
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Billing / POS</div><div class="page-sub">${cart.length} items</div></div>
      <div class="page-actions">${hasPerm("billing_create") ? '<button class="btn primary" onclick="posCheckout()">Checkout</button>' : ''}</div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><div class="card-title">Add Products</div></div>
        <input class="search-box" placeholder="Search products..." oninput="posSearch(this.value)" style="margin-bottom:8px">
        <div id="pos-results" class="list"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Cart</div></div>
        <div class="field"><label>Customer</label><input class="input" id="pos-cust" placeholder="Walk-in or customer name" oninput="posCust(this.value)"></div>
        <div id="pos-cart" style="margin:10px 0">
          ${cart.length ? cart.map((i, idx) => `<div class="kv"><span class="k">${esc(i.name)} \u00D7${i.qty}</span><span class="v">${fmtMoney(i.selling_price*i.qty)} <button class="btn sm" onclick="posRemove(${idx})">\u2715</button></span></div>`).join("") : '<div class="empty">Cart is empty</div>'}
        </div>
        <div class="kv" style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px"><span class="k">Subtotal</span><span class="v">${fmtMoney(subtotal)}</span></div>
        <div class="kv"><span class="k">Discount</span><input class="input" type="number" value="${VIEW_STATE.billing.discount}" oninput="VIEW_STATE.billing.discount=this.value;navigate('billing')" style="width:120px;text-align:right"></div>
        <div class="kv" style="font-size:16px"><span class="k"><b>Total</b></span><span class="v"><b>${fmtMoney(total)}</b></span></div>
      </div>
    </div>
  `;
  posSearch("");
};
async function posSearch(qstr) {
  const rows = await q("SELECT * FROM products WHERE (is_active = 1 OR is_active IS NULL) AND (name LIKE ? OR code LIKE ?) LIMIT 20", ["%"+qstr+"%", "%"+qstr+"%"]);
  document.getElementById("pos-results").innerHTML = rows.length ? rows.map(p => `<div class="list-item" onclick="posAdd(${p.id})">
    <div class="li-main"><div class="li-title">${esc(p.name)}</div><div class="li-sub">${esc(p.code||'')} \u00B7 Stock: ${p.current_stock||0}</div></div>
    <div class="li-right"><div class="li-amount">${fmtMoney(p.selling_price||0)}</div></div>
  </div>`).join("") : '<div class="empty">No products</div>';
}
function posAdd(id) {
  const cart = VIEW_STATE.billing.cart;
  q1("SELECT * FROM products WHERE id = ?", [id]).then(p => {
    if (!p) return;
    const ex = cart.find(i => i.id === id);
    if (ex) ex.qty++; else cart.push({ id: p.id, name: p.name, selling_price: p.selling_price || 0, qty: 1 });
    navigate("billing");
  });
}
function posRemove(idx) { VIEW_STATE.billing.cart.splice(idx, 1); navigate("billing"); }
function posCust(name) { VIEW_STATE.billing.cartCustomer = name; }
async function posCheckout() {
  const cart = VIEW_STATE.billing.cart;
  if (!cart.length) return toast("Cart is empty", "err");
  const customer = VIEW_STATE.billing.cartCustomer || "Walk-in";
  const subtotal = cart.reduce((s, i) => s + i.selling_price * i.qty, 0);
  const discount = parseFloat(VIEW_STATE.billing.discount) || 0;
  const total = Math.max(0, subtotal - discount);
  const num = await nextNumber("RCP", "payments", "payment_number");
  let cust = await q1("SELECT * FROM customers WHERE name = ? LIMIT 1", [customer]);
  if (!cust) {
    await exec("INSERT INTO customers (uuid, name, balance, is_active, created_by, created_at, updated_at, sync_status) VALUES (?,?,0,1,?,?,?, 'pending')", [uuid(), customer, SESSION.user.id, nowStr(), nowStr()]);
    cust = await q1("SELECT * FROM customers WHERE name = ? LIMIT 1", [customer]);
  }
  await batch([
    { sql: "INSERT INTO payments (uuid, payment_number, customer_id, amount, payment_mode, reference, notes, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?,?,?, 'pending')", args: [uuid(), num, cust.id, total, "cash", "POS " + num, "POS sale " + num, SESSION.user.id, nowStr()] },
    { sql: "UPDATE customers SET balance = balance - ? WHERE id = ?", args: [total, cust.id] }
  ]);
  for (const i of cart) {
    await exec("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [i.qty, i.id]);
  }
  VIEW_STATE.billing.cart = []; VIEW_STATE.billing.cartCustomer = null; VIEW_STATE.billing.discount = 0;
  toast("Sale " + num + ": " + fmtMoney(total), "ok");
  navigate("billing");
}

/* =====================================================
   ACCOUNTING
   ===================================================== */
VIEWS.accounting = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.accounting.tab) VIEW_STATE.accounting.tab = "transactions";
  const tab = VIEW_STATE.accounting.tab;
  if (tab === "expenses") {
    const rows = await q("SELECT * FROM expenses ORDER BY created_at DESC LIMIT 200");
    el.innerHTML = `
      <div class="tabs"><div class="tab" onclick="VIEW_STATE.accounting.tab='transactions';navigate('accounting')">Transactions</div><div class="tab active">Expenses</div></div>
      <div class="page-head"><div><div class="page-title">Expenses</div></div><div class="page-actions">${hasPerm("accounting_create")?'<button class="btn primary" onclick="expenseForm()">+ New</button>':''}</div></div>
      <div class="list">
        ${rows.length ? rows.map(r => `<div class="list-item"><div class="li-icon" style="background:var(--danger-container);color:var(--danger)">\uD83D\uDCB8</div><div class="li-main"><div class="li-title">${esc(r.category||'')} \u00B7 ${esc(r.description||'')}</div><div class="li-sub">${fmtD(r.expense_date)}</div></div><div class="li-right"><div class="li-amount">${fmtMoney(r.amount||0)}</div></div></div>`).join("") : '<div class="empty">No expenses</div>'}
      </div>`;
  } else {
    const rows = await q("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 200");
    el.innerHTML = `
      <div class="tabs"><div class="tab active">Transactions</div><div class="tab" onclick="VIEW_STATE.accounting.tab='expenses';navigate('accounting')">Expenses</div></div>
      <div class="page-head"><div><div class="page-title">Transactions</div></div></div>
      <div class="list">
        ${rows.length ? rows.map(r => `<div class="list-item"><div class="li-icon" style="background:var(--success-container);color:var(--success)">\uD83D\uDCB3</div><div class="li-main"><div class="li-title">${esc(r.transaction_type||'')} \u00B7 ${esc(r.description||'')}</div><div class="li-sub">${fmtDT(r.transaction_date||r.created_at)}</div></div><div class="li-right"><div class="li-amount">${fmtMoney(r.amount||0)}</div></div></div>`).join("") : '<div class="empty">No transactions</div>'}
      </div>`;
  }
};
async function expenseForm() {
  openModal(modalHead("New Expense") + modalBody(`
    <div class="row">
      <div class="field"><label>Category</label><input class="input" id="ef-cat" placeholder="Rent / Salary / Parts"></div>
      <div class="field"><label>Amount</label><input class="input" type="number" id="ef-amount"></div>
    </div>
    <div class="field"><label>Description</label><textarea class="textarea" id="ef-desc"></textarea></div>
    <div class="row">
      <div class="field"><label>Date</label><input class="input" type="date" id="ef-date" value="${todayStr()}"></div>
      <div class="field"><label>Mode</label><select class="select" id="ef-mode"><option>cash</option><option>upi</option><option>bank</option><option>card</option><option>cheque</option></select></div>
    </div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="ef-save">Save</button>`));
  document.getElementById("ef-save").onclick = async () => {
    await exec("INSERT INTO expenses (uuid, category, amount, description, payment_mode, expense_date, created_by, created_at, sync_status) VALUES (?,?,?,?,?,?,?,?, 'pending')", [uuid(), gv("ef-cat"), parseFloat(gv("ef-amount"))||0, gv("ef-desc"), gv("ef-mode"), gv("ef-date"), SESSION.user.id, nowStr()]);
    toast("Saved", "ok"); closeModal(); navigate("accounting");
  };
}

/* =====================================================
   ATTENDANCE (uses date+punch_in)
   ===================================================== */
VIEWS.attendance = async function () {
  const el = document.getElementById("content");
  const today = todayStr();
  const rows = await q("SELECT * FROM attendance WHERE date = ? ORDER BY id DESC", [today]);
  const myToday = rows.find(r => r.user_id === SESSION.user.id);
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Attendance</div><div class="page-sub">${fmtD(today)}</div></div>
      <div class="page-actions">
        ${!myToday || myToday.punch_out ? '<button class="btn primary" onclick="attendancePunch(\'in\')">Punch In</button>' : ''}
        ${myToday && !myToday.punch_out ? '<button class="btn" onclick="attendancePunch(\'out\')">Punch Out</button>' : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Today</div></div>
      <div class="list">
        ${rows.length ? rows.map(r => `<div class="list-item">
          <div class="li-icon" style="background:${r.punch_out?'var(--bg-tertiary)':'var(--success-container)'};color:${r.punch_out?'var(--text-muted)':'var(--success)'}">${initials(r.user_name)}</div>
          <div class="li-main"><div class="li-title">${esc(r.user_name||'-')}</div><div class="li-sub">In: ${fmtDT(r.punch_in)} ${r.punch_out?'\u00B7 Out: '+fmtDT(r.punch_out):''} ${r.total_hours?'\u00B7 '+r.total_hours+'h':''}</div></div>
          <div class="li-right">${badge(r.status)}</div>
        </div>`).join("") : '<div class="empty">No one has punched in yet</div>'}
      </div>
    </div>
  `;
};
async function attendancePunch(type) {
  const today = todayStr();
  const existing = await q1("SELECT * FROM attendance WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1", [SESSION.user.id, today]);
  if (type === "in") {
    if (existing && !existing.punch_out) return toast("Already punched in", "err");
    await exec("INSERT INTO attendance (user_id, user_name, date, punch_in, day_type, status, created_at) VALUES (?,?,?,?,?,?,?)", [SESSION.user.id, SESSION.user.full_name || SESSION.user.username, today, nowStr(), "full", "present", nowStr()]);
    toast("Punched in", "ok");
  } else {
    if (!existing || existing.punch_out) return toast("Not punched in", "err");
    const inTime = existing.punch_in ? new Date(existing.punch_in.replace(" ", "T")) : new Date();
    const outTime = new Date();
    const hours = Math.round(((outTime - inTime) / 3600000) * 10) / 10;
    await exec("UPDATE attendance SET punch_out=?, total_hours=?, day_type=?, status=?, updated_at=? WHERE id=?", [nowStr(), hours, hours < 4 ? "leave" : "full", hours < 4 ? "absent" : "present", nowStr(), existing.id]);
    toast("Punched out (" + hours + "h)", "ok");
  }
  navigate("attendance");
}

/* =====================================================
   REPORTS
   ===================================================== */
VIEWS.reports = async function () {
  const el = document.getElementById("content");
  if (!VIEW_STATE.reports.from) VIEW_STATE.reports.from = todayStr().slice(0,7)+"-01";
  if (!VIEW_STATE.reports.to) VIEW_STATE.reports.to = todayStr();
  const fr = VIEW_STATE.reports.from, to = VIEW_STATE.reports.to;
  const [sales, jobStats, customers, amc, leads, lowStock] = await Promise.all([
    q("SELECT invoice_number, customer_name, invoice_date, grand_total, paid_amount, balance, payment_status FROM invoices WHERE invoice_date BETWEEN ? AND ? ORDER BY invoice_date DESC LIMIT 100", [fr, to]),
    q("SELECT status, COUNT(*) n FROM jobs WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY status", [fr, to]),
    q("SELECT c.name, c.balance, (SELECT COUNT(*) FROM jobs j WHERE j.customer_id=c.id AND DATE(j.created_at) BETWEEN ? AND ?) jobs, (SELECT COUNT(*) FROM invoices i WHERE i.customer_id=c.id AND i.invoice_date BETWEEN ? AND ?) inv, (SELECT COALESCE(SUM(i2.grand_total),0) FROM invoices i2 WHERE i2.customer_id=c.id AND i2.invoice_date BETWEEN ? AND ?) spent FROM customers c WHERE (c.is_active = 1 OR c.is_active IS NULL) ORDER BY spent DESC LIMIT 50", [fr, to, fr, to, fr, to]),
    q("SELECT contract_number, customer_name, start_date, end_date, contract_value, status FROM amc_contracts ORDER BY created_at DESC LIMIT 50"),
    q("SELECT name, phone, source, status, estimated_value, created_at FROM leads WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 50", [fr, to]),
    q("SELECT name, code, current_stock, min_stock, selling_price FROM products WHERE current_stock <= min_stock AND min_stock > 0 AND (is_active = 1 OR is_active IS NULL) LIMIT 50")
  ]);

  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Reports</div></div>
      <div class="page-actions">
        <input class="input" type="date" value="${fr}" onchange="VIEW_STATE.reports.from=this.value;navigate('reports')" style="width:auto">
        <input class="input" type="date" value="${to}" onchange="VIEW_STATE.reports.to=this.value;navigate('reports')" style="width:auto">
      </div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">\uD83D\uDCC8 Sales</div></div>
      ${sales.length ? repTable(["Invoice","Customer","Date","Total","Paid","Balance","Status"], sales.map(r => [esc(r.invoice_number||'-'), esc(r.customer_name||'-'), fmtD(r.invoice_date), fmtMoney(r.grand_total||0), fmtMoney(r.paid_amount||0), fmtMoney(r.balance||0), badge(r.payment_status)])) : '<div class="empty">No sales</div>'}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">\uD83D\uDD27 Job Status</div></div>
      ${jobStats.length ? repTable(["Status","Count"], jobStats.map(r => [badge(r.status), r.n])) : '<div class="empty">No jobs</div>'}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">\uD83D\uDC65 Top Customers</div></div>
      ${customers.length ? repTable(["Customer","Jobs","Invoices","Spent","Balance"], customers.map(r => [esc(r.name), r.jobs, r.inv, fmtMoney(r.spent), fmtMoney(r.balance||0)])) : '<div class="empty">No data</div>'}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">\uD83D\uDCC5 AMC</div></div>
      ${amc.length ? repTable(["Contract","Customer","Period","Value","Status"], amc.map(r => [esc(r.contract_number||'-'), esc(r.customer_name||'-'), fmtD(r.start_date)+" - "+fmtD(r.end_date), fmtMoney(r.contract_value||0), badge(r.status)])) : '<div class="empty">No contracts</div>'}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">\uD83C\uDFAF Leads</div></div>
      ${leads.length ? repTable(["Name","Phone","Source","Status","Value","Created"], leads.map(r => [esc(r.name), esc(r.phone||'-'), esc(r.source||'-'), badge(r.status), fmtMoney(r.estimated_value||0), fmtD(r.created_at)])) : '<div class="empty">No leads</div>'}
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">\uD83D\uDCE6 Low Stock</div></div>
      ${lowStock.length ? repTable(["Product","Code","Stock","Min","Price"], lowStock.map(r => [esc(r.name), esc(r.code||'-'), r.current_stock, r.min_stock, fmtMoney(r.selling_price||0)])) : '<div class="empty">All stock OK</div>'}
    </div>
  `;
};
function repTable(headers, rows) {
  return `<div class="table-wrap"><table class="tbl"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* =====================================================
   EMPLOYEES
   ===================================================== */
VIEWS.employees = async function () {
  const el = document.getElementById("content");
  const rows = await q("SELECT id, username, full_name, display_name, phone, email, role, is_active FROM users ORDER BY full_name");
  el.innerHTML = `
    <div class="page-head">
      <div><div class="page-title">Employees</div><div class="page-sub">${rows.length} users</div></div>
      <div class="page-actions">${hasPerm("user_manage")?'<button class="btn primary" onclick="employeeForm()">+ New</button>':''}</div>
    </div>
    <div class="list">
      ${rows.map(r => `<div class="list-item" onclick="employeeForm(${r.id})">
        <div class="li-icon" style="background:var(--secondary-container);color:var(--secondary)">${initials(r.full_name||r.username)}</div>
        <div class="li-main"><div class="li-title">${esc(r.full_name||r.username)}</div><div class="li-sub">${esc(r.username)} \u00B7 ${badge(r.role)}</div></div>
        <div class="li-right">${r.is_active?badge('active'):badge('inactive')}</div>
      </div>`).join("")}
    </div>
  `;
};
async function employeeForm(id) {
  const u = id ? await q1("SELECT * FROM users WHERE id = ?", [id]) : {};
  openModal(modalHead(id ? "Edit Employee" : "New Employee") + modalBody(`
    <div class="row">
      <div class="field"><label class="req">Username</label><input class="input" id="ef-username" value="${esc(u.username||'')}" ${id?'disabled':''}></div>
      <div class="field"><label class="req">Full Name</label><input class="input" id="ef-fullname" value="${esc(u.full_name||'')}"></div>
    </div>
    <div class="field"><label>${id?'New Password (blank = keep)':'Password'}</label><input class="input" type="password" id="ef-password" placeholder="${id?'Leave blank to keep':'Min 6 chars'}"></div>
    <div class="row">
      <div class="field"><label>Display Name</label><input class="input" id="ef-display" value="${esc(u.display_name||'')}"></div>
      <div class="field"><label>Phone</label><input class="input" id="ef-phone" value="${esc(u.phone||'')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Email</label><input class="input" id="ef-email" value="${esc(u.email||'')}"></div>
      <div class="field"><label>Role</label>
        <select class="select" id="ef-role">
          ${["super_admin","admin","receptionist","technician","accounts","store","sales","operations","delivery_exec","pickup_exec","amc_manager"].map(r => `<option value="${r}" ${u.role===r?"selected":""}>${r.replace(/_/g," ")}</option>`).join("")}
        </select>
      </div>
    </div>
  `) + modalActions(`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="ef-save">Save</button>`));
  document.getElementById("ef-save").onclick = async () => {
    const username = gv("ef-username"), full_name = gv("ef-fullname"), password = gv("ef-password");
    if (!username || !full_name) return toast("Username and full name required", "err");
    if (id) {
      const updates = ["full_name=?", "display_name=?", "phone=?", "email=?", "role=?", "updated_at=?"];
      const args = [full_name, gv("ef-display"), gv("ef-phone"), gv("ef-email"), gv("ef-role"), nowStr()];
      if (password) { updates.push("password_hash=?"); args.push(hashPassword(password)); }
      args.push(id);
      await exec("UPDATE users SET " + updates.join(", ") + " WHERE id=?", args);
    } else {
      if (!password || password.length < 6) return toast("Password min 6 chars", "err");
      await exec("INSERT INTO users (uuid, username, full_name, display_name, phone, email, role, password_hash, is_active, created_at, updated_at, sync_status) VALUES (?,?,?,?,?,?,?,?,1,?,?, 'pending')",
        [uuid(), username, full_name, gv("ef-display"), gv("ef-phone"), gv("ef-email"), gv("ef-role"), hashPassword(password), nowStr(), nowStr()]);
    }
    toast("Saved", "ok"); closeModal(); navigate("employees");
  };
}

/* =====================================================
   SETTINGS
   ===================================================== */
VIEWS.settings = async function () {
  const el = document.getElementById("content");
  const s = await q("SELECT * FROM settings");
  const map = {};
  s.forEach(r => map[r.key] = r.value);
  el.innerHTML = `
    <div class="page-head"><div><div class="page-title">Settings</div></div></div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">Business Details</div></div>
      <div class="row">
        <div class="field"><label>Company Name</label><input class="input" id="st-co" value="${esc(map.company_name||'')}"></div>
        <div class="field"><label>Phone</label><input class="input" id="st-ph" value="${esc(map.company_phone||'')}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Email</label><input class="input" id="st-em" value="${esc(map.company_email||'')}"></div>
        <div class="field"><label>GSTIN</label><input class="input" id="st-gst" value="${esc(map.gstin||'')}"></div>
      </div>
      <div class="field"><label>Address</label><textarea class="textarea" id="st-addr">${esc(map.company_address||'')}</textarea></div>
      <div class="row">
        <div class="field"><label>UPI ID</label><input class="input" id="st-upi" value="${esc(map.upi_id||'')}"></div>
        <div class="field"><label>UPI Name</label><input class="input" id="st-upin" value="${esc(map.upi_name||'')}"></div>
      </div>
      <button class="btn primary" onclick="settingsSave()">Save</button>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Change Password</div></div>
      <div class="field"><label>Current Password</label><input class="input" type="password" id="st-cur"></div>
      <div class="field"><label>New Password</label><input class="input" type="password" id="st-new"></div>
      <div class="field"><label>Confirm</label><input class="input" type="password" id="st-cnf"></div>
      <button class="btn primary" onclick="changePassword()">Change</button>
    </div>
  `;
};
async function settingsSave() {
  const items = [["company_name",gv("st-co")],["company_phone",gv("st-ph")],["company_email",gv("st-em")],["gstin",gv("st-gst")],["company_address",gv("st-addr")],["upi_id",gv("st-upi")],["upi_name",gv("st-upin")]];
  for (const [k, v] of items) {
    await exec("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [k, v]);
  }
  toast("Saved", "ok");
}
async function changePassword() {
  const cur = gv("st-cur"), nw = gv("st-new"), cf = gv("st-cnf");
  if (!cur || !nw) return toast("All fields required", "err");
  if (nw !== cf) return toast("Passwords don't match", "err");
  const u = await q1("SELECT password_hash FROM users WHERE id = ?", [SESSION.user.id]);
  if (!u || !verifyPassword(cur, u.password_hash || "")) return toast("Current password wrong", "err");
  await exec("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [hashPassword(nw), nowStr(), SESSION.user.id]);
  toast("Changed", "ok");
  gv("st-cur", ""); gv("st-new", ""); gv("st-cnf", "");
}

/* =====================================================
   RECYCLE BIN
   ===================================================== */
VIEWS.recycle_bin = async function () {
  const el = document.getElementById("content");
  if (!hasPerm("settings_view")) { el.innerHTML = '<div class="empty">No access</div>'; return; }
  const rows = await q("SELECT * FROM recycle_bin ORDER BY deleted_at DESC LIMIT 100");
  el.innerHTML = `
    <div class="page-head"><div><div class="page-title">Recycle Bin</div><div class="page-sub">${rows.length} items</div></div></div>
    <div class="list">
      ${rows.length ? rows.map(r => `<div class="list-item">
        <div class="li-icon" style="background:var(--bg-tertiary);color:var(--text-muted)">\uD83D\uDDD1</div>
        <div class="li-main"><div class="li-title">${esc(r.table_name)} #${esc(r.record_id)}</div><div class="li-sub">Deleted ${fmtDT(r.deleted_at)} by ${esc(r.deleted_by_name||'-')}</div></div>
        <div class="li-right"><button class="btn sm" onclick="toast('Restore from desktop only','ok')">Info</button></div>
      </div>`).join("") : '<div class="empty">Empty</div>'}
    </div>
  `;
};

