// 설정 객체 초기 설정
let settings = {
  onairSts: true, // 방송 ON/OFF
  BGMsettingSts: true // Youtube로 BGM 쓸거냐
};

// 페이지 로드 시 1회 불러오기 및 UI 자동 작동
(async function () {
  document.addEventListener('DOMContentLoaded', function() {
  chrome.storage.local.get('settings', function(data) {
    const savedsettings = data.settings;
    if (savedsettings) {
      settings = savedsettings;
      updateUI();
    }
  });
});
})();
// UI 리로드 함수
function updateUI() {
  // 토글 상태 업데이트
  document.getElementById('onairBtn').checked = settings.onairSts;
  document.getElementById('onairSts').textContent = settings.onairSts ? '방송 ON' : '방송 OFF';
  document.getElementById('BGMsettingBtn').checked = settings.BGMsettingSts;
  document.getElementById('BGMsettingSts').textContent = settings.BGMsettingSts ? 'Youtube ON' : 'Youtube OFF';
};

// 이벤트 리스너 등록
document.getElementById('onairBtn').addEventListener('change', function() {
  settings.onairSts = this.checked;
  document.getElementById('onairSts').textContent = settings.onairSts;
  document.getElementById('onairSts').textContent = settings.onairSts ? '방송 ON' : '방송 OFF';
  chrome.storage.local.set({ settings }, function() {});
});
document.getElementById('BGMsettingBtn').addEventListener('change', function() {
  settings.BGMsettingSts = this.checked;
  document.getElementById('BGMsettingSts').textContent = settings.BGMsettingSts;
  document.getElementById('BGMsettingSts').textContent = settings.BGMsettingSts ? 'Youtube ON' : 'Youtube OFF';
  chrome.storage.local.set({ settings }, function() {
  });
});

// 버튼 이벤트 리스너
document.getElementById('bgmBtn').addEventListener('click', function() {
  const url = chrome.runtime.getURL('localBGMsettings.html');
  chrome.tabs.create({ url });
  //window.close();
});

document.getElementById('rbBtn').addEventListener('click', function() {
  const url = chrome.runtime.getURL('request-bot.html');
  chrome.tabs.create({ url });
  //window.close();
});