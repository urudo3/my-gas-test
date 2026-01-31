var allSongs = [];
var filteredListSongs = [];
var searchTimeout = null;
var listFilterTimeout = null;
var currentSort = { key: '最終演奏', ascending: false };
var currentPage = 1;
var itemsPerPage = 50;
var reportMode = false;
var reportingSong = null;
// Default Settings
var defaultSettings = {
    searchSort: '最終演奏',
    searchLimit: 50,
    horizontalScroll: false,
    listColumns: [
        { key: '曲名', label: '曲名', visible: true },
        { key: 'アーティスト', label: 'アーティスト', visible: true },
        { key: '最終演奏', label: '最終演奏', visible: true },
        { key: '演奏回数', label: '回数', visible: true },
        { key: '曲名の読み', label: '曲名よみがな', visible: false },
        { key: 'アーティストの読み', label: '歌手よみがな', visible: false },
        { key: 'タイアップ', label: 'タイアップ', visible: false }
    ]
};
var appSettings = JSON.parse(JSON.stringify(defaultSettings));
function loadSettings() {
    const saved = localStorage.getItem('appSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            appSettings = { ...defaultSettings, ...parsed };
            if (parsed.listColumns && Array.isArray(parsed.listColumns)) {
                appSettings.listColumns = parsed.listColumns;
            }
        } catch (e) { console.error('Settings parse error', e); }
    }
    applySettings();
}
function saveSettings() {
    appSettings.searchSort = document.getElementById('settingSearchSort').value;
    const limitVal = document.getElementById('settingSearchLimit').value;
    appSettings.searchLimit = (limitVal === 'all') ? 'all' : parseInt(limitVal, 10);
    const hScroll = document.getElementById('settingHorizontalScroll');
    if (hScroll) {
        appSettings.horizontalScroll = hScroll.checked;
    }
    const colList = document.getElementById('columnSettingsList');
    const newCols = [];
    colList.querySelectorAll('.column-item').forEach(item => {
        const key = item.dataset.key;
        const visible = item.querySelector('input[type="checkbox"]').checked;
        const label = item.querySelector('.column-name').textContent;
        newCols.push({ key: key, label: label, visible: visible });
    });
    appSettings.listColumns = newCols;
    localStorage.setItem('appSettings', JSON.stringify(appSettings));
    closeSettingsPopup();
    applySettings();
    performSearch();
    renderListTable();
}
function applySettings() {
    renderListHeader();
}
function showSettingsPopup() {
    closeMenu();
    document.getElementById('settingSearchSort').value = appSettings.searchSort;
    document.getElementById('settingSearchLimit').value = appSettings.searchLimit;
    const hScroll = document.getElementById('settingHorizontalScroll');
    if (hScroll) hScroll.checked = appSettings.horizontalScroll;
    checkSearchLimitWarning();
    renderColumnSettingsList();
    const popup = document.getElementById('settingsPopup');
    popup.classList.remove('hidden');
    const content = popup.querySelector('.popup-content');
    if (content) content.scrollTop = 0;
}
function closeSettingsPopup(event) {
    if (event && event.target.id !== 'settingsPopup') return;
    document.getElementById('settingsPopup').classList.add('hidden');
}
function checkSearchLimitWarning() {
    const val = document.getElementById('settingSearchLimit').value;
    const warning = document.getElementById('searchLimitWarning');
    if (val === 'all') warning.classList.remove('hidden');
    else warning.classList.add('hidden');
}
function resetSettings() {
    document.getElementById('settingSearchSort').value = defaultSettings.searchSort;
    document.getElementById('settingSearchLimit').value = defaultSettings.searchLimit;
    const hScroll = document.getElementById('settingHorizontalScroll');
    if (hScroll) hScroll.checked = defaultSettings.horizontalScroll;
    renderColumnSettingsList(defaultSettings.listColumns);
    checkSearchLimitWarning();
}
function renderColumnSettingsList(columnsToRender) {
    const container = document.getElementById('columnSettingsList');
    container.innerHTML = '';
    const cols = columnsToRender || appSettings.listColumns;
    cols.forEach((col, index) => {
        const div = document.createElement('div');
        div.className = 'column-item';
        div.draggable = true;
        div.dataset.key = col.key;
        div.innerHTML = `
                <div class="column-handle" style="cursor: grab;">☰</div>
                <input type="checkbox" class="column-checkbox" ${col.visible ? 'checked' : ''}>
                <span class="column-name">${escapeHtml(col.label)}</span>
                <div class="column-move-btns">
                    <button class="move-btn" onclick="moveColumn(${index}, -1)" ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button class="move-btn" onclick="moveColumn(${index}, 1)" ${index === cols.length - 1 ? 'disabled' : ''}>▼</button>
                </div>
            `;
        div.addEventListener('dragstart', handleDragStart, false);
        div.addEventListener('dragenter', handleDragEnter, false);
        div.addEventListener('dragover', handleDragOver, false);
        div.addEventListener('dragleave', handleDragLeave, false);
        div.addEventListener('drop', handleDrop, false);
        div.addEventListener('dragend', handleDragEnd, false);
        container.appendChild(div);
    });
}
let dragSrcEl = null;
function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.outerHTML);
    this.classList.add('dragging');
}
function handleDragOver(e) {
    if (e.preventDefault) { e.preventDefault(); }
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
    return false;
}
function handleDragEnter(e) { this.classList.add('drag-over'); }
function handleDragLeave(e) { this.classList.remove('drag-over'); }
function handleDrop(e) {
    if (e.stopPropagation) { e.stopPropagation(); }
    if (dragSrcEl !== this) {
        const container = document.getElementById('columnSettingsList');
        const allItems = [...container.querySelectorAll('.column-item')];
        const srcIndex = allItems.indexOf(dragSrcEl);
        const dstIndex = allItems.indexOf(this);
        if (srcIndex < dstIndex) {
            container.insertBefore(dragSrcEl, this.nextSibling);
        } else {
            container.insertBefore(dragSrcEl, this);
        }
        updateMoveButtons();
    }
    return false;
}
function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.column-item').forEach(item => item.classList.remove('drag-over'));
}
function moveColumn(index, direction) {
    const colList = document.getElementById('columnSettingsList');
    const items = Array.from(colList.querySelectorAll('.column-item'));
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const currentItem = items[index];
    const swapItem = items[newIndex];
    if (direction < 0) {
        colList.insertBefore(currentItem, swapItem);
    } else {
        colList.insertBefore(swapItem, currentItem);
    }
    updateMoveButtons();
}
function updateMoveButtons() {
    const colList = document.getElementById('columnSettingsList');
    const items = colList.querySelectorAll('.column-item');
    items.forEach((item, index) => {
        const btns = item.querySelectorAll('.move-btn');
        btns[0].disabled = (index === 0);
        btns[0].setAttribute('onclick', `moveColumn(${index}, -1)`);
        btns[1].disabled = (index === items.length - 1);
        btns[1].setAttribute('onclick', `moveColumn(${index}, 1)`);
    });
}
function renderListHeader() {
    const thead = document.querySelector('#songsTable thead tr');
    let html = '';
    appSettings.listColumns.forEach(col => {
        if (col.visible || reportMode) {
            html += `<th onclick="sortTable('${col.key}')">${escapeHtml(col.label)} ↕</th>`;
        }
    });
    thead.innerHTML = html;
}

