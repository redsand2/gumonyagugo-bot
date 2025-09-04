// ===== 전역 상태 =====
const audio = new Audio();
let tracksMeta = [];     // [{id, name, type, size, createdAt}]
let queueIds = [];       // 전체반복 목록(상단 -> 하단)
let excludedIds = [];    // 일시제외 목록
let currentId = null;    // 현재 재생 중 ID
let currentObjectUrl = null; // 현재 객체 URL (메모리 해제용)
let deleteMode = false;  // 삭제툴 토글
let repeatMode = 'all';  // 'all' | 'iso' (쿠키 저장)
let randomOn = false;    // 랜덤 토글
let randomOrder = [];    // 랜덤 임시순서(IDs)
let randomIndex = -1;    // 랜덤 진행 인덱스
let log = [];            // 삭제 로그(열람 기능 없음, 변수만 보관)
let lbgm_play = false;   // BGM 재생 스위치
let nostalgia_log = [];  // 최근 재생곡 기록용

// ===== IndexedDB =====
const DB_NAME = 'bgmDB';
const STORE = 'tracks';
const DB_VERSION = 1;
const dbp = openDB();

// ======= 영도 ========
let chzzk_v_don = false; // 영도 나옴?
let _v_status = false; // 엄마도?
let settings = {
  onairSts: true, // 방송 켰냐
  BGMsettingSts: true // Youtube로 BGM 쓸 거냐
};

// 실행시, 설정값 1회 다운로드
async function zeroload() {
  return new Promise((resolve) => {
    chrome.storage.local.get('settings', function(data) {
      if (data.settings) {
        settings = data.settings;
      }
      resolve(settings);
    });
  });
}
zeroload();
// 설정값 변동시에 localBGMsetting.js에 자동 업데이트 (외부 설정 변동 가능성 고려)
chrome.storage.onChanged.addListener(async function(changes, areaName) {
  await zeroload();
});

// bgm 재생 멈추기
function lbgm_st(video_donation_status) {
  if (!settings.BGMsettingSts) {
    if (video_donation_status) {
      audio.pause();
    } else{
      audio.play();
    }
  }
}

// content에게 메세지 받기
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const m = message;
  if (settings.onairSts) { // 방송이 켜져있는가
    if (m.type && m.type == "WOLYA") { // 영도관련 데이터인가
      chzzk_v_don = m.v; // true: 영도 옴 / false: 영도 멈춤
      if (chzzk_v_don != _v_status) {
        lbgm_st(chzzk_v_don);
        _v_status = chzzk_v_don;
      }
    }
  }
  return true;
});

// ====== DB ======
// (PATCH 1)
// 메타데이터를 chrome.storage.local에 저장하는 함수
async function saveMetadataToStorage(metas) {
  return new Promise((resolve) => {
    chrome.storage.local.set({'bgmTracksMeta': metas }, function() {
      resolve();
    });
  });
}

// 메타데이터를 chrome.storage.local에서 불러오는 함수
async function loadMetadataFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get('bgmTracksMeta', function(result) {
      resolve(result.bgmTracksMeta || []);
    });
  });
}
//
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function addTracks(files) {
  const db = await dbp;
  const now = Date.now();
  
  // 현재 메타데이터 불러오기
  const currentMetas = await loadMetadataFromStorage() || [];
  const newMetas = [];
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    
    files.forEach(f => {
      const id = 'track_' + now + '_' + Math.random().toString(36).substring(2, 9);
      store.put({ id, name: f.name || 'unnamed', type: f.type || 'audio/*', size: f.size || 0, createdAt: now, blob: f });
      
      // 새 메타데이터 객체 생성
      newMetas.push({ 
        id, 
        name: f.name || 'unnamed', 
        type: f.type || 'audio/*', 
        size: f.size || 0, 
        createdAt: now 
      });
      
      queueIds.push(id); // 불러오면 전체반복에 추가
    });
    
    tx.oncomplete = async () => {
      // 메타데이터 업데이트 및 저장
      const updatedMetas = [...currentMetas, ...newMetas];
      await saveMetadataToStorage(updatedMetas);
      resolve();
    };
    
    tx.onerror = () => reject(tx.error);
  });
}

