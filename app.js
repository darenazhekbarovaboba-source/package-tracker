(function () {
  "use strict";

  var STORAGE_KEY = "package-tracker.v1";
  var CARRIERS = [
    { id: "usps", label: "USPS" },
    { id: "china-post", label: "China Post" },
    { id: "ems", label: "EMS" },
    { id: "cainiao", label: "Cainiao / AliExpress" },
    { id: "ups", label: "UPS" },
    { id: "fedex", label: "FedEx" },
    { id: "dhl", label: "DHL" },
    { id: "other", label: "Other" },
  ];
  var STATUSES = [
    "Label created",
    "In transit",
    "Customs",
    "Out for delivery",
    "Delivered",
    "Exception",
  ];
  var AGENT_STAGES = [
    "Ordered",
    "Arrived at agent warehouse",
    "QC",
    "Shipped international",
    "In destination country",
    "Delivered",
  ];
  var STAGE_SHORT = [
    "Ordered",
    "At warehouse",
    "QC",
    "Shipped",
    "In country",
    "Delivered",
  ];

  var dateFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  var dateTimeFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  var state = {
    packages: [],
    filter: "all",
    carrierFilter: "all",
    query: "",
    editingId: null,
    kind: "carrier",
  };

  var form = document.getElementById("pkg-form");
  var formHeading = document.getElementById("form-heading");
  var editBanner = document.getElementById("edit-banner");
  var cancelEdit = document.getElementById("cancel-edit");
  var saveBtn = document.getElementById("save-btn");
  var formStatus = document.getElementById("form-status");
  var nameInput = document.getElementById("item-name");
  var statusSelect = document.getElementById("status");
  var etaInput = document.getElementById("eta");
  var trackingInput = document.getElementById("tracking-number");
  var carrierSelect = document.getElementById("carrier");
  var detectHint = document.getElementById("detect-hint");
  var agentNameInput = document.getElementById("agent-name");
  var agentOrderInput = document.getElementById("agent-order");
  var agentStageSelect = document.getElementById("agent-stage");
  var domesticInput = document.getElementById("domestic-tracking");
  var domesticCarrier = document.getElementById("domestic-carrier");
  var intlInput = document.getElementById("intl-tracking");
  var intlCarrier = document.getElementById("intl-carrier");
  var listEl = document.getElementById("package-list");
  var emptyState = document.getElementById("empty-state");
  var searchInput = document.getElementById("search");
  var filterCarrier = document.getElementById("filter-carrier");
  var importFile = document.getElementById("import-file");
  var appStatus = document.getElementById("app-status");

  var demoMode = false;
  var lastSeenDate = null;
  var carrierManual = { main: false, domestic: false, intl: false };
  var lastNormalized = { main: "", domestic: "", intl: "" };

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function toISODate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function parseISODate(iso) {
    var parts = (iso || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(function (n) { return !n; })) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function startOfWeek(d) {
    var x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay());
    return x;
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function daysUntil(iso) {
    var d = parseISODate(iso);
    if (!d) return null;
    return Math.round((d.getTime() - startOfDay(new Date()).getTime()) / 86400000);
  }

  function carrierLabel(id) {
    var found = CARRIERS.filter(function (c) { return c.id === id; })[0];
    return found ? found.label : "Other";
  }

  function normalizeTracking(raw) {
    return String(raw || "").replace(/\s+/g, "").toUpperCase();
  }

  function isAmbiguousUspsFedex(raw) {
    return /^9\d{19}$/.test(normalizeTracking(raw));
  }

  function detectCarrier(raw) {
    var n = normalizeTracking(raw);
    if (!n) return null;
    if (/^1Z[A-Z0-9]{16}$/.test(n)) return "ups";
    if (/^96\d{20}$/.test(n)) return "fedex";
    if (/^9\d{21}$/.test(n) || /^(70|71|73|82)\d{20}$/.test(n)) return "usps";
    if (/^9\d{25}$/.test(n)) return "usps";
    if (/^9\d{19}$/.test(n)) return "usps";
    if (/^7\d{19}$/.test(n) || /^82\d{18}$/.test(n)) return "usps";
    if (/^[A-Z]{2}\d{9}US$/.test(n)) return "usps";
    if (/^[A-Z]{2}\d{9}CN$/.test(n)) return n.charAt(0) === "E" ? "ems" : "china-post";
    if (/^LP[A-Z0-9]{10,}$/.test(n) || /^4PX[A-Z0-9]+$/.test(n) || /^YT\d{13,}$/.test(n) || /^AE[A-Z0-9]{10,}$/.test(n) || /^CNG[A-Z0-9]{8,}$/.test(n)) {
      return "cainiao";
    }
    if (/^\d{12}$/.test(n) || /^\d{15}$/.test(n)) return "fedex";
    if (/^\d{20}$/.test(n)) return "fedex";
    if (/^\d{10}$/.test(n) || /^GM\d{16,}$/.test(n) || /^JVGL[A-Z0-9]+$/.test(n) || /^JD[A-Z0-9]{8,}$/.test(n)) return "dhl";
    return null;
  }

  function officialUrl(carrier, num) {
    var n = normalizeTracking(num);
    if (!n) return null;
    var enc = encodeURIComponent(n);
    switch (carrier) {
      case "usps":
        return "https://tools.usps.com/go/TrackConfirmAction?tLabels=" + enc;
      case "ups":
        return "https://www.ups.com/track?tracknum=" + enc;
      case "fedex":
        return "https://www.fedex.com/fedextrack/?trknbr=" + enc;
      case "dhl":
        return "https://www.dhl.com/global-en/home/tracking.html?tracking-id=" + enc;
      case "cainiao":
        return "https://global.cainiao.com/detail.htm?mailNoList=" + enc;
      case "china-post":
        return "https://t.17track.net/en#nums=" + enc;
      case "ems":
        return "https://www.ems.com.cn/queryList?searchType=EMS&mailNo=" + enc;
      default:
        return null;
    }
  }

  function track17Url(num) {
    return "https://t.17track.net/en#nums=" + encodeURIComponent(normalizeTracking(num));
  }

  function isDelivered(pkg) {
    return pkg.status === "Delivered" || (pkg.kind === "agent" && pkg.agentStage === "Delivered");
  }

  function deliveredAt(pkg) {
    var i;
    var latest = 0;
    if (pkg.history) {
      for (i = 0; i < pkg.history.length; i++) {
        if (pkg.history[i].status === "Delivered" && pkg.history[i].at) {
          latest = Math.max(latest, pkg.history[i].at);
        }
      }
    }
    if (latest) return latest;
    return pkg.updatedAt || pkg.createdAt || 0;
  }

  function isOverdue(pkg) {
    if (isDelivered(pkg) || !pkg.eta) return false;
    var days = daysUntil(pkg.eta);
    return days !== null && days < 0;
  }

  function arrivingThisWeek(pkg) {
    if (isDelivered(pkg) || !pkg.eta) return false;
    var d = parseISODate(pkg.eta);
    if (!d) return false;
    var start = startOfWeek(new Date());
    var end = addDays(start, 6);
    return d >= start && d <= end;
  }

  function deliveredThisMonth(pkg) {
    if (!isDelivered(pkg)) return false;
    var when = new Date(deliveredAt(pkg));
    if (isNaN(when.getTime())) return false;
    var now = new Date();
    return when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth();
  }

  function packageCarriers(pkg) {
    var set = {};
    if (pkg.kind === "agent") {
      if (pkg.domesticCarrier) set[pkg.domesticCarrier] = true;
      if (pkg.intlCarrier) set[pkg.intlCarrier] = true;
    } else if (pkg.carrier) {
      set[pkg.carrier] = true;
    }
    return set;
  }

  function fillSelect(el, items, includeBlank, blankLabel) {
    el.innerHTML = "";
    if (includeBlank) {
      var opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = blankLabel || "Select";
      el.appendChild(opt0);
    }
    items.forEach(function (item) {
      var opt = document.createElement("option");
      if (typeof item === "string") {
        opt.value = item;
        opt.textContent = item;
      } else {
        opt.value = item.id;
        opt.textContent = item.label;
      }
      el.appendChild(opt);
    });
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      var rows = Array.isArray(data) ? data : (data && data.packages);
      if (!Array.isArray(rows)) return;
      state.packages = rows.filter(function (p) { return p && p.id && p.name; }).map(normalizePackage);
    } catch (err) {
      /* ignore a damaged store */
    }
  }

  function normalizePackage(p) {
    var pkg = {
      id: p.id || uid(),
      kind: p.kind === "agent" ? "agent" : "carrier",
      name: String(p.name || "").slice(0, 120),
      trackingNumber: String(p.trackingNumber || "").slice(0, 40),
      carrier: p.carrier || "other",
      status: STATUSES.indexOf(p.status) >= 0 ? p.status : "Label created",
      eta: p.eta || "",
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
      history: Array.isArray(p.history) ? p.history.filter(function (h) { return h && h.at; }).map(function (h) {
        return {
          id: h.id || uid(),
          at: h.at,
          status: h.status || "",
          location: String(h.location || "").slice(0, 80),
          note: String(h.note || "").slice(0, 200),
        };
      }) : [],
      agentName: String(p.agentName || "").slice(0, 80),
      agentOrder: String(p.agentOrder || "").slice(0, 40),
      agentStage: AGENT_STAGES.indexOf(p.agentStage) >= 0 ? p.agentStage : "Ordered",
      domesticTracking: String(p.domesticTracking || "").slice(0, 40),
      domesticCarrier: p.domesticCarrier || "",
      intlTracking: String(p.intlTracking || "").slice(0, 40),
      intlCarrier: p.intlCarrier || "",
    };
    if (CARRIERS.every(function (c) { return c.id !== pkg.carrier; })) pkg.carrier = "other";
    return pkg;
  }

  function save() {
    if (demoMode) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        packages: state.packages,
      }));
    } catch (err) {
      /* quota or private mode */
    }
  }

  function announce(msg) {
    formStatus.textContent = msg;
    appStatus.textContent = msg;
  }

  function setKind(kind) {
    state.kind = kind === "agent" ? "agent" : "carrier";
    document.getElementById("kind-carrier").setAttribute("aria-pressed", state.kind === "carrier" ? "true" : "false");
    document.getElementById("kind-agent").setAttribute("aria-pressed", state.kind === "agent" ? "true" : "false");
    document.getElementById("wrap-tracking").hidden = state.kind === "agent";
    document.getElementById("wrap-carrier").hidden = state.kind === "agent";
    var agentFields = document.querySelectorAll(".agent-only");
    agentFields.forEach(function (el) { el.hidden = state.kind !== "agent"; });
    nameInput.required = true;
    trackingInput.required = false;
    agentNameInput.required = state.kind === "agent";
  }

  function applyDetection(input, select, which) {
    var detected = detectCarrier(input.value);
    var hasNumber = !!normalizeTracking(input.value);
    if (!carrierManual[which]) {
      if (detected) select.value = detected;
      else if (hasNumber) select.value = which === "main" ? "other" : "";
    }
    if (which === "main") {
      if (detected && isAmbiguousUspsFedex(input.value)) {
        detectHint.hidden = false;
        detectHint.textContent = "This 20-digit number starting with 9 could be USPS or FedEx. It’s set to USPS — change the carrier if you know it’s FedEx.";
      } else if (detected) {
        detectHint.hidden = false;
        detectHint.textContent = "Detected as " + carrierLabel(detected) + ". You can change the carrier if this is wrong.";
      } else if (hasNumber) {
        detectHint.hidden = false;
        detectHint.textContent = "Carrier could not be detected automatically. Pick one, or leave as Other and use 17TRACK.";
      } else {
        detectHint.hidden = true;
        detectHint.textContent = "";
      }
    }
  }

  function resetForm() {
    state.editingId = null;
    carrierManual = { main: false, domestic: false, intl: false };
    lastNormalized = { main: "", domestic: "", intl: "" };
    clearValidation();
    form.reset();
    statusSelect.value = "Label created";
    carrierSelect.value = "other";
    domesticCarrier.value = "";
    intlCarrier.value = "";
    agentStageSelect.value = "Ordered";
    setKind("carrier");
    detectHint.hidden = true;
    editBanner.hidden = true;
    cancelEdit.hidden = true;
    saveBtn.textContent = "Add package";
    formHeading.textContent = "Add a package";
  }

  function fillForm(pkg) {
    state.editingId = pkg.id;
    setKind(pkg.kind);
    nameInput.value = pkg.name;
    statusSelect.value = pkg.status;
    etaInput.value = pkg.eta || "";
    trackingInput.value = pkg.trackingNumber || "";
    carrierSelect.value = pkg.carrier || "other";
    agentNameInput.value = pkg.agentName || "";
    agentOrderInput.value = pkg.agentOrder || "";
    agentStageSelect.value = pkg.agentStage || "Ordered";
    domesticInput.value = pkg.domesticTracking || "";
    domesticCarrier.value = pkg.domesticCarrier || "";
    intlInput.value = pkg.intlTracking || "";
    intlCarrier.value = pkg.intlCarrier || "";
    carrierManual = { main: true, domestic: true, intl: true };
    lastNormalized = {
      main: normalizeTracking(pkg.trackingNumber || ""),
      domestic: normalizeTracking(pkg.domesticTracking || ""),
      intl: normalizeTracking(pkg.intlTracking || ""),
    };
    detectHint.hidden = true;
    clearValidation();
    editBanner.hidden = false;
    editBanner.textContent = "Editing “" + pkg.name + "”. History already logged stays unless you delete the package.";
    cancelEdit.hidden = false;
    saveBtn.textContent = "Save changes";
    formHeading.textContent = "Edit package";
    nameInput.focus();
  }

  function formValues() {
    var kind = state.kind;
    return {
      kind: kind,
      name: nameInput.value.trim().slice(0, 120),
      status: statusSelect.value,
      eta: etaInput.value || "",
      trackingNumber: kind === "agent" ? "" : normalizeTracking(trackingInput.value).slice(0, 40),
      carrier: kind === "agent" ? "" : (carrierSelect.value || "other"),
      agentName: agentNameInput.value.trim().slice(0, 80),
      agentOrder: agentOrderInput.value.trim().slice(0, 40),
      agentStage: agentStageSelect.value || "Ordered",
      domesticTracking: normalizeTracking(domesticInput.value).slice(0, 40),
      domesticCarrier: domesticCarrier.value || "",
      intlTracking: normalizeTracking(intlInput.value).slice(0, 40),
      intlCarrier: intlCarrier.value || "",
    };
  }

  function trackingFields(values) {
    var fields = [];
    if (values.kind === "agent") {
      if (values.domesticTracking) fields.push({ num: values.domesticTracking, el: domesticInput, label: "domestic tracking number" });
      if (values.intlTracking) fields.push({ num: values.intlTracking, el: intlInput, label: "international tracking number" });
    } else if (values.trackingNumber) {
      fields.push({ num: values.trackingNumber, el: trackingInput, label: "tracking number" });
    }
    return fields;
  }

  function packageTrackingNumbers(pkg) {
    var nums = [];
    if (pkg.kind === "agent") {
      if (pkg.domesticTracking) nums.push(normalizeTracking(pkg.domesticTracking));
      if (pkg.intlTracking) nums.push(normalizeTracking(pkg.intlTracking));
    } else if (pkg.trackingNumber) {
      nums.push(normalizeTracking(pkg.trackingNumber));
    }
    return nums.filter(Boolean);
  }

  function findDuplicate(values, exceptId) {
    var fields = trackingFields(values);
    var i, j, field;
    for (i = 0; i < fields.length; i++) {
      for (j = i + 1; j < fields.length; j++) {
        if (fields[i].num && fields[i].num === fields[j].num) {
          return { el: fields[j].el, msg: "The domestic and international tracking numbers are the same." };
        }
      }
    }
    for (i = 0; i < fields.length; i++) {
      field = fields[i];
      var clash = state.packages.filter(function (pkg) {
        return pkg.id !== exceptId && packageTrackingNumbers(pkg).indexOf(field.num) !== -1;
      })[0];
      if (clash) {
        return { el: field.el, msg: "That " + field.label + " is already used on “" + clash.name + "”." };
      }
    }
    return null;
  }

  function clearValidation() {
    var box = document.getElementById("form-error");
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
    [nameInput, trackingInput, agentNameInput, domesticInput, intlInput].forEach(function (el) {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
  }

  function showValidation(msg, el) {
    var box = document.getElementById("form-error");
    box.hidden = false;
    box.textContent = msg;
    if (el) {
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-describedby", "form-error");
      el.focus();
    }
    announce(msg);
  }

  function validate(values) {
    if (!values.name) return { msg: "Please enter an item name.", el: nameInput };
    if (values.kind === "agent" && !values.agentName) return { msg: "Please enter the agent or forwarder name.", el: agentNameInput };
    if (values.kind === "carrier" && !values.trackingNumber) return { msg: "Please enter a tracking number.", el: trackingInput };
    var dup = findDuplicate(values, state.editingId);
    if (dup) return { msg: dup.msg, el: dup.el };
    return null;
  }

  function upsertFromForm(e) {
    e.preventDefault();
    var values = formValues();
    var err = validate(values);
    if (err) {
      showValidation(err.msg, err.el);
      return;
    }
    clearValidation();
    var now = Date.now();
    if (state.editingId) {
      var existing = state.packages.filter(function (p) { return p.id === state.editingId; })[0];
      if (!existing) return;
      var changes = [];
      if (existing.status !== values.status) changes.push("Status changed to " + values.status);
      if ((existing.eta || "") !== (values.eta || "")) changes.push(values.eta ? "ETA set to " + values.eta : "ETA cleared");
      if ((existing.trackingNumber || "") !== (values.trackingNumber || "")) changes.push("Tracking number updated");
      if ((existing.domesticTracking || "") !== (values.domesticTracking || "") || (existing.intlTracking || "") !== (values.intlTracking || "")) changes.push("Tracking numbers updated");
      if (existing.kind === "agent" && existing.agentStage !== values.agentStage) changes.push("Stage set to " + values.agentStage);
      if (existing.name !== values.name) changes.push("Renamed to “" + values.name + "”");
      Object.keys(values).forEach(function (k) { existing[k] = values[k]; });
      existing.updatedAt = now;
      if (existing.kind === "agent" && existing.agentStage === "Delivered") existing.status = "Delivered";
      if (existing.kind === "agent" && existing.agentStage !== "Delivered" && existing.status === "Delivered") {
        existing.status = statusForAgentStage(existing.agentStage, existing);
      }
      existing.history = existing.history || [];
      existing.history.push({
        id: uid(),
        at: now,
        status: existing.status,
        location: "",
        note: changes.length ? changes.join(". ") + "." : "Package updated.",
      });
      save();
      announce("Saved changes to “" + existing.name + "”.");
    } else {
      var pkg = normalizePackage({
        id: uid(),
        createdAt: now,
        updatedAt: now,
        history: [{
          id: uid(),
          at: now,
          status: values.status,
          location: "",
          note: "Package added",
        }],
      });
      Object.keys(values).forEach(function (k) { pkg[k] = values[k]; });
      if (pkg.kind === "agent" && pkg.agentStage === "Delivered") pkg.status = "Delivered";
      state.packages.push(pkg);
      save();
      announce("Added “" + pkg.name + "”.");
    }
    resetForm();
    render();
  }

  function deletePackage(id) {
    var pkg = state.packages.filter(function (p) { return p.id === id; })[0];
    if (!pkg) return;
    if (!window.confirm("Delete “" + pkg.name + "” and its history? This cannot be undone.")) return;
    state.packages = state.packages.filter(function (p) { return p.id !== id; });
    if (state.editingId === id) resetForm();
    save();
    announce("Deleted “" + pkg.name + "”.");
    render();
  }

  function addHistory(id, values) {
    var pkg = state.packages.filter(function (p) { return p.id === id; })[0];
    if (!pkg) return;
    var at = values.at ? Date.parse(values.at) : Date.now();
    if (isNaN(at)) at = Date.now();
    pkg.history.push({
      id: uid(),
      at: at,
      status: values.status || pkg.status,
      location: (values.location || "").trim().slice(0, 80),
      note: (values.note || "").trim().slice(0, 200),
    });
    if (values.status) pkg.status = values.status;
    if (pkg.status === "Delivered" && pkg.kind === "agent") pkg.agentStage = "Delivered";
    pkg.updatedAt = Date.now();
    save();
    announce("Logged an update for “" + pkg.name + "”.");
    render();
  }

  function statusForAgentStage(stage, pkg) {
    if (stage === "Delivered") return "Delivered";
    if (pkg && pkg.history) {
      var rows = pkg.history.slice().sort(function (a, b) { return b.at - a.at; });
      var i;
      for (i = 0; i < rows.length; i++) {
        if (rows[i].status && rows[i].status !== "Delivered") return rows[i].status;
      }
    }
    if (stage === "Ordered") return "Label created";
    return "In transit";
  }

  function setStage(id, stage) {
    var pkg = state.packages.filter(function (p) { return p.id === id; })[0];
    if (!pkg || pkg.agentStage === stage) return;
    var leavingDelivered = pkg.agentStage === "Delivered" && stage !== "Delivered";
    pkg.agentStage = stage;
    pkg.updatedAt = Date.now();
    if (stage === "Delivered") pkg.status = "Delivered";
    else if (leavingDelivered || pkg.status === "Delivered") pkg.status = statusForAgentStage(stage, pkg);
    else if (stage === "In destination country" && pkg.status === "Label created") pkg.status = "In transit";
    else if (stage === "Shipped international" && pkg.status === "Label created") pkg.status = "In transit";
    pkg.history.push({
      id: uid(),
      at: Date.now(),
      status: pkg.status,
      location: "",
      note: "Stage set to " + stage,
    });
    save();
    announce("Updated stage for “" + pkg.name + "” to " + stage + ".");
    render();
  }

  function copyText(text, btn) {
    function done() {
      announce("Copied " + text + ".");
      if (btn) {
        var prev = btn.textContent;
        btn.textContent = "Copied";
        window.setTimeout(function () { btn.textContent = prev; }, 1400);
      }
    }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (err) {
        announce("Could not copy the tracking number.");
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  function matchesQuery(pkg, q) {
    if (!q) return true;
    var blob = [
      pkg.name, pkg.trackingNumber, pkg.carrier, carrierLabel(pkg.carrier),
      pkg.status, pkg.agentName, pkg.agentOrder, pkg.agentStage,
      pkg.domesticTracking, pkg.intlTracking,
      pkg.domesticCarrier, pkg.intlCarrier,
    ].join(" ").toLowerCase();
    if (pkg.history) {
      pkg.history.forEach(function (h) {
        blob += " " + (h.note || "") + " " + (h.location || "") + " " + (h.status || "");
      });
    }
    return blob.toLowerCase().indexOf(q) !== -1;
  }

  function visiblePackages() {
    var q = state.query.trim().toLowerCase();
    var rows = state.packages.filter(function (pkg) {
      if (state.filter === "active" && isDelivered(pkg)) return false;
      if (state.filter === "delivered" && !isDelivered(pkg)) return false;
      if (state.carrierFilter !== "all") {
        var carriers = packageCarriers(pkg);
        if (!carriers[state.carrierFilter]) return false;
      }
      return matchesQuery(pkg, q);
    });
    rows.sort(function (a, b) {
      var ae = a.eta || "9999-99-99";
      var be = b.eta || "9999-99-99";
      if (ae !== be) return ae < be ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusBadgeClass(status) {
    if (status === "Delivered") return "badge-delivered";
    if (status === "Exception") return "badge-exception";
    if (status === "Customs") return "badge-customs";
    if (status === "Out for delivery") return "badge-out";
    if (status === "In transit") return "badge-transit";
    return "badge-status";
  }

  function etaText(pkg) {
    if (!pkg.eta) return { text: "No estimated delivery date", cls: "" };
    var d = parseISODate(pkg.eta);
    var label = d ? dateFmt.format(d) : pkg.eta;
    if (isDelivered(pkg)) return { text: "Estimated " + label, cls: "" };
    var days = daysUntil(pkg.eta);
    if (days === null) return { text: "Estimated " + label, cls: "" };
    if (days < 0) {
      var late = Math.abs(days);
      return { text: "Estimated " + label + " · Overdue by " + late + " day" + (late === 1 ? "" : "s"), cls: "is-overdue" };
    }
    if (days === 0) return { text: "Estimated " + label + " · Arriving today", cls: "is-today" };
    if (days === 1) return { text: "Estimated " + label + " · 1 day left", cls: "is-soon" };
    return { text: "Estimated " + label + " · " + days + " days left", cls: days <= 3 ? "is-soon" : "" };
  }

  function trackButtonsHtml(carrier, num, label) {
    if (!num) return "";
    var official = officialUrl(carrier, num);
    var t17 = track17Url(num);
    var bits = [];
    bits.push('<span class="track-label">' + escapeHtml(label || "Tracking") + "</span>");
    bits.push('<span class="track-number">' + escapeHtml(num) + "</span>");
    bits.push('<button type="button" class="btn btn-small btn-ghost" data-act="copy" data-num="' + escapeHtml(num) + '">Copy</button>');
    if (official && official !== t17) {
      bits.push('<a class="btn btn-small btn-primary" href="' + official + '" target="_blank" rel="noopener noreferrer">Track</a>');
    }
    bits.push('<a class="btn btn-small btn-ghost" href="' + t17 + '" target="_blank" rel="noopener noreferrer">17TRACK</a>');
    return '<div class="track-row">' + bits.join("") + "</div>";
  }

  function historyHtml(pkg) {
    var rows = (pkg.history || []).slice().sort(function (a, b) { return b.at - a.at; });
    var items = rows.map(function (h) {
      var when = new Date(h.at);
      var whenText = isNaN(when.getTime()) ? "" : dateTimeFmt.format(when);
      var head = [whenText, h.status, h.location].filter(Boolean).join(" · ");
      var note = h.note ? '<p class="history-note">' + escapeHtml(h.note) + "</p>" : "";
      return '<li class="history-item"><p class="history-head">' + escapeHtml(head) + "</p>" + note + "</li>";
    }).join("");
    var statusOpts = STATUSES.map(function (s) {
      return '<option value="' + escapeHtml(s) + '"' + (s === pkg.status ? " selected" : "") + ">" + escapeHtml(s) + "</option>";
    }).join("");
    return (
      '<div class="history">' +
        "<h3>History</h3>" +
        (items ? '<ol class="history-list">' + items + "</ol>" : "<p class=\"hint\">No updates yet.</p>") +
        '<form class="history-form" data-act="history" data-id="' + escapeHtml(pkg.id) + '">' +
          '<div class="span-3"><label for="hist-status-' + escapeHtml(pkg.id) + '">Status</label><select id="hist-status-' + escapeHtml(pkg.id) + '" name="status">' + statusOpts + "</select></div>" +
          '<div class="span-4"><label for="hist-at-' + escapeHtml(pkg.id) + '">Date and time</label><input id="hist-at-' + escapeHtml(pkg.id) + '" name="at" type="datetime-local"></div>' +
          '<div class="span-5"><label for="hist-location-' + escapeHtml(pkg.id) + '">Location <span class="optional">(optional)</span></label><input id="hist-location-' + escapeHtml(pkg.id) + '" name="location" type="text" maxlength="80" autocomplete="off"></div>' +
          '<div class="span-12"><label for="hist-note-' + escapeHtml(pkg.id) + '">Note <span class="optional">(optional)</span></label><input id="hist-note-' + escapeHtml(pkg.id) + '" name="note" type="text" maxlength="200" autocomplete="off" placeholder="Scan, customs, or a reminder"></div>' +
          '<div class="span-12"><button type="submit" class="btn btn-small btn-primary">Add update</button></div>' +
        "</form>" +
      "</div>"
    );
  }

  function stepperHtml(pkg) {
    if (pkg.kind !== "agent") return "";
    var current = AGENT_STAGES.indexOf(pkg.agentStage);
    var items = AGENT_STAGES.map(function (stage, i) {
      var cls = i < current ? "is-done" : (i === current ? "is-current" : "");
      var aria = i === current ? ' aria-current="step"' : "";
      return "<li><button type=\"button\" class=\"" + cls + "\" data-act=\"stage\" data-id=\"" + escapeHtml(pkg.id) + "\" data-stage=\"" + escapeHtml(stage) + "\"" + aria + " title=\"" + escapeHtml(stage) + "\">" + escapeHtml(STAGE_SHORT[i]) + "</button></li>";
    }).join("");
    return '<ol class="stepper" aria-label="Agent shipment stages">' + items + "</ol>";
  }

  function cardHtml(pkg) {
    var overdue = isOverdue(pkg);
    var eta = etaText(pkg);
    var classes = "pkg-card" + (overdue ? " is-overdue" : "") + (isDelivered(pkg) ? " is-delivered" : "");
    var badges = [];
    if (pkg.kind === "agent") badges.push('<span class="badge badge-agent">Agent</span>');
    if (pkg.kind === "agent" && pkg.agentName) badges.push('<span class="badge badge-carrier">' + escapeHtml(pkg.agentName) + "</span>");
    if (pkg.kind !== "agent") badges.push('<span class="badge badge-carrier">' + escapeHtml(carrierLabel(pkg.carrier)) + "</span>");
    badges.push('<span class="badge ' + statusBadgeClass(pkg.status) + '">' + escapeHtml(pkg.status) + "</span>");
    if (overdue) badges.push('<span class="badge badge-overdue">Overdue</span>');
    var meta = [];
    if (pkg.kind === "agent" && pkg.agentOrder) meta.push("Order " + pkg.agentOrder);
    if (pkg.kind === "agent") meta.push("Stage: " + pkg.agentStage);
    var tracks = "";
    if (pkg.kind === "agent") {
      tracks += trackButtonsHtml(pkg.domesticCarrier, pkg.domesticTracking, "Domestic");
      tracks += trackButtonsHtml(pkg.intlCarrier, pkg.intlTracking, "International");
    } else {
      tracks += trackButtonsHtml(pkg.carrier, pkg.trackingNumber, carrierLabel(pkg.carrier));
    }
    return (
      '<article class="' + classes + '" data-id="' + escapeHtml(pkg.id) + '">' +
        '<div class="pkg-top">' +
          '<h3 class="pkg-title">' + escapeHtml(pkg.name) + "</h3>" +
          '<div class="pkg-badges">' + badges.join("") + "</div>" +
        "</div>" +
        (meta.length ? '<p class="pkg-meta">' + escapeHtml(meta.join(" · ")) + "</p>" : "") +
        '<p class="pkg-eta ' + eta.cls + '">' + escapeHtml(eta.text) + "</p>" +
        stepperHtml(pkg) +
        tracks +
        historyHtml(pkg) +
        '<div class="pkg-actions btn-row">' +
          '<button type="button" class="btn btn-small btn-ghost" data-act="edit" data-id="' + escapeHtml(pkg.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-small btn-danger" data-act="delete" data-id="' + escapeHtml(pkg.id) + '">Delete</button>' +
        "</div>" +
      "</article>"
    );
  }

  function renderStats() {
    var active = 0, week = 0, overdue = 0, delivered = 0;
    state.packages.forEach(function (pkg) {
      if (!isDelivered(pkg)) active += 1;
      if (arrivingThisWeek(pkg)) week += 1;
      if (isOverdue(pkg)) overdue += 1;
      if (deliveredThisMonth(pkg)) delivered += 1;
    });
    document.getElementById("stat-active").textContent = String(active);
    document.getElementById("stat-week").textContent = String(week);
    document.getElementById("stat-overdue").textContent = String(overdue);
    document.getElementById("stat-delivered").textContent = String(delivered);
  }

  function renderFilters() {
    document.getElementById("filter-all").setAttribute("aria-pressed", state.filter === "all" ? "true" : "false");
    document.getElementById("filter-active").setAttribute("aria-pressed", state.filter === "active" ? "true" : "false");
    document.getElementById("filter-delivered").setAttribute("aria-pressed", state.filter === "delivered" ? "true" : "false");
    if (document.activeElement !== searchInput) searchInput.value = state.query;
    if (document.activeElement !== filterCarrier) filterCarrier.value = state.carrierFilter;
  }

  function renderList() {
    var rows = visiblePackages();
    listEl.innerHTML = rows.map(cardHtml).join("");
    var empty = rows.length === 0;
    var emptyFilter = document.getElementById("empty-filter");
    listEl.hidden = empty;
    if (!empty) {
      emptyState.hidden = true;
      if (emptyFilter) emptyFilter.hidden = true;
    } else if (state.packages.length > 0) {
      emptyState.hidden = true;
      if (emptyFilter) emptyFilter.hidden = false;
    } else {
      emptyState.hidden = false;
      if (emptyFilter) emptyFilter.hidden = true;
    }
  }

  function render() {
    renderStats();
    renderFilters();
    renderList();
  }

  function maybeRollover() {
    var today = todayISO();
    if (today !== lastSeenDate) {
      lastSeenDate = today;
      render();
    }
  }

  function sampleData() {
    var now = Date.now();
    function days(offset, hour) {
      var d = addDays(new Date(), offset);
      d.setHours(hour || 10, 15, 0, 0);
      return d.getTime();
    }
    function hist(entries) {
      return entries.map(function (e) {
        return { id: uid(), at: e.at, status: e.status, location: e.location || "", note: e.note || "" };
      });
    }
    return [
      normalizePackage({
        id: uid(), kind: "carrier", name: "Mechanical keyboard switches",
        trackingNumber: "9400111899223812345678", carrier: "usps",
        status: "In transit", eta: toISODate(addDays(new Date(), 3)),
        createdAt: days(-4, 9), updatedAt: days(-1, 14),
        history: hist([
          { at: days(-4, 9), status: "Label created", location: "Los Angeles, CA", note: "Label created" },
          { at: days(-2, 16), status: "In transit", location: "Phoenix, AZ", note: "Departed facility" },
        ]),
      }),
      normalizePackage({
        id: uid(), kind: "carrier", name: "Skincare set from Taobao",
        trackingNumber: "LX123456789CN", carrier: "china-post",
        status: "Customs", eta: toISODate(addDays(new Date(), 7)),
        createdAt: days(-18, 8), updatedAt: days(-1, 11),
        history: hist([
          { at: days(-18, 8), status: "Label created", location: "Guangzhou, CN", note: "Accepted at post office" },
          { at: days(-10, 4), status: "In transit", location: "International transit", note: "Departed origin country" },
          { at: days(-1, 11), status: "Customs", location: "ISC New York, NY", note: "Inbound to customs" },
        ]),
      }),
      normalizePackage({
        id: uid(), kind: "carrier", name: "Family documents",
        trackingNumber: "EE987654321CN", carrier: "ems",
        status: "Out for delivery", eta: toISODate(addDays(new Date(), 1)),
        createdAt: days(-8, 10), updatedAt: days(0, 7),
        history: hist([
          { at: days(-8, 10), status: "In transit", location: "Beijing, CN", note: "EMS export" },
          { at: days(0, 7), status: "Out for delivery", location: "Local facility", note: "On the truck today" },
        ]),
      }),
      normalizePackage({
        id: uid(), kind: "carrier", name: "AliExpress phone case",
        trackingNumber: "LP00451234567890CN", carrier: "cainiao",
        status: "In transit", eta: toISODate(addDays(new Date(), 10)),
        createdAt: days(-6, 12), updatedAt: days(-2, 3),
        history: hist([
          { at: days(-6, 12), status: "Label created", location: "Yiwu, CN", note: "Cainiao warehouse" },
          { at: days(-2, 3), status: "In transit", location: "Export center", note: "Handed to airline" },
        ]),
      }),
      normalizePackage({
        id: uid(), kind: "carrier", name: "Running shoes",
        trackingNumber: "1Z999AA10123456784", carrier: "ups",
        status: "Label created", eta: toISODate(addDays(new Date(), 5)),
        createdAt: days(-1, 15), updatedAt: days(-1, 15),
        history: hist([{ at: days(-1, 15), status: "Label created", location: "Louisville, KY", note: "Pickup scheduled" }]),
      }),
      normalizePackage({
        id: uid(), kind: "carrier", name: "Camera lens",
        trackingNumber: "774901234567", carrier: "fedex",
        status: "Delivered", eta: toISODate(addDays(new Date(), -10)),
        createdAt: days(-16, 9), updatedAt: days(-10, 17),
        history: hist([
          { at: days(-16, 9), status: "In transit", location: "Memphis, TN", note: "Left FedEx hub" },
          { at: days(-10, 17), status: "Delivered", location: "Front door", note: "Signed for" },
        ]),
      }),
      normalizePackage({
        id: uid(), kind: "carrier", name: "DHL sample parcel",
        trackingNumber: "1234567890", carrier: "dhl",
        status: "Exception", eta: toISODate(addDays(new Date(), -3)),
        createdAt: days(-14, 11), updatedAt: days(-2, 9),
        history: hist([
          { at: days(-14, 11), status: "In transit", location: "Leipzig, DE", note: "Export scan" },
          { at: days(-2, 9), status: "Exception", location: "Destination facility", note: "Address correction needed" },
        ]),
      }),
      normalizePackage({
        id: uid(), kind: "agent", name: "Figure and snacks haul",
        agentName: "Superbuy", agentOrder: "SB2026110001",
        agentStage: "Shipped international",
        status: "In transit", eta: toISODate(addDays(new Date(), 13)),
        domesticTracking: "RA123456789CN", domesticCarrier: "china-post",
        intlTracking: "9400111899223811111111", intlCarrier: "usps",
        createdAt: days(-20, 8), updatedAt: days(-3, 19),
        history: hist([
          { at: days(-20, 8), status: "Label created", location: "Superbuy warehouse", note: "Ordered" },
          { at: days(-12, 13), status: "In transit", location: "Warehouse", note: "Arrived at agent warehouse" },
          { at: days(-11, 16), status: "In transit", location: "Warehouse", note: "QC passed" },
          { at: days(-3, 19), status: "In transit", location: "Export", note: "Shipped international" },
        ]),
      }),
      normalizePackage({
        id: uid(), kind: "agent", name: "Winter jacket",
        agentName: "CSSBuy", agentOrder: "CS-88421",
        agentStage: "Ordered",
        status: "Label created", eta: toISODate(addDays(new Date(), 25)),
        createdAt: days(-2, 20), updatedAt: days(-2, 20),
        history: hist([{ at: days(-2, 20), status: "Label created", note: "Waiting for the seller to ship to the agent" }]),
      }),
    ];
  }

  function exportJson() {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      packages: state.packages,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "package-tracker-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    announce("Downloaded a JSON backup of " + state.packages.length + " package" + (state.packages.length === 1 ? "" : "s") + ".");
  }

  function uniquifyPackages(rows) {
    var seen = {};
    return rows.map(function (p) {
      var pkg = normalizePackage(p);
      if (!pkg.id || seen[pkg.id]) pkg.id = uid();
      seen[pkg.id] = true;
      var histSeen = {};
      pkg.history = (pkg.history || []).map(function (h) {
        if (!h.id || histSeen[h.id]) h.id = uid();
        histSeen[h.id] = true;
        return h;
      });
      return pkg;
    });
  }

  function importJsonText(text) {
    var data = JSON.parse(text);
    var rows = Array.isArray(data) ? data : (data && data.packages);
    if (!Array.isArray(rows)) throw new Error("no packages");
    var imported = uniquifyPackages(rows.filter(function (p) { return p && (p.name || p.trackingNumber); }));
    if (!imported.length) throw new Error("empty");
    if (state.packages.length && !window.confirm("Replace your current list of " + state.packages.length + " package" + (state.packages.length === 1 ? "" : "s") + " with " + imported.length + " imported package" + (imported.length === 1 ? "" : "s") + "?")) {
      return;
    }
    state.packages = imported;
    save();
    announce("Imported " + imported.length + " package" + (imported.length === 1 ? "" : "s") + ".");
    render();
  }

  function bind() {
    var skipLink = document.querySelector(".skip-link");
    if (skipLink) {
      skipLink.addEventListener("click", function (e) {
        var main = document.getElementById("main");
        var heading = main && main.querySelector(".page-title");
        var target = heading || main;
        if (!target) return;
        e.preventDefault();
        if (target.scrollIntoView) target.scrollIntoView({ block: "start", inline: "nearest" });
        if (main && main.focus) main.focus({ preventScroll: true });
      });
    }

    document.getElementById("kind-carrier").addEventListener("click", function () { setKind("carrier"); });
    document.getElementById("kind-agent").addEventListener("click", function () { setKind("agent"); });

    form.addEventListener("submit", upsertFromForm);
    cancelEdit.addEventListener("click", function () {
      resetForm();
      announce("Edit canceled.");
    });

    function onTrackingInput(input, select, which) {
      var norm = normalizeTracking(input.value);
      if (norm !== lastNormalized[which]) {
        lastNormalized[which] = norm;
        carrierManual[which] = false;
      }
      applyDetection(input, select, which);
    }
    trackingInput.addEventListener("input", function () { onTrackingInput(trackingInput, carrierSelect, "main"); });
    trackingInput.addEventListener("blur", function () { applyDetection(trackingInput, carrierSelect, "main"); });
    domesticInput.addEventListener("input", function () { onTrackingInput(domesticInput, domesticCarrier, "domestic"); });
    intlInput.addEventListener("input", function () { onTrackingInput(intlInput, intlCarrier, "intl"); });
    carrierSelect.addEventListener("change", function () { carrierManual.main = true; });
    domesticCarrier.addEventListener("change", function () { carrierManual.domestic = true; });
    intlCarrier.addEventListener("change", function () { carrierManual.intl = true; });

    document.getElementById("filter-all").addEventListener("click", function () { state.filter = "all"; render(); });
    document.getElementById("filter-active").addEventListener("click", function () { state.filter = "active"; render(); });
    document.getElementById("filter-delivered").addEventListener("click", function () { state.filter = "delivered"; render(); });
    filterCarrier.addEventListener("change", function () {
      state.carrierFilter = filterCarrier.value || "all";
      render();
    });
    searchInput.addEventListener("input", function () {
      state.query = searchInput.value;
      renderList();
    });
    var clearFiltersBtn = document.getElementById("clear-filters");
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener("click", function () {
        state.filter = "all";
        state.carrierFilter = "all";
        state.query = "";
        render();
      });
    }
    [nameInput, trackingInput, agentNameInput].forEach(function (el) {
      el.addEventListener("input", function () {
        if (el.getAttribute("aria-invalid") === "true") clearValidation();
      });
    });

    document.getElementById("load-sample").addEventListener("click", function () {
      if (state.packages.length && !window.confirm("Replace your current package list with sample data?")) return;
      state.packages = sampleData();
      save();
      announce("Sample data loaded.");
      render();
    });

    document.getElementById("clear-all").addEventListener("click", function () {
      if (!window.confirm("Delete every package in this browser? This cannot be undone.")) return;
      state.packages = [];
      resetForm();
      save();
      announce("All packages cleared.");
      render();
    });

    document.getElementById("export-json").addEventListener("click", exportJson);
    document.getElementById("import-json").addEventListener("click", function () {
      importFile.value = "";
      importFile.click();
    });
    importFile.addEventListener("change", function () {
      var file = importFile.files && importFile.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          importJsonText(String(reader.result || ""));
        } catch (err) {
          announce("That file is not a valid Package Tracker backup.");
        }
      };
      reader.readAsText(file);
    });

    listEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn || !listEl.contains(btn)) return;
      if (btn.tagName === "A") return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id");
      if (act === "copy") {
        e.preventDefault();
        copyText(btn.getAttribute("data-num") || "", btn);
      } else if (act === "edit") {
        var pkg = state.packages.filter(function (p) { return p.id === id; })[0];
        if (pkg) fillForm(pkg);
      } else if (act === "delete") {
        deletePackage(id);
      } else if (act === "stage") {
        setStage(id, btn.getAttribute("data-stage"));
      }
    });

    listEl.addEventListener("submit", function (e) {
      var formEl = e.target.closest("form[data-act='history']");
      if (!formEl) return;
      e.preventDefault();
      addHistory(formEl.getAttribute("data-id"), {
        status: formEl.status.value,
        at: formEl.at.value,
        location: formEl.location.value,
        note: formEl.note.value,
      });
    });

    document.addEventListener("visibilitychange", function () {
      maybeRollover();
    });
    setInterval(maybeRollover, 15000);
  }

  fillSelect(statusSelect, STATUSES, false);
  fillSelect(agentStageSelect, AGENT_STAGES, false);
  fillSelect(carrierSelect, CARRIERS, false);
  fillSelect(domesticCarrier, CARRIERS, true, "Unknown");
  fillSelect(intlCarrier, CARRIERS, true, "Unknown");
  filterCarrier.innerHTML = "";
  var allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All carriers";
  filterCarrier.appendChild(allOpt);
  CARRIERS.forEach(function (c) {
    var opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    filterCarrier.appendChild(opt);
  });

  load();
  lastSeenDate = todayISO();
  var params = new URLSearchParams(location.search);
  if (params.get("demo") === "1") {
    demoMode = true;
    state.packages = sampleData();
    var banner = document.getElementById("demo-banner");
    if (banner) banner.hidden = false;
    var note = document.getElementById("header-note");
    if (note) note.textContent = "Demo — not saved";
  }
  bind();
  setKind("carrier");
  render();
})();
