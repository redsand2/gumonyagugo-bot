const els = {
    clientID: document.getElementById('clientID'),
    clientKEY: document.getElementById('clientKEY'),
    idHint: document.getElementById('idHint'),
    submitBtn: document.getElementById('submitBtn')
};
document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get("chzzkapi", function(data) {
        els.clientID.value = data ?? '';
    });
});
// api 바로가기
els.idHint.addEventListener('click', () => {
    const url = 'https://developers.chzzk.naver.com/application';
    window.open(url, '_blank');
});

// 인증 요청
els.submitBtn.addEventListener('click', function() {
    const chzzkapi = els.clientID.value ?? '';
    const state = Math.random().toString(36).substring(2, 15);
    const redirectUri = 'https://localhost:8080';
    chrome.storage.local.set({chzzkapitempstate: state, chzzkapi: chzzkapi}, function() {});
    const url = `https://chzzk.naver.com/account-interlock?clientId=${chzzkapi}&redirectUri=${redirectUri}&state=${state}`;
    window.location = url;
});