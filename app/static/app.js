/* J1SPA DSS - vanilla JS front end (no external libraries; runs offline). */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const peso = n => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = n => Number(n || 0).toLocaleString("en-PH");

async function api(url, opts = {}) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status, data });
  return data;
}

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids) n.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ""));
  return n;
}

/* ---------- tiny inline-SVG charts (offline, no CDN) ---------- */
function barChart(container, rows, { label, value, value2, h = 220 } = {}) {
  container.innerHTML = "";
  if (!rows.length) { container.append(el("p", { class: "muted" }, "No data yet.")); return; }
  const padL = 34, padB = 56, padT = 20;
  const slot = value2 ? 76 : 66;
  const w = Math.max(340, rows.length * slot + padL + 12);
  const max = Math.max(1, ...rows.map(r => Math.max(+r[value] || 0, value2 ? +r[value2] || 0 : 0))) * 1.2;
  const baseY = h - padB, innerH = baseY - padT;
  const Y = v => padT + (1 - v / max) * innerH;
  const bw = value2 ? 18 : 32, gap = (w - padL - 12) / rows.length;
  const ellip = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;

  const yticks = [0, max / 2, max].map(v => `
    <line class="gridline" x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${w - 4}" y2="${Y(v).toFixed(1)}"/>
    <text class="lbl" x="${padL - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`).join("");

  const bars = rows.map((r, i) => {
    const slotW = value2 ? bw * 2 + 3 : bw;
    const x0 = padL + i * gap + (gap - slotW) / 2;
    const v1 = +r[value] || 0, y1 = Y(v1), hgt1 = Math.max(0, baseY - y1);
    const cx = x0 + slotW / 2;
    const v2 = value2 ? +r[value2] || 0 : null;
    const bar2 = value2 != null ? (() => {
      const y2 = Y(v2), hgt2 = Math.max(0, baseY - y2);
      return `<rect class="bar2" x="${(x0 + bw + 3).toFixed(1)}" y="${y2.toFixed(1)}" width="${bw}" height="${hgt2.toFixed(1)}" rx="3"/>`;
    })() : "";
    return `<g><title>${r[label]}: ${int(v1)}${value2 != null ? " / " + int(v2) : ""}</title>
      <rect class="bar" x="${x0.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw}" height="${hgt1.toFixed(1)}" rx="3"/>
      ${bar2}
      <text class="lbl val" x="${cx.toFixed(1)}" y="${(y1 - 6).toFixed(1)}" text-anchor="middle">${int(v1)}</text>
      <text class="lbl" x="${cx.toFixed(1)}" y="${(baseY + 14).toFixed(1)}" text-anchor="end"
        transform="rotate(-30 ${cx.toFixed(1)} ${(baseY + 14).toFixed(1)})">${ellip(String(r[label]), 14)}</text>
    </g>`;
  }).join("");

  container.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${yticks}
    <line class="axis" x1="${padL}" y1="${baseY}" x2="${w - 4}" y2="${baseY}"/>
    ${bars}
  </svg>`;
}

/* historical (solid) + forecast (dashed) line chart with a "now" divider */
function histForecastChart(container, hist, fc, { h = 260 } = {}) {
  container.innerHTML = "";
  const nH = hist.length, nF = fc.length;
  if (nH < 2) { container.append(el("p", { class: "muted" }, "Not enough history to plot.")); return; }
  const total = nH + nF;
  const w = Math.max(560, total * 14 + 60);
  const padL = 34, padB = 24, padT = 8;
  const all = [...hist.map(p => p.units), ...fc];
  const max = Math.max(10, ...all) * 1.15;
  const X = i => padL + (i / (total - 1)) * (w - padL - 8);
  const Y = v => padT + (1 - v / max) * (h - padT - padB);
  const line = pts => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

  const histPts = hist.map((p, i) => [X(i), Y(p.units)]);
  const joinVal = hist[nH - 1].units;
  const fcPts = [[X(nH - 1), Y(joinVal)], ...fc.map((v, i) => [X(nH + i), Y(v)])];

  const yticks = [0, max / 2, max].map(v => `
    <line class="gridline" x1="${padL}" y1="${Y(v)}" x2="${w}" y2="${Y(v)}"/>
    <text class="lbl" x="${padL - 6}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`).join("");

  // sparse x labels: every ~Math.ceil(total/12)
  const step = Math.max(1, Math.ceil(total / 12));
  let xlabels = "";
  for (let i = 0; i < total; i += step) {
    const lab = i < nH ? (hist[i].label || "").split(" ")[0] : "+" + (i - nH + 1) + "d";
    xlabels += `<text class="lbl" x="${X(i)}" y="${h - 6}" text-anchor="middle">${lab}</text>`;
  }
  const nowX = X(nH - 1);
  container.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${yticks}
    <line class="nowline" x1="${nowX}" y1="${padT}" x2="${nowX}" y2="${h - padB}"/>
    <path class="hline" d="${line(histPts)}"/>
    <path class="fline" d="${line(fcPts)}"/>
    ${xlabels}
  </svg>`;
}

/* single-series solid line chart (e.g. monthly volume trend) */
function simpleLineChart(container, points, { h = 180 } = {}) {
  container.innerHTML = "";
  if (points.length < 2) { container.append(el("p", { class: "muted" }, "Not enough history to plot.")); return; }
  const n = points.length;
  const w = Math.max(320, n * 90);
  const padL = 40, padB = 24, padT = 10;
  const max = Math.max(10, ...points.map(p => p.units)) * 1.15;
  const X = i => padL + (i / (n - 1)) * (w - padL - 10);
  const Y = v => padT + (1 - v / max) * (h - padT - padB);
  const pts = points.map((p, i) => [X(i), Y(p.units)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

  const yticks = [0, max / 2, max].map(v => `
    <line class="gridline" x1="${padL}" y1="${Y(v)}" x2="${w}" y2="${Y(v)}"/>
    <text class="lbl" x="${padL - 6}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`).join("");
  const xlabels = points.map((p, i) => `<text class="lbl" x="${X(i)}" y="${h - 6}" text-anchor="middle">${p.label}</text>`).join("");
  const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--brand)"><title>${points[i].label}: ${int(points[i].units)} units</title></circle>`).join("");

  container.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${yticks}
    <path class="vline" d="${line}"/>
    ${dots}
    ${xlabels}
  </svg>`;
}

/* donut chart with a colored-dot legend (category / share breakdowns) */
function donutChart(container, slices, { size = 150, stroke = 20 } = {}) {
  container.innerHTML = "";
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) { container.append(el("p", { class: "muted" }, "No data yet.")); return; }
  const r = (size - stroke) / 2, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  const arcs = slices.map(s => {
    const frac = s.value / total;
    const seg = frac * circ;
    const dash = `${seg.toFixed(2)} ${(circ - seg).toFixed(2)}`;
    const offset = -acc.toFixed(2);
    acc += seg;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}"
      stroke-width="${stroke}" stroke-dasharray="${dash}" stroke-dashoffset="${offset}">
      <title>${s.label}: ${Math.round(frac * 100)}%</title></circle>`;
  }).join("");

  const wrap = el("div", { class: "donut-wrap" });
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
      style="transform:rotate(-90deg);transform-origin:50% 50%">${arcs}</svg>`;
  const legend = el("div", { class: "donut-legend" });
  slices.forEach(s => legend.append(el("div", { class: "dl-row" },
    el("span", { class: "sw", style: `background:${s.color}` }),
    el("span", { class: "lab" }, s.label),
    el("span", { class: "pct" }, Math.round(s.value / total * 100) + "%"))));
  wrap.append(legend);
  container.append(wrap);
}

/* =========================================================
   DIRECT SALES ENTRY
   ========================================================= */
const SALE_QUEUE_KEY = "j1spa_sale_queue";

function loadQueue() { try { return JSON.parse(localStorage.getItem(SALE_QUEUE_KEY) || "[]"); } catch { return []; } }
function saveQueue(q) { try { localStorage.setItem(SALE_QUEUE_KEY, JSON.stringify(q)); } catch {} }

async function flushQueue(onMsg) {
  let q = loadQueue();
  if (!q.length) return;
  const still = [];
  for (const body of q) {
    try { await api("/sales/confirm", { method: "POST", body: JSON.stringify(body) }); }
    catch (e) { if (e.status && e.status >= 400 && e.status < 500) { /* drop bad */ } else still.push(body); }
  }
  saveQueue(still);
  if (onMsg) onMsg(q.length - still.length, still.length);
}

function salesScreen() {
  const cart = new Map();           // product_id -> {name, price, qty, stock}
  const listBox = $("#prodList"), cartBody = $("#cart tbody");
  const search = $("#prodSearch"), reviewBtn = $("#reviewBtn");

  const drawCart = () => {
    cartBody.innerHTML = "";
    let total = 0;
    for (const [pid, l] of cart) {
      total += l.price * l.qty;
      const row = el("tr", {},
        el("td", {}, l.name),
        el("td", {}, peso(l.price)),
        el("td", { class: "num" }, stepper(l.qty, 1, l.stock, v => { l.qty = v; if (v <= 0) cart.delete(pid); drawCart(); })),
        el("td", { class: "num" }, peso(l.price * l.qty)),
        el("td", {}, el("button", { class: "secondary", onclick: () => { cart.delete(pid); drawCart(); } }, "x")));
      cartBody.append(row);
    }
    $("#cartTotal").textContent = total.toFixed(2);
    reviewBtn.disabled = cart.size === 0;
  };

  const drawProducts = rows => {
    listBox.innerHTML = "";
    rows.forEach(p => {
      const card = el("div", { class: "prod-card" + (p.stock_on_hand <= 0 ? " low" : "") },
        el("div", {}, el("div", {}, p.name),
          el("div", { class: "meta" }, `${p.sku} - ${p.brand} - ${peso(p.unit_price)} - on hand ${p.stock_on_hand}`)),
        el("button", {
          onclick: () => {
            if (p.stock_on_hand <= 0) return;
            const l = cart.get(p.product_id) || { name: p.name, price: p.unit_price, qty: 0, stock: p.stock_on_hand };
            l.qty = Math.min(l.qty + 1, p.stock_on_hand); cart.set(p.product_id, l); drawCart();
          }
        }, "Add"));
      listBox.append(card);
    });
  };

  const doSearch = debounce(async () => {
    try { drawProducts(await api("/sales/api/products?q=" + encodeURIComponent(search.value))); }
    catch (e) { listBox.innerHTML = `<p class="muted">Search failed: ${e.message}</p>`; }
  }, 200);
  search.addEventListener("input", doSearch);
  doSearch();

  const dlg = $("#confirmDlg");
  reviewBtn.addEventListener("click", () => {
    const rows = [...cart.values()];
    $("#confirmSummary").innerHTML =
      rows.map(l => `<div>${l.qty} &times; ${l.name} (${peso(l.price)} each) = ${peso(l.qty * l.price)}</div>`).join("") +
      `<hr><b>Total ${peso(rows.reduce((s, l) => s + l.qty * l.price, 0))}</b>`;
    dlg.showModal();
  });

  dlg.querySelector('button[value="cancel"]').addEventListener("click", () => dlg.close());

  $("#confirmBtn").addEventListener("click", async e => {
    e.preventDefault(); dlg.close();
    const body = {
      items: [...cart.entries()].map(([product_id, l]) => ({ product_id, qty: l.qty })),
      note: $("#saleNote").value,
    };
    const res = $("#result");

    let r;
    try {
      r = await api("/sales/confirm", { method: "POST", body: JSON.stringify(body) });
    } catch (err) {
      if (err.status) {                       // server rejected it (e.g. not enough stock)
        res.className = "result err"; res.textContent = err.message;
      } else {                                // could not reach the server at all
        const q = loadQueue(); q.push(body); saveQueue(q);
        res.className = "result err";
        res.textContent = "Could not reach the server. The sale is saved on this device "
          + "and will be submitted automatically when the connection returns.";
        cart.clear(); drawCart();
      }
      return;
    }

    // success — recorded on the server
    res.className = "result ok";
    res.textContent = `Sale #${r.sale_id} recorded: ${r.lines} line(s), total ${peso(r.total_amount)}.`;
    cart.clear(); drawCart(); $("#saleNote").value = "";
    loadRecent();
  });

  async function loadRecent() {
    try {
      const sales = await api("/sales/recent");
      const tb = $("#recentTbl tbody"); tb.innerHTML = "";
      sales.forEach(s => tb.append(el("tr", {},
        el("td", {}, "#" + s.sale_id),
        el("td", {}, s.sale_ts),
        el("td", {}, s.cashier),
        el("td", { class: "num" }, s.lines),
        el("td", { class: "num" }, peso(s.total_amount)),
        el("td", {}, s.status),
        el("td", {}, s.status === "confirmed"
          ? el("button", { class: "secondary", onclick: () => voidSale(s.sale_id) }, "Void")
          : ""))));
    } catch {}
  }
  async function voidSale(id) {
    if (!confirm("Void sale #" + id + "? Stock will be restored.")) return;
    try { await api(`/sales/${id}/void`, { method: "POST" }); loadRecent(); doSearch(); }
    catch (e) { alert(e.message); }
  }

  flushQueue((done) => { if (done) loadRecent(); });
  setInterval(() => flushQueue(() => loadRecent()), 30000);
  loadRecent();
}