async function listMetas() {
  // 먼저 스토리지에서 메타데이터 불러오기 시도
  let metas = await loadMetadataFromStorage();
  
  // 스토리지에 메타데이터가 없으면 IndexedDB에서 한 번만 불러오기
  if (!metas || metas.length === 0) {
    const db = await dbp;
    const all = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    
    // IndexedDB에서 불러온 메타데이터를 형식화
    metas = all.map(({ id, name, type, size, createdAt }) => 
      ({ id, name, type, size, createdAt }))
      .sort((a,b) => a.createdAt - b.createdAt);
    
    // 불러온 메타데이터를 스토리지에 저장
    await saveMetadataToStorage(metas);
  }
  
  return metas;
}
async function getBlobById(id) {
  const db = await dbp;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob || null : null);
    req.onerror = () => reject(req.error);
  });
}
async function deleteById(id) {
  // IndexedDB에서 blob 삭제
  const db = await dbp;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  
  // 메타데이터에서도 해당 항목 삭제
  const metas = await loadMetadataFromStorage() || [];
  const updatedMetas = metas.filter(meta => meta.id !== id);
  await saveMetadataToStorage(updatedMetas);
  
  return true;
}

// ===== 쿠키 유틸(반복 모드 저장) =====
function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days*864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
function getCookie(name) {
  const m = document.cookie.split('; ').find(s => s.startsWith(name + '='))?.split('=')[1];
  return m ? decodeURIComponent(m) : '';
}

