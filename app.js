const $ = id => document.getElementById(id);

const STORAGE_KEY = "turnforge-solves";
const TOKEN_KEY = "turnforge-token";
const EMAIL_KEY = "turnforge-email";

let solves = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

let token = localStorage.getItem(TOKEN_KEY);
let currentScramble = "";
let startTime = 0;
let elapsed = 0;
let timerInterval = null;
let running = false;
let inspection = false;
let inspectionStart = 0;
let holding = false;
let holdTimeout = null;

const moves = ["R", "L", "U", "D", "F", "B"];
const modifiers = ["", "'", "2"];

function randomScramble(event) {
  const length = {
    "222": 11,
    "333": 20,
    "444": 40,
    "555": 60,
    "666": 80,
    "777": 100,
    "pyram": 12,
    "skewb": 12
  }[event] || 20;

  let result = [];
  let previous = "";

  while (result.length < length) {
    const move = moves[Math.floor(Math.random() * moves.length)];

    if (move === previous) continue;

    previous = move;

    result.push(
      move + modifiers[Math.floor(Math.random() * modifiers.length)]
    );
  }

  return result.join(" ");
}

function nextScramble() {
  currentScramble = randomScramble($("eventSelect").value);
  $("scramble").textContent = currentScramble;
}

function formatTime(ms) {
  return (ms / 1000).toFixed(2);
}

function saveSolves() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(solves));
}

function effectiveTime(solve) {
  if (solve.penalty === "DNF") return Infinity;
  return solve.time_ms + (solve.penalty === "+2" ? 2000 : 0);
}

function showTime(solve) {
  return solve.penalty === "DNF"
    ? "DNF"
    : formatTime(effectiveTime(solve)) +
      (solve.penalty === "+2" ? "+" : "");
}

function startTimer() {
  if (running) return;

  if (inspection) {
    inspection = false;
  }

  running = true;
  startTime = performance.now();

  $("timerHint").textContent = "Press SPACE to stop";

  timerInterval = setInterval(() => {
    elapsed = performance.now() - startTime;
    $("timerDisplay").textContent = formatTime(elapsed);
  }, 10);
}

function stopTimer() {
  if (!running) return;

  clearInterval(timerInterval);

  elapsed = performance.now() - startTime;

  running = false;

  $("timerDisplay").textContent = formatTime(elapsed);
  $("timerHint").textContent = "Solve saved";

  const solve = {
    id: crypto.randomUUID(),
    session_name: $("sessionSelect").value,
    event: $("eventSelect").value,
    time_ms: Math.round(elapsed),
    penalty: "OK",
    scramble: currentScramble,
    note: "",
    created_at: new Date().toISOString()
  };

  solves.unshift(solve);

  saveSolves();
  renderAll();

  syncToServer();

  nextScramble();
}

function toggleTimer() {
  if (running) {
    stopTimer();
  } else {
    startTimer();
  }
}

function handleKeyDown(event) {
  if (
    event.code !== "Space" ||
    event.repeat ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(
      document.activeElement.tagName
    )
  ) return;

  event.preventDefault();

  if (running) {
    stopTimer();
    return;
  }

  if (holding) return;

  holding = true;

  $("timerDisplay").style.color = "#ffffff";

  holdTimeout = setTimeout(() => {
    $("timerDisplay").style.color = "var(--accent)";
    startTimer();
  }, 350);
}

function handleKeyUp(event) {
  if (event.code !== "Space") return;

  holding = false;

  clearTimeout(holdTimeout);

  $("timerDisplay").style.color = "var(--accent)";
}

document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);

// MOBILE TIMER
let touchStart = null;

$("timerDisplay").addEventListener("touchstart", event => {
  event.preventDefault();

  if (running) {
    stopTimer();
    return;
  }

  startTimer();
}, { passive: false });

// NAVIGATION
document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn")
      .forEach(b => b.classList.remove("active"));

    document.querySelectorAll(".view")
      .forEach(v => v.classList.remove("active"));

    button.classList.add("active");

    $(button.dataset.view).classList.add("active");

    renderAll();
  });
});