/* =========================================================
   STOCK IN
   ========================================================= */
function stockInScreen() {
  const cart = new Map();
  const listBox = $("#prodList"), cartBody = $("#cart tbody");
  const search = $("#prodSearch"), recordBtn = $("#recordBtn");

  const draw = () => {
    cartBody.innerHTML = "";
    for (const [pid, l] of cart) {
      cartBody.append(el("tr", {},
        el("td", {}, `${l.name} (${l.sku})`),
        el("td", { class: "num" }, l.stock),
        el("td", { class: "num" }, stepper(l.qty, -9999, 99999, v => { l.qty = v; draw(); })),
        el("td", {}, el("button", { class: "secondary", onclick: () => { cart.delete(pid); draw(); } }, "x"))));
    }
    recordBtn.disabled = cart.size === 0;
  };
  const drawProducts = rows => {
    listBox.innerHTML = "";
    rows.forEach(p => listBox.append(el("div", { class: "prod-card" },
      el("div", {}, el("div", {}, p.name),
        el("div", { class: "meta" }, `${p.sku} - on hand ${p.stock_on_hand} - ROP ${p.reorder_point}`)),
      el("button", {
        onclick: () => {
          const l = cart.get(p.product_id) || { name: p.name, sku: p.sku, stock: p.stock_on_hand, qty: 1 };
          cart.set(p.product_id, l); draw();
        }
      }, "Add"))));
  };
  const doSearch = debounce(async () => {
    try { drawProducts(await api("/stockin/api/products?q=" + encodeURIComponent(search.value))); } catch {}
  }, 200);
  search.addEventListener("input", doSearch); doSearch();

  recordBtn.addEventListener("click", async () => {
    const body = {
      type: $("#moveType").value,
      reference: $("#moveRef").value,
      items: [...cart.entries()].map(([product_id, l]) => ({ product_id, qty: l.qty })),
    };
    const res = $("#result");
    try {
      const r = await api("/stockin/confirm", { method: "POST", body: JSON.stringify(body) });
      res.className = "result ok";
      res.innerHTML = "Recorded:<br>" + r.recorded.map(x => `${x.name}: ${x.change > 0 ? "+" : ""}${x.change} -> ${x.balance}`).join("<br>");
      cart.clear(); draw(); doSearch();
    } catch (e) { res.className = "result err"; res.textContent = e.message; }
  });
}