// ===== 엘리먼트 =====
const els = {
  dropOverlay: document.getElementById('dropOverlay'),
  dropzone: document.getElementById('dropzone'),
  pickBtn: document.getElementById('pickBtn'),
  fileInput: document.getElementById('fileInput'),

  playToggle: document.getElementById('playToggle'),
  repeatToggle: document.getElementById('repeatToggle'),
  randomChk: document.getElementById('randomChk'),
  deleteTool: document.getElementById('deleteTool'),

  nowPlaying: document.getElementById('nowPlaying'),
  queueList: document.getElementById('queueList'),
  excludedList: document.getElementById('excludedList'),
  // UI PATCH1
  posText: document.getElementById('posText'),
  durText: document.getElementById('durText'),
  seekRange: document.getElementById('seekRange'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
};

// ===== 유틸: 시간 포맷/진행 UI =====
function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

let isSeeking = false;

function updateProgressUI() {
  const cur = Number(audio.currentTime) || 0;
  const dur = Number(audio.duration);
  els.posText.textContent = fmtTime(cur);
  els.durText.textContent = Number.isFinite(dur) ? fmtTime(dur) : '00:00';
  if (!isSeeking) {
    els.seekRange.max = Number.isFinite(dur) && dur > 0 ? dur : 0;
    els.seekRange.value = Math.min(cur, els.seekRange.max || 0);
  }
}

// ===== 렌더 =====
function renderLists(nostalgia=null) {
  // 메타 기준으로 큐/제외 정리(없는 id 제거, 중복 방지)
  const metaIds = new Set(tracksMeta.map(t => t.id));
  queueIds = queueIds.concat(nostalgia) ?? queueIds;
  queueIds = queueIds.filter(id => metaIds.has(id) && !excludedIds.includes(id));
  excludedIds = excludedIds.filter(id => metaIds.has(id) && !queueIds.includes(id));

  // 전체반복 목록
  els.queueList.innerHTML = '';
  const fragQ = document.createDocumentFragment();
  const isPlaying = !!audio.src && !audio.paused;
  for (const id of queueIds) {
    const meta = tracksMeta.find(t => t.id === id); if (!meta) continue;
    const li = document.createElement('li');
    li.className = 'track' + (id === currentId ? ' playing' : '');
    li.dataset.id = id;
    li.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.textContent = '≡';
    handle.title = '드래그하여 순서 변경';
    handle.dataset.action = 'drag';

    const btnPlay = document.createElement('button');
    btnPlay.className = 'btn btn-ok';
    const isCur = (id === currentId && isPlaying);
    btnPlay.textContent = isCur ? '정지' : '재생';
    btnPlay.setAttribute('aria-pressed', isCur ? 'true' : 'false'); // 추가: 상태 속성
    btnPlay.dataset.action = 'togglePlay';
    btnPlay.dataset.id = id;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = meta.name;

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = (meta.type||'').split('/')[1]?.toUpperCase() || 'AUDIO';

    const btnDownOrDel = document.createElement('button');
    btnDownOrDel.className = deleteMode ? 'btn btn-danger' : 'btn';
    btnDownOrDel.textContent = deleteMode ? '삭제' : '내리기';
    btnDownOrDel.dataset.action = deleteMode ? 'delete' : 'down';
    btnDownOrDel.dataset.id = id;

    li.append(handle, btnPlay, name, badge, btnDownOrDel);
    fragQ.appendChild(li);
  }
  els.queueList.appendChild(fragQ);

  // 일시제외 목록
  els.excludedList.innerHTML = '';
  const fragE = document.createDocumentFragment();
  for (const id of excludedIds) {
    const meta = tracksMeta.find(t => t.id === id); if (!meta) continue;
    const li = document.createElement('li');
    li.className = 'track';
    li.dataset.id = id;

    const btnUpOrDel = document.createElement('button');
    btnUpOrDel.className = deleteMode ? 'btn btn-danger' : 'btn';
    btnUpOrDel.textContent = deleteMode ? '삭제' : '올리기';
    btnUpOrDel.dataset.action = deleteMode ? 'delete' : 'up';
    btnUpOrDel.dataset.id = id;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = meta.name;

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = (meta.type||'').split('/')[1]?.toUpperCase() || 'AUDIO';

    li.append(btnUpOrDel, name, badge);
    fragE.appendChild(li);
  }
  els.excludedList.appendChild(fragE);

  updateNowPlayingLabel();
}

function updateNowPlayingLabel() {
  const meta = tracksMeta.find(t => t.id === currentId);
  els.nowPlaying.textContent = meta ? meta.name : '-';
}
function updatePlayToggleLabel() {
  if (!audio.src || audio.paused) {
    els.playToggle.textContent = '전체재생';
    els.playToggle.classList.add('btn-ok');
    els.playToggle.setAttribute('aria-pressed', 'false');
  } else {
    els.playToggle.textContent = '일시정지';
    els.playToggle.classList.remove('btn-ok');
    els.playToggle.setAttribute('aria-pressed', 'true');
  }
}
function updateRepeatToggleLabel() {
  // 단일반복 버튼 <-> 전체반복 버튼
  if (repeatMode === 'iso') {
    els.repeatToggle.textContent = '전체반복';
  } else {
    els.repeatToggle.textContent = '한곡반복';
  }
}

// ===== 재생 로직 ===== + UI PATCH1
async function setSourceById(id) {
  const blob = await getBlobById(id);
  if (!blob) return false;
  if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch {} currentObjectUrl = null; }
  currentObjectUrl = URL.createObjectURL(blob);
  audio.src = currentObjectUrl;     // 현재 곡만 메모리에 로드
  currentId = id;
  updateNowPlayingLabel();
  updateProgressUI();
  return true;
}
async function playById(id, nostalgia=null, chronomode=false) {
  if (chronomode){
    nostalgia_log.slice(0, -1);
  } else {
    nostalgia_log.push(id);
    nostalgia_log = nostalgia_log.slice(-16);
  }
  const ok = await setSourceById(id);
  if (!ok) return;
  try { await audio.play(); } catch {}

  renderLists(nostalgia);            // 버튼 라벨/하이라이트 반영
  updatePlayToggleLabel();
}
function stopPlayback() {
  audio.pause();
  audio.removeAttribute('src');
  if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch {} currentObjectUrl = null; }
  currentId = null;
  updateNowPlayingLabel();
  renderLists();
  updatePlayToggleLabel();
}

