async function loadDashboard() {
  const response = await fetch("data/dashboard.json");
  if (!response.ok) {
    throw new Error("无法读取 dashboard.json");
  }
  return response.json();
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const text = String(value).trim().replace("%", "");
  if (!text) return null;
  const num = Number(text);
  return Number.isNaN(num) ? null : num;
}

function formatNumber(value) {
  const num = parseNumber(value);
  if (num === null) return "-";
  return num.toFixed(2);
}

function formatPercent(value) {
  const num = parseNumber(value);
  if (num === null) return "-";
  const percent = num <= 1 ? num * 100 : num;
  return `${percent.toFixed(2)}%`;
}

function formatProbability(value) {
  const num = parseNumber(value);
  if (num === null) return "-";
  const percent = num <= 1 ? num * 100 : num;
  return `${percent.toFixed(0)}%`;
}

function mapAction(action) {
  const normalized = String(action || "").trim().toLowerCase();
  if (normalized === "buy" || normalized === "买入") return { label: "买入", cls: "tag-buy" };
  if (normalized === "sell" || normalized === "卖出") return { label: "卖出", cls: "tag-sell" };
  if (normalized === "hold" || normalized === "观望" || normalized === "持有") {
    return { label: "观望", cls: "tag-hold" };
  }
  return { label: action || "-", cls: "" };
}

function mapOpportunity(value) {
  const normalized = String(value || "").toLowerCase();
  if (["yes", "true", "1", "是", "有"].includes(normalized)) return "有";
  if (["no", "false", "0", "否", "无"].includes(normalized)) return "无";
  return value || "-";
}

function drawLineChart(canvas, data) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!data.length) {
    ctx.fillStyle = "#7fa7c7";
    ctx.font = "12px Fira Sans, Arial";
    ctx.fillText("暂无收益曲线数据", 20, 30);
    return;
  }

  const padding = 36;
  const values = data.map((point) => Number(point.equity || 0));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  ctx.strokeStyle = "rgba(0, 200, 255, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  ctx.strokeStyle = "#26d7ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((point, idx) => {
    const x = padding + (idx / (data.length - 1 || 1)) * (width - padding * 2);
    const y = height - padding - ((Number(point.equity || 0) - minVal) / range) * (height - padding * 2);
    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#7fa7c7";
  ctx.font = "12px Fira Sans, Arial";
  ctx.fillText(formatNumber(maxVal), padding, padding - 8);
  ctx.fillText(formatNumber(minVal), padding, height - padding + 18);
}

function renderPortfolio(portfolio) {
  document.getElementById("portfolioCash").textContent = formatNumber(portfolio.cash);
  document.getElementById("portfolioPositionsCount").textContent = portfolio.positions_count ?? "-";
  document.getElementById("portfolioInvested").textContent = formatNumber(portfolio.invested_cost);
  document.getElementById("portfolioExposure").textContent = formatPercent(portfolio.exposure);
  document.getElementById("portfolioEquity").textContent = formatNumber(portfolio.last_equity);
  document.getElementById("portfolioReturn").textContent = formatPercent(portfolio.total_return);
  document.getElementById("portfolioLastTrade").textContent = portfolio.last_trade_time || "-";
  document.getElementById("portfolioLastUpdate").textContent = portfolio.last_update || "-";

  const list = document.getElementById("portfolioPositions");
  const positions = portfolio.positions || [];
  if (!positions.length) {
    list.textContent = "暂无持仓";
    return;
  }

  list.innerHTML = positions
    .slice(0, 12)
    .map(
      (pos) => `
        <div class="position-row">
          <span>${pos.symbol || "-"}</span>
          <span>${pos.shares ?? "-"} @ ${formatNumber(pos.avg_cost)}</span>
        </div>
      `
    )
    .join("");
}

function renderSignals(signals, fallbackTime) {
  const body = document.querySelector("#signalsTable tbody");
  body.innerHTML = "";
  if (!signals || !signals.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">暂无信号</td></tr>';
    return;
  }

  signals.forEach((signal) => {
    const row = document.createElement("tr");
    const actionInfo = mapAction(signal.action);
    const probability = formatProbability(signal.probability);
    const opportunity = mapOpportunity(signal.has_opportunity);
    const triggerTime = signal.trigger_time || fallbackTime || "-";

    row.innerHTML = `
      <td>${signal.symbol_code || "-"}</td>
      <td>${signal.symbol_name || "-"}</td>
      <td><span class="tag ${actionInfo.cls}">${actionInfo.label}</span></td>
      <td>${probability}</td>
      <td>${opportunity}</td>
      <td>${triggerTime}</td>
    `;
    body.appendChild(row);
  });
}

function renderHistory(history) {
  const body = document.querySelector("#historyTable tbody");
  body.innerHTML = "";
  if (!history || !history.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">暂无执行记录</td></tr>';
    return;
  }

  history.forEach((record) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${record.time || "-"}</td>
      <td>${record.orders ?? "-"}</td>
      <td>${formatNumber(record.ending_equity)}</td>
      <td>${formatNumber(record.realized_pnl)}</td>
    `;
    body.appendChild(row);
  });
}

function renderSummary(summary, metaId, bodyId, label) {
  const meta = document.getElementById(metaId);
  const body = document.getElementById(bodyId);
  if (!meta || !body) return;
  if (!summary || !summary.name) {
    meta.textContent = `${label}暂无报告`;
    body.textContent = "暂无摘要";
    return;
  }
  meta.textContent = `更新时间：${summary.updated_at || "-"} | 文件：${summary.name || "-"}`;
  body.textContent = summary.summary || "暂无摘要";
}

function updateUI(data) {
  document.getElementById("generatedAt").textContent = `数据生成时间：${data.generated_at || "-"}`;
  document.getElementById("signalTime").textContent = `信号生成时间：${data.latest_signals?.signal_time || "-"}`;

  const status = data.status || {};
  document.getElementById("statusPhase").textContent = status.phase || "-";
  document.getElementById("statusMessage").textContent = status.message || "-";
  document.getElementById("statusSignal").textContent = status.signal_time || "-";
  document.getElementById("statusExec").textContent = status.exec_time || "-";

  drawLineChart(document.getElementById("equityChart"), data.equity_curve || []);
  renderPortfolio(data.portfolio || {});
  renderSignals(data.latest_signals?.signals || [], data.latest_signals?.signal_time);
  renderHistory(data.history || []);

  renderSummary(data.report_summaries?.research, "researchSummaryMeta", "researchSummary", "研究报告");
  renderSummary(data.report_summaries?.data, "dataSummaryMeta", "dataSummary", "数据报告");
}

loadDashboard()
  .then(updateUI)
  .catch((err) => {
    const subtitle = document.getElementById("generatedAt");
    if (subtitle) {
      subtitle.textContent = `加载失败：${err.message}`;
    }
  });