/* =========================================================
   PRODUCT MANAGEMENT
   ========================================================= */
function productsScreen() {
  const form = $("#prodForm"), msg = $("#formMsg"), search = $("#prodSearch");
  const catSel = $("#category"), catNew = $("#categoryNew");

  const syncCategoryNew = () => {
    const adding = catSel.value === "__new__";
    catNew.classList.toggle("hidden", !adding);
    if (adding) catNew.focus();
  };
  catSel.addEventListener("change", syncCategoryNew);

  async function loadCategories(selected) {
    try {
      const cats = await api("/products/api/categories");
      if (selected && !cats.includes(selected)) cats.push(selected);
      cats.sort();
      catSel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("")
        + `<option value="__new__">+ Add new category…</option>`;
      catSel.value = selected && cats.includes(selected) ? selected : (cats[0] || "__new__");
    } catch {}
    syncCategoryNew();
  }

  const reset = () => {
    form.reset(); $("#product_id").value = ""; $("#is_active").checked = true;
    $("#sku").disabled = false; $("#formTitle").textContent = "Add Product";
    $("#opening_stock").disabled = false; msg.textContent = "";
    loadCategories();
  };
  $("#resetBtn").addEventListener("click", reset);

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (catSel.value === "__new__" && !catNew.value.trim()) {
      msg.className = "result err"; msg.textContent = "Enter a name for the new category.";
      return;
    }
    const fd = new FormData(form);
    fd.set("is_active", $("#is_active").checked ? "1" : "0");
    if (catSel.value === "__new__") fd.set("category", catNew.value.trim());
    try {
      const r = await api("/products/save", { method: "POST", body: fd, headers: {} });
      msg.className = "result ok"; msg.textContent = `Product ${r.mode}.`;
      reset(); loadList();
    } catch (err) { msg.className = "result err"; msg.textContent = err.message; }
  });

  const TRASH_SVG = '<svg class="trash-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
    + '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'
    + '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  async function removeProduct(p) {
    const ok = confirm(`Delete ${p.sku} — ${p.name}?\n\n`
      + `If it has recorded sales or stock history it will be deactivated `
      + `(hidden from active lists) instead of permanently deleted.`);
    if (!ok) return;
    try {
      const r = await api("/products/api/delete", {
        method: "POST", body: JSON.stringify({ product_id: p.product_id }),
      });
      msg.className = "result ok"; msg.textContent = r.message;
      loadList();
    } catch (err) { msg.className = "result err"; msg.textContent = err.message; }
  }

  async function loadList() {
    try {
      const rows = await api("/products/api/list?q=" + encodeURIComponent(search.value));
      const tb = $("#catalogTbl tbody"); tb.innerHTML = "";
      rows.forEach(p => tb.append(el("tr", { class: p.is_active ? "" : "row-inactive" },
        el("td", {}, p.sku), el("td", {}, p.name), el("td", {}, p.category),
        el("td", { class: "num" }, peso(p.unit_cost)), el("td", { class: "num" }, peso(p.unit_price)),
        el("td", { class: "num" }, p.reorder_point), el("td", { class: "num" }, p.stock_on_hand),
        el("td", {},
          el("span", { class: "stat stat-norecentsales" },
            p.source_type === "Historical Migration" ? "Historical import" : "Direct entry"),
          p.is_active ? "" : el("span", { class: "stat stat-lowstock", style: "margin-left:4px" }, "Inactive")),
        el("td", { class: "row-actions" },
          el("button", { class: "secondary", onclick: () => fill(p) }, "Edit"),
          el("button", {
            class: "icon-btn danger", title: "Delete " + p.sku, html: TRASH_SVG,
            onclick: () => removeProduct(p),
          })))));
    } catch {}
  }
  async function fill(p) {
    $("#formTitle").textContent = "Edit " + p.sku;
    $("#product_id").value = p.product_id;
    $("#sku").value = p.sku; $("#sku").disabled = true;
    $("#name").value = p.name; $("#brand").value = p.brand;
    await loadCategories(p.category);
    $("#supplier").value = p.supplier;
    $("#unit_cost").value = p.unit_cost; $("#unit_price").value = p.unit_price;
    $("#reorder_point").value = p.reorder_point;
    $("#opening_stock").value = p.stock_on_hand; $("#opening_stock").disabled = true;
    $("#is_active").checked = !!p.is_active;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  search.addEventListener("input", debounce(loadList, 200));
  loadCategories();
  loadList();
}

