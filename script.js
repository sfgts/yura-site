const teamsInput = document.getElementById("teamsInput");
const pairingsOutput = document.getElementById("pairingsOutput");
const matchesPerTeamInput = document.getElementById("matchesPerTeam");
const seedInput = document.getElementById("seedInput");
const buildBtn = document.getElementById("buildBtn");
const drawBtn = document.getElementById("drawBtn");
const resetBtn = document.getElementById("resetBtn");
const matrixTable = document.getElementById("matrixTable");
const selectedTeamName = document.getElementById("selectedTeamName");
const opponentsList = document.getElementById("opponentsList");
const summary = document.getElementById("summary");
const errorBox = document.getElementById("errorBox");
const drawStatus = document.getElementById("drawStatus");

let state = {
  teams: [],
  matrix: [],
  selectedIndex: null,
  matchesPerTeam: 4
};

const demoTeams = [
  "Player_1",
  "Player_2",
  "etc"
];

teamsInput.value = demoTeams.join("\n");

buildBtn.addEventListener("click", handleBuildGrid);
drawBtn.addEventListener("click", handleDraw);
resetBtn.addEventListener("click", handleReset);

function handleBuildGrid() {
  clearError();

  const teams = parseTeams(teamsInput.value);
  const matchesPerTeam = Number(matchesPerTeamInput.value);

  const validationError = validateInputs(teams, matchesPerTeam);
  if (validationError) {
    showError(validationError);
    return;
  }

  state.teams = teams;
  state.matchesPerTeam = matchesPerTeam;
  state.matrix = createEmptyMatrix(teams.length);
  state.selectedIndex = null;

  renderTable();
  renderSelection();
  updateSummary(0);
  pairingsOutput.value = "";
  drawStatus.textContent = "Сетка построена, жеребьёвка ещё не выполнена";
}

function handleDraw() {
  clearError();

  const teams = parseTeams(teamsInput.value);
  const matchesPerTeam = Number(matchesPerTeamInput.value);

  const validationError = validateInputs(teams, matchesPerTeam);
  if (validationError) {
    showError(validationError);
    return;
  }

  const seed = seedInput.value.trim();
  const drawResult = generateDraw(teams, matchesPerTeam, seed);

  if (!drawResult.success) {
    showError(drawResult.error);
    return;
  }

  state.teams = teams;
  state.matchesPerTeam = matchesPerTeam;
  state.matrix = drawResult.matrix;

  if (state.selectedIndex !== null && state.selectedIndex >= teams.length) {
    state.selectedIndex = null;
  }

  renderTable();
  renderSelection();
  updateSummary(drawResult.matchCount);
  pairingsOutput.value = buildPairingsText(state.matrix);

  drawStatus.textContent =
    `Случайная жеребьёвка выполнена: ${drawResult.matchCount} матчей`;
}

function handleReset() {
  state = {
    teams: [],
    matrix: [],
    selectedIndex: null,
    matchesPerTeam: 4
  };

  matrixTable.innerHTML = "";
  selectedTeamName.textContent = "—";
  opponentsList.innerHTML = "";
  summary.textContent = "";
  pairingsOutput.value = "";
  drawStatus.textContent = "Пока жеребьёвка не выполнена";
  clearError();
}

function parseTeams(raw) {
  return raw
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
}

function validateInputs(teams, matchesPerTeam) {
  if (teams.length < 2) {
    return "Нужно минимум 2 игрока.";
  }

  const unique = new Set(teams.map((t) => t.toLowerCase()));
  if (unique.size !== teams.length) {
    return "В списке есть дубликаты названий игроков.";
  }

  if (!Number.isInteger(matchesPerTeam) || matchesPerTeam < 1) {
    return "Количество соперников на игрока должно быть целым числом от 1.";
  }

  if (matchesPerTeam >= teams.length) {
    return "Количество соперников должно быть меньше количества игроков.";
  }

  const total = teams.length * matchesPerTeam;
  if (total % 2 !== 0) {
    return "Невозможно построить такую жеребьёвку: количество игроков × соперников должно быть чётным.";
  }

  return null;
}

