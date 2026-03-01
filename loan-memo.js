/**
 * 貸借記録メモ Pro - 通信・制御ロジック
 * GAS (Google Apps Script) 環境と、外部ホスティング (GitHub等) 環境の両方に対応
 */

// --- 通信プロキシ設定 ---
const ScriptRunner = {
    // ブラウザのLocalStorageに保存されたGAS WebアプリURLを取得
    get apiUrl() {
        return localStorage.getItem('GAS_API_URL') || '';
    },

    set apiUrl(url) {
        localStorage.setItem('GAS_API_URL', url);
    },

    // 汎用呼び出し関数
    async call(action, payload = {}) {
        // 1. GAS 内部環境の場合
        if (typeof google !== 'undefined' && google.script && google.script.run) {
            return new Promise((resolve, reject) => {
                google.script.run
                    .withSuccessHandler(resolve)
                    .withFailureHandler(reject)[action](payload);
            });
        }

        // 2. 外部環境（GitHub等）の場合 - fetch API を使用
        if (!this.apiUrl) {
            const input = prompt("Google Apps Script の WebアプリURL が設定されていません。\nデプロイされたURLを入力してください:");
            if (input) {
                this.apiUrl = input;
                location.reload();
            }
            throw new Error("API URL is not set.");
        }

        try {
            // POSTリクエストをGASに送信 (doPostで処理)
            const response = await fetch(this.apiUrl, {
                method: "POST",
                body: JSON.stringify({ action, payload }),
                headers: { "Content-Type": "text/plain" } // CORS制限回避のため text/plain で送信
            });
            return await response.json();
        } catch (err) {
            console.error("API Call Error:", err);
            if (err.message.includes("Failed to fetch")) {
                alert("GASへの通信に失敗しました。URLが正しいか、またはGAS側で「全員（匿名含む）」に公開されているか確認してください。");
            }
            throw err;
        }
    }
};

// --- アプリケーション状態 ---
let activeNav = 0;
let currentType = '貸した';
let unpaidItems = [];
let selectedIds = [];
let currentAlloc = [];
let isManualSelection = false;

window.onload = () => {
    // 日本時間（JST）で今日の日付をセット
    const now = new Date();
    const jstDate = new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo'
    }).format(now).replace(/\//g, '-');
    document.getElementById('date').value = jstDate;

    loadSummary();
    initSwipe();

    // ESCキーでモーダルを閉じる
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
};

async function switchNav(idx) {
    activeNav = idx;
    document.querySelectorAll('.nav-item').forEach((el, i) => el.classList.toggle('active', i === idx));
    document.getElementById('viewport').style.transform = `translateX(-${idx * 25}%)`;

    if (idx === 0) loadSummary();
    else if (idx === 1) loadUnpaid();
    else if (idx === 2) loadHistory();
    else if (idx === 3) loadMonthly();
}

function setType(type) {
    currentType = type;
    document.getElementById('btn_kashi').classList.toggle('active', type === '貸した');
    document.getElementById('btn_kaeri').classList.toggle('active', type === '返ってきた');

    const isKaeri = type === '返ってきた';
    document.getElementById('repayment_section').style.display = isKaeri ? 'block' : 'none';
    document.getElementById('btn_submit').style.background = isKaeri ? 'var(--primary)' : 'var(--success)';

    if (isKaeri) loadUnpaidSuggest();
}

async function loadSummary() {
    try {
        const d = await ScriptRunner.call("getSummary");
        document.getElementById('sum_kashi').textContent = d.kashi.toLocaleString() + "円";
        document.getElementById('sum_kaeri').textContent = d.kaeri.toLocaleString() + "円";
        document.getElementById('sum_bal').textContent = d.balance.toLocaleString() + "円";
    } catch (e) { }
}

async function loadUnpaidSuggest() {
    try {
        const data = await ScriptRunner.call("getUnpaid");
        unpaidItems = data || [];
        renderSuggest();
    } catch (e) { }
}

function renderSuggest() {
    const box = document.getElementById('suggest_list');
    box.innerHTML = unpaidItems.length ? '' : '<div style="padding:20px; text-align:center; color:var(--text-sub);">未完済の項目はありません</div>';
    unpaidItems.forEach(item => {
        const div = document.createElement('div');
        div.className = `suggest-item ${selectedIds.includes(item.rowId) ? 'selected' : ''}`;
        div.innerHTML = `<div class="checkbox"></div><div style="flex:1;"><div style="font-weight:600; font-size:14px;">${item.title}</div><div style="font-size:11px; color:var(--text-sub);">${item.date} • 残 ${item.amount.toLocaleString()}円</div></div>`;
        div.onclick = () => toggleSelect(item);
        box.appendChild(div);
    });
}

