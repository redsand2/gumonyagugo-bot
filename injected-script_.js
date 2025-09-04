// (페이지 컨텍스트; chrome.* 사용 금지)
console.log('from injected-script_: 가동');
(function () {
  if (window.__WOLYA_WS_IN_HOOK__) return;
  window.__WOLYA_WS_IN_HOOK__ = true;

  function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**string의 백이스케이프를 지워서 파싱해주는 함수
   * 
   * @param {string} // str data 
   * @returns {object} json object
   */
  function pje(data) {
    let data_ = data;
    let i = 0;
    while (true) {
      try {
        return JSON.parse(data_);
      } catch {
        i++;
        if (i == 10){
          break;
        }
        data_ = data.replace(/\\"/g, '"');
      }
      sleep(100);
    }
    console.log('[e01] fail');
    return data_;
  }

  // 개별 WS 인스턴스에 우리 message 리스너를 1회만 설치
  function ensureMessageTap(ws) {
    try {
      if (ws.__WOLYAMsgTapped) return;
      ws.__WOLYAMsgTapped = true;
      ws.addEventListener('message', (ev) => {
        const enc_sub = JSON.stringify(ev.data);
        const enc_sub_ = enc_sub.indexOf('{');
        if (enc_sub_ != -1 && enc_sub.length < 10000) {
          try {
            const enc_bdy = pje((JSON.parse(JSON.stringify(enc_sub.slice(enc_sub_, -1)))).replace(/\\\"/g, '"').replace(/\\"/g, '"')).bdy;
            if (Array.isArray(enc_bdy)) {
              const enc_bdy_ = pje(JSON.stringify(enc_bdy[0]));
              const enc_bdy_p = pje(enc_bdy_.profile);
              const _c = {
                type: 'chat',
                nick: enc_bdy_p.nickname,
                id: enc_bdy_p.userIdHash,
                msg: enc_bdy_.msg
              };
              window.parent.postMessage(_c, "*");
            }
          } catch (e) {
            console.log('[e]', e);
          }
          
        }
        
      });
    } catch {}
  }
  // addEventListener 래핑: 앱이 리스너를 추가하면 나도 설치
  const NativeAdd = WebSocket.prototype.addEventListener;
  if (!WebSocket.prototype.__WOLYAAddWrapped) {
    WebSocket.prototype.addEventListener = function (type, listener, options) {
      try { if (type === 'message') ensureMessageTap(this); } catch {}
      return NativeAdd.call(this, type, listener, options);
    };
    WebSocket.prototype.__WOLYAAddWrapped = true;
  }

  // onmessage 세터 래핑: 온속성으로 바꿔도 내장 리스너 유지
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
if (desc && !desc.__WOLYAWrapped && (desc.configurable || desc.set)) {
  const origSet = desc.set;
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    configurable: true,
    get: desc.get,
    set: function (handler) {
      try { ensureMessageTap(this); } catch {}
      return origSet ? origSet.call(this, handler) : undefined;
    }
  });

  desc.__WOLYAWrapped = true;
}

  // send 래핑: 이미 열린 소켓도 첫 송신 시 내장 리스너를 지연 설치
  const NativeSend = WebSocket.prototype.send;
  if (!WebSocket.prototype.__WOLYASendWrapped) {
    WebSocket.prototype.send = function () {
      try { ensureMessageTap(this); } catch {}
      return NativeSend.apply(this, arguments);
    };
    WebSocket.prototype.__WOLYASendWrapped = true;
  }
  function obser () {
    const playButton = document.querySelector('.ytp-play-button');
    return playButton;
  }
  window.addEventListener('message', function(event) {
    if (event.data.type === 'FROM_CONTENT_SCRIPT') {
      console.log('Content 스크립트에서 받은 데이터:', event.data.data);
      console.log(obser());
    }
  });

  try { console.log('[WOLYA] WS in-hook installed (addEventListener/onmessage/send)'); } catch {}
})();
console.log('from injected-script_: 가동완료');