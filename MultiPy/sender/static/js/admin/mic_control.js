// 인라인 스타일 제거, 클래스 토글만 수행
function updateMicButtonState(isRecording) {
  if (!uiManager.micBtn) return;
  uiManager.micBtn.classList.toggle('recording', !!isRecording);
  uiManager.micBtn.title = isRecording
    ? '녹음 중 - 버튼을 떼면 전송됩니다'
    : '누르고 있으면 녹음됩니다';
}