/* =========================================================
   EXECUTIVE DASHBOARD  (built-in analytics dashboard)
   ========================================================= */
function dashboardScreen() {
  const CAT_COLORS = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)"];
  let allRows = [];

  function renderTracking() {
    const catV = $("#catFilter").value, statusV = $("#statusFilter").value, moveV = $("#moveFilter").value;
    const rows = allRows.filter(r =>
      (!catV || r.category === catV) && (!statusV || r.status === statusV) && (!moveV || r.movement === moveV));
    const tb = $("#velTbl tbody"); tb.innerHTML = "";
    const lvlClass = s => s === "Low stock" ? "lvl-crit" : s === "Overstocked" ? "lvl-warn" : "lvl-good";
    const pill = s => `<span class="stat stat-${s.toLowerCase().replace(/[^a-z]/g, "")}">${s}</span>`;
    rows.forEach(r => {
      const pct = Math.max(4, Math.min(100, Math.round(r.stock_on_hand / Math.max(1, r.reorder_point * 2) * 100)));
      const lvl = el("div", { class: "stocklvl" },
        el("span", { class: "track" }, el("span", { class: `fill ${lvlClass(r.status)}`, style: `width:${pct}%` })),
        el("span", { class: "n" }, int(r.stock_on_hand)));
      const tr = el("tr", {
        class: "clickable",
        onclick: () => { location.href = "/forecasting/?sku=" + encodeURIComponent(r.sku); },
      },
        el("td", {}, el("a", { href: "/forecasting/?sku=" + encodeURIComponent(r.sku) }, r.sku)),
        el("td", {}, r.name),
        el("td", {}, r.category),
        el("td", {}, r.movement),
        el("td", { class: "num" }, lvl),
        el("td", { html: pill(r.status) }));
      tb.append(tr);
    });
    $("#velNote").textContent =
      `${rows.length} of ${allRows.length} active items shown. Movement class = trailing-90-day unit volume. `
      + `Status compares current stock to the reorder point. Values reflect the last ETL sync.`;
  }

  async function load() {
    try {
      const k = await api("/analytics/api/kpis");
      $("#dashMeta").innerHTML =
        `Historical repository: ${k.historical_window}<br>Last sync: ${k.last_sync}`;
      const d = k.gross_profit_margin_delta_pct;
      const delta = d == null ? "" :
        ` <span style="font-size:12px;color:${d >= 0 ? "var(--ok)" : "var(--crit)"}">`
        + `${d >= 0 ? "▲ +" : "▼ "}${d}%</span>`;
      $("#kpis").innerHTML = "";
      const kpi = (vHtml, label) => el("div", { class: "kpi" },
        el("div", { class: "v", html: vHtml }), el("div", { class: "k" }, label));
      $("#kpis").append(
        kpi(k.gross_profit_margin_pct + "%" + delta, "Gross profit margin"),
        kpi(peso(k.avg_transaction_value), "Average transaction value"),
        kpi(int(k.sku_count), "Active SKUs"));
    } catch (e) { $("#dashMeta").textContent = "Could not load KPIs: " + e.message; }

    try {
      const rows = await api("/analytics/api/velocity-table");
      allRows = rows;

      // ---- operational KPI cards ----
      const totalStock = rows.reduce((s, r) => s + r.stock_on_hand, 0);
      const lowStock = rows.filter(r => r.status === "Low stock").length;
      const noSales = rows.filter(r => r.movement === "No recent sales").length;
      const card = (icClass, iconSvg, vTxt, kTxt, href, onClick) => {
        const c = el("div", { class: "kpi2" + (onClick ? " kpi2-clickable" : "") });
        c.innerHTML = `<div class="kpi2-top">
            <div class="kpi2-ic ${icClass}">${iconSvg}</div>
            <a class="kpi2-arrow" href="${href}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></a>
          </div>
          <div class="v">${vTxt}</div><div class="k">${kTxt}</div>`;
        if (onClick) {
          const go = e => { e.preventDefault(); onClick(); };
          c.addEventListener("click", go);
          c.querySelector(".kpi2-arrow").addEventListener("click", go);
        }
        return c;
      };
      const filterTrackingTo = (moveVal, statusVal) => {
        $("#moveFilter").value = moveVal || "";
        $("#statusFilter").value = statusVal || "";
        $("#catFilter").value = "";
        renderTracking();
        $("#trackingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      };
      $("#opsKpis").innerHTML = "";
      $("#opsKpis").append(
        card("ic-brand", '<svg viewBox="0 0 24 24"><path d="M4 4h16v5H4V4zm1 6h14v10H5V10zm4 2v2h6v-2H9z"/></svg>',
          int(totalStock), "Total units in stock", "#trackingPanel", () => filterTrackingTo("", "")),
        card("ic-crit", '<svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm0 6 6.5 11h-13L12 8zm-1 4h2v4h-2zm0 5h2v2h-2z"/></svg>',
          int(lowStock), "Restocking items (critical)", "/alerts/"),
        card("ic-warn", '<svg viewBox="0 0 24 24"><path d="M4 4h16l-1 8h-4l-2 3h-2l-2-3H5L4 4zm1 10h14v6H5v-6z"/></svg>',
          int(noSales), "Items with no recent sales", "#trackingPanel", () => filterTrackingTo("No recent sales", "")));

      // ---- top 5 best-sellers (bar) ----
      const top5 = [...rows].sort((a, b) => b.units_90d - a.units_90d).slice(0, 5);
      barChart($("#topChart"), top5, { label: "name", value: "units_90d" });

      // ---- category filter options ----
      const cats = [...new Set(rows.map(r => r.category))].sort();
      const sel = $("#catFilter"); const cur = sel.value;
      sel.innerHTML = `<option value="">All Categories</option>`
        + cats.map(c => `<option value="${c}">${c}</option>`).join("");
      sel.value = cur;

      // ---- stock-by-category donut ----
      const byCat = {};
      rows.forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + r.stock_on_hand; });
      const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      const top = sorted.slice(0, 4).map(([label, value], i) => ({ label, value, color: CAT_COLORS[i] }));
      const rest = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
      if (rest > 0) top.push({ label: "Other", value: rest, color: "var(--cat-other)" });
      donutChart($("#catDonut"), top);

      renderTracking();
    } catch (e) { $("#velNote").textContent = e.message; }

    try {
      const vol = await api("/analytics/api/monthly-volume");
      simpleLineChart($("#volChart"), vol);
    } catch (e) { $("#volChart").innerHTML = `<p class="muted">${e.message}</p>`; }
  }

  $("#catFilter").addEventListener("change", renderTracking);
  $("#statusFilter").addEventListener("change", renderTracking);
  $("#moveFilter").addEventListener("change", renderTracking);

  $("#refreshBtn").addEventListener("click", async () => {
    const m = $("#refreshMsg"); m.textContent = "Syncing…";
    try {
      const r = await api("/analytics/refresh", { method: "POST" });
      m.textContent = `Synced ${r.rows_loaded} row(s) (LSR ${r.lsr}%).`;
      load();
    } catch (e) { m.textContent = "Refresh failed: " + e.message; }
  });
  load();
}