function createEmptyMatrix(size) {
  return Array.from({ length: size }, () => Array(size).fill(""));
}

function generateDraw(teams, matchesPerTeam, seedText) {
  const maxAttempts = 400;
  const baseSeed = stringToSeed(seedText || String(Date.now()));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(baseSeed + attempt);
    const matrix = createEmptyMatrix(teams.length);
    const degrees = Array(teams.length).fill(0);
    const targetDegree = matchesPerTeam;

    const success = backtrackFill(matrix, degrees, targetDegree, rng);

    if (success) {
      assignHomeAway(matrix, rng);

      const matchCount = countMatches(matrix);
      return {
        success: true,
        matrix,
        matchCount
      };
    }
  }

  return {
    success: false,
    error: "Не удалось собрать корректную случайную жеребьёвку с такими параметрами."
  };
}

function backtrackFill(matrix, degrees, targetDegree, rng) {
  const n = matrix.length;

  if (degrees.every((d) => d === targetDegree)) {
    return true;
  }

  let current = -1;
  let minOptions = Infinity;

  for (let i = 0; i < n; i++) {
    if (degrees[i] >= targetDegree) continue;

    const options = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (degrees[j] >= targetDegree) continue;
      if (matrix[i][j] !== "") continue;
      options.push(j);
    }

    if (options.length === 0) return false;

    if (options.length < minOptions) {
      minOptions = options.length;
      current = i;
    }
  }

  if (current === -1) return false;

  const candidates = [];
  for (let j = 0; j < n; j++) {
    if (current === j) continue;
    if (degrees[j] >= targetDegree) continue;
    if (matrix[current][j] !== "") continue;
    candidates.push(j);
  }

  shuffleInPlace(candidates, rng);

  for (const opponent of candidates) {
    matrix[current][opponent] = "P";
    matrix[opponent][current] = "P";
    degrees[current]++;
    degrees[opponent]++;

    if (
      isStateStillPossible(matrix, degrees, targetDegree) &&
      backtrackFill(matrix, degrees, targetDegree, rng)
    ) {
      return true;
    }

    matrix[current][opponent] = "";
    matrix[opponent][current] = "";
    degrees[current]--;
    degrees[opponent]--;
  }

  return false;
}

function isStateStillPossible(matrix, degrees, targetDegree) {
  const n = matrix.length;

  for (let i = 0; i < n; i++) {
    const need = targetDegree - degrees[i];
    if (need < 0) return false;

    let available = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (matrix[i][j] !== "") continue;
      if (degrees[j] >= targetDegree) continue;
      available++;
    }

    if (available < need) {
      return false;
    }
  }

  return true;
}

function assignHomeAway(matrix, rng) {
  const n = matrix.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i][j] === "P" && matrix[j][i] === "P") {
        if (rng() < 0.5) {
          matrix[i][j] = "H";
          matrix[j][i] = "A";
        } else {
          matrix[i][j] = "A";
          matrix[j][i] = "H";
        }
      }
    }
  }
}

function countMatches(matrix) {
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      if (matrix[i][j] === "H" || matrix[i][j] === "A") {
        count++;
      }
    }
  }
  return count;
}

function buildPairingsText(matrix) {
  const lines = [];
  const matchesPerTeam = state.matchesPerTeam;

  for (let i = 0; i < matrix.length; i++) {
    const rowPairs = [];

    for (let j = 0; j < matrix.length; j++) {
      if (i === j) continue;

      if (matrix[i][j] === "H" || matrix[i][j] === "A") {
        rowPairs.push(`${i + 1}v${j + 1}`);
      }
    }

    rowPairs.sort((a, b) => {
      const aNum = Number(a.split("v")[1]);
      const bNum = Number(b.split("v")[1]);
      return aNum - bNum;
    });

    while (rowPairs.length < matchesPerTeam) {
      rowPairs.push(`-`);
    }

    lines.push(rowPairs.join(" "));
  }

  return lines.join("\n");
}