// 다음 곡 결정
function nextId() { // 전체 반복임을 가정하고 시작 all
  if (!queueIds.length) return null;
  if (randomOn) {
    if (!randomOrder.length) return null;
    randomIndex = (randomIndex + 1) % randomOrder.length;
    return randomOrder[randomIndex] || null;
  } else {
    const top = queueIds[0] || null;
    if (!currentId) return top;
    const idx = queueIds.indexOf(currentId);
    const nextIdx = (idx >= 0 ? idx + 1 : 0) % queueIds.length;
    return queueIds[nextIdx] || null;
  }
}

function prevId() {
  if (!queueIds.length) return null;
  if (randomOn) {
    if (!randomOrder.length) return null;
    randomIndex = (randomIndex - 1 + randomOrder.length) % randomOrder.length;
    return randomOrder[randomIndex] || null;
  } else {
    if (!currentId) return queueIds[0] || null;
    const idx = queueIds.indexOf(currentId);
    const prevIdx = (idx >= 0 ? idx - 1 + queueIds.length : 0) % queueIds.length;
    return queueIds[prevIdx] || null;
  }
}

function rebuildRandomOrder() {
  randomOrder = queueIds.slice();
  if (randomOrder.length > 3){
    for (let i = randomOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); // 0..i
      [randomOrder[i], randomOrder[j]] = [randomOrder[j], randomOrder[i]];
    }
  }
  randomIndex = currentId ? Math.max(0, randomOrder.indexOf(currentId)) : -1;
}

// ===== 오디오 이벤트 =====
audio.addEventListener('ended', async () => {
  if (repeatMode === 'iso') {
    await playById(queueIds[0]);
  } else {
    const nid = nextId();
    const nostalgia = queueIds.slice(1);
    const present = queueIds[0];
    queueIds = nostalgia.concat(present); 
    if (nid) await playById(nid);
  }
});
audio.addEventListener('play', updatePlayToggleLabel);
audio.addEventListener('pause', updatePlayToggleLabel);
audio.addEventListener('ended', updatePlayToggleLabel);
// UI PATCH1
audio.addEventListener('timeupdate', updateProgressUI);
audio.addEventListener('loadedmetadata', updateProgressUI);
audio.addEventListener('durationchange', updateProgressUI);

// ===== 시킹(진행바) 이벤트 =====
els.seekRange.addEventListener('input', () => {
  // 드래그 중 텍스트 미리보기 업데이트
  isSeeking = true;
  const v = Number(els.seekRange.value) || 0;
  els.posText.textContent = fmtTime(v);
});
['change', 'pointerup', 'mouseup', 'touchend'].forEach(ev => {
  els.seekRange.addEventListener(ev, () => {
    const v = Number(els.seekRange.value) || 0;
    audio.currentTime = v;
    isSeeking = false;
  });
});

// ===== 이전/다음 곡 =====
els.prevBtn.addEventListener('click', async () => {
  const pid = prevId();
  const ll = queueIds.length;
  let nostalgia = [];
  if (ll > 3) {
    nostalgia = [queueIds.at(-1)];
  }
  const hope = queueIds.slice(0, -1);
  queueIds = nostalgia.concat(hope); 
  if (pid) await playById(pid, null, true);
});
els.nextBtn.addEventListener('click', async () => {
  const nid = nextId();
  const ll = queueIds.length;
  let hope = queueIds.slice(1);
  const present = queueIds[0];
  queueIds = hope.concat(present); 
  if (nid) await playById(nid);
});

// ===== 드래그 앤 드롭(화면 전체) =====
// 오디오 파일 확인 함수
function isAudioFile(file) {
  return file.type?.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a)$/i.test(file.name);
}
// 버튼용
els.pickBtn.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', async e => {
  const files = Array.from(e.target.files||[]).filter(isAudioFile);
  await saveNormalizedAudio(files);
  tracksMeta = await listMetas();
  renderLists();
  els.fileInput.value = '';
});

