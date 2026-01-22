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

function formatShares(value) {
  const num = parseNumber(value);
  if (num === null) return "-";
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2);
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

function getOrderList(record) {
  if (!record) return [];
  if (Array.isArray(record.orders_detail)) return record.orders_detail;
  if (Array.isArray(record.orders)) return record.orders;
  return [];
}

function getOrderCount(record, orderList) {
  if (orderList && orderList.length) return orderList.length;
  const count = parseNumber(record?.orders);
  return count === null ? 0 : count;
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

function renderHistoryDetail(record) {
  const meta = document.getElementById("historyDetailMeta");
  const stats = document.getElementById("historyDetailStats");
  const body = document.getElementById("historyDetailBody");
  if (!meta || !stats || !body) return;

  if (!record) {
    meta.textContent = "点击日期行查看详情";
    stats.textContent = "";
    body.innerHTML = '<div class="detail-empty">暂无详情</div>';
    return;
  }

  const orders = getOrderList(record);
  const orderCount = getOrderCount(record, orders);
  const signalTime = record.signal_time || "-";
  const priceMode = record.price_mode || "-";

  meta.textContent = `执行时间：${record.time || "-"}`;
  stats.innerHTML = `
    <span>信号：${signalTime}</span>
    <span>订单数：${orderCount}</span>
    <span>价格模式：${priceMode}</span>
  `;

  if (!orders.length) {
    const message = orderCount > 0 ? "订单明细缺失，请重新生成 dashboard.json" : "当日无成交订单";
    body.innerHTML = `<div class="detail-empty">${message}</div>`;
    return;
  }

  const rows = orders
    .map((order) => {
      const actionInfo = mapAction(order.action);
      const totalCost = order.costs?.total_cost ?? order.costs?.total ?? 0;
      return `
        <tr>
          <td>${order.symbol || "-"}</td>
          <td><span class="tag ${actionInfo.cls}">${actionInfo.label}</span></td>
          <td>${formatShares(order.shares)}</td>
          <td>${formatNumber(order.price)}</td>
          <td>${formatNumber(order.gross)}</td>
          <td>${formatNumber(totalCost)}</td>
          <td>${formatNumber(order.total)}</td>
        </tr>
      `;
    })
    .join("");

  body.innerHTML = `
    <table class="detail-table">
      <thead>
        <tr>
          <th>标的</th>
          <th>方向</th>
          <th>股数</th>
          <th>成交价</th>
          <th>交易额</th>
          <th>费用合计</th>
          <th>净额</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function selectHistoryRecord(history, index) {
  const rows = document.querySelectorAll("#historyTable tbody tr");
  rows.forEach((row, idx) => {
    row.classList.toggle("is-active", idx === index);
  });
  renderHistoryDetail(history[index]);
}

function renderHistory(history) {
  const body = document.querySelector("#historyTable tbody");
  body.innerHTML = "";
  if (!history || !history.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">暂无执行记录</td></tr>';
    renderHistoryDetail(null);
    return;
  }

  history.forEach((record, index) => {
    const row = document.createElement("tr");
    const orders = getOrderList(record);
    const orderCount = getOrderCount(record, orders);
    row.classList.add("history-row");
    row.tabIndex = 0;
    row.innerHTML = `
      <td>${record.time || "-"}</td>
      <td>${orderCount}</td>
      <td>${formatNumber(record.ending_equity)}</td>
      <td>${formatNumber(record.realized_pnl)}</td>
    `;
    row.addEventListener("click", () => selectHistoryRecord(history, index));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectHistoryRecord(history, index);
      }
    });
    body.appendChild(row);
  });

  selectHistoryRecord(history, history.length - 1);
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