$("newScramble").addEventListener("click", nextScramble);

$("eventSelect").addEventListener("change", nextScramble);

$("resetTimer").addEventListener("click", () => {
  if (running) {
    clearInterval(timerInterval);
    running = false;
  }

  elapsed = 0;
  $("timerDisplay").textContent = "0.00";
  $("timerHint").textContent = "Press SPACE or tap to start";
});

$("manualEntry").addEventListener("click", () => {
  const value = prompt("Enter solve time in seconds:");

  if (value === null) return;

  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    alert("Enter a valid time.");
    return;
  }

  solves.unshift({
    id: crypto.randomUUID(),
    session_name: $("sessionSelect").value,
    event: $("eventSelect").value,
    time_ms: Math.round(seconds * 1000),
    penalty: "OK",
    scramble: currentScramble,
    note: "Manual entry",
    created_at: new Date().toISOString()
  });

  saveSolves();
  renderAll();
  syncToServer();
  nextScramble();
});

// STATISTICS
function average(list) {
  const valid = list
    .map(effectiveTime)
    .filter(Number.isFinite);

  if (!valid.length) return "--";

  return formatTime(
    valid.reduce((a, b) => a + b, 0) / valid.length
  );
}

function trimmedAverage(list) {
  if (list.length < 5) return "--";

  const values = list.map(effectiveTime).sort((a, b) => a - b);

  values.shift();
  values.pop();

  if (values.includes(Infinity)) return "DNF";

  return formatTime(
    values.reduce((a, b) => a + b, 0) / values.length
  );
}

function renderStatistics() {
  $("totalSolves").textContent = solves.length;

  const valid = solves.filter(s => Number.isFinite(effectiveTime(s)));

  $("bestTime").textContent = valid.length
    ? formatTime(Math.min(...valid.map(effectiveTime)))
    : "--";

  $("meanTime").textContent = average(solves);

  $("ao5").textContent = trimmedAverage(solves.slice(0, 5));

  $("ao12").textContent = trimmedAverage(solves.slice(0, 12));

  $("lastSolve").textContent = solves.length
    ? showTime(solves[0])
    : "--";
}

// HISTORY
function renderHistory() {
  const container = $("historyList");

  if (!solves.length) {
    container.textContent = "No solves yet.";
    return;
  }

  container.replaceChildren();

  solves.forEach((solve, index) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const info = document.createElement("div");

    const time = document.createElement("div");
    time.className = "history-time";
    time.textContent = `${index + 1}. ${showTime(solve)}`;

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent =
      `${solve.event} · ${solve.session_name} · ` +
      new Date(solve.created_at).toLocaleString();

    info.append(time, meta);

    const controls = document.createElement("div");

    const penalty = document.createElement("select");

    ["OK", "+2", "DNF"].forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      penalty.appendChild(option);
    });

    penalty.value = solve.penalty;

    penalty.addEventListener("change", () => {
      solve.penalty = penalty.value;
      saveSolves();
      renderAll();
      syncToServer();
    });

    const edit = document.createElement("button");
    edit.textContent = "Edit";

    edit.addEventListener("click", () => {
      const value = prompt(
        "Enter new time in seconds:",
        solve.time_ms / 1000
      );

      if (value === null) return;

      const seconds = Number(value);

      if (!Number.isFinite(seconds) || seconds <= 0) {
        alert("Invalid time.");
        return;
      }

      solve.time_ms = Math.round(seconds * 1000);
      saveSolves();
      renderAll();
      syncToServer();
    });

    const remove = document.createElement("button");
    remove.textContent = "Delete";

    remove.addEventListener("click", async () => {
      if (!confirm("Delete this solve?")) return;

      solves = solves.filter(s => s.id !== solve.id);

      saveSolves();
      renderAll();

      if (token) {
        try {
          await api(`/api/solves/${encodeURIComponent(solve.id)}`, {
            method: "DELETE"
          });
        } catch {}
      }
    });

    controls.append(penalty, edit, remove);
    item.append(info, controls);

    container.appendChild(item);
  });
}