const overlay = document.getElementById('dropOverlay');
const dropzone = document.getElementById('dropzone');

// 오버레이 토글 유틸(기존 showOverlay 대체 또는 내부에서 호출)
function setOverlay(active) {
  overlay.classList.toggle('active', !!active);
  dropzone?.classList?.toggle?.('hover', !!active);
}

// 파일 드래그만 반응하도록 체크
function isFileDrag(e) {
  try {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    // Chrome/OBS CEF: DOMStringList or array-like
    return Array.from(types).includes('Files');
  } catch {
    return false;
  }
}

// 드래그 상태 카운터
let dragCounter = 0;

// 공통 억제
function preventAll(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

// 안정화된 핸들러들
window.addEventListener('dragenter', (e) => {
  if (!isFileDrag(e)) return;
  preventAll(e);
  dragCounter++;
  if (dragCounter === 1) setOverlay(true); // 최초 진입 시 한 번만 켠다
});

window.addEventListener('dragover', (e) => {
  if (!isFileDrag(e)) return;
  preventAll(e); // 기본 동작 억제(브라우저가 파일 열기 방지)
});

window.addEventListener('dragleave', (e) => {
  if (!isFileDrag(e)) return;
  preventAll(e);
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) setOverlay(false); // 완전히 벗어났을 때만 끈다
});

window.addEventListener('drop', async (e) => {
  preventAll(e);         // 파일을 페이지로 열어버리는 기본 동작 방지
  dragCounter = 0;       // 초기화
  setOverlay(false);     // 오버레이/hover 끔

  // 파일만 필터링
  const files = Array.from(e.dataTransfer?.files || []).filter(f =>
    f.type?.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a)$/i.test(f.name)
  );
  if (!files.length) return;
  await saveNormalizedAudio(files);
  tracksMeta = await listMetas();
  renderLists();
});

// ===== 상단 컨트롤 =====
// 3) 전체재생 토글
els.playToggle.addEventListener('click', async () => {
  if (!audio.src) {
    // 아직 재생 시작 전 → 최상단 곡부터
    let startId = null;
    if (repeatMode === 'iso') {
      startId = queueIds[0] || null;
    } else if (randomOn) {
      if (!randomOrder.length) rebuildRandomOrder();
      startId = randomOrder[0] || queueIds[0] || null;
      randomIndex = 0;
    } else {
      startId = queueIds[0] || null;
    }
    if (startId) await playById(startId);
  } else if (audio.paused) {
    try { await audio.play(); } catch {}
  } else {
    audio.pause();
  }
  updatePlayToggleLabel();
});

// 5/6) 반복 토글(단일반복 ↔ 전체반복)
els.repeatToggle.addEventListener('click', () => {
  repeatMode = (repeatMode === 'iso') ? 'all' : 'iso';
  setCookie('repeatMode', repeatMode);
  updateRepeatToggleLabel();
});

// 랜덤 체크
els.randomChk.addEventListener('change', () => {
  randomOn = els.randomChk.checked;
  if (randomOn) rebuildRandomOrder();
});

// 삭제툴 토글
els.deleteTool.addEventListener('click', () => {
  deleteMode = !deleteMode;
  els.deleteTool.setAttribute('aria-pressed', String(deleteMode));
  renderLists(); // 버튼 라벨을 ‘삭제’로/원복
});

// ===== 목록 상호작용(위임) =====
function idFromEl(el) { return el?.dataset?.id || el.closest('li')?.dataset?.id || null; }

