const teamsInput = document.getElementById("teamsInput");
const pairingsOutput = document.getElementById("pairingsOutput");
const matchesPerTeamInput = document.getElementById("matchesPerTeam");
const buildBtn = document.getElementById("buildBtn");
const drawBtn = document.getElementById("drawBtn");
const resetBtn = document.getElementById("resetBtn");
const matrixTable = document.getElementById("matrixTable");
const selectedTeamName = document.getElementById("selectedTeamName");
const opponentsList = document.getElementById("opponentsList");
const summary = document.getElementById("summary");
const errorBox = document.getElementById("errorBox");
const drawStatus = document.getElementById("drawStatus");
const roundsBoard = document.getElementById("roundsBoard");

let state = {
  teams: [],
  matrix: [],
  selectedIndex: null,
  matchesPerTeam: 4,
  rounds: []
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
  state.rounds = [];

  renderTable();
  renderSelection();
  updateSummary(0);
  pairingsOutput.value = "";
  roundsBoard.innerHTML = "";
  drawStatus.textContent = "Grid built, draw has not been performed yet";
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

  const drawResult = generateDrawWithRounds(teams, matchesPerTeam);

  if (!drawResult.success) {
    showError(drawResult.error);
    return;
  }

  state.teams = teams;
  state.matchesPerTeam = matchesPerTeam;
  state.matrix = drawResult.matrix;
  state.rounds = drawResult.rounds;

  if (state.selectedIndex !== null && state.selectedIndex >= teams.length) {
    state.selectedIndex = null;
  }

  renderTable();
  renderSelection();
  updateSummary(drawResult.matchCount);
  pairingsOutput.value = buildPairingsTextFromRounds(drawResult.rounds);
  renderRoundsBoard(drawResult.rounds, state.teams);

  drawStatus.textContent =
    `Draw completed: ${drawResult.matchCount} matches, ${drawResult.rounds.length} rounds`;
}

function handleReset() {
  state = {
    teams: [],
    matrix: [],
    selectedIndex: null,
    matchesPerTeam: 4,
    rounds: []
  };

  matrixTable.innerHTML = "";
  selectedTeamName.textContent = "—";
  opponentsList.innerHTML = "";
  summary.textContent = "";
  pairingsOutput.value = "";
  roundsBoard.innerHTML = "";
  drawStatus.textContent = "The draw has not been performed yet";
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
    return "At least 2 players are required.";
  }

  const unique = new Set(teams.map((t) => t.toLowerCase()));
  if (unique.size !== teams.length) {
    return "The player list contains duplicate names.";
  }

  if (!Number.isInteger(matchesPerTeam) || matchesPerTeam < 1) {
    return "The number of opponents per player must be an integer starting from 1.";
  }

  if (matchesPerTeam >= teams.length) {
    return "The number of opponents must be less than the number of players.";
  }

  const total = teams.length * matchesPerTeam;
  if (total % 2 !== 0) {
    return "It is impossible to build such a draw: the number of players × opponents must be even.";
  }

  if (teams.length % 2 !== 0) {
    return "For rounds without repeating players, the number of players must be even.";
  }

  return null;
}

function createEmptyMatrix(size) {
  return Array.from({ length: size }, () => Array(size).fill(""));
}

function generateDrawWithRounds(teams, matchesPerTeam) {
  const maxAttempts = 300;
  const n = teams.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const matrix = createEmptyMatrix(n);
    const degrees = Array(n).fill(0);
    const targetDegree = matchesPerTeam;

    const success = backtrackFill(matrix, degrees, targetDegree);
    if (!success) continue;

    assignHomeAway(matrix);

    const rounds = scheduleRounds(matrix, matchesPerTeam, n);
    if (!rounds) continue;

    return {
      success: true,
      matrix,
      rounds,
      matchCount: countMatches(matrix)
    };
  }

  return {
    success: false,
    error:
      "Failed to generate a draw that can be distributed into rounds without repeating players. Please try again."
  };
}