function toggleSelect(item) {
    const amountInput = document.getElementById('amount');
    const currentVal = Number(amountInput.value) || 0;

    const idx = selectedIds.indexOf(item.rowId);
    if (idx > -1) {
        selectedIds.splice(idx, 1);
    } else {
        selectedIds.push(item.rowId);
        if (currentVal === 0) amountInput.value = item.amount;
    }
    isManualSelection = true;
    renderSuggest();
    calcAlloc();
}

function handleAmountInput() {
    if (currentType === '返ってきた') {
        isManualSelection = false;
        autoSelectByAmount();
    }
}

function autoSelectByAmount() {
    if (isManualSelection) {
        calcAlloc();
        return;
    }
    const amt = Number(document.getElementById('amount').value) || 0;
    if (amt <= 0) {
        selectedIds = [];
    } else {
        const sorted = [...unpaidItems].sort((a, b) => a.amount - b.amount);
        let remaining = amt;
        let newSelection = [];
        for (const item of sorted) {
            if (remaining <= 0) break;
            newSelection.push(item.rowId);
            remaining -= item.amount;
        }
        selectedIds = newSelection;
    }
    renderSuggest();
    calcAlloc();
}

function calcAlloc() {
    const amt = Number(document.getElementById('amount').value) || 0;
    let remaining = amt;
    currentAlloc = [];

    const selected = unpaidItems.filter(i => selectedIds.includes(i.rowId)).sort((a, b) => a.amount - b.amount);
    selected.forEach(item => {
        const pay = Math.min(remaining, item.amount);
        if (pay > 0) {
            currentAlloc.push({ rowId: item.rowId, title: item.title, paidAmount: pay, isComplete: pay === item.amount });
            remaining -= pay;
        }
    });

    if (selected.length > 0) {
        document.getElementById('title').value = selected.map(s => s.title).join('、') + " の返済";
    } else if (currentType === '返ってきた') {
        document.getElementById('title').value = "";
    }
}

async function submitData() {
    const payload = {
        type: currentType,
        date: document.getElementById('date').value,
        amount: document.getElementById('amount').value,
        displayAmount: document.getElementById('amount').value,
        title: document.getElementById('title').value,
        note: document.getElementById('note').value,
        allocations: currentAlloc
    };

    if (!payload.date || !payload.amount || !payload.title) {
        showStatus("入力に不備があります", "var(--danger)");
        return;
    }

    showSpinner("保存中...");
    try {
        const msg = await ScriptRunner.call("add", payload);
        hideSpinner();
        showStatus("✅ " + msg, "var(--success)");
        resetForm();
        loadSummary();
    } catch (e) {
        hideSpinner();
        showStatus("❌ エラーが発生しました", "var(--danger)");
    }
}

function resetForm() {
    document.getElementById('amount').value = "";
    document.getElementById('title').value = "";
    document.getElementById('note').value = "";
    selectedIds = [];
    currentAlloc = [];
    if (currentType === '返ってきた') loadUnpaidSuggest();
}

async function loadUnpaid() {
    const list = document.getElementById('list_unpaid');
    list.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
    try {
        const data = await ScriptRunner.call("getUnpaid");
        list.innerHTML = data.length ? '' : '<div style="text-align:center; padding:40px; color:var(--text-sub);">未完済の項目はありません</div>';
        data.forEach(item => {
            const acc = document.createElement('div');
            acc.className = 'acc-item';
            acc.innerHTML = `
        <div class="acc-header" onclick="toggleAccordion(this, '${item.rowId}')">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="acc-icon">▶</div>
            <div>
              <div style="font-size:11px; color:var(--text-sub);">${item.date}</div>
              <div style="font-weight:600; font-size:15px;">${item.title}</div>
            </div>
          </div>
          <div class="txt-pos" style="font-weight:600; font-size:16px;">${item.amount.toLocaleString()}円</div>
        </div>
        <div class="acc-body"><div class="acc-sub-list"></div></div>`;
            list.appendChild(acc);
        });
    } catch (e) { list.innerHTML = "エラー"; }
}

