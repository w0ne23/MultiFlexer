// 전역 함수들 노출 (다른 모듈에서 사용)
window.stateManager = stateManager;
window.uiManager = uiManager;
window.handleParticipantCalled = uiManager.handleParticipantCalled.bind(uiManager);
window.updateMicButtonState = updateMicButtonState;

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', function () {
    console.log('[ADMIN] DOM 로드 완료 - UI 초기화');
    uiManager.initialize();
});