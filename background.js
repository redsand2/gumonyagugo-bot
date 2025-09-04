chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  try {
    if (info.status !== 'complete' ) return;
    if (!tab.url || !/^https:\/\/studio\.chzzk\.naver\.com\//.test(tab.url)) return;

    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content-script.js'],
      world: 'ISOLATED'
    });
  } catch (e) {
    console.error('from bg[inject-fail]', e);
  }
});
// content

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

// 설정값 변동시에 background.js에 자동 업데이트 (외부 설정 변동 가능성 고려)
chrome.storage.onChanged.addListener(async function(changes, areaName) {
  await zeroload();
});

/**유튜브 탭 찾아서 멈추거나 재생하는 함수
 * 
 * @param {'boolean'} cm true: pause / false: play
 */
function yt_pause(cm=true) {
  chrome.tabs.query({url: "*://*.youtube.com/*"}, function(tabs) {
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        args: [cm],  // cm 값을 args 배열로 전달
        func: (shouldPause) => {  // 함수 이름을 function에서 func로 변경
          const video = document.querySelector('.html5-main-video');
          if (shouldPause) {  // 전달받은 인자 사용
            if (video && !video.paused) {
              video.pause();
            }
          } else {
            if (video && video.paused) {
              video.play();
            }
          }
        }
      });
    }
  });
}

/**영상 도네이션 상태 보고 bgm이나 미디어탭 자동으로 멈춰주는 함수
 * 
 * @param {boolean*} video_donation_status true: 도네옴 / false: 영상끝남
 */
function yt_st(video_donation_status) {
  if (settings.BGMsettingSts) {
    if (video_donation_status) {
      yt_pause(true);
    } else{
      yt_pause(false);
    }
  } else {
    // TODO : bgm 탭 html연동
  }
}
// content에게 메세지 받기
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const m = message;
  if (settings.onairSts) { // 방송이 켜져있는가
    if (m.type && m.type == "WOLYA") { // 영도관련 데이터인가
      chzzk_v_don = m.v; // true: 영도 옴 / false: 영도 멈춤
      if (chzzk_v_don != _v_status) {
        yt_st(chzzk_v_don);
        _v_status = chzzk_v_don;
      }
    }
  }
  return true;
});

/*
chrome.storage.onChanged.addListener('change', function() {
  console.log('변경 감지:', change,'sett');
  console.log('스토리지 영역:', areaName);
});

chrome.storage.onChanged.addListener(function(changes, areaName) { // async 키워드 추가
  

});




*/
// ============== background.js 이벤트호라이즌 ===============