function backtrackFill(matrix, degrees, targetDegree) {
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

  shuffleInPlace(candidates);

  for (const opponent of candidates) {
    matrix[current][opponent] = "P";
    matrix[opponent][current] = "P";
    degrees[current]++;
    degrees[opponent]++;

    if (
      isStateStillPossible(matrix, degrees, targetDegree) &&
      backtrackFill(matrix, degrees, targetDegree)
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

function assignHomeAway(matrix) {
  const n = matrix.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i][j] === "P" && matrix[j][i] === "P") {
        if (Math.random() < 0.5) {
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

function scheduleRounds(matrix, roundCount, playerCount) {
  const matches = extractUniquePairs(matrix);
  const expectedMatchesPerRound = playerCount / 2;
  const rounds = Array.from({ length: roundCount }, () => ({
    matches: [],
    usedPlayers: new Set()
  }));

  // Sort pairs: first pairs of players with fewer options
  const degreeMap = Array(playerCount).fill(0);
  for (const match of matches) {
    degreeMap[match.a]++;
    degreeMap[match.b]++;
  }

  matches.sort((m1, m2) => {
    const s1 = degreeMap[m1.a] + degreeMap[m1.b];
    const s2 = degreeMap[m2.a] + degreeMap[m2.b];
    return s2 - s1;
  });

  const success = placeMatchIntoRounds(matches, 0, rounds, expectedMatchesPerRound);

  if (!success) return null;

  return rounds.map((round) => round.matches);
}

function extractUniquePairs(matrix) {
  const pairs = [];

  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      if (matrix[i][j] === "H" || matrix[i][j] === "A") {
        pairs.push({
          a: i,
          b: j,
          text: `${i + 1}v${j + 1}`
        });
      }
    }
  }

  return pairs;
}

function placeMatchIntoRounds(matches, index, rounds, expectedMatchesPerRound) {
  if (index === matches.length) {
    return rounds.every((round) => round.matches.length === expectedMatchesPerRound);
  }

  const match = matches[index];

  const roundOrder = rounds
    .map((round, idx) => ({ round, idx }))
    .sort((x, y) => x.round.matches.length - y.round.matches.length);

  for (const item of roundOrder) {
    const round = item.round;

    if (round.matches.length >= expectedMatchesPerRound) continue;
    if (round.usedPlayers.has(match.a)) continue;
    if (round.usedPlayers.has(match.b)) continue;

    round.matches.push(match.text);
    round.usedPlayers.add(match.a);
    round.usedPlayers.add(match.b);

    if (placeMatchIntoRounds(matches, index + 1, rounds, expectedMatchesPerRound)) {
      return true;
    }

    round.matches.pop();
    round.usedPlayers.delete(match.a);
    round.usedPlayers.delete(match.b);
  }

  return false;
}

function buildPairingsTextFromRounds(rounds) {
  return rounds.map((round) => round.join(" ")).join("\n");
}

function renderRoundsBoard(rounds, teams) {
  roundsBoard.innerHTML = "";

  if (!rounds || !rounds.length) {
    roundsBoard.innerHTML = `<div class="round-empty">Rounds have not been generated yet</div>`;
    return;
  }

  rounds.forEach((round, roundIndex) => {
    const card = document.createElement("div");
    card.className = "round-card";

    const title = document.createElement("div");
    title.className = "round-card-title";
    title.textContent = `ROUND ${roundIndex + 1}`;

    const subtitle = document.createElement("div");
    subtitle.className = "round-card-subtitle";
    subtitle.textContent = `${round.length} matches`;

    const matchesWrap = document.createElement("div");
    matchesWrap.className = "round-matches";

    round.forEach((pairText) => {
      const parsed = parsePairText(pairText);
      if (!parsed) return;

      const homeName = teams[parsed.a - 1] || `Player ${parsed.a}`;
      const awayName = teams[parsed.b - 1] || `Player ${parsed.b}`;

      const row = document.createElement("div");
      row.className = "round-match";
      row.innerHTML = `
        <div class="round-home">${escapeHtml(homeName)}</div>
        <div class="round-sep">-</div>
        <div class="round-away">${escapeHtml(awayName)}</div>
      `;

      matchesWrap.appendChild(row);
    });

    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(matchesWrap);

    roundsBoard.appendChild(card);
  });
}

function parsePairText(pairText) {
  const match = pairText.match(/^(\d+)v(\d+)$/i);
  if (!match) return null;

  return {
    a: Number(match[1]),
    b: Number(match[2])
  };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  corner.innerHTML = `
    <div class="table-logo">
      <img src="logo.png" alt="logo">
    </div>
  `;

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
        td.textContent = "";
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

  updateCellSize(teams.length);
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
          ${value === "H" ? "H" : "A"}
        </span>
      `;
      opponentsList.appendChild(li);
    }
  }

  if (!opponentsList.children.length) {
    const li = document.createElement("li");
    li.textContent = "Opponents have not been assigned yet";
    opponentsList.appendChild(li);
  }
}

function updateSummary(matchCount) {
  const { teams, matchesPerTeam } = state;
  summary.innerHTML = `
    Players: <strong>${teams.length}</strong><br>
    Opponents per player: <strong>${matchesPerTeam}</strong><br>
    Total matches: <strong>${matchCount}</strong>
  `;
}

function showError(message) {
  errorBox.textContent = message;
}

function clearError() {
  errorBox.textContent = "";
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function updateCellSize(playerCount) {
  const gridSection = document.querySelector(".grid-section");
  const gridWidth = gridSection.clientWidth;

  const nameColumn = 240; // player name column width
  const padding = 40; // small extra space

  const availableWidth = gridWidth - nameColumn - padding;

  let cellSize = Math.floor(availableWidth / playerCount);

  // limits so cells do not become too small
  if (cellSize > 36) cellSize = 36;
  if (cellSize < 18) cellSize = 18;

  document.documentElement.style.setProperty("--cell-size", cellSize + "px");
}

function updateCellSize(playerCount) {
  const gridSection = document.querySelector(".grid-section");
  const gridWidth = gridSection.clientWidth;

  const nameColumn = 240;
  const padding = 40;

  const availableWidth = gridWidth - nameColumn - padding;

  let cellSize = Math.floor(availableWidth / playerCount);

  if (cellSize > 36) cellSize = 36;
  if (cellSize < 18) cellSize = 18;

  document.documentElement.style.setProperty("--cell-size", cellSize + "px");
}