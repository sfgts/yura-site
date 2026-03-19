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

  drawBtn.disabled = true;
  drawBtn.textContent = "Drawing...";
  animateStatus("Generating draw...");

  setTimeout(() => {
    try {
      const drawResult = generateDrawWithRounds(teams, matchesPerTeam);

      if (!drawResult.success) {
        showError(drawResult.error);
        animateStatus("Draw failed");
        return;
      }

      state.teams = teams;
      state.matchesPerTeam = matchesPerTeam;
      state.matrix = drawResult.matrix;
      state.rounds = drawResult.rounds;

      if (state.selectedIndex !== null && state.selectedIndex >= teams.length) {
        state.selectedIndex = null;
      }

      // Render table first (instant), then animate everything else
      renderTable();
      renderSelection();
      updateSummary(drawResult.matchCount);
      pairingsOutput.value = buildPairingsTextFromRounds(drawResult.rounds);

      animateDrawReveal(drawResult, teams);

    } finally {
      drawBtn.disabled = false;
      drawBtn.textContent = "Random draw";
    }
  }, 10);
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
  // FIX: reduced maxAttempts and added iteration limit to backtrack
  const maxAttempts = 5;
  const n = teams.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const matrix = createEmptyMatrix(n);
    const degrees = Array(n).fill(0);

    const success = backtrackFill(matrix, degrees, matchesPerTeam);
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

// FIX: backtrackFill now has an iteration counter to prevent infinite loops
function backtrackFill(matrix, degrees, targetDegree) {
  const n = matrix.length;
  // Max iterations limit: prevents exponential blowup on large inputs
  const MAX_ITER = 100000;
  let iterations = 0;

  function inner() {
    if (++iterations > MAX_ITER) return false;

    if (degrees.every((d) => d === targetDegree)) return true;

    // Pick the node with fewest available options (MRV heuristic)
    let current = -1;
    let minOptions = Infinity;

    for (let i = 0; i < n; i++) {
      if (degrees[i] >= targetDegree) continue;

      let count = 0;
      for (let j = 0; j < n; j++) {
        if (i !== j && degrees[j] < targetDegree && matrix[i][j] === "") count++;
      }

      if (count === 0) return false;

      if (count < minOptions) {
        minOptions = count;
        current = i;
      }
    }

    if (current === -1) return false;

    const candidates = [];
    for (let j = 0; j < n; j++) {
      if (current !== j && degrees[j] < targetDegree && matrix[current][j] === "") {
        candidates.push(j);
      }
    }

    shuffleInPlace(candidates);

    for (const opponent of candidates) {
      matrix[current][opponent] = "P";
      matrix[opponent][current] = "P";
      degrees[current]++;
      degrees[opponent]++;

      if (
        isStateStillPossible(matrix, degrees, targetDegree) &&
        inner()
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

  return inner();
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

    if (available < need) return false;
  }

  return true;
}

function assignHomeAway(matrix) {
  const n = matrix.length;

  // Collect all pairs and shuffle to avoid positional bias
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i][j] === "P") pairs.push([i, j]);
    }
  }
  shuffleInPlace(pairs);

  const totalMatches = matchesPerTeam => matchesPerTeam; // each player plays exactly matchesPerTeam games
  const half = Math.floor(pairs.length * 2 / n / 2); // target home games per player = matchesPerTeam / 2

  // homeCount[i] = home games assigned so far
  // awayCount[i] = away games assigned so far
  const homeCount = Array(n).fill(0);
  const awayCount = Array(n).fill(0);

  // Total games per player (count from pairs)
  const gamesPerPlayer = Array(n).fill(0);
  for (const [i, j] of pairs) {
    gamesPerPlayer[i]++;
    gamesPerPlayer[j]++;
  }

  // Target: each player should have exactly floor(games/2) or ceil(games/2) home games
  const targetHome = gamesPerPlayer.map(g => Math.floor(g / 2));
  const targetHomeMax = gamesPerPlayer.map(g => Math.ceil(g / 2));

  // Backtracking assignment
  function solve(idx) {
    if (idx === pairs.length) return true;

    const [i, j] = pairs[idx];

    // Remaining games for each player (including current pair)
    const remainingI = gamesPerPlayer[i] - homeCount[i] - awayCount[i];
    const remainingJ = gamesPerPlayer[j] - homeCount[j] - awayCount[j];

    // How many home games still needed
    const needHomeI = targetHome[i] - homeCount[i];
    const needHomeJ = targetHome[j] - homeCount[j];
    const canMoreHomeI = homeCount[i] < targetHomeMax[i];
    const canMoreHomeJ = homeCount[j] < targetHomeMax[j];

    // Build ordered list of options: try the "more needed" one first
    const options = [];

    // Option: i = Home, j = Away
    if (canMoreHomeI && awayCount[j] < targetHomeMax[j]) {
      options.push(true);
    }
    // Option: j = Home, i = Away
    if (canMoreHomeJ && awayCount[i] < targetHomeMax[i]) {
      options.push(false);
    }

    // If neither fits cleanly, allow both anyway (fallback)
    if (options.length === 0) {
      options.push(true, false);
    }

    // Sort: try the option that helps the most-needy player first
    options.sort((a, b) => {
      const scoreA = a ? needHomeI : needHomeJ;
      const scoreB = b ? needHomeI : needHomeJ;
      return scoreB - scoreA;
    });

    for (const iIsHome of options) {
      if (iIsHome) {
        if (homeCount[i] >= targetHomeMax[i]) continue;
        if (awayCount[j] >= targetHomeMax[j]) continue;
        homeCount[i]++;
        awayCount[j]++;
        matrix[i][j] = "H";
        matrix[j][i] = "A";
      } else {
        if (homeCount[j] >= targetHomeMax[j]) continue;
        if (awayCount[i] >= targetHomeMax[i]) continue;
        homeCount[j]++;
        awayCount[i]++;
        matrix[i][j] = "A";
        matrix[j][i] = "H";
      }

      if (solve(idx + 1)) return true;

      // Backtrack
      if (iIsHome) {
        homeCount[i]--;
        awayCount[j]--;
        matrix[i][j] = "P";
        matrix[j][i] = "P";
      } else {
        homeCount[j]--;
        awayCount[i]--;
        matrix[i][j] = "P";
        matrix[j][i] = "P";
      }
    }

    return false;
  }

  const solved = solve(0);

  // Fallback: if backtracking somehow fails (shouldn't happen), use greedy
  if (!solved) {
    const hCount = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (matrix[i][j] === "P") {
          if (hCount[i] <= hCount[j]) {
            matrix[i][j] = "H"; matrix[j][i] = "A"; hCount[i]++;
          } else {
            matrix[i][j] = "A"; matrix[j][i] = "H"; hCount[j]++;
          }
        }
      }
    }
  }
}

