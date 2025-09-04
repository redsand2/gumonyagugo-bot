const $ = (sel) => document.querySelector(sel);
const input = $('#ytInput');
const errorEl = $('#error');
const frame = $('#ytFrame');
let _rb = {
  saved: false,
  playlist: [],
  srlog: [],
  slowmode: true, // 슬로우 모드 on/off
  _sm_n: 3, // 슬로우 모드 시간 동안 개인이 리스트에 넣을 수 있는 갯수 제한 // 0이나 다른 값일 경우 infinity
  _sm_t: 15, // 슬로우 모드 시간 (m) // 0이나 다른 값일 경우 infinity
  // _sm_l: 15, // 슬로우 모드 시간동안 개인이 리스트에 넣은 노래 길이의 총 합 제한 // 0이나 다른 값일 경우 infinity
  // indurationlimit: 15, // 단일 입력 가능한 곡 길이 제한 // 0이나 다른 값일 경우 infinity
  listlimit: 30, // 대기열 곡 갯수 제한 // 0이나 다른 값일 경우 infinity
  party: true,
  run: false,
  commandlist: ['!sr'],
  log: [],
  srstatus: 'stop' // 현재 재생 상태
};
const els = {
  yt: document.getElementById('ytFrame'),
  reqList: document.getElementById('reqList'),
  rbrunBtn: document.getElementById('rbrunBtn'), // run
  inUrl: document.getElementById('inUrl'), // 관리자 권한으로 url 입력
  //inNick: document.getElementById('inNick'), // null
  //indurationlimit: document.getElementById('indurationlimit'), // 곡 길이가 길면 안 받을 거임
  listlimit: document.getElementById('listlimit'), // 리스트가 가득 차면 안 받을 거임
  _sm_n: document.getElementById('smn'), //
  _sm_t: document.getElementById('smt'),
  nextBtn: document.getElementById('nextBtn'),
  inbgmBtn: document.getElementById('inbgmBtn')
  //authBtn: document.getElementById('authBtn') // api 인증
};

// JSON 형태로 쿠키에 저장하는 함수
function setCookie(name, value, options = {}) {
  // 기본 옵션 설정
  options = {
    path: '/',
    // 필요하다면 기본 옵션을 여기에 추가
    ...options
  };
  
  // 만료일 설정 (기본 7일)
  if (options.expires instanceof Date) {
    options.expires = options.expires.toUTCString();
  } else {
    let expireDate = new Date();
    expireDate.setTime(expireDate.getTime() + (7*24*60*60*1000)); // 7일
    options.expires = expireDate.toUTCString();
  }
  
  // JSON 객체를 문자열로 변환
  let updatedValue = JSON.stringify(value);
  
  // 쿠키 설정
  let updatedCookie = encodeURIComponent(name) + "=" + encodeURIComponent(updatedValue);
  
  // 옵션 추가
  for (let optionKey in options) {
    updatedCookie += "; " + optionKey;
    let optionValue = options[optionKey];
    if (optionValue !== true) {
      updatedCookie += "=" + optionValue;
    }
  }
  
  // 쿠키 저장
  document.cookie = updatedCookie;
}

// 쿠키에서 데이터를 불러오는 함수
function getCookie(name) {
  let matches = document.cookie.match(new RegExp(
    "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
  ));
  
  if (matches) {
    try {
      // 디코딩 및 JSON 파싱
      const decodedValue = decodeURIComponent(matches[1]);
      return JSON.parse(decodedValue);
    } catch (e) {
      // JSON 파싱 실패 시 원래 값 반환
      return decodeURIComponent(matches[1]);
    }
  }
  
  return undefined;
}

// 쿠키 삭제 함수
function deleteCookie(name) {
  setCookie(name, "", {
    'max-age': -1
  });
}

const d = getCookie('_rb_');
if (d && d.saved === true) {
  _rb = d;
} else {
  _rb.saved = true;
}
_rb.run = false;
_rb.srstatus = 'stop';

els.listlimit.value = _rb.listlimit;
els._sm_n.value = _rb._sm_n;
els._sm_t.value = _rb._sm_t;
_rbsave();

renderQueue();

async function _rbsave () {
  _rb.listlimit = els.listlimit.value;
  _rb._sm_n = els._sm_n.value;
  _rb._sm_t = els._sm_t.value;
  setCookie('_rb_', _rb);
}
/**시간 계산기
 * 
 * @param {string} ```시간h/분m/초s``` 
 * @returns {string} seconds
 */
function hmsToSec(hms) {
  
  if (!hms) return 0;
  if (/^\d+$/.test(hms)) return parseInt(hms, 10);
  let sec = 0;
  const re = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i;
  const m = String(hms).match(re);
  if (m) {
    sec += (parseInt(m[1] || 0, 10) * 3600);
    sec += (parseInt(m[2] || 0, 10) * 60);
    sec += (parseInt(m[3] || 0, 10));
  }
  return sec;
}