function initDragScroll() {
    const searchType = document.querySelector('.search-type');
    let isDown = false;
    let startX;
    let scrollLeft;
    searchType.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.pageX - searchType.offsetLeft;
        scrollLeft = searchType.scrollLeft;
        searchType.style.cursor = 'grabbing';
        searchType.style.setProperty('--hide-arrow', 'none');
    });
    searchType.addEventListener('mouseleave', () => {
        isDown = false;
        searchType.style.cursor = 'grab';
    });
    searchType.addEventListener('mouseup', () => {
        isDown = false;
        searchType.style.cursor = 'grab';
    });
    searchType.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - searchType.offsetLeft;
        const walk = (x - startX) * 1;
        searchType.scrollLeft = scrollLeft - walk;
    });
    searchType.style.cursor = 'grab';
}
function initScrollToTopBtn() {
    const scrollBtn = document.getElementById('scrollToTopBtn');
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            scrollBtn.classList.add('show');
        } else {
            scrollBtn.classList.remove('show');
        }
    });
}
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}
function toggleMenu() {
    const menu = document.getElementById('burgerMenu');
    const overlay = document.getElementById('menuOverlay');
    const btn = document.getElementById('burgerBtn');
    menu.classList.toggle('hidden');
    overlay.classList.toggle('hidden');
    btn.classList.toggle('open');
}
function closeMenu() {
    const menu = document.getElementById('burgerMenu');
    const overlay = document.getElementById('menuOverlay');
    const btn = document.getElementById('burgerBtn');
    menu.classList.add('hidden');
    overlay.classList.add('hidden');
    btn.classList.remove('open');
}
function showAboutPopup() {
    closeMenu();
    const popup = document.getElementById('aboutPopup');
    popup.classList.remove('hidden');
}
function closeAboutPopup(event) {
    if (event && event.target.id !== 'aboutPopup') return;
    const popup = document.getElementById('aboutPopup');
    popup.classList.add('hidden');
}
function toggleReportMode() {
    closeMenu();
    reportMode = !reportMode;
    const reportBtn = document.getElementById('reportBtn');
    if (reportMode) {
        reportBtn.innerHTML = `
                <svg class="report-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                </svg>
                <span>報告モードを終了</span>
            `;
        showModePopup();
    } else {
        reportBtn.innerHTML = `
                <svg class="report-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                </svg>
                <span>誤りを報告</span>
            `;
    }
    updateReportButtonState();
    if (!reportMode) {
        reportingSong = null;
        updateFloatingReportButton();
    }
    performSearch();
    renderListHeader();
    renderListTable();
}
function showModePopup() {
    const popup = document.createElement('div');
    popup.className = 'popup-overlay';
    popup.style.animation = 'popupFadeIn 0.3s ease';
    popup.innerHTML = `
            <div class="popup-modal" onclick="event.stopPropagation()">
                <div class="popup-header">
                    <h2>報告モードを開始しました</h2>
                </div>
                <div class="popup-content">
                    <p style="text-align: center; line-height: 1.8; color: #4a5568;">
                        報告モードになりました。<br>
                        一覧の「報告」ボタンから、<br>
                        または検索結果のボタンから報告できます。
                    </p>
                </div>
                <div class="popup-footer">
                    <button class="popup-ok-btn" onclick="this.closest('.popup-overlay').remove()">OK</button>
                </div>
            </div>
        `;
    document.body.appendChild(popup);
}
function updateReportButtonState() {
    const reportBtn = document.getElementById('reportBtn');
    reportBtn.classList.remove('disabled');
}
function openReportPopup(song) {
    reportingSong = song;
    document.getElementById('reportNewSongName').dataset.original = song['曲名'] || '';
    document.getElementById('reportNewArtist').dataset.original = song['アーティスト'] || '';
    document.getElementById('reportNewSongYomi').dataset.original = song['曲名の読み'] || '';
    document.getElementById('reportNewArtistYomi').dataset.original = song['アーティストの読み'] || '';
    document.getElementById('reportNewTieup').dataset.original = song['タイアップ'] || '';
    document.getElementById('reportNewSongName').placeholder = song['曲名'] || '修正後の曲名';
    document.getElementById('reportNewArtist').placeholder = song['アーティスト'] || '修正後のアーティスト';
    document.getElementById('reportNewSongYomi').placeholder = song['曲名の読み'] || '修正後のよみがな';
    document.getElementById('reportNewArtistYomi').placeholder = song['アーティストの読み'] || '修正後のよみがな';
    document.getElementById('reportNewTieup').placeholder = song['タイアップ'] || '修正後のタイアップ';
    document.getElementById('reportNewSongName').value = '';
    document.getElementById('reportNewArtist').value = '';
    document.getElementById('reportNewSongYomi').value = '';
    document.getElementById('reportNewArtistYomi').value = '';
    document.getElementById('reportNewTieup').value = '';
    document.getElementById('reporterName').value = '';
    document.querySelectorAll('input[name^="report"]').forEach(cb => {
        if (cb.type === 'checkbox') cb.checked = false;
    });
    document.querySelectorAll('.form-input-report').forEach(input => {
        input.disabled = true;
    });
    updateReportButtonDisabledState();
    document.querySelectorAll('input[name^="report"][type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', updateReportButtonDisabledState);
    });
    const popup = document.getElementById('reportPopup');
    popup.classList.remove('hidden');
    const content = popup.querySelector('.popup-content');
    if (content) content.scrollTop = 0;
}
function updateReportButtonDisabledState() {
    const submitBtn = document.querySelector('#reportPopup .popup-submit-btn');
    const checkedBoxes = document.querySelectorAll('input[name^="report"][type="checkbox"]:checked');
    if (checkedBoxes.length === 0) {
        submitBtn.disabled = true;
        return;
    }
    submitBtn.disabled = false;
}
function toggleReportField(checkbox) {
    const reportRow = checkbox.closest('.form-report-row');
    const input = reportRow.querySelector('.form-input-report');
    const originalValue = input.dataset.original || '';
    if (checkbox.checked) {
        input.disabled = false;
        if (input.value === '') {
            input.value = originalValue;
        }
        input.focus();
    } else {
        input.disabled = true;
        input.value = '';
    }
    updateReportButtonDisabledState();
}
function closeReportPopup(event) {
    if (event && event.target.id !== 'reportPopup') return;
    const popup = document.getElementById('reportPopup');
    popup.classList.add('hidden');
    const isList = document.getElementById('list-tab').classList.contains('active');
    if (!isList) {
        reportingSong = null;
    }
}
function submitReport() {
    if (!reportingSong) return;
    const checkedItems = [];
    const updates = {};
    document.querySelectorAll('input[name^="report"][type="checkbox"]:checked').forEach(cb => {
        const fieldName = cb.name;
        const reportRow = cb.closest('.form-report-row');
        const input = reportRow.querySelector('.form-input-report');
        const value = input.value.trim();
        if (fieldName === 'reportSongName') {
            checkedItems.push('曲名');
            updates['修正後曲名'] = value;
        } else if (fieldName === 'reportArtist') {
            checkedItems.push('アーティスト');
            updates['修正後アーティスト'] = value;
        } else if (fieldName === 'reportSongYomi') {
            checkedItems.push('曲名のよみがな');
            updates['修正後曲名のよみがな'] = value;
        } else if (fieldName === 'reportArtistYomi') {
            checkedItems.push('アーティストのよみがな');
            updates['修正後アーティストのよみがな'] = value;
        } else if (fieldName === 'reportTieup') {
            checkedItems.push('タイアップ');
            updates['修正後タイアップ'] = value;
        }
    });
    const reasonText = checkedItems.join('、') + 'が誤っている';
    const reportData = {
        理由: reasonText,
        修正前曲名: reportingSong['曲名'] || '',
        修正前アーティスト: reportingSong['アーティスト'] || '',
        修正前曲名のよみがな: reportingSong['曲名の読み'] || '',
        修正前アーティストのよみがな: reportingSong['アーティストの読み'] || '',
        修正前タイアップ: reportingSong['タイアップ'] || '',
        修正後曲名: updates['修正後曲名'] || '',
        修正後アーティスト: updates['修正後アーティスト'] || '',
        修正後曲名のよみがな: updates['修正後曲名のよみがな'] || '',
        修正後アーティストのよみがな: updates['修正後アーティストのよみがな'] || '',
        修正後タイアップ: updates['修正後タイアップ'] || '',
        依頼者名: document.getElementById('reporterName').value || '匿名'
    };
    const submitBtn = document.querySelector('#reportPopup .popup-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';
    const baseUrl = 'https://script.google.com/macros/s/AKfycbz1xZ1M2AWkHuDFkOy9Hb3sY3r7M7quHtnT4lVZqHV1SNikVds7K-gFDCURHRpR7T-4/exec';
    const params = Object.keys(reportData)
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(reportData[key]))
        .join('&');
    const url = baseUrl + '?' + params;
    fetch(url, { method: 'GET' })
        .then(response => response.text())
        .then(data => {
            closeReportPopup();
            showReportSuccessPopup();
            submitBtn.disabled = false;
            submitBtn.textContent = '報告する';
        })
        .catch(error => {
            console.error('Report error:', error);
            alert('報告の送信に失敗しました。もう一度お試しください。');
            submitBtn.disabled = false;
            submitBtn.textContent = '報告する';
        });
}
function showReportSuccessPopup() {
    const popup = document.createElement('div');
    popup.className = 'popup-overlay';
    popup.innerHTML = `
            <div class="popup-modal" onclick="event.stopPropagation()">
                <div class="popup-header">
                    <h2>✓ 報告完了</h2>
                </div>
                <div class="popup-content">
                    <p style="text-align: center; line-height: 1.8; color: #4a5568; font-size: 16px;">
                        報告ありがとうございました！<br><br>
                        ご指摘いただいた内容は<br>
                        データ改善に役立てさせていただきます。
                    </p>
                </div>
                <div class="popup-footer">
                    <button class="popup-ok-btn" onclick="closeReportSuccessPopup(this)">OK</button>
                </div>
            </div>
        `;
    document.body.appendChild(popup);
}
function closeReportSuccessPopup(btn) {
    btn.closest('.popup-overlay').remove();
    reportMode = false;
    reportingSong = null;
    updateFloatingReportButton();
    const reportBtn = document.getElementById('reportBtn');
    reportBtn.innerHTML = `
            <svg class="report-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <span>誤りを報告</span>
        `;
    updateReportButtonState();
    performSearch();
    renderListHeader();
    renderListTable();
}
function forceRefresh() {
    closeMenu();
    document.getElementById('loadingOverlay').classList.remove('hidden');
    let currentTab = 'search';
    if (document.getElementById('list-tab').classList.contains('active')) {
        currentTab = 'list';
    }
    localStorage.setItem('lastActiveTab', currentTab);
    localStorage.removeItem('songData');
    localStorage.removeItem('lastFetchTime');
    fetchFreshSongData();
}
function changeItemsPerPage() {
    const val = document.getElementById('itemsPerPage').value;
    if (val === 'all') {
        itemsPerPage = filteredListSongs.length > 0 ? filteredListSongs.length : 10000;
    } else {
        itemsPerPage = parseInt(val, 10);
    }
    currentPage = 1;
    renderListTable();
}
function performSearch() {
    var query = document.getElementById('searchQuery').value.trim();
    var queryLower = query.toLowerCase();
    var searchType = document.querySelector('input[name="searchType"]:checked').value;
    var resultsDiv = document.getElementById('searchResults');
    var countSpan = document.getElementById('resultCountInline');
    var noResults = document.getElementById('noSearchResults');
    resultsDiv.innerHTML = '';
    if (!query) {
        countSpan.textContent = '';
        noResults.style.display = 'none';
        return;
    }
    let results = allSongs.filter(song => {
        const title = (song['曲名'] || '').toLowerCase();
        const titleYomi = (song['曲名の読み'] || '').toLowerCase().replace(/ /g, '');
        const artist = (song['アーティスト'] || '').toLowerCase();
        const artistYomi = (song['アーティストの読み'] || '').toLowerCase().replace(/ /g, '');
        const tieup = (song['タイアップ'] || '').toLowerCase();
        if (searchType === 'song') return title.includes(queryLower) || titleYomi.includes(queryLower);
        if (searchType === 'artist') return artist.includes(queryLower) || artistYomi.includes(queryLower);
        if (searchType === 'tieup') return tieup.includes(queryLower);
        return title.includes(queryLower) || titleYomi.includes(queryLower) ||
            artist.includes(queryLower) || artistYomi.includes(queryLower) ||
            tieup.includes(queryLower);
    });
    if (appSettings && appSettings.searchSort) {
        const key = appSettings.searchSort;
        const asc = (key !== '最終演奏' && key !== '演奏回数');
        results.sort((a, b) => {
            let valA = a[key] ?? '';
            let valB = b[key] ?? '';
            if (key === '演奏回数') { valA = parseInt(valA) || 0; valB = parseInt(valB) || 0; }
            if (valA < valB) return asc ? -1 : 1;
            if (valA > valB) return asc ? 1 : -1;
            return 0;
        });
    }
    if (results.length === 0) {
        countSpan.textContent = '0件';
        noResults.style.display = 'block';
    } else {
        countSpan.textContent = results.length + '件';
        noResults.style.display = 'none';
        let displayLimit = 50;
        if (appSettings && appSettings.searchLimit) {
            if (appSettings.searchLimit === 'all') {
                displayLimit = results.length;
            } else {
                displayLimit = parseInt(appSettings.searchLimit, 10);
            }
        }
        const displayResults = results.slice(0, displayLimit);
        let html = '';
        displayResults.forEach(song => { html += createResultItem(song, query); });
        if (results.length > displayLimit) {
            html += '<div style="text-align:center; padding:10px; color:#aaa;">他 ' + (results.length - displayLimit) + ' 件... (設定で表示件数を変更できます)</div>';
        }
        resultsDiv.innerHTML = html;
    }
}
function createResultItem(song, query) {
    const date = song['最終演奏'] ? formatDate(song['最終演奏']) : '-';
    const count = song['演奏回数'] || 0;
    const title = song['曲名'] || '不明';
    const artist = song['アーティスト'] || '不明';
    const titleYomi = song['曲名の読み'] || '';
    const artistYomi = song['アーティストの読み'] || '';
    const tieup = song['タイアップ'] || '';
    const hTitle = highlightText(title, query);
    const hArtist = highlightText(artist, query);
    const hTitleYomi = highlightText(titleYomi, query);
    const hArtistYomi = highlightText(artistYomi, query);
    const hTieup = highlightText(tieup, query);
    const copyText = title + '／' + artist;
    let yomiDisplay = (titleYomi || artistYomi) ? `<div class="song-yomi">${hTitleYomi} ${artistYomi ? '/ ' + hArtistYomi : ''}</div>` : '';
    let tieupDisplay = tieup ? `<div class="song-tieup"><div class="tv-icon-20"></div><span>${hTieup}</span></div>` : '';
    let buttonHTML = '';
    if (reportMode) {
        const songIndex = allSongs.indexOf(song);
        buttonHTML = `<button class="copy-button report-button" onclick="openReportPopupByIndex(${songIndex})">報告</button>`;
    } else {
        buttonHTML = `<button class="copy-button" onclick="copyToClipboard('${escapeQuotes(copyText)}')">コピー</button>`;
    }
    return `
        <div class="result-item">
            <div class="song-title">${hTitle}</div>
            <div class="song-artist">${hArtist}</div>
            ${yomiDisplay}
            ${tieupDisplay}
            ${`<div class="song-meta">
                  <span>演奏回数: ${count}回</span>
                  <span>最終演奏: ${date}</span>
                </div>`
        }
            ${buttonHTML}
        </div>
      `;
}
function openReportPopupByIndex(index) {
    const song = allSongs[index];
    openReportPopup(song);
}
function toggleRowSelection(index) {
    const song = filteredListSongs[index];
    if (reportingSong === song) {
        reportingSong = null;
    } else {
        reportingSong = song;
    }
    renderListTable();
    updateFloatingReportButton();
}
function updateFloatingReportButton() {
    const btn = document.getElementById('floatingReportBtn');
    if (reportMode && reportingSong) {
        btn.classList.remove('hidden');
        // Small delay to allow display:block to apply before opacity transition
        requestAnimationFrame(() => btn.classList.add('show'));
        btn.disabled = false;
    } else {
        btn.classList.remove('show');
        btn.disabled = true;
        // Wait for transition to finish before hiding (approx 300ms)
        setTimeout(() => {
            if (!btn.classList.contains('show')) {
                btn.classList.add('hidden');
            }
        }, 300);
    }
}
function reportSelectedSong() {
    if (reportingSong) {
        openReportPopup(reportingSong);
    }
}
function filterList() {
    const query = document.getElementById('listFilter').value.trim().toLowerCase();
    filteredListSongs = !query ? [...allSongs] : allSongs.filter(song =>
        (song['曲名'] || '').toLowerCase().includes(query) ||
        (song['曲名の読み'] || '').toLowerCase().includes(query) ||
        (song['アーティスト'] || '').toLowerCase().includes(query) ||
        (song['アーティストの読み'] || '').toLowerCase().includes(query) ||
        (song['タイアップ'] || '').toLowerCase().includes(query)
    );
    sortData(currentSort.key, currentSort.ascending);
    currentPage = 1;
    renderListTable();
}
function sortTable(key) {
    if (currentSort.key === key) {
        currentSort.ascending = !currentSort.ascending;
    } else {
        currentSort.key = key;
        currentSort.ascending = (key !== '最終演奏' && key !== '演奏回数');
    }
    sortData(currentSort.key, currentSort.ascending);
    renderListTable();
}
function sortData(key, ascending) {
    filteredListSongs.sort((a, b) => {
        let valA = a[key] ?? '';
        let valB = b[key] ?? '';
        if (key === '演奏回数') { valA = parseInt(valA) || 0; valB = parseInt(valB) || 0; }
        if (valA < valB) return ascending ? -1 : 1;
        if (valA > valB) return ascending ? 1 : -1;
        return 0;
    });
}
function renderListTable() {
    const tbody = document.getElementById('songListBody');
    tbody.innerHTML = '';
    const table = document.getElementById('songsTable');
    if (appSettings.horizontalScroll) {
        table.classList.add('nowrap-table');
    } else {
        table.classList.remove('nowrap-table');
    }
    if (filteredListSongs.length === 0) {
        const visibleCols = appSettings.listColumns.filter(c => c.visible).length + (reportMode ? 1 : 0);
        tbody.innerHTML = `<tr><td colspan="${visibleCols}" style="text-align:center; padding:20px;">該当する曲がありません</td></tr>`;
        renderPagination(0);
        return;
    }
    const start = (currentPage - 1) * itemsPerPage;
    const pageItems = filteredListSongs.slice(start, start + itemsPerPage);
    tbody.innerHTML = pageItems.map((song, idx) => {
        let rowHtml = '';
        if (reportMode) {
            const isSelected = (song === reportingSong) ? ' selected-row' : '';
            rowHtml = `<tr class="report-row-selectable${isSelected}" onclick="toggleRowSelection(${start + idx})">`;
        } else {
            rowHtml = '<tr>';
        }
        appSettings.listColumns.forEach(col => {
            if (col.visible || reportMode) {
                let val = song[col.key];
                let displayVal = escapeHtml(val);
                if (col.key === '最終演奏') {
                    displayVal = `<span style="font-size:0.9em; color:#666;">${val ? formatDate(val) : '-'}</span>`;
                } else if (col.key === '演奏回数') {
                    displayVal = `<div style="text-align:center;">${val || 0}</div>`;
                }
                rowHtml += `<td>${displayVal}</td>`;
            }
        });
        rowHtml += '</tr>';
        return rowHtml;
    }).join('');
    renderPagination(Math.ceil(filteredListSongs.length / itemsPerPage));
}
function renderPagination(totalPages) {
    renderPaginationContainer(document.getElementById('listPaginationTop'), totalPages);
    renderPaginationContainer(document.getElementById('listPaginationBottom'), totalPages);
}
function renderPaginationContainer(container, totalPages) {
    if (!container) return;
    container.innerHTML = '';
    if (totalPages <= 1) return;
    let paddingPage = (window.innerWidth > 600) ? 1 : 0;
    const isWide = (window.innerWidth > 500);
    const paddingStart = 1 + paddingPage;
    const paddingEnd = 2 + (2 * paddingPage);
    let start = Math.max(1, currentPage - paddingStart);
    let end = Math.min(totalPages, start + paddingEnd);
    if (end - start < paddingEnd) start = Math.max(1, end - paddingEnd);
    if (currentPage > 1) {
        if (isWide) container.appendChild(createPageBtn('|<<', 1));
        container.appendChild(createPageBtn('<', currentPage - 1));
    }
    for (let i = start; i <= end; i++) container.appendChild(createPageBtn(i, i));
    if (currentPage < totalPages) {
        container.appendChild(createPageBtn('>', currentPage + 1));
        if (isWide) container.appendChild(createPageBtn('>>|', totalPages));
    }
}
function createPageBtn(text, pageNum) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (pageNum === currentPage ? ' active' : '');
    btn.textContent = text;
    btn.onclick = () => {
        currentPage = pageNum;
        renderListTable();
        document.querySelector('.list-controls').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    return btn;
}
function highlightText(text, query) {
    if (!query || !text) return escapeHtml(text);
    const regex = new RegExp('(' + escapeRegex(query) + ')', 'gi');
    return escapeHtml(text).replace(regex, '<span class="highlight">$1</span>');
}
function escapeRegex(string) { return string.replace(/[*|[\]\\]/g, '\\$&').replace(/./g, '\\s*$&').replace(/[.+?^${}()]/g, '\\$&'); }
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? dateStr : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
function escapeHtml(text) {
    return String(text ?? '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeQuotes(text) { return text.replace(/'/g, "\\'").replace(/"/g, '\\"'); }
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showCopyToast).catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showCopyToast();
}
function showCopyToast() {
    const toast = document.getElementById('copyToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}
document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchQuery');
    const searchClear = document.getElementById('searchClear');
    const searchRadios = document.querySelectorAll('input[name="searchType"]');
    function updateSearchClear() {
        searchClear.classList.toggle('visible', searchInput.value.length > 0);
    }
    searchInput.addEventListener('input', function () {
        updateSearchClear();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performSearch, 300);
    });
    searchClear.addEventListener('click', function () {
        searchInput.value = '';
        updateSearchClear();
        searchInput.focus();
        performSearch();
    });
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); searchInput.blur(); }
    });
    searchRadios.forEach(radio => radio.addEventListener('change', performSearch));
    const listFilter = document.getElementById('listFilter');
    const filterClear = document.getElementById('filterClear');
    function updateFilterClear() {
        filterClear.classList.toggle('visible', listFilter.value.length > 0);
    }
    listFilter.addEventListener('input', function () {
        updateFilterClear();
        clearTimeout(listFilterTimeout);
        listFilterTimeout = setTimeout(filterList, 300);
    });
    filterClear.addEventListener('click', function () {
        listFilter.value = '';
        updateFilterClear();
        listFilter.focus();
        filterList();
    });
});
window.onload = function () {
    initDragScroll();

    initScrollToTopBtn();
    loadSettings();
    fetch('https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLg3Mh9pD1cfoLjzGKoWN85Gk3bYFpPA8-oPlNbFXDQwZSrx-7YQn1Qy7_tmEpzzorOTQow9QIbVsKVjgfXUiI3hUpHNtQaVxF5FRYozt4ziG3OutQJSWtSqXCcdeJU7a_Uhr2j0KiH3Kw9PaSSjYaZ-Pxx2MUB2AEtN-ozLj-H6GBxw8JOISVRz8QT-ziXa-lUbnL0NULykgmNlOLH-s4Jnt-Py_bQ05foDbnH9BD7EgMzudhnWfWM6yEP4M21osh0JprLH-ddjFiDhSqven0yIHGmO3cNRqPPRjvzm&lib=MXVx9ipRNFTfomE6WbanXaGJpguNqVXQJ')
        .then(response => response.json())
        .then(data => {
            const ytLink = document.getElementById('ytLink');
            if (data.liveVideoUrl && data.liveVideoUrl.trim() !== '') {
                ytLink.href = data.liveVideoUrl;
                ytLink.title = 'ライブ配信を開く';
                const liveBadge = document.createElement('span');
                liveBadge.className = 'live-badge';
                liveBadge.textContent = 'LIVE';
                ytLink.appendChild(liveBadge);
            }
        })
        .catch(error => console.error('ライブ配信URL取得エラー:', error));
    console.log('Fetching fresh data');
    fetchFreshSongData();
};
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabName));
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.classList.add('hidden');
    });
    const target = document.getElementById(tabName + '-tab');
    target.classList.add('active');
    target.classList.remove('hidden');
    updateReportButtonState();
}
function onDataLoaded(data, isCached) {
    allSongs = data;
    filteredListSongs = [...allSongs];
    document.getElementById('loadingOverlay').classList.add('hidden');
    const lastTab = localStorage.getItem('lastActiveTab');
    if (lastTab === 'list') {
        switchTab('list');
        filterList();
    } else {
        switchTab('search');
        performSearch();
        if (!localStorage.getItem('initialFocusDone')) {
            const sq = document.getElementById('searchQuery');
            if (sq) sq.focus();
            localStorage.setItem('initialFocusDone', 'true');
        }
    }
    localStorage.removeItem('lastActiveTab');
    sortData(currentSort.key, currentSort.ascending);
    renderListTable();
}
function onError(error) {
    console.error(error);
    document.getElementById('loadingOverlay').innerHTML = '<div class="loading-text" style="color:white;">エラーが発生しました: ' + error.message + '</div><button onclick="location.reload()" style="padding:10px 20px; border-radius:5px; border:none; background:white; color:#764ba2; font-weight:bold; cursor:pointer;">再読み込み</button>';
}
function fetchFreshSongData() {
    // const API_URL = 'https://script.google.com/macros/s/AKfycby4dEto3Abr_bmC7nCMBjALGkxut24WTWtDoODMUWXWvx4W7TTNTqXCGQhxRT5QV8qqeA/exec';
    const API_URL = 'data.json?t=' + Date.now();
    fetch(API_URL)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => onDataLoaded(data, false))
        .catch(error => onError(error));
}