function countMatches(matrix) {
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      if (matrix[i][j] === "H" || matrix[i][j] === "A") count++;
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

  const degreeMap = Array(playerCount).fill(0);
  for (const match of matches) {
    degreeMap[match.a]++;
    degreeMap[match.b]++;
  }

  // Sort: hardest-to-place first (fewest options)
  matches.sort((m1, m2) => {
    const s1 = degreeMap[m1.a] + degreeMap[m1.b];
    const s2 = degreeMap[m2.a] + degreeMap[m2.b];
    return s1 - s2; // FIX: ascending = hardest first (fewer options)
  });

  // FIX: added iteration limit to placeMatchIntoRounds
  const MAX_PLACE_ITER = 200000;
  let placeIter = 0;

  function placeMatch(index) {
    if (++placeIter > MAX_PLACE_ITER) return false;
    if (index === matches.length) {
      return rounds.every((r) => r.matches.length === expectedMatchesPerRound);
    }

    const match = matches[index];

    // Sort rounds by fill level ascending (try least-filled first)
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

      if (placeMatch(index + 1)) return true;

      round.matches.pop();
      round.usedPlayers.delete(match.a);
      round.usedPlayers.delete(match.b);
    }

    return false;
  }

  if (!placeMatch(0)) return null;

  return rounds.map((round) => round.matches);
}

function extractUniquePairs(matrix) {
  const pairs = [];

  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      if (matrix[i][j] === "H" || matrix[i][j] === "A") {
        pairs.push({ a: i, b: j, text: `${i + 1}v${j + 1}` });
      }
    }
  }

  return pairs;
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

  const fragment = document.createDocumentFragment();

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
    fragment.appendChild(card);
  });

  roundsBoard.appendChild(fragment);
}

// ── Animation helpers ──────────────────────────────────────────────────────

function animateStatus(text) {
  drawStatus.classList.remove("status-animate");
  void drawStatus.offsetWidth; // reflow to restart animation
  drawStatus.textContent = text;
  drawStatus.classList.add("status-animate");
}

