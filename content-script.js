(function () {
  if (window.__WOLYA_INJECT_ATTEMPTED__) return;
  window.__WOLYA_INJECT_ATTEMPTED__ = true;
  console.log('from content-script: 실행', window.location.href);
  
  // 현재 창이 iframe인지 확인
  const isIframe = window !== window.top;
  const scriptToInject = isIframe ? 'injected-script_.js' : 'injected-script.js';
  
  // 페이지 컨텍스트로 injected-script.js 삽입
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(scriptToInject);
    s.onload = () => {
      s.remove();
      console.log(`from content-script: ${scriptToInject} 로드 및 실행 완료`);
    };
    s.onerror = (e) => {
      console.log(`from content-script: ${scriptToInject} 로드 실패`, e);
    };
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.error('injection error:', e);
  }

  window.addEventListener('message', function(event) {
    const ty = event.data.type;
    if (ty == "WOLYA" || ty == "chat") { 
      try {
        chrome.runtime.sendMessage(event.data);
      } catch (e) {
        console.log('[e03]', e);
      }
    }
  })
})();