/** youtube url 파싱 // 감지 실패시 null 반환
 * 
 * @param {string} url
 * @returns {{kind: string, id: string, list_id: string, start: string, list_index: string}} kind: video, id: youtubecode
 */
function parseYouTube(u) {
  const s = String(u).trim();
  if (!s) return null;

  // ID만 들어온 경우(11자, 영숫자+_-)
  if (/^[\w-]{11}$/.test(s)) return { kind: 'video', id: s };
  let url;
  try { url = new URL(s); }
  catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, ''); // 끝 / 제거
  const qs = url.searchParams;

  // 플레이리스트 우선 감지
  const list = qs.get('list');
  if (list) {
    const id = qs.get('v') ?? path.split('/')[1];
    const start = hmsToSec(qs.get('t') || qs.get('start'));
    const list_index = qs.get('index');
    return { kind: 'playlist', id, list_id: list, start, list_index};
  }

  // 짧은 주소 youtu.be/<id>
  if (host === 'youtu.be') {
    const id = path.split('/')[1];
    const start = hmsToSec(qs.get('t') || qs.get('start'));
    return id ? { kind: 'video', id, start } : null;
  }

  // watch?v=<id>
  if (host.endsWith('youtube.com')) {
    const v = qs.get('v');
    if (v) {
      const start = hmsToSec(qs.get('t') || qs.get('start'));
      return { kind: 'video', id: v, start };
    }
    // shorts/<id>, live/<id>
    const parts = path.split('/').filter(Boolean); // ['shorts','<id>']
    if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'live')) {
      return { kind: 'video', id: parts[1], start: 0 };
    }
  }

  return null;
}

/** Embed 완성 함수
 * 
 * @param {{kind: string, id: string, list_id: string, start: string, list_index: string}}
 * @returns {string} Embed가 붙은 완성형 url
 */
function buildEmbedUrl(info) {
  const base = 'https://www.youtube.com';
  const common = 'rel=0&modestbranding=1&playsinline=1&autoplay=1&mute=0';
  let url = '';

  //const start = info.start ? `&start=${info.start}` : '';
  if (info.kind === 'playlist' && !(info.list_id.startsWith('RD')) && _rb.playlistloadop === true) {
    const list_index = info.list_index ?? '';
    url = `${base}/embed/${encodeURIComponent(info.id)}&videoseries?list=${encodeURIComponent(info.list_id)}&index=${list_index}&`;
  } else {
    url = `${base}/embed/${encodeURIComponent(info.id)}?`;
  }

  return url + common;
}

/**버튼 실행 함수
 * 
 * @returns 
 */
function playFromInput() {
  errorEl.textContent = '';
  const parsed = parseYouTube(input.value);
  if (!parsed) {
    errorEl.textContent = '유효한 유튜브 주소(또는 영상 ID)가 아녜요.';
    return;
  }
  const src = buildEmbedUrl(parsed);
  frame.src = src;
}

function playQueue(srs=null) {
  frame.src = src;
}

// 영상 실행
function playFirstInQueue() {
  const firstItem = _rb.playlist[0];
  els.yt = firstItem.url;
  frame.src = firstItem.url;
  _rb.srstatus = 'playing';
  _rb.log.push({log: 'played', data: firstItem, time: now()});
  if (_rb.srlog.length > 1000) {
    rb.srlog.shift();
  }
  _rbsave();
}
function playNextQueue() {
  if (_rb.playlist.length > 1 && _rb.srstatus == 'playing'){
    _rb.playlist.shift();
  }
  renderQueue();
  playFirstInQueue();
}
// 채팅불러오기 런타임
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const m = message;
  if (_rb.run) { // 신청곡 받을거냐
    if (m.type && m.type == 'chat') {
      let sr_cmded = {url: '', nick: '', id: '', time: 0, duration:0, songname: ''};
      for (const cmd of _rb.commandlist) {
        if (m.msg.startsWith(cmd)) {
          sr_cmded = {
            url: m.msg.slice(cmd.length),
            nick: m.nick,
            id: m.id,
            time: new Date().getTime(),
            duration: 0,
            songname: ''
          };
        }
      }
      if (sr_cmded.time != 0) {
        const trypushlist = pushlist(sr_cmded);
        if (trypushlist && _rb.party && _rb.playlist.length == 1) {
          playFirstInQueue();
        }
      }
    }
  }
  return true;
});