/* =========================================================
   TIME-SERIES DEMAND FORECASTING WORKSPACE
   ========================================================= */
function forecastingScreen() {
  const sel = $("#skuSelect"), horizon = $("#horizon"), runBtn = $("#runBtn");

  // model-comparison pills: toggle which of the five models are compared
  const pills = $$("#modelPills .pill");
  const enabled = () => pills.filter(p => !p.classList.contains("off")).map(p => p.dataset.model);
  pills.forEach(p => p.addEventListener("click", () => {
    const on = enabled();
    if (on.length === 1 && on[0] === p.dataset.model) return;   // keep at least one
    p.classList.toggle("off");
    run();
  }));

  (async () => {
    try {
      const rows = await api("/forecasting/api/skus?q=");
      sel.innerHTML = "";
      rows.forEach(r => sel.append(el("option", { value: r.sku },
        `${r.sku} · ${r.name}`)));
      runBtn.disabled = rows.length === 0;
      // if we arrived from a dashboard row (?sku=BRK-023), preselect it
      const want = new URLSearchParams(location.search).get("sku");
      if (want && rows.some(r => r.sku === want)) sel.value = want;
      if (rows.length) run();                 // auto-run selected/first item
    } catch (e) { sel.innerHTML = `<option>Could not load items</option>`; }
  })();

  runBtn.addEventListener("click", run);
  sel.addEventListener("change", run);
  horizon.addEventListener("change", run);

  async function run() {
    const sku = sel.value;
    if (!sku) return;
    runBtn.disabled = true; runBtn.textContent = "Running…";
    try {
      const on = enabled();
      const mp = on.length && on.length < pills.length ? "&models=" + encodeURIComponent(on.join(",")) : "";
      const d = await api(`/forecasting/api/run?sku=${encodeURIComponent(sku)}&horizon=${horizon.value}${mp}`);
      render(d);
    } catch (e) { alert(e.message); }
    runBtn.disabled = false; runBtn.textContent = "Run comparison";
  }

  function render(d) {
    $("#fcEmpty").classList.add("hidden");
    $("#fcResult").classList.remove("hidden");
    const H = d.horizon || 30;

    $("#fcSubtitle").textContent =
      `${d.sku} · ${H}-day horizon · Best fit: ${d.best_fit_short || "-"} · as of ${d.as_of || ""}`;
    $("#fcLegend").innerHTML = `<i class="fc"></i>Forecast: ${d.best_fit_short || ""}`;

    histForecastChart($("#fcChart"),
      (d.history || []).slice(-18).map(h => ({ label: h.label, units: h.units })),
      d.forecast_curve || []);

    // ---- depletion estimate panel ----
    const gapNeg = (d.coverage_gap ?? 0) < 0;
    const row = (k, v, cls) => el("div", { class: "row" },
      el("span", {}, k), el("b", { class: cls || "" }, v));
    const dl = $("#depList"); dl.innerHTML = "";
    dl.append(
      row("Current stock balance", int(d.stock_on_hand) + " units"),
      row(`Forecasted 30-day demand`, int(Math.round(d.forecast_30d)) + " units"),
      row("Projected days to depletion", d.days_to_depletion != null ? "~" + d.days_to_depletion + " days" : "-"),
      row("Reorder point (ROP)", int(d.reorder_point) + " units"),
      row("Stock coverage gap", (d.coverage_gap > 0 ? "+" : "") + int(d.coverage_gap) + " units",
        gapNeg ? "dep-neg" : ""));

    // "insufficient_history" covers two different situations: zero sales ever
    // recorded (no models computed at all) vs. some sales but under the
    // 24-month minimum (models computed, just flagged low-confidence below).
    // Only the first case has nothing to base a risk read on.
    const hasModels = Object.keys(d.models || {}).length > 0;

    $("#riskBox").innerHTML = !hasModels
      ? `<div class="risk-box" style="border-color:var(--line);background:var(--surface-2)">
         <div class="rt" style="color:var(--muted)">No sales history yet — stockout risk can't be assessed.</div></div>`
      : d.stockout_risk
      ? `<div class="risk-box"><div class="rt">&#9888; Stockout risk detected</div>
         <p>Advisory only. The system will not auto-generate purchase orders.
         <a href="/alerts/">View decision-support advisories</a>.</p></div>`
      : `<div class="risk-box" style="border-color:rgba(87,194,95,.35);background:var(--soft-ok)">
         <div class="rt" style="color:var(--ok)">&#10003; Stock cover is adequate for the horizon</div></div>`;

    // ---- model comparison table (MSE primary, MAPE supporting) ----
    const tb = $("#modelTbl tbody"); tb.innerHTML = "";
    const order = ["Simple Moving Average", "Weighted Moving Average", "Linear Regression",
      "ARIMA", "Holt-Winters", "Naive (last month)"];
    const entries = Object.entries(d.models || {})
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    entries.forEach(([name, m]) => {
      const tr = el("tr", { class: m.chosen ? "is-best" : "" },
        el("td", {}, (m.short || name) + (m.chosen ? "  ★" : "")),
        el("td", { class: "num" }, m.mse),
        el("td", { class: "num" }, m.rmse),
        el("td", { class: "num" }, m.mape != null ? m.mape + "%" : "-"),
        el("td", { class: "num" }, m.next));
      tb.append(tr);
    });
    if (!entries.length) {
      tb.append(el("tr", {},
        el("td", { colspan: "5", class: "muted" },
          "No sales transactions recorded yet for this item — nothing to compare.")));
    }
    $("#fcFoot").textContent = hasModels
      ? `${d.observations_used} underlying historical observations · ${d.months_history} months. `
        + `Primary metric MSE; the lowest-MSE model is selected per item.`
      : `${d.reason === "no sales history in the warehouse yet"
          ? "No sales transactions recorded yet for this item."
          : `${d.months_history} months of history available.`}`;

    $("#fcFlags").innerHTML = !d.insufficient_history ? "" : !hasModels
      ? `<div class="flash error">No sales transactions have been recorded for this item yet, so no
         forecast model has run. Figures above are placeholders, not a real forecast.</div>`
      : `<div class="flash error">Insufficient history (${d.months_history} months, need 24).
         Forecast falls back to Simple Moving Average / naive and is flagged as low-confidence.</div>`;
  }
}