/**
 * Master reveal sequence after a successful draw:
 * 1. Flash match cells in the matrix row by row
 * 2. Then slide-in round cards one by one
 * 3. Then cascade matches inside each card
 * 4. Update status at the end
 */
function animateDrawReveal(drawResult, teams) {
  // Step 1: animate matrix cells
  animateMatrixCells(() => {
    // Step 2: reveal rounds board with staggered cards + matches
    animateRoundsBoard(drawResult.rounds, teams, () => {
      animateStatus(
        `✓ Draw completed: ${drawResult.matchCount} matches, ${drawResult.rounds.length} rounds`
      );
    });
  });
}

function animateMatrixCells(onDone) {
  const cells = Array.from(matrixTable.querySelectorAll("td.match-cell"));

  // Group cells by diagonal index = col - row
  // Diagonal 1 = cells adjacent to main diagonal (|col-row| = 1)
  // Diagonal 2 = next wave (|col-row| = 2), etc.
  // We go from smallest diagonal distance outward
  const byDiag = {};
  cells.forEach(td => {
    const r = +td.dataset.r;
    const c = +td.dataset.c;
    const d = Math.abs(c - r); // distance from main diagonal
    if (!byDiag[d]) byDiag[d] = [];
    byDiag[d].push(td);
  });

  const diagKeys = Object.keys(byDiag).map(Number).sort((a, b) => a - b);

  const DIAG_DELAY = 100;   // ms between diagonal waves
  const FLASH_DUR  = 320;  // ms for the pop animation itself

  // Hide everything first
  cells.forEach(td => td.classList.add("cell-hidden"));

  diagKeys.forEach((d, i) => {
    setTimeout(() => {
      byDiag[d].forEach(td => {
        td.classList.remove("cell-hidden");
        td.classList.add("cell-pop");
        td.addEventListener("animationend", () => td.classList.remove("cell-pop"), { once: true });
      });
    }, i * DIAG_DELAY);
  });

  const totalTime = diagKeys.length * DIAG_DELAY + FLASH_DUR;
  setTimeout(onDone, totalTime);
}

function animateRoundsBoard(rounds, teams, onDone) {
  roundsBoard.innerHTML = "";

  if (!rounds || !rounds.length) {
    roundsBoard.innerHTML = `<div class="round-empty">Rounds have not been generated yet</div>`;
    onDone && onDone();
    return;
  }

  const CARD_DELAY   = 120;  // ms between cards
  const MATCH_DELAY  = 55;   // ms between matches inside a card
  const CARD_ANIM    = 350;  // ms card slide-in duration

  rounds.forEach((round, roundIndex) => {
    const card = document.createElement("div");
    card.className = "round-card card-hidden";

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
      row.className = "round-match match-hidden";
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

    // Animate card in
    const cardDelay = roundIndex * CARD_DELAY;
    setTimeout(() => {
      card.classList.remove("card-hidden");
      card.classList.add("card-slide-in");
      card.addEventListener("animationend", () => card.classList.remove("card-slide-in"), { once: true });

      // Cascade matches inside this card
      const matchRows = card.querySelectorAll(".round-match");
      matchRows.forEach((row, mi) => {
        setTimeout(() => {
          row.classList.remove("match-hidden");
          row.classList.add("match-drop-in");
          row.addEventListener("animationend", () => row.classList.remove("match-drop-in"), { once: true });
        }, CARD_ANIM * 0.6 + mi * MATCH_DELAY);
      });
    }, cardDelay);
  });

  const totalTime = (rounds.length - 1) * CARD_DELAY + CARD_ANIM +
                    (rounds[rounds.length - 1]?.length || 0) * MATCH_DELAY + 200;
  setTimeout(onDone, totalTime);
}

