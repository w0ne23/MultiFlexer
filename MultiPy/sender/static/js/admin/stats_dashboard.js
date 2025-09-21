// === 전역 차트 관리 ===
const charts = {}; // { participantName: { chart, metric } }

// === STATS 표시 ===
function handleStatsMessage(stats) {
  const area = document.querySelector('.video-measurement-area');
  if (!area) {
    console.warn("[UI] video-measurement-area를 찾을 수 없음!");
    return;
  }

  console.log("[UI] handleStatsMessage 호출됨", stats);

  // 기존 div 찾아서 업데이트
  let statDiv = area.querySelector(`.stat-entry[data-name="${stats.name}"]`);

  if (!statDiv) {
    statDiv = document.createElement("div");
    statDiv.classList.add("stat-entry");
    statDiv.dataset.name = stats.name;
    statDiv.style.color = "#000";
    statDiv.style.fontSize = "14px";
    statDiv.style.marginBottom = "16px";
    statDiv.style.border = "1px solid #ddd";
    statDiv.style.borderRadius = "8px";
    statDiv.style.background = "#fff";
    statDiv.style.padding = "10px";
    statDiv.style.display = 'none';
    area.appendChild(statDiv);

    // 제목
    const title = document.createElement("strong");
    title.textContent = stats.name || "이름없음";
    statDiv.appendChild(title);

    // 캔버스 (차트 영역)
    const canvas = document.createElement("canvas");
    canvas.id = `chart-${stats.name}`;
    canvas.style.width = "100%";
    canvas.style.height = "200px";
    statDiv.appendChild(canvas);

    // 버튼 영역
    const btnGroup = document.createElement("div");
    btnGroup.style.margin = "8px 0";
    ["fps", "mbps", "avg_fps"].forEach(metric => {
      const btn = document.createElement("button");
      btn.textContent = metric.toUpperCase();
      btn.style.marginRight = "6px";
      btn.style.padding = "4px 8px";
      btn.style.border = "1px solid #ccc";
      btn.style.borderRadius = "4px";
      btn.style.cursor = "pointer";

      btn.addEventListener("click", () => {
        charts[stats.name].metric = metric;
        charts[stats.name].chart.data.datasets[0].label = metric.toUpperCase();
        charts[stats.name].chart.data.labels = []; // 초기화
        charts[stats.name].chart.data.datasets[0].data = [];
        charts[stats.name].chart.update();
      });

      btnGroup.appendChild(btn);
    });
    statDiv.appendChild(btnGroup);

    // 텍스트 영역
    const textDiv = document.createElement("div");
    textDiv.classList.add("stat-text");
    statDiv.appendChild(textDiv);

    // Chart.js 초기화
    const ctx = canvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "FPS",
            data: [],
            borderColor: "rgba(75, 192, 192, 1)",
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        animation: false,
        scales: {
          x: { display: false },
          y: { beginAtZero: true }
        }
      }
    });

    charts[stats.name] = { chart, metric: "fps" };
  }

  // 텍스트 업데이트
  const textDiv = statDiv.querySelector(".stat-text");
  textDiv.innerHTML = `
    FPS: ${(stats.fps ?? 0).toFixed(2)}<br>
    Avg FPS: ${(stats.avg_fps ?? 0).toFixed(2)}<br>
    Mbps: ${(stats.mbps ?? 0).toFixed(2)}<br>
    Drop: ${(stats.drop ?? 0).toFixed(2)}<br>
    Res: ${stats.width}x${stats.height}
  `;

  // 차트 업데이트
  const chartInfo = charts[stats.name];
  if (chartInfo) {
    const metric = chartInfo.metric;
    const value = stats[metric] ?? 0;
    const chart = chartInfo.chart;

    chart.data.labels.push(new Date().toLocaleTimeString());
    chart.data.datasets[0].data.push(value);

    if (chart.data.labels.length > 20) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }

    chart.update();
  }
}
window.handleStatsMessage = handleStatsMessage;

function filterStatsByName(name) {
  const entries = document.querySelectorAll('.stat-entry');
  entries.forEach(div => {
    if (div.dataset.name === name) {
      div.style.display = 'block'; // 해당 사용자만 보이게
    } else {
      div.style.display = 'none';  // 나머지는 숨김
    }
  });
}
window.filterStatsByName = filterStatsByName;

function showPlacedStats() {
  const placedNames = stateManager.getPlacedParticipantNames();
  const entries = document.querySelectorAll('.stat-entry');

  entries.forEach(div => {
    if (placedNames.includes(div.dataset.name)) {
      div.style.display = 'block'; // 공유 중인 사람 통계만 표시
    } else {
      div.style.display = 'none';
    }
  });
}
window.showPlacedStats = showPlacedStats;

// === MQTT 구독 연결 ===
if (window.client) {
  window.client.subscribe("stats/update");

  window.client.on("message", function (topic, message) {
    if (topic === "stats/update") {
      try {
        const stats = JSON.parse(message.toString());
        handleStatsMessage(stats);
      } catch (err) {
        console.error("[STATS] JSON parse error:", err);
      }
    }
  });
}

// 대시보드 토글 버튼 이벤트
document.addEventListener('DOMContentLoaded', function () {
  const dashboardBtn = document.getElementById('dashboard-btn');
  const dashLeft = document.querySelector('.dash-left');
  const dashRight = document.querySelector('.dash-right');

  let isDashboardActive = false; // 토글 상태 저장

  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
      isDashboardActive = !isDashboardActive;

      if (isDashboardActive) {
        dashboardBtn.textContent = '대시보드 중지';
        dashboardBtn.style.background = '#ff4444';
        dashLeft.classList.remove('hidden');
        dashRight.classList.remove('hidden');
      } else {
        dashboardBtn.textContent = '대시보드 보기';
        dashboardBtn.style.background = '#04d2af';
        dashLeft.classList.add('hidden');
        dashRight.classList.add('hidden');
      }
    });
  }
});