/* =========================================================
   DECISION SUPPORT ADVISORIES
   ========================================================= */
function alertsScreen() {
  const fcLink = sku => "/forecasting/?sku=" + encodeURIComponent(sku);
  const TYPES = [
    { key: "low_stock", label: "Low Stock Alert", sev: "critical" },
    { key: "demand_spike", label: "Demand Spike Warning", sev: "warning" },
    { key: "overstock", label: "Overstock Advisory", sev: "warning" },
  ];
  const PAGE_SIZE = 10;
  const dtdKey = a => a.days_to_depletion == null ? Infinity : a.days_to_depletion;
  const SORTERS = {
    low_stock: (a, b) => dtdKey(a) - dtdKey(b),
    overstock: (a, b) => b.on_hand - a.on_hand,
    demand_spike: (a, b) => b.forecast_30d - a.forecast_30d,
  };

  let latest = null;               // last /api/latest payload
  let severityFilter = null;       // null | "critical" | "warning"
  const pages = new Map();         // advisory-group type key -> current page index (0-based)

  function resetPaging() { pages.clear(); }

  function ruleLines(a) {
    const box = el("div", { class: "adv-rules" });
    a.rules.forEach(r => box.append(el("div", { class: "rule-line" },
      `RULE ${r.id}: ${r.expr} → `,
      el("b", { class: r.result ? "rt-true" : "rt-false" }, r.result ? "TRUE" : "FALSE"))));
    return box;
  }

  function advRow(a) {
    const rules = ruleLines(a);
    const why = el("button", { class: "linkish", onclick: () => rules.hidden = !rules.hidden }, "Why?");
    rules.hidden = true;
    return el("div", { class: "adv-item" },
      el("div", { class: "adv-line adv-" + a.severity },
        el("span", { class: "adv-dot" }, ""),
        el("a", { class: "adv-sku", href: fcLink(a.sku) }, a.sku),
        el("span", { class: "adv-text" }, a.message),
        why,
        el("a", { class: "adv-review", href: fcLink(a.sku) }, "Review →")),
      rules);
  }

  function matchesFilters(a, type) {
    const term = $("#advSearch").value.trim().toLowerCase();
    const typeV = $("#advTypeFilter").value;
    if (severityFilter && a.severity !== severityFilter) return false;
    if (typeV && type !== typeV) return false;
    if (term && !(a.sku.toLowerCase().includes(term) || a.name.toLowerCase().includes(term))) return false;
    return true;
  }

  function render() {
    if (!latest) return;
    const d = latest;
    const crit = d.advisories.filter(a => a.severity === "critical").length;
    const warn = d.advisories.length - crit;

    $("#advChips").innerHTML = "";
    const chip = (v, l, cls, sevValue) => {
      const active = severityFilter === sevValue;
      const c = el("span", {
        class: "chip chip-clickable " + (cls || "") + (active ? " chip-active" : ""),
        onclick: () => { severityFilter = active ? null : sevValue; resetPaging(); render(); },
      }, el("b", {}, v), " " + l);
      return c;
    };
    $("#advChips").append(
      chip(crit, "critical", "chip-crit", "critical"),
      chip(warn, "warnings", "chip-warn", "warning"),
      chip(d.advisories.length, "total", "", null));

    $("#advBreakdown").textContent = TYPES
      .map(t => `${t.label}s: ${d.by_type[t.key] || 0}`).join("  ·  ");

    const activeFilters = severityFilter || $("#advTypeFilter").value || $("#advSearch").value.trim();
    $("#advFilterNote").textContent = activeFilters ? "Click a chip again to clear the severity filter." : "";

    const groups = $("#advGroups"); groups.innerHTML = "";
    const visibleTotal = d.advisories.filter(a => matchesFilters(a, a.type)).length;
    if (!d.advisories.length) {
      groups.append(el("div", { class: "panel muted" }, "No advisories. Stock levels are within range."));
    } else if (!visibleTotal) {
      groups.append(el("div", { class: "panel muted" }, "No advisories match the current search/filter."));
    }
    TYPES.forEach(t => {
      const items = d.advisories.filter(a => a.type === t.key && matchesFilters(a, a.type))
        .sort(SORTERS[t.key]);
      if (!items.length) return;
      const det = el("details", { class: "adv-group" });
      det.open = t.sev === "critical" || !!activeFilters;
      det.append(el("summary", {},
        el("span", { class: "gdot g-" + t.sev }, ""),
        `${t.label} `, el("b", {}, `(${items.length})`)));

      const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
      const page = Math.min(pages.get(t.key) || 0, totalPages - 1);
      pages.set(t.key, page);
      const shown = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      shown.forEach(a => det.append(advRow(a)));

      if (totalPages > 1) {
        const goTo = n => { pages.set(t.key, n); render(); };
        const prevAttrs = { class: "icon-btn secondary", onclick: () => goTo(page - 1) };
        const nextAttrs = { class: "icon-btn secondary", onclick: () => goTo(page + 1) };
        if (page === 0) prevAttrs.disabled = "disabled";
        if (page === totalPages - 1) nextAttrs.disabled = "disabled";
        det.append(el("div", { class: "adv-item pager" },
          el("button", prevAttrs, "←"),
          el("span", { class: "pager-label" }, `Page ${page + 1} of ${totalPages}`),
          el("button", nextAttrs, "→")));
      }
      groups.append(det);
    });

    const typeBySku = new Map(d.advisories.map(a => [a.sku, a.type]));
    const tb = $("#advSummary tbody"); tb.innerHTML = "";
    d.summary
      .filter(s => matchesFilters(s, typeBySku.get(s.sku)))
      .sort((a, b) => (a.severity === b.severity ? dtdKey(a) - dtdKey(b)
                       : a.severity === "critical" ? -1 : 1))
      .forEach(s => tb.append(el("tr", {},
        el("td", {}, el("a", { href: fcLink(s.sku) }, s.sku)),
        el("td", { class: "num" }, int(s.on_hand)),
        el("td", { class: "num" }, int(s.rop)),
        el("td", { class: "num" }, int(s.forecast_30d)),
        el("td", { class: "num" + (s.severity === "critical" ? " dep-neg" : "") },
          s.days_to_depletion == null ? "-" : s.days_to_depletion + "d"),
        el("td", {}, s.recommendation))));
  }

  async function load() {
    try {
      latest = await api("/alerts/api/latest");
      $("#advMsg").textContent = "as of " + latest.generated_at;
      resetPaging();
      render();
    } catch (e) { $("#advMsg").textContent = e.message; }
  }

  $("#advSearch").addEventListener("input", debounce(() => { resetPaging(); render(); }, 150));
  $("#advTypeFilter").addEventListener("change", () => { resetPaging(); render(); });

  $("#recomputeBtn").addEventListener("click", async () => {
    $("#advMsg").textContent = "Recomputing…";
    try { await api("/alerts/api/recompute", { method: "POST" }); load(); }
    catch (e) { $("#advMsg").textContent = e.message; }
  });
  load();
}