async function toggleAccordion(header, rowId) {
    const item = header.parentElement;
    if (!item.classList.contains('open')) {
        item.classList.add('open');
        const body = item.querySelector('.acc-sub-list');
        body.innerHTML = '<div class="spinner" style="width:16px; height:16px; margin:0 auto;"></div>';
        try {
            const history = await ScriptRunner.call("getRepayHistory", { id: rowId });
            if (!history || history.length === 0) {
                body.innerHTML = '<div style="color:var(--text-sub); font-size:12px;">返済履歴はありません</div>';
                return;
            }
            body.innerHTML = history.map(h => `
        <div class="acc-sub-item">
          <div style="color:var(--text-sub); font-weight:600;">${h.date} - ${h.note || '返済'}</div>
          <div style="color:var(--success); font-weight:600;">-${h.amount.toLocaleString()}円</div>
        </div>`).join('');
        } catch (e) { body.innerHTML = "エラー"; }
    } else {
        item.classList.remove('open');
    }
}

async function loadHistory() {
    const list = document.getElementById('list_history');
    list.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
    try {
        const data = await ScriptRunner.call("getHistory");
        list.innerHTML = data.length ? '' : '<div style="text-align:center; padding:40px; color:var(--text-sub);">履歴はありません</div>';
        data.forEach(item => {
            const isKashi = item.type === "貸し";
            const div = document.createElement('div');
            div.className = 'hist-item';
            div.innerHTML = `
        <div class="hist-info">
          <div class="hist-date">${item.date} ${item.timestamp.split(' ')[1]}</div>
          <div style="font-weight:600; font-size:15px;">${item.title}</div>
          <div style="font-size:12px; color:var(--text-sub);">${item.note || ''}</div>
        </div>
        <div style="text-align:right; margin-right:15px;">
          <div class="hist-amt ${isKashi ? 'txt-pos' : 'txt-neg'}">${isKashi ? '貸:' : '返:'} ${(isKashi ? item.kashi : item.kaeri).toLocaleString()}円</div>
          ${(isKashi && item.remaining > 0) ? `<div style="font-size:10px; color:var(--danger);">残: ${item.remaining.toLocaleString()}円</div>` : ''}
        </div>
        <button class="btn-del" onclick="askDelete('${item.rowId}')">✕</button>`;
            list.appendChild(div);
        });
    } catch (e) { list.innerHTML = "エラー"; }
}

async function loadMonthly() {
    const list = document.getElementById('list_monthly');
    list.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
    try {
        const data = await ScriptRunner.call("getMonthly");
        list.innerHTML = data.length ? '' : '<div style="text-align:center; padding:40px; color:var(--text-sub);">データがありません</div>';
        data.forEach(row => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '18px';
            card.innerHTML = `
        <div style="font-weight:600; font-size:16px; margin-bottom:10px; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:5px;">${row.month}</div>
        <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:5px;"><span>貸し合計:</span><span class="txt-pos">${row.kashi.toLocaleString()}円</span></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:10px;"><span>返済合計:</span><span class="txt-neg">${row.kaeri.toLocaleString()}円</span></div>
        <div style="display:flex; justify-content:space-between; font-weight:600; border-top:1px solid rgba(0,0,0,0.03); padding-top:8px;"><span>当月収支:</span><span class="${row.diff >= 0 ? 'txt-neg' : 'txt-pos'}">${row.diff.toLocaleString()}円</span></div>`;
            list.appendChild(card);
        });
    } catch (e) { list.innerHTML = "エラー"; }
}

let pendingDelId = null;
function askDelete(id) {
    pendingDelId = id;
    document.getElementById('modal_del').style.display = 'flex';
    document.getElementById('btn_confirm_del').onclick = async () => {
        closeModal();
        showSpinner("削除中...");
        try {
            const msg = await ScriptRunner.call("delete", { id: pendingDelId });
            hideSpinner();
            showStatus("✅ " + msg, "var(--success)");
            loadHistory();
            loadSummary();
        } catch (e) { hideSpinner(); showStatus("❌ エラー", "var(--danger)"); }
    };
}

function closeModal() { document.getElementById('modal_del').style.display = 'none'; }
function showSpinner(msg) { document.getElementById('lock_msg').textContent = msg; document.getElementById('spinner').style.display = 'flex'; }
function hideSpinner() { document.getElementById('spinner').style.display = 'none'; }
function showStatus(msg, color) { const el = document.getElementById('status_msg'); el.textContent = msg; el.style.color = color; setTimeout(() => el.textContent = "", 3000); }

function initSwipe() {
    let startX = 0;
    document.body.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    document.body.addEventListener('touchend', e => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 70) {
            if (diff > 0 && activeNav < 3) switchNav(activeNav + 1);
            else if (diff < 0 && activeNav > 0) switchNav(activeNav - 1);
        }
    }, { passive: true });
}