function renderTable() {
  const { teams, matrix, selectedIndex } = state;

  if (!teams.length) {
    matrixTable.innerHTML = "";
    return;
  }

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const corner = document.createElement("th");
  corner.className = "corner";
  corner.textContent = "Игроки";
  headRow.appendChild(corner);

  teams.forEach((team, colIndex) => {
    const th = document.createElement("th");
    th.className = "col-head";
    if (selectedIndex === colIndex) th.classList.add("highlight");

    const div = document.createElement("div");
    div.textContent = `${colIndex + 1}. ${team}`;
    th.appendChild(div);

    th.addEventListener("click", () => {
      state.selectedIndex = colIndex;
      renderTable();
      renderSelection();
    });

    headRow.appendChild(th);
  });

  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");

  teams.forEach((team, rowIndex) => {
    const tr = document.createElement("tr");

    const rowHead = document.createElement("th");
    rowHead.className = "row-head";
    if (selectedIndex === rowIndex) rowHead.classList.add("highlight");
    rowHead.textContent = `${rowIndex + 1}. ${team}`;

    rowHead.addEventListener("click", () => {
      state.selectedIndex = rowIndex;
      renderTable();
      renderSelection();
    });

    tr.appendChild(rowHead);

    teams.forEach((_, colIndex) => {
      const td = document.createElement("td");

      if (rowIndex === colIndex) {
        td.className = "diagonal";
        td.textContent = "—";
      } else {
        const value = matrix[rowIndex]?.[colIndex] || "";

        if (!value) {
          td.className = "empty";
        } else {
          td.className = "match-cell";

          if (value === "H") {
            td.classList.add("home");
            td.textContent = "H";
          } else if (value === "A") {
            td.classList.add("away");
            td.textContent = "A";
          } else {
            td.textContent = value;
          }
        }
      }

      if (selectedIndex !== null) {
        if (rowIndex === selectedIndex || colIndex === selectedIndex) {
          td.classList.add("highlight");
        }
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  matrixTable.innerHTML = "";
  matrixTable.appendChild(thead);
  matrixTable.appendChild(tbody);
}

function renderSelection() {
  const { teams, matrix, selectedIndex } = state;

  if (selectedIndex === null || !teams[selectedIndex]) {
    selectedTeamName.textContent = "—";
    opponentsList.innerHTML = "";
    return;
  }

  selectedTeamName.textContent = `${selectedIndex + 1}. ${teams[selectedIndex]}`;
  opponentsList.innerHTML = "";

  for (let j = 0; j < teams.length; j++) {
    const value = matrix[selectedIndex][j];
    if (value === "H" || value === "A") {
      const li = document.createElement("li");
      li.innerHTML = `
        ${j + 1}. ${teams[j]}
        <span class="badge ${value === "H" ? "home" : "away"}">
          ${value === "H" ? "Д" : "Г"}
        </span>
      `;
      opponentsList.appendChild(li);
    }
  }

  if (!opponentsList.children.length) {
    const li = document.createElement("li");
    li.textContent = "Соперники ещё не заданы";
    opponentsList.appendChild(li);
  }
}

function updateSummary(matchCount) {
  const { teams, matchesPerTeam } = state;
  summary.innerHTML = `
    Игроков: <strong>${teams.length}</strong><br>
    Соперников на игрока: <strong>${matchesPerTeam}</strong><br>
    Всего матчей: <strong>${matchCount}</strong>
  `;
}

function showError(message) {
  errorBox.textContent = message;
}

function clearError() {
  errorBox.textContent = "";
}

function shuffleInPlace(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function stringToSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return functionSeed(h);
}

function functionSeed(h) {
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}