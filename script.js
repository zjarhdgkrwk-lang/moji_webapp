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
    // 테마 변경 시 현재 검색 결과가 있다면 다시 그려서 그래프 색상을 업데이트합니다.
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
      const sql = `
                SELECT * FROM words
                WHERE kanji LIKE ? OR reading LIKE ? OR romaji LIKE ? OR meaning LIKE ?
                ORDER BY length(reading)
                LIMIT 30
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
      displayResults(words);
    } catch (error) {
      console.error("검색 오류:", error);
      alert("검색 중 오류가 발생했습니다: " + error.message);
    }
  }

  function displayResults(words) {
    resultsContainer.innerHTML = "";
    if (words.length === 0) {
      resultsContainer.innerHTML =
        '<div class="initial-message"><p>검색 결과가 없습니다.</p></div>';
      return;
    }

    words.forEach((word) => {
      const card = document.createElement("div");
      card.className = "word-card";

      const kanjiHTML = word.kanji
        ? `<h2>${word.kanji}</h2><span class="reading">${word.reading}</span>`
        : `<h2>${word.reading}</h2>`;
      const meaningHTML = `<div class="meaning-info">${
        word.meaning || ""
      }</div>`;
      let accentHTML = '<div class="accent-info"></div>';

      if (word.pitch) {
        accentHTML = `
                    <div class="accent-info">
                        <div class="accent-graph-container">
                            <canvas id="canvas-${word.id}"></canvas>
                        </div>
                    </div>
                `;
      }

      card.innerHTML = `
                <div class="word-main-info">
                    <div class="word-title">${kanjiHTML}</div>
                    ${accentHTML}
                </div>
                ${meaningHTML}
            `;
      resultsContainer.appendChild(card);

      if (word.pitch) {
        requestAnimationFrame(() => {
          const canvas = document.getElementById(`canvas-${word.id}`);
          if (canvas) {
            drawAccentGraph(canvas, word.pitch, word.accent_type, word.reading);
          }
        });
      }
    });
  }

  function drawAccentGraph(canvas, pitch, accentType, reading) {
    const ctx = canvas.getContext("2d");
    const moraCount = pitch.length;
    if (moraCount === 0) return;

    // 1. 캔버스의 부모 컨테이너(.accent-info)의 실제 너비를 가져옵니다.
    const containerWidth = canvas.parentElement.parentElement.clientWidth;

    // 2. 음절당 차지할 CSS 픽셀 너비를 정의합니다.
    const spacingPerMora = 25;
    const horizontalPadding = 15;

    // 3. 단어 길이에 따라 이상적인 너비를 계산합니다.
    let idealWidth = spacingPerMora * (moraCount + 1) + horizontalPadding;

    // 4. 이상적인 너비가 컨테이너 너비보다 크면, 컨테이너 너비에 맞춥니다.
    const finalCssWidth = Math.min(idealWidth, containerWidth);

    canvas.style.width = `${finalCssWidth}px`;

    // 5. 고해상도 디스플레이를 위해 내부 드로잉 크기를 설정합니다.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = finalCssWidth * dpr;
    canvas.height = 60 * dpr;
    ctx.scale(dpr, dpr);

    const particlePitch = accentType === 0 ? "H" : "L";
    const fullPitch = pitch + particlePitch;

    const yHigh = 15;
    const yLow = 45;

    // 6. 최종 너비에 맞춰 점 사이 간격을 다시 계산합니다.
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
      ctx.fillText(reading[i], points[i].x, 35); // 텍스트를 점 바로 아래로 이동
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