function pushlist (sr, admin=false) { // sr {type:chat, nick, id, url, time, songname}
  if (_rb.slowmode && admin == false) {
    _rb._sm_t = Number(els._sm_t.value) ?? Infinity;
    _rb._sm_n = Number(els._sm_n.value) ?? Infinity;
    _rb.listlimit = Number(els.listlimit.value) ?? Infinity;
    if (_rb._sm_t < Infinity && _rb._sm_n < Infinity) {
      if(logread(sr) >= 0){
        if (_rb.playlist.length < _rb.listlimit || _rb.listlimit == 0) {
          const parsed = parseYouTube(sr.url);
          sr.songname = `https://youtu.be/${parsed.id}`;
          if (parsed){
            sr.url = buildEmbedUrl(parsed);
            _rb.playlist.push(sr);
            _rb.srlog.push(sr);
            renderQueue();
            return true;
          }
        }
      }
    }
  } else {
    const parsed = parseYouTube(sr.url);
    sr.songname = `https://youtu.be/${parsed.id}`;
    if (parsed){
      sr.url = buildEmbedUrl(parsed);
      _rb.playlist.push(sr);
      _rb.srlog.push(sr);
      renderQueue();
      return true;
    }
  }
  return false;
}
//
function logread (sr) {
  let mylist = [];
  let mylist_d = 0;
  const p = sr;
  for (const l of _rb.srlog) {
    if (l.id == p.id && (_rb._sm_t * 60000) > (p.time - l.time)) {
      mylist.push(l);
      mylist_d += l.duration;
    }
  }
  _rb._sm_n = Number(els.listlimit.value) ?? Infinity;
  if (mylist.length > _rb._sm_n) return -1;
  return mylist_d;
}

// 상태
//let queue = []; //삭제 // { id, url, user, ts }

// 유틸
function uid() { return crypto.randomUUID(); }
function now() { return Date.now(); }

// html 요소 생성/제거 후 정렬
function renderQueue() {
  els.reqList.innerHTML = '';
  const frag = document.createDocumentFragment();

  _rb.playlist.forEach(item => {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = String(item.time);

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.songname;

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = item.nick ? `by ${item.nick}` : '';

    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.textContent = '삭제';
    del.dataset.action = 'del';
    del.dataset.id = String(item.time);

    const play = document.createElement('button');
    play.className = 'btn';
    play.textContent = '재생';
    play.dataset.action = 'play';
    play.dataset.id = String(item.time);

    li.append(title, badge, del, play);
    frag.appendChild(li);
  });

  els.reqList.appendChild(frag);
  _rbsave();
}

function removeRequest(id) {
  const i = _rb.playlist.findIndex(x => x.time == id);
  const i_l = _rb.srlog.findIndex(x => x.time == id);
  if (i >= 0) {
    _rb.log.push({log: 'delete', data: _rb.playlist[i], time: now()});
    _rb.playlist.splice(i, 1);
    _rb.srlog.splice(i_l, 1);
    renderQueue();
  }
  _rbsave();
}

function playRequest(id) {
  const i = _rb.playlist.findIndex(x => x.time == id);
  const Item = _rb.playlist[i];
  els.yt = Item.url;
  frame.src = Item.url;
  _rb.srstatus = 'stop';
  _rb.log.push({log: 'played', data: Item, time: now()});
  _rbsave();
}

// 이벤트
els.rbrunBtn.addEventListener('click', () => {
  _rb.run = !_rb.run;
  els.rbrunBtn.setAttribute('aria-pressed', _rb.run ? 'true' : 'false');
  els.rbrunBtn.textContent = _rb.run ? '신청 받기 OFF' : '신청 받기 ON';
  _rbsave();
});

/*
els.authBtn.addEventListener('click', () => {
  const url = chrome.runtime.getURL('settings.html');
  chrome.tabs.create({ url });

});
*/

// 목록 삭제 위임
els.reqList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="del"]');
  if (!btn) return;
  const id = btn.dataset.id;
  removeRequest(id);
});

els.reqList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="play"]');
  if (!btn) return;
  const id = btn.dataset.id;
  playRequest(id);
});

// 초기 표시
renderQueue();
els.rbrunBtn.setAttribute('aria-pressed', false);

// 재생 상태 리스너
/*
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  const m = message;
  if (!m.srstatus) return;
  if (m.srstatus == 'stop' && _rb.playlist.length > 0 && _rb.party) {
    _rb.srstatus = 'play';
    _rbsave();
    playFirstInQueue();
    return;
  }
  return true;
});
*/

// 아오============================================================================
els.nextBtn.addEventListener('click', () => {
  if (_rb.playlist.length == 0) return;
  playNextQueue();
});

els.inbgmBtn.addEventListener('click', () => {
  const url = 'http'+(((els.inUrl.value.trim()).split('http')).at(-1));
  console.log(url);
  const sr_cmded = {
    url: url,
    nick: 'admin',
    id: 'admin',
    time: new Date().getTime(),
    duration: 0,
    songname: ''
  };
  const trypushlist = pushlist(sr_cmded, true);
  if (trypushlist && _rb.party && _rb.playlist.length == 1) {
    playFirstInQueue();
  }
});