// (우상) 전체반복 목록
els.queueList.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = idFromEl(el); if (!id) return;

  if (action === 'togglePlay') {
    const playing = !!audio.src && !audio.paused;
    if (playing && id === currentId) {
      // 같은 항목 → 정지
      stopPlayback();
      return;
    }
    // 8) 다른 항목 클릭 → 해당 항목을 재생 + 순서를 앞당김(최상단으로)
    const idx = queueIds.indexOf(id) ?? 0;
    if (idx > 0) {
      const nostalgia = queueIds.slice(1, idx);
      const present = queueIds[0];
      const hope = queueIds.slice(idx);
      queueIds = hope.concat(present); // 선택 항목이 최상단으로
      await playById(id, nostalgia); //  
    } else {
      await playById(id);
    }
    
  } else if (action === 'down' && !deleteMode) {
    // 내리기: 전체 -> 제외
    const idx = queueIds.indexOf(id); if (idx >= 0) queueIds.splice(idx, 1);
    if (!excludedIds.includes(id)) excludedIds.push(id);

    // 현재 재생 곡을 내렸다면 다음 처리
    if (id === currentId) {
      if (repeatMode === 'iso') {
        // iso에서는 최상단 재반복인데, 최상단을 내렸으니 새 최상단 기준
        const top = queueIds[0] || null;
        if (top) await playById(top); else stopPlayback();
      } else {
        const nid = nextId();
        if (nid) await playById(nid); else stopPlayback();
      }
    }
    renderLists();
  } else if (action === 'delete' && deleteMode) {
    // 10) 삭제(완전 삭제 + 목록 제거 + 로그)
    await deleteById(id);
    // 로그 남김(변수만)
    const meta = tracksMeta.find(t => t.id === id);
    log.push({ id, name: meta?.name || null, ts: Date.now() });

    // 목록에서 제거
    const qi = queueIds.indexOf(id); if (qi >= 0) queueIds.splice(qi, 1);
    const ei = excludedIds.indexOf(id); if (ei >= 0) excludedIds.splice(ei, 1);
    tracksMeta = tracksMeta.filter(t => t.id !== id);

    // 재생 중이었으면 처리
    if (id === currentId) {
      const nid = (repeatMode === 'iso') ? (queueIds[0] || null) : nextId();
      if (nid) await playById(nid); else stopPlayback();
    }
    renderLists();
  }
});

// 더블클릭: 해당 BGM을 최상단으로 올리고 즉시 재생
els.queueList.addEventListener('dblclick', async (e) => {
  const li = e.target.closest('li.track'); if (!li) return;
  const id = li.dataset.id; if (!id) return;
  if (id === currentId) return; // 현재 재생중이면 무시

  // 현재 재생 포함, 선택된 항목 이전까지를 뒤로 미룸
  const idx = queueIds.indexOf(id);
  if (idx > 0) {
    const nostalgia = queueIds.slice(1, idx);
    const present = queueIds[0];
    const hope = queueIds.slice(idx);
    queueIds = hope.concat(present); // 선택 항목이 최상단으로
    await playById(id, nostalgia); //
  }
});

// 드래그 정렬
let draggingId = null;
let marker = null;
function ensureMarker() { if (!marker) { marker = document.createElement('div'); marker.className = 'drop-marker'; } return marker; }
function clearMarker() { draggingId = null; if (marker) marker.remove(); }

els.queueList.addEventListener('dragstart', (e) => {
  const li = e.target.closest('li.track'); if (!li) return;
  draggingId = li.dataset.id || null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggingId);
});
els.queueList.addEventListener('dragover', (e) => {
  e.preventDefault();
  const li = e.target.closest('li.track'); if (!li) return;
  const rect = li.getBoundingClientRect();
  const before = (e.clientY - rect.top) < rect.height/2;
  ensureMarker(); marker.remove();
  if (before) li.before(marker); else li.after(marker);
});
els.queueList.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!draggingId) return;
  if (!marker || !marker.parentElement) return clearMarker();

  // 현재 DOM 순서 기준으로 새 위치 계산
  const parent = marker.parentElement;
  const domIds = Array.from(parent.querySelectorAll('li.track')).map(n => n.dataset.id);
  const beforeId = marker.previousElementSibling?.dataset?.id || null;

  // 원래 위치 제거
  const curIdx = queueIds.indexOf(draggingId);
  if (curIdx >= 0) queueIds.splice(curIdx, 1);

  // 삽입 위치 결정
  let insertAt = 0;
  if (beforeId) {
    const i = queueIds.indexOf(beforeId);
    insertAt = (i >= 0) ? i+1 : queueIds.length;
  }
  queueIds.splice(insertAt, 0, draggingId);

  if (randomOn) rebuildRandomOrder();
  renderLists();
  clearMarker();
});
els.queueList.addEventListener('dragend', clearMarker);