function parsePairText(pairText) {
  const match = pairText.match(/^(\d+)v(\d+)$/i);
  if (!match) return null;

  return { a: Number(match[1]), b: Number(match[2]) };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// FIX: renderTable — отделяем подсветку от пересборки таблицы.
// Таблица пересобирается только при смене состава / матрицы.
// При клике (выбор игрока) только обновляем CSS-классы.

let _lastRenderKey = null; // tracks if full rebuild is needed

function renderTable() {
  const { teams, matrix, selectedIndex } = state;

  if (!teams.length) {
    matrixTable.innerHTML = "";
    _lastRenderKey = null;
    return;
  }

  // Build a key that represents structure (not selection)
  const structureKey = teams.join("|") + "||" + matrix.map(r => r.join(",")).join(";");
  const needFullRebuild = structureKey !== _lastRenderKey;

  if (needFullRebuild) {
    _lastRenderKey = structureKey;
    _buildFullTable(teams, matrix);
  }

  _applyHighlights(teams.length, selectedIndex);
  updateCellSize(teams.length);
}

function _buildFullTable(teams, matrix) {
  const fragment = document.createDocumentFragment();

  // THEAD
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const corner = document.createElement("th");
  corner.className = "corner";
  corner.innerHTML = `<div class="table-logo"><img src="logo.png" alt="logo"></div>`;
  headRow.appendChild(corner);

  teams.forEach((team, colIndex) => {
    const th = document.createElement("th");
    th.className = "col-head";
    th.dataset.col = colIndex;

    const div = document.createElement("div");
    div.textContent = `${colIndex + 1}. ${team}`;
    th.appendChild(div);

    th.addEventListener("click", () => {
      state.selectedIndex = colIndex;
      _applyHighlights(teams.length, colIndex);
      renderSelection();
    });

    headRow.appendChild(th);
  });

  thead.appendChild(headRow);

  // TBODY
  const tbody = document.createElement("tbody");

  teams.forEach((team, rowIndex) => {
    const tr = document.createElement("tr");

    const rowHead = document.createElement("th");
    rowHead.className = "row-head";
    rowHead.dataset.row = rowIndex;
    rowHead.textContent = `${rowIndex + 1}. ${team}`;

    rowHead.addEventListener("click", () => {
      state.selectedIndex = rowIndex;
      _applyHighlights(teams.length, rowIndex);
      renderSelection();
    });

    tr.appendChild(rowHead);

    teams.forEach((_, colIndex) => {
      const td = document.createElement("td");
      td.dataset.r = rowIndex;
      td.dataset.c = colIndex;

      if (rowIndex === colIndex) {
        td.className = "diagonal";
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

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  fragment.appendChild(thead);
  fragment.appendChild(tbody);

  matrixTable.innerHTML = "";
  matrixTable.appendChild(fragment);
}

function _applyHighlights(n, selectedIndex) {
  // Remove all existing highlights
  matrixTable.querySelectorAll(".highlight").forEach(el => el.classList.remove("highlight"));

  if (selectedIndex === null) return;

  // Highlight column header
  const colHead = matrixTable.querySelector(`th.col-head[data-col="${selectedIndex}"]`);
  if (colHead) colHead.classList.add("highlight");

  // Highlight row header
  const rowHead = matrixTable.querySelector(`th.row-head[data-row="${selectedIndex}"]`);
  if (rowHead) rowHead.classList.add("highlight");

  // Highlight cells in selected row and column
  matrixTable.querySelectorAll(`td[data-r="${selectedIndex}"], td[data-c="${selectedIndex}"]`)
    .forEach(td => td.classList.add("highlight"));
}

function renderSelection() {
  const { teams, matrix, selectedIndex } = state;

  if (selectedIndex === null || !teams[selectedIndex]) {
    selectedTeamName.textContent = "—";
    opponentsList.innerHTML = "";
    return;
  }

  selectedTeamName.textContent = `${selectedIndex + 1}. ${teams[selectedIndex]}`;

  // FIX: use fragment for opponents list
  const fragment = document.createDocumentFragment();
  let hasOpponents = false;

  for (let j = 0; j < teams.length; j++) {
    const value = matrix[selectedIndex][j];
    if (value === "H" || value === "A") {
      hasOpponents = true;
      const li = document.createElement("li");
      li.innerHTML = `
        ${j + 1}. ${escapeHtml(teams[j])}
        <span class="badge ${value === "H" ? "home" : "away"}">
          ${value === "H" ? "H" : "A"}
        </span>
      `;
      fragment.appendChild(li);
    }
  }

  if (!hasOpponents) {
    const li = document.createElement("li");
    li.textContent = "Opponents have not been assigned yet";
    fragment.appendChild(li);
  }

  opponentsList.innerHTML = "";
  opponentsList.appendChild(fragment);
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

// FIX: removed duplicate declaration
function updateCellSize(playerCount) {
  const gridSection = document.querySelector(".grid-section");
  if (!gridSection) return;
  const gridWidth = gridSection.clientWidth;

  const nameColumn = 240;
  const padding = 40;
  const availableWidth = gridWidth - nameColumn - padding;

  let cellSize = Math.floor(availableWidth / playerCount);

  if (cellSize > 36) cellSize = 36;
  if (cellSize < 18) cellSize = 18;

  document.documentElement.style.setProperty("--cell-size", cellSize + "px");
}
