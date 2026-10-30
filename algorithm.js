let algorithms = [];
let learned = JSON.parse(
  localStorage.getItem("turnforge-learned") || "{}"
);

async function loadAlgorithms() {
  try {
    const response = await fetch("/algorithms.json");

    if (!response.ok) {
      throw new Error("Could not load algorithms.");
    }

    algorithms = await response.json();

    renderAlgorithms();

  } catch (error) {
    $("algorithmList").textContent = error.message;
  }
}

function saveLearned() {
  localStorage.setItem(
    "turnforge-learned",
    JSON.stringify(learned)
  );

  syncAlgorithmProgress();
}

function renderAlgorithms() {
  const search = $("algorithmSearch")
    .value.toLowerCase();

  const type = $("algorithmType").value;
  const filter = $("algorithmProgressFilter").value;

  const all = [
    ...(algorithms.OLL || []),
    ...(algorithms.PLL || [])
  ];

  const filtered = all.filter(item => {
    const isLearned = !!learned[item.id];

    const matchesSearch =
      item.name.toLowerCase().includes(search) ||
      item.algorithm.toLowerCase().includes(search) ||
      item.id.toLowerCase().includes(search);

    const matchesType =
      type === "ALL" || item.id.startsWith(type);

    const matchesProgress =
      filter === "ALL" ||
      (filter === "LEARNED" && isLearned) ||
      (filter === "UNLEARNED" && !isLearned);

    return matchesSearch && matchesType && matchesProgress;
  });

  $("algorithmCount").textContent =
    `${filtered.length} algorithms shown · ` +
    `${Object.values(learned).filter(Boolean).length} learned`;

  const container = $("algorithmList");

  container.replaceChildren();

  filtered.forEach(item => {
    const card = document.createElement("article");

    card.className = "algorithm-card";

    const heading = document.createElement("h3");
    heading.textContent = item.name;

    const category = document.createElement("div");
    category.className = "history-meta";
    category.textContent = item.category || item.id;

    const algorithm = document.createElement("p");
    algorithm.textContent = item.algorithm;

    const copy = document.createElement("button");
    copy.textContent = "Copy";

    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.algorithm);
        copy.textContent = "Copied!";
      } catch {
        copy.textContent = "Copy unavailable";
      }

      setTimeout(() => {
        copy.textContent = "Copy";
      }, 1200);
    });

    const learnedButton = document.createElement("button");

    learnedButton.textContent = learned[item.id]
      ? "✓ Learned"
      : "Mark learned";

    learnedButton.addEventListener("click", () => {
      learned[item.id] = !learned[item.id];

      saveLearned();
      renderAlgorithms();
    });

    card.append(
      heading,
      category,
      algorithm,
      copy,
      learnedButton
    );

    container.appendChild(card);
  });
}

$("algorithmSearch").addEventListener(
  "input",
  renderAlgorithms
);

$("algorithmType").addEventListener(
  "change",
  renderAlgorithms
);

$("algorithmProgressFilter").addEventListener(
  "change",
  renderAlgorithms
);

// CLOUD PROGRESS SYNC
let syncTimeout;

async function syncAlgorithmProgress() {
  clearTimeout(syncTimeout);

  syncTimeout = setTimeout(async () => {
    const token = localStorage.getItem("turnforge-token");

    if (!token || !navigator.onLine) return;

    try {
      await fetch("/api/algorithms/progress", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          progress: learned
        })
      });
    } catch (error) {
      console.error("Algorithm sync failed:", error);
    }
  }, 500);
}

async function pullAlgorithmProgress() {
  const token = localStorage.getItem("turnforge-token");

  if (!token || !navigator.onLine) return;

  try {
    const response = await fetch(
      "/api/algorithms/progress",
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) return;

    const data = await response.json();

    learned = {
      ...learned,
      ...(data.progress || {})
    };

    localStorage.setItem(
      "turnforge-learned",
      JSON.stringify(learned)
    );

    renderAlgorithms();

  } catch (error) {
    console.error("Progress download failed:", error);
  }
}

window.addEventListener(
  "turnforge-account-ready",
  pullAlgorithmProgress
);

loadAlgorithms();
pullAlgorithmProgress();