function renderAll() {
  renderStatistics();
  renderHistory();
}

// CSV EXPORT
$("exportCSV").addEventListener("click", () => {
  const header = [
    "id",
    "session",
    "event",
    "time_ms",
    "penalty",
    "scramble",
    "date"
  ];

  const rows = solves.map(s => [
    s.id,
    s.session_name,
    s.event,
    s.time_ms,
    s.penalty,
    s.scramble,
    s.created_at
  ]);

  const csv = [header, ...rows]
    .map(row => row.map(value =>
      `"${String(value).replace(/"/g, '""')}"`
    ).join(","))
    .join("\n");

  downloadFile(csv, "turnforge-solves.csv", "text/csv");
});

// BACKUP
$("backupData").addEventListener("click", () => {
  downloadFile(
    JSON.stringify(solves, null, 2),
    "turnforge-backup.json",
    "application/json"
  );
});

$("importBackup").addEventListener("click", () => {
  $("backupFile").click();
});

$("backupFile").addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());

    if (!Array.isArray(imported)) {
      throw new Error("Invalid backup.");
    }

    const valid = imported.filter(s =>
      s &&
      typeof s.id === "string" &&
      Number.isFinite(s.time_ms) &&
      ["OK", "+2", "DNF"].includes(s.penalty)
    );

    const combined = new Map(
      [...solves, ...valid].map(s => [s.id, s])
    );

    solves = [...combined.values()]
      .sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );

    saveSolves();
    renderAll();
    syncToServer();

    alert("Backup imported.");

  } catch {
    alert("Could not import this backup.");
  }

  event.target.value = "";
});

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

// CLEAR HISTORY
$("clearHistory").addEventListener("click", () => {
  if (!confirm("Clear all local solves?")) return;

  solves = [];
  saveSolves();
  renderAll();
});

// API
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

// ACCOUNT
function setAccountMessage(message) {
  $("accountMessage").textContent = message;
}

$("accountButton").addEventListener("click", () => {
  $("accountModal").classList.remove("hidden");
});

$("closeAccount").addEventListener("click", () => {
  $("accountModal").classList.add("hidden");
});

async function accountAction(action) {
  try {
    const data = await api(`/api/${action}`, {
      method: "POST",
      body: JSON.stringify({
        email: $("emailInput").value,
        password: $("passwordInput").value
      })
    });

    token = data.token;

    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EMAIL_KEY, data.email);

    updateAccountUI();

    await pullFromServer();
    await syncToServer();

    setAccountMessage("Account connected successfully.");

    window.dispatchEvent(
      new Event("turnforge-account-ready")
    );

  } catch (error) {
    setAccountMessage(error.message);
  }
}

$("loginButton").addEventListener("click", () => {
  accountAction("login");
});

$("registerButton").addEventListener("click", () => {
  accountAction("register");
});

$("logoutButton").addEventListener("click", () => {
  token = null;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);

  updateAccountUI();

  setAccountMessage("Signed out.");
});

function updateAccountUI() {
  $("accountStatus").textContent = token
    ? localStorage.getItem(EMAIL_KEY) || "Signed in"
    : "Offline mode";
}

async function pullFromServer() {
  if (!token || !navigator.onLine) return;

  try {
    const remote = await api("/api/solves");

    const merged = new Map();

    [...solves, ...remote].forEach(s => {
      merged.set(s.id, s);
    });

    solves = [...merged.values()].sort(
      (a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
    );

    saveSolves();
    renderAll();

  } catch (error) {
    console.error("Cloud download failed:", error);
  }
}

async function syncToServer() {
  if (!token || !navigator.onLine) return;

  try {
    await api("/api/sync", {
      method: "POST",
      body: JSON.stringify({ solves })
    });
  } catch (error) {
    console.error("Cloud sync failed:", error);
  }
}

window.addEventListener("online", () => {
  pullFromServer().then(syncToServer);
});

updateAccountUI();
renderAll();
nextScramble();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .catch(console.error);
}