/* =========================================================
   DATA IMPORT  (one-time historical migration)
   ========================================================= */
function importsScreen() {
  const dz = $("#dropzone"), input = $("#fileInput"), importBtn = $("#importBtn");
  let picked = [];

  const showPicked = () => {
    $("#dzList").innerHTML = picked.map(f => `• ${f.name} (${(f.size / 1024).toFixed(0)} KB)`).join("<br>");
    importBtn.disabled = picked.length === 0;
  };

  dz.addEventListener("click", () => input.click());
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("over");
    picked = [...e.dataTransfer.files]; showPicked();
  });
  input.addEventListener("change", () => { picked = [...input.files]; showPicked(); });

  importBtn.addEventListener("click", async () => {
    const msg = $("#importMsg");
    importBtn.disabled = true; msg.textContent = " uploading…";
    try {
      const fd = new FormData();
      picked.forEach(f => fd.append("files", f));
      const up = await api("/import/api/upload", { method: "POST", body: fd, headers: {} });
      if (up.skipped.length)
        msg.textContent = " skipped: " + up.skipped.map(s => `${s.file} (${s.why})`).join("; ");
      if (up.saved.length) {
        msg.textContent = " running import…";
        const r = await api("/import/api/run", { method: "POST" });
        msg.textContent = ` done: ${r.products} products, ${r.facts} facts, ${r.audited} audited `
          + `(DCR ${r.dcr}%, DRR ${r.drr}%, LSR ${r.lsr}%).`;
        picked = []; input.value = ""; showPicked();
      }
      load();
    } catch (e) { msg.textContent = " " + e.message; }
    importBtn.disabled = picked.length === 0;
  });

  async function load() {
    try {
      const d = await api("/import/api/status");
      $("#uploadHint").textContent = `Accepted: .csv · .xlsx, max ${d.max_mb} MB per file`;
      $("#batchCount").textContent = `${d.batches} batch${d.batches === 1 ? "" : "es"}`;
      const tb = $("#histTbl tbody"); tb.innerHTML = "";
      d.history.forEach(h => tb.append(el("tr", {},
        el("td", {}, el("code", {}, h.file)),
        el("td", {}, h.date),
        el("td", { class: "num" }, h.rows == null ? "-" : int(h.rows)),
        el("td", {}, el("span", {
          class: "stat stat-" + (h.status === "Success" ? "stable" : h.status === "Failed" ? "lowstock" : "norecentsales")
        }, h.status)))));
    } catch (e) { $("#importMsg").textContent = e.message; }
  }
  load();
}

