document.addEventListener('DOMContentLoaded', () => {
    const searchBox = document.getElementById('search-box');
    const resultsContainer = document.getElementById('results-container');
    const initialMessage = document.querySelector('.initial-message p');
    let db;

    async function loadDatabase() {
        try {
            const sqlJs = await initSqlJs({ 
                locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}` 
            });
            const dbUrl = 'https://raw.githubusercontent.com/zjarhdgkrwk-lang/moji-assets/main/dictionary.db';
            initialMessage.textContent = '사전 데이터 다운로드 중... (최초 1회)';
            const response = await fetch(dbUrl);
            const buffer = await response.arrayBuffer();
            db = new sqlJs.Database(new Uint8Array(buffer));
            initialMessage.textContent = '검색어를 입력하고 Enter를 누르세요.';
        } catch (error) {
            console.error("DB 로딩 오류:", error);
            initialMessage.textContent = '사전 데이터를 불러오는데 실패했습니다.';
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
            const results = db.exec(sql, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]);
            
            let words = [];
            if (results.length > 0) {
                const columns = results[0].columns;
                words = results[0].values.map(row => {
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
        resultsContainer.innerHTML = '';
        if (words.length === 0) {
            resultsContainer.innerHTML = '<div class="initial-message"><p>검색 결과가 없습니다.</p></div>';
            return;
        }

        words.forEach(word => {
            const card = document.createElement('div');
            card.className = 'word-card';
            
            const kanjiHTML = word.kanji ? `<h2>${word.kanji}</h2><span class="reading">${word.reading}</span>` : `<h2>${word.reading}</h2>`;
            const meaningHTML = `<div class="meaning-info">${word.meaning || ''}</div>`;
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
                <div class="word-info">${kanjiHTML}</div>
                ${accentHTML}
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
        const ctx = canvas.getContext('2d');
        const moraCount = pitch.length;
        if (moraCount === 0) return;

        // 1. 내부 캔버스 크기는 고정 (고화질 보장)
        canvas.width = 300;
        canvas.height = 120;

        const particlePitch = (accentType === 0) ? 'H' : 'L';
        const fullPitch = pitch + particlePitch;
        
        const yHigh = 20;
        const yLow = 60;
        
        // 2. [수정] 캔버스 내부에 안전 여백(padding)을 설정합니다.
        const padding = 20;
        const drawableWidth = canvas.width - (padding * 2); // 그림이 그려질 실제 너비 (300 - 40 = 260)
        
        // 3. [수정] 여백을 고려하여 시작점과 점 사이 간격을 다시 계산합니다.
        const startX = padding;
        const stepX = (moraCount > 0) ? drawableWidth / moraCount : 0; // 260px 안에서 간격 계산

        ctx.lineWidth = 4;
        ctx.font = '32px sans-serif';
        ctx.textAlign = 'center';
        
        let points = [];
        for (let i = 0; i < fullPitch.length; i++) {
            const y = (fullPitch[i] === 'H') ? yHigh : yLow;
            points.push({ x: startX + stepX * i, y: y });
        }

        // 선 그리기
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // 점과 텍스트 그리기
        for (let i = 0; i < moraCount; i++) {
            // 점
            ctx.beginPath();
            ctx.arc(points[i].x, points[i].y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = '#000000';
            ctx.fill();
            
            // 텍스트
            ctx.fillStyle = '#8e8e93';
            ctx.fillText(reading[i], points[i].x, 100);
        }

        // 조사(particle) 그리기
        const particlePoint = points[moraCount];
        ctx.beginPath();
        ctx.arc(particlePoint.x, particlePoint.y, 8, 0, 2 * Math.PI);
        ctx.strokeStyle = '#000000';
        ctx.stroke();
    }

    searchBox.addEventListener('keyup', e => {
        if (e.key === "Enter") {
            performSearch(e.target.value);
        }
    });

    loadDatabase();
});