// (좌하) 일시제외 목록
els.excludedList.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = idFromEl(el); if (!id) return;

  if (action === 'up' && !deleteMode) {
    // 올리기: 제외 -> 전체(맨 뒤)
    const ei = excludedIds.indexOf(id); if (ei >= 0) excludedIds.splice(ei, 1);
    if (!queueIds.includes(id)) queueIds.push(id);
    if (randomOn) rebuildRandomOrder();
    renderLists();
  } else if (action === 'delete' && deleteMode) {
    await deleteById(id);
    const meta = tracksMeta.find(t => t.id === id);
    log.push({ id, name: meta?.name || null, ts: Date.now() });

    const ei = excludedIds.indexOf(id); if (ei >= 0) excludedIds.splice(ei, 1);
    tracksMeta = tracksMeta.filter(t => t.id !== id);
    if (id === currentId) stopPlayback();
    renderLists();
  }
});

// =====평준화=====
// 오디오 파일 평준화 함수
async function normalizeAudio(file) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // RMS 계산 (LUFS 근사치)
    let sumSquares = 0;
    const leftChannel = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < leftChannel.length; i++) {
      sumSquares += leftChannel[i] * leftChannel[i];
    }
    
    const rms = Math.sqrt(sumSquares / leftChannel.length);
    const rmsDB = 20 * Math.log10(rms);
    
    // 목표 LUFS와 현재 레벨의 차이로 게인 조정
    const targetLUFS = -14; // 목표 LUFS 값
    const gainFactor = Math.pow(10, (targetLUFS - rmsDB) / 20);
    
    // 게인 적용한 새 버퍼 생성
    const normalizedBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    
    // 모든 채널에 게인 적용
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      const normalizedData = normalizedBuffer.getChannelData(channel);
      
      for (let i = 0; i < channelData.length; i++) {
        // 클리핑 방지 (-0.99 ~ 0.99 범위로 제한)
        normalizedData[i] = Math.max(-0.99, Math.min(0.99, channelData[i] * gainFactor));
      }
    }
    
    // WAV로 변환
    return audioBufferToWav(normalizedBuffer);
    
  } catch (error) {
    console.error('오디오 평준화 처리 중 오류:', error);
    throw error;
  }
}

