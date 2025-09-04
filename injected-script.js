// (페이지 컨텍스트; chrome.* 사용 금지)
console.log('from injected-script: 가동');
(function () {
  if (window.__WOLYA_WS_IN_HOOK__) return;
  window.__WOLYA_WS_IN_HOOK__ = true;

  // 개별 WS 인스턴스에 우리 message 리스너를 1회만 설치
  function ensureMessageTap(ws) {
    try {
      if (ws.__WOLYAMsgTapped) return;
      ws.__WOLYAMsgTapped = true;
      ws.addEventListener('message', (ev) => {
        const enc_sub = JSON.stringify(ev.data);
        const enc = enc_sub.slice(1);
        if (enc.startsWith('42')){
           if (enc.includes("PLAY")){
              try {
                window.postMessage({type: "WOLYA", v: true}, "*");
              } catch {}
            } else {
              if (enc.includes("STOP")){
                try {
                  window.postMessage({type: "WOLYA", v: false}, "*");
                } catch {}
              }
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

  try { console.log('[WOLYA] WS in-hook installed (addEventListener/onmessage/send)'); } catch {}
})();
console.log('from injected-script: 가동완료');