/* =========================================================
   SETTINGS
   ========================================================= */
function settingsScreen() {
  async function loadUsers() {
    try {
      const rows = await api("/settings/api/users");
      const tb = $("#userTbl tbody"); tb.innerHTML = "";
      rows.forEach(u => {
        const actions = el("td", {});
        if (u.role === "staff") {
          actions.append(
            el("button", { class: "secondary", onclick: () => toggle(u.user_id) },
              u.is_active ? "Disable" : "Enable"),
            el("button", {
              class: "danger", style: "margin-left:6px",
              onclick: () => del(u.user_id, u.username),
            }, "Delete"));
        }
        tb.append(el("tr", {},
          el("td", {}, u.username), el("td", {}, u.full_name), el("td", {}, u.role),
          el("td", {}, u.is_active ? "active" : "disabled"), el("td", {}, u.created_at),
          actions));
      });
    } catch {}
  }
  async function toggle(id) {
    try { await api(`/settings/api/toggle/${id}`, { method: "POST" }); loadUsers(); }
    catch (e) { alert(e.message); }
  }
  async function del(id, name) {
    if (!confirm(`Delete staff account "${name}"?\n\nAny sales or stock movements they `
      + `recorded are kept and reassigned to "Former staff". This cannot be undone.`)) return;
    try {
      const r = await api(`/settings/api/delete/${id}`, { method: "POST" });
      if (r.reassigned) alert(`Account deleted. ${r.reassigned} historical record(s) `
        + `reassigned to "Former staff".`);
      loadUsers();
    } catch (e) { alert(e.message); }
  }
  $("#pwBtn").addEventListener("click", async () => {
    const m = $("#pwMsg");
    try {
      await api("/settings/api/change-password", {
        method: "POST",
        body: JSON.stringify({ current: $("#curPw").value, new: $("#newPw").value }),
      });
      m.className = "result ok"; m.textContent = "Password updated.";
      $("#curPw").value = ""; $("#newPw").value = "";
    } catch (e) { m.className = "result err"; m.textContent = e.message; }
  });
  $("#stBtn").addEventListener("click", async () => {
    const m = $("#stMsg");
    try {
      await api("/settings/api/add-staff", {
        method: "POST",
        body: JSON.stringify({
          username: $("#stUser").value, name: $("#stName").value, password: $("#stPw").value,
        }),
      });
      m.className = "result ok"; m.textContent = "Staff account created.";
      $("#stUser").value = $("#stName").value = $("#stPw").value = "";
      loadUsers();
    } catch (e) { m.className = "result err"; m.textContent = e.message; }
  });
  loadUsers();
}

/* ---------- shared widgets ---------- */
function stepper(value, min, max, onChange) {
  const wrap = el("span", { class: "stepper" });
  const input = el("input", { type: "number", value: value });
  const clamp = v => Math.max(min, Math.min(max, v | 0));
  input.addEventListener("change", () => { input.value = clamp(+input.value); onChange(+input.value); });
  wrap.append(
    el("button", { onclick: () => { input.value = clamp(+input.value - 1); onChange(+input.value); } }, "-"),
    input,
    el("button", { onclick: () => { input.value = clamp(+input.value + 1); onChange(+input.value); } }, "+"));
  return wrap;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