// AudioBuffer를 WAV Blob으로 변환
function audioBufferToWav(buffer) {
  const numOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numOfChannels * 2; // 16-bit samples
  const sampleRate = buffer.sampleRate;
  
  const wavDataView = new DataView(new ArrayBuffer(44 + length));
  
  // WAV 헤더 작성
  writeString(wavDataView, 0, 'RIFF');
  wavDataView.setUint32(4, 36 + length, true);
  writeString(wavDataView, 8, 'WAVE');
  writeString(wavDataView, 12, 'fmt ');
  wavDataView.setUint32(16, 16, true);
  wavDataView.setUint16(20, 1, true);
  wavDataView.setUint16(22, numOfChannels, true);
  wavDataView.setUint32(24, sampleRate, true);
  wavDataView.setUint32(28, sampleRate * numOfChannels * 2, true);
  wavDataView.setUint16(32, numOfChannels * 2, true);
  wavDataView.setUint16(34, 16, true);
  writeString(wavDataView, 36, 'data');
  wavDataView.setUint32(40, length, true);
  
  // 샘플 데이터 작성
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      wavDataView.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  function writeString(dataView, offset, string) {
    for (let i = 0; i < string.length; i++) {
      dataView.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  return new Blob([wavDataView], { type: 'audio/wav' });
}

async function saveNormalizedAudio(files) {
  const db = await dbp;
  const now = Date.now();
  const currentMetas = await loadMetadataFromStorage() || [];
  const newMetas = [];

  // Promise 배열을 생성하여 모든 파일 처리를 병렬로 진행
  const filePromises = files.map(async (f) => {
    try {
      // 여기서 await 사용
      const normalizedBlob = await normalizeAudio(f);
      console.log(normalizedBlob.size, normalizedBlob.type);
      
      const id = 'track_' + now + '_' + Math.random().toString(36).substring(2, 9);
      
      return {
        fileData: { 
          id, 
          name: f.name || 'unnamed', 
          type: f.type || 'audio/*', 
          size: f.size || 0, 
          createdAt: now, 
          blob: normalizedBlob 
        },
        metaData: {
          id,
          name: f.name || 'unnamed',
          type: f.type || 'audio/*',
          size: normalizedBlob.size,
          createdAt: now,
        }
      };
    } catch (error) {
      console.error(`파일 ${f.name} 처리 중 오류:`, error);
      return null;
    }
  });
  
  // 모든 파일 처리가 완료될 때까지 대기
  const results = await Promise.all(filePromises);
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    
    // 유효한 결과만 필터링
    results.filter(result => result !== null).forEach(result => {
      store.put(result.fileData);
      newMetas.push(result.metaData);
      queueIds.push(result.fileData.id);
    });

    tx.oncomplete = async () => {
      // 메타데이터 업데이트 및 저장
      const updatedMetas = [...currentMetas, ...newMetas];
      await saveMetadataToStorage(updatedMetas);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// =================== 볼륨조절 ====================
let currentVolume = 0.7; // 기본 볼륨 값

// init 함수 내부나 DOMContentLoaded 이벤트에 추가
const volumeSlider = document.getElementById('volumeSlider');
const volumeIcon = document.querySelector('.volume-icon');

// 초기 볼륨 설정
audio.volume = currentVolume;
volumeSlider.value = currentVolume;

// 볼륨 슬라이더 이벤트 리스너
volumeSlider.addEventListener('input', () => {
  currentVolume = parseFloat(volumeSlider.value);
  audio.volume = currentVolume;
  updateVolumeIcon();
  
  // 볼륨 설정 저장 (선택 사항)
  localStorage.setItem('bgmVolume', currentVolume);
});

// 볼륨 아이콘 클릭 시 음소거/음소거 해제
volumeIcon.addEventListener('click', () => {
  if (audio.volume > 0) {
    // 음소거
    audio.volume = 0;
    volumeSlider.value = 0;
    volumeIcon.textContent = '🔇';
  } else {
    // 음소거 해제
    audio.volume = currentVolume || 0.7;
    volumeSlider.value = currentVolume || 0.7;
    updateVolumeIcon();
  }
});

// 볼륨 아이콘 업데이트 함수
function updateVolumeIcon() {
  if (audio.volume === 0) {
    volumeIcon.textContent = '🔇';
  } else if (audio.volume < 0.5) {
    volumeIcon.textContent = '🔉';
  } else {
    volumeIcon.textContent = '🔊';
  }
}

// 저장된 볼륨 설정 불러오기 (init 함수에 추가)
const savedVolume = localStorage.getItem('bgmVolume');
if (savedVolume !== null) {
  currentVolume = parseFloat(savedVolume);
  audio.volume = currentVolume;
  volumeSlider.value = currentVolume;
  updateVolumeIcon();
}

// ===== 초기화 =====
(async function init() {
  // 반복 모드 쿠키
  const saved1 = getCookie('repeatMode');
  repeatMode = (saved1 === 'iso' || saved1 === 'all') ? saved1 : 'all';
  setCookie('repeatMode', repeatMode);

  // 랜덤 모드 쿠키
  const saved2 = getCookie('repeatMode');
  randomOn = (typeof(saved2) == 'boolean') ? saved2 : false;
  setCookie('randomOn', randomOn);

  // 메타 로드
  tracksMeta = await listMetas();

  // 최초 큐 구성: 메타 순서대로(이미 추가된 항목들)
  if (!queueIds.length && !excludedIds.length) {
    queueIds = tracksMeta.map(t => t.id);
  }

  renderLists();
  updatePlayToggleLabel();
})(); 


