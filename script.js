document.addEventListener("DOMContentLoaded", () => {
  const searchBox = document.getElementById("search-box");
  const resultsContainer = document.getElementById("results-container");
  const initialMessage = document.querySelector(".initial-message p");
  let db;

  // --- 다크 모드 로직 ---
  const themeToggle = document.getElementById("checkbox");
  const currentTheme = localStorage.getItem("theme");

  if (currentTheme === "dark") {
    document.body.classList.add("dark-mode");
    themeToggle.checked = true;
  }

  themeToggle.addEventListener("change", () => {
    if (themeToggle.checked) {
      document.body.classList.add("dark-mode");
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark-mode");
      localStorage.setItem("theme", "light");
    }
    if (searchBox.value) {
      performSearch(searchBox.value);
    }
  });
  // --------------------

  async function loadDatabase() {
    try {
      const sqlJs = await initSqlJs({
        locateFile: (file) =>
          `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
      });
      const dbUrl =
        "https://raw.githubusercontent.com/zjarhdgkrwk-lang/moji-assets/main/dictionary.db";
      initialMessage.textContent = "사전 데이터 다운로드 중... (최초 1회)";
      const response = await fetch(dbUrl);
      const buffer = await response.arrayBuffer();
      db = new sqlJs.Database(new Uint8Array(buffer));
      initialMessage.textContent = "검색어를 입력하고 Enter를 누르세요.";
    } catch (error) {
      console.error("DB 로딩 오류:", error);
      initialMessage.textContent = "사전 데이터를 불러오는데 실패했습니다.";
    }
  }

  function performSearch(query) {
    if (!db || !query) return;
    try {
      // --- 📢 수정 1: SQL에서 정렬(ORDER BY)을 제거하고 후보군을 더 많이 가져옵니다. ---
      const sql = `
                SELECT *, rowid FROM words
                WHERE word LIKE ? OR reading LIKE ? OR romaji LIKE ? OR meaning LIKE ?
                LIMIT 100
            `;
      const results = db.exec(sql, [
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
      ]);

      let words = [];
      if (results.length > 0) {
        const columns = results[0].columns;
        words = results[0].values.map((row) => {
          const wordObject = {};
          columns.forEach((col, i) => {
            wordObject[col] = row[i];
          });
          return wordObject;
        });
      }

      // --- 📢 수정 2: JavaScript로 정확도 점수를 계산하고 정렬합니다. ---
      const scoredWords = words
        .map((word) => {
          word.score = calculateRelevanceScore(word, query);
          return word;
        })
        .sort((a, b) => b.score - a.score); // 점수가 높은 순으로 정렬

      displayResults(scoredWords.slice(0, 30)); // 상위 30개만 표시
    } catch (error) {
      console.error("검색 오류:", error);
      alert("검색 중 오류가 발생했습니다: " + error.message);
    }
  }

  function calculateRelevanceScore(word, query) {
    let score = 0;
    const lowerQuery = query.toLowerCase();

    // 1. 완전 일치 (가장 높은 점수)
    if (
      word.word === query ||
      word.reading === query ||
      (word.romaji && word.romaji.toLowerCase() === lowerQuery)
    ) {
      score += 100;
    }

    // 2. 시작 부분 일치 (다음으로 높은 점수)
    if (word.word && word.word.startsWith(query)) score += 50;
    if (word.reading && word.reading.startsWith(query)) score += 50;
    if (word.romaji && word.romaji.toLowerCase().startsWith(lowerQuery))
      score += 50;

    // 3. 필드별 가중치
    if (word.word && word.word.includes(query)) score += 20;
    if (word.reading && word.reading.includes(query)) score += 20;
    if (word.romaji && word.romaji.toLowerCase().includes(lowerQuery))
      score += 20;
    if (word.meaning && word.meaning.toLowerCase().includes(lowerQuery))
      score += 5; // 뜻 일치는 낮은 점수

    // 4. 단어 길이 보너스 (검색어와 길이가 비슷할수록 높은 점수)
    if (score > 0) {
      const lengthDifference = Math.abs(
        (word.reading || "").length - query.length
      );
      score -= lengthDifference * 0.5;
    }

    return score;
  }

  function displayResults(words) {
    resultsContainer.innerHTML = "";
    if (words.length === 0) {
      resultsContainer.innerHTML =
        '<div class="initial-message"><p>검색 결과가 없습니다.</p></div>';
      return;
    }
    words.forEach((word) => displayWord(word, resultsContainer));
  }

  function displayWord(word, container) {
    const card = document.createElement("div");
    card.className = "word-card";

    const displayWordText = word.word || word.reading;
    const displayReadingText =
      word.word && word.word !== word.reading ? `(${word.reading})` : "";
    const wordHTML = `<h2>${displayWordText}</h2><span class="reading">${displayReadingText}</span>`;

    const meaningHTML = `<div class="meaning-info">${word.meaning || ""}</div>`;

    let accentHTML = '<div class="accent-info"></div>';
    if (word.pitch_pattern) {
      accentHTML = `
                <div class="accent-info">
                    <div class="accent-graph-container">
                        <canvas id="canvas-${word.rowid}"></canvas>
                    </div>
                </div>
            `;
    }

    card.innerHTML = `
            <div class="word-main-info">
                <div class="word-title">${wordHTML}</div>
                ${accentHTML}
            </div>
            ${meaningHTML}
        `;
    container.appendChild(card);

    if (word.pitch_pattern) {
      const canvas = card.querySelector(`#canvas-${word.rowid}`);
      if (canvas) {
        requestAnimationFrame(() => {
          drawAccentGraph(
            canvas,
            word.pitch_pattern,
            word.accent_type,
            word.reading
          );
        });
      }
    }
  }

  function drawAccentGraph(canvas, pitch, accentType, reading) {
    const ctx = canvas.getContext("2d");
    const moraCount = pitch.length;
    if (moraCount === 0) return;

    const containerWidth = canvas.parentElement.parentElement.clientWidth;
    const spacingPerMora = 25;
    const horizontalPadding = 15;
    let idealWidth = spacingPerMora * (moraCount + 1) + horizontalPadding;
    const finalCssWidth = Math.min(idealWidth, containerWidth);
    canvas.style.width = `${finalCssWidth}px`;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = finalCssWidth * dpr;
    canvas.height = 60 * dpr;
    ctx.scale(dpr, dpr);

    const particlePitch = accentType === 0 ? "H" : "L";
    const fullPitch = pitch + particlePitch;

    const yHigh = 15;
    const yLow = 45;

    const drawableWidth = finalCssWidth - horizontalPadding;
    const stepX = moraCount > 0 ? drawableWidth / moraCount : 0;
    const startX = horizontalPadding / 2;

    ctx.lineWidth = 2.5;
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";

    const isDarkMode = document.body.classList.contains("dark-mode");
    const graphColor = isDarkMode ? "#F5F5F7" : "#000000";
    const textColor = "#8e8e93";

    let points = [];
    for (let i = 0; i < fullPitch.length; i++) {
      const y = fullPitch[i] === "H" ? yHigh : yLow;
      points.push({ x: startX + stepX * i, y: y });
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = graphColor;
    ctx.stroke();

    for (let i = 0; i < moraCount; i++) {
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = graphColor;
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.fillText(reading[i], points[i].x, 35);
    }

    const particlePoint = points[moraCount];
    ctx.beginPath();
    ctx.arc(particlePoint.x, particlePoint.y, 5, 0, 2 * Math.PI);
    ctx.strokeStyle = graphColor;
    ctx.stroke();
  }

  searchBox.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      performSearch(e.target.value);
    }
  });

  loadDatabase();
});
