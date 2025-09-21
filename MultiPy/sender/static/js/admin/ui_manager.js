// === UI 관리 ===
const uiManager = {
  // DOM 요소들
  videoArea: null,
  participantArea: null,
  layoutMenu: null,
  layoutOptions: [],
  plusIcon: null,
  micBtn: null,
  dashParticipantArea: null,

  // 드래그 관련
  draggedParticipant: null,
  participantElements: [],

  // 초기화
  initialize() {
    this.videoArea = document.querySelector('.video-area');
    this.participantArea = document.querySelector('.participant-area');
    this.layoutMenu = document.querySelector('.layout-menu');
    this.layoutOptions = document.querySelectorAll('.layout-option');
    this.plusIcon = document.querySelector('.plus');
    this.micBtn = document.querySelector('.mic-btn');
    this.dashParticipantArea = document.querySelector('.dash-participant-area');

    if (!this.videoArea || !this.participantArea) {
      console.error('[UI ERROR] 필수 DOM 요소를 찾을 수 없습니다.');
      return false;
    }

    this.setupEventListeners();
    console.log('[UI] UI 관리자 초기화 완료');
    return true;
  },

  // 이벤트 리스너 설정
  setupEventListeners() {
    // 비디오 영역 드래그 이벤트
    this.videoArea.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.videoArea.addEventListener('drop', (e) => this.handleDrop(e));
    this.videoArea.addEventListener('dragenter', (e) => this.handleDragEnter(e));
    this.videoArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));

    // 레이아웃 옵션 이벤트
    this.layoutOptions.forEach((option, index) => {
      option.addEventListener('click', () => {
        const layout = index + 1;
        this.selectLayout(layout);
      });

      option.addEventListener('dragover', (e) => this.handleLayoutDragOver(e));
      option.addEventListener('drop', (e) => this.handleLayoutDrop(e, index + 1));
      option.addEventListener('dragleave', (e) => {
        e.target.classList.remove('layout-hover');
      });
    });

    // 마이크 버튼 이벤트
    this.setupMicrophoneButton();
  },

  // 마이크 버튼 이벤트 설정
  setupMicrophoneButton() {
    if (!this.micBtn) return;

    // 마우스
    this.micBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (window.startPushToTalk) window.startPushToTalk();
    });
    this.micBtn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      if (window.stopPushToTalk) window.stopPushToTalk();
    });
    this.micBtn.addEventListener('mouseleave', (e) => {
      e.preventDefault();
      if (window.stopPushToTalk) window.stopPushToTalk();
    });

    // 터치
    this.micBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (window.startPushToTalk) window.startPushToTalk();
    });
    this.micBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (window.stopPushToTalk) window.stopPushToTalk();
    });

    // 키보드(스페이스)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && window.isPushed && !window.isPushed()) {
        e.preventDefault();
        if (window.startPushToTalk) window.startPushToTalk();
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && window.isPushed && window.isPushed()) {
        e.preventDefault();
        if (window.stopPushToTalk) window.stopPushToTalk();
      }
    });
  },

  // 참여자 목록 UI 업데이트
  updateParticipantList(participantList) {
    if (!this.participantArea) return;

    // 초기화
    this.participantArea.innerHTML = '';

    // 비어있을 때 메시지
    if (participantList.length === 0) {
      const noParticipantsMsg = document.createElement('div');
      noParticipantsMsg.className = 'no-participants';
      noParticipantsMsg.textContent = '참여자를 기다리는 중...';
      this.participantArea.appendChild(noParticipantsMsg);
      this.participantElements = [];
      return;
    }

    // 목록 생성
    participantList.forEach(userName => {
      const participantDiv = document.createElement('div');
      participantDiv.className = 'participant';
      participantDiv.draggable = true;
      participantDiv.setAttribute('data-name', userName);

      const isPlaced = stateManager.isPlaced(userName);
      const buttonText = isPlaced ? '공유 중' : '공유 X';
      const btnClass = isPlaced ? 'mute-btn on' : 'mute-btn off';

      participantDiv.innerHTML = `
        <span>${userName}</span>
        <button class="${btnClass}">${buttonText}</button>
      `;

      participantDiv.addEventListener('dragstart', (e) => this.handleDragStart(e));
      participantDiv.addEventListener('dragend',   (e) => this.handleDragEnd(e));

      this.participantArea.appendChild(participantDiv);
    });

    this.participantElements = document.querySelectorAll('.participant');
    console.log(`[UI] 참여자 UI 업데이트 완료: ${participantList.length}명`);
  },

  // 대시보드 전용 참여자 목록 업데이트
  updateDashParticipantList(participantList) {
    if (!this.dashParticipantArea) return;
    this.dashParticipantArea.innerHTML = '';

    if (participantList.length === 0) {
      const noMsg = document.createElement('div');
      noMsg.className = 'no-participants';
      noMsg.textContent = '참여자를 기다리는 중...';
      this.dashParticipantArea.appendChild(noMsg);
      return;
    }

    // 전체보기 버튼
    const allBtn = document.createElement('button');
    allBtn.className = 'dash-participant all-btn';
    allBtn.textContent = '전체보기';
    allBtn.addEventListener('click', () => { showPlacedStats(); });
    this.dashParticipantArea.appendChild(allBtn);

    // 공유 중 참여자 버튼
    participantList.forEach(userName => {
      const btn = document.createElement('button');
      btn.className = 'dash-participant';
      btn.textContent = userName;
      btn.dataset.name = userName;
      btn.addEventListener('click', () => { filterStatsByName(userName); });
      this.dashParticipantArea.appendChild(btn);
    });
  },

  // 드래그 관련
  handleDragStart(e) {
    const participantName = e.target.querySelector('span').textContent;

    if (stateManager.currentLayout === 4 && stateManager.placedParticipants.length >= 4) {
      e.preventDefault();
      return false;
    }
    if (stateManager.isPlaced(participantName)) {
      e.preventDefault();
      return false;
    }

    this.draggedParticipant = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', participantName);
    e.dataTransfer.effectAllowed = 'move';
  },
  handleDragEnd(e) {
    e.target.classList.remove('dragging');
    this.draggedParticipant = null;
  },
  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  },
  handleDragEnter(e) {
    e.preventDefault();
    if (stateManager.placedParticipants.length === 0) this.showLayoutMenu();
  },
  handleDragLeave(e) {
    if (!this.videoArea.contains(e.relatedTarget)) {
      if (stateManager.placedParticipants.length === 0) this.hideLayoutMenu();
    }
  },

  handleDrop(e) {
    e.preventDefault();
    const participantName = e.dataTransfer.getData('text/plain');

    if (stateManager.isPlaced(participantName)) return;
    if (stateManager.currentLayout === 4 && stateManager.placedParticipants.length >= 4) return;

    if (stateManager.placedParticipants.length === 0) this.selectLayout(1);

    const emptySlot = document.querySelector('.slot:not([data-occupied])');
    if (emptySlot) {
      this.addParticipantToSlot(participantName, emptySlot);
      this.checkAndExpandLayout();
    }
  },

  // 레이아웃 드래그 이벤트
  handleLayoutDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.target.classList.add('layout-hover');
  },
  handleLayoutDrop(e, layout) {
    e.preventDefault();
    e.stopPropagation();

    const participantName = e.dataTransfer.getData('text/plain');
    if (stateManager.isPlaced(participantName)) {
      e.target.classList.remove('layout-hover');
      return;
    }

    this.selectLayout(layout);
    const firstSlot = document.querySelector('.slot');
    if (firstSlot) {
      this.addParticipantToSlot(participantName, firstSlot);
      this.checkAndExpandLayout();
    }
    e.target.classList.remove('layout-hover');
  },

  // 레이아웃 메뉴 표시/숨김
  showLayoutMenu() {
    this.layoutMenu?.classList.remove('hidden');
    this.plusIcon?.classList.add('hidden');
  },
  hideLayoutMenu() {
    this.layoutMenu?.classList.add('hidden');
    if (stateManager.placedParticipants.length === 0) this.plusIcon?.classList.remove('hidden');
  },

  // 레이아웃 선택
  selectLayout(layout) {
    stateManager.setLayout(layout);
    this.hideLayoutMenu();
    this.createVideoSlots();
  },

  // 비디오 슬롯 생성
  createVideoSlots() {
    if (!this.videoArea) return;

    const currentLayout = stateManager.currentLayout;

    // 기존 제거
    this.videoArea.querySelectorAll('.slot, .slots-container, .small-slots').forEach(el => el.remove());
    this.plusIcon?.classList.add('hidden');

    // 컨테이너 생성
    const container = document.createElement('div');
    container.className = 'slots-container';

    if (currentLayout === 1) {
      container.classList.add('layout-1');
      const slot = this.createSlot('slot-0');
      container.appendChild(slot);

    } else if (currentLayout === 2) {
      container.classList.add('layout-2');
      for (let i = 0; i < 2; i++) {
        const slot = this.createSlot(`slot-${i}`);
        container.appendChild(slot);
      }

    } else if (currentLayout === 3) {
      container.classList.add('layout-3');

      const mainSlot = this.createSlot('slot-0');
      mainSlot.classList.add('slot-main');

      const smallSlotsContainer = document.createElement('div');
      smallSlotsContainer.className = 'small-slots';
      for (let i = 1; i < 3; i++) {
        const smallSlot = this.createSlot(`slot-${i}`);
        smallSlot.classList.add('slot-small');
        smallSlotsContainer.appendChild(smallSlot);
      }

      container.appendChild(mainSlot);
      container.appendChild(smallSlotsContainer);

    } else if (currentLayout === 4) {
      container.classList.add('layout-4');
      for (let i = 0; i < 4; i++) {
        const slot = this.createSlot(`slot-${i}`);
        container.appendChild(slot);
      }
    }

    this.videoArea.appendChild(container);
  },

  // 슬롯 생성
  createSlot(id) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.id = id;

    slot.addEventListener('dragover', (e) => this.handleSlotDragOver(e));
    slot.addEventListener('drop',     (e) => this.handleSlotDrop(e));
    slot.addEventListener('dragleave',(e) => {
      if (!e.target.hasAttribute('data-occupied')) e.target.classList.remove('is-hover');
    });
    return slot;
  },

  // 슬롯 드래그 이벤트
  handleSlotDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!e.target.hasAttribute('data-occupied')) e.target.classList.add('is-hover');
  },
  handleSlotDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const participantName = e.dataTransfer.getData('text/plain');

    if (stateManager.isPlaced(participantName)) {
      e.target.classList.remove('is-hover');
      return;
    }
    if (e.target.hasAttribute('data-occupied')) return;

    this.addParticipantToSlot(participantName, e.target);
    this.checkAndExpandLayout();
  },

  // 슬롯에 참가자 추가
  addParticipantToSlot(participantName, slot) {
    // 상태
    stateManager.addToVideoArea(participantName);

    // UI
    slot.innerHTML = '';
    const wrap  = document.createElement('div');
    wrap.className = 'slot-content';

    const avatar = document.createElement('div');
    avatar.className = 'slot-avatar';
    avatar.textContent = participantName.charAt(0);

    const nameEl = document.createElement('div');
    nameEl.className = 'slot-name';
    nameEl.textContent = participantName;

    const btn = document.createElement('button');
    btn.className = 'slot-remove-btn';
    btn.textContent = '×';
    btn.addEventListener('click', () => this.removeParticipant(participantName, btn));

    wrap.appendChild(avatar);
    wrap.appendChild(nameEl);
    wrap.appendChild(btn);

    slot.appendChild(wrap);
    slot.classList.add('is-occupied');
    slot.setAttribute('data-occupied', 'true');

    // 원본 버튼 표시
    this.updateParticipantButtonColor(participantName, true);
    // 대시보드 목록 갱신
    uiManager.updateDashParticipantList(stateManager.getPlacedParticipantNames());
  },

  // 참가자 버튼 색상 업데이트
  updateParticipantButtonColor(participantName, isPlaced) {
    const originalParticipant = Array.from(this.participantElements).find(p =>
      p.querySelector('span').textContent === participantName
    );
    if (originalParticipant) {
      const muteBtn = originalParticipant.querySelector('.mute-btn');
      if (muteBtn) {
        muteBtn.classList.toggle('on',  isPlaced);
        muteBtn.classList.toggle('off', !isPlaced);
        muteBtn.textContent = isPlaced ? '공유 중' : '공유 X';
      }
    }
  },

  // 참가자 제거
  removeParticipant(participantName, buttonElement) {
    const slot = buttonElement.closest('.slot');
    slot.innerHTML = '';
    slot.removeAttribute('data-occupied');
    slot.classList.remove('is-occupied', 'is-hover');

    stateManager.removeFromVideoArea(participantName);
    this.updateParticipantButtonColor(participantName, false);

    const statDiv = document.querySelector(`.stat-entry[data-name="${participantName}"]`);
    if (statDiv) statDiv.remove();

    this.adjustLayoutAfterRemoval();
    uiManager.updateDashParticipantList(stateManager.getPlacedParticipantNames());
  },

  removeParticipantFromUI(participantName) {
    const slot = Array.from(document.querySelectorAll('.slot[data-occupied]'))
      .find(s => s.querySelector('.slot-name')?.textContent === participantName);

    if (slot) {
      slot.innerHTML = '';
      slot.removeAttribute('data-occupied');
      slot.classList.remove('is-occupied', 'is-hover');
      console.log(`[UI] 슬롯에서 자동 제거: ${participantName}`);
    }
    this.updateParticipantButtonColor(participantName, false);
  },

  // 레이아웃 자동 확장 체크
  checkAndExpandLayout() {
    const n = stateManager.placedParticipants.length;
    let target = stateManager.currentLayout;

    if (stateManager.currentLayout === 1 && n === 2) target = 2;
    else if (stateManager.currentLayout === 2 && n === 3) target = 3;
    else if (stateManager.currentLayout === 3 && n === 4) target = 4;

    if (target > stateManager.currentLayout) {
      const names = stateManager.getPlacedParticipantNames();
      names.forEach(name => stateManager.removeFromVideoArea(name));

      stateManager.setLayout(target);
      this.createVideoSlots();

      names.forEach((name, idx) => {
        const targetSlot = document.querySelector(`#slot-${idx}`);
        if (targetSlot) this.addParticipantToSlot(name, targetSlot);
      });
    }
  },

  // 비디오 영역 초기화
  resetVideoArea() {
    if (!this.videoArea) return;

    const slotsContainer = this.videoArea.querySelector('.slots-container');
    if (slotsContainer) slotsContainer.remove();

    this.plusIcon?.classList.remove('hidden'); // 표시

    stateManager.setLayout(1);
    this.participantElements.forEach(p => {
      const name = p.querySelector('span').textContent;
      this.updateParticipantButtonColor(name, false);
    });
  },

  // 음성 호출 배치
  handleParticipantCalled(participantName) {
    console.log(`[UI] '${participantName}' 호출됨`);

    const allNames = stateManager.getAllParticipantNames();
    if (!allNames.includes(participantName)) {
      console.warn(`[UI] 존재하지 않는 참여자: ${participantName}`);
      return;
    }
    if (stateManager.isPlaced(participantName)) return;

    if (stateManager.placedParticipants.length === 0) this.selectLayout(1);

    let empty = document.querySelector('.slot:not([data-occupied])');

    if (!empty && stateManager.placedParticipants.length < 4) {
      const newCount = stateManager.placedParticipants.length + 1;
      const target = Math.min(newCount, 4);

      const names = stateManager.getPlacedParticipantNames();
      names.forEach(name => stateManager.removeFromVideoArea(name));

      stateManager.setLayout(target);
      this.createVideoSlots();

      names.forEach((name, idx) => {
        const slot = document.querySelector(`#slot-${idx}`);
        if (slot) this.addParticipantToSlot(name, slot);
      });

      empty = document.querySelector('.slot:not([data-occupied])');
    }

    if (empty) this.addParticipantToSlot(participantName, empty);
  },

  // 제거 후 레이아웃 조정
  adjustLayoutAfterRemoval() {
    const placed = stateManager.placedParticipants.length;
    if (placed === 0) {
      this.resetVideoArea();
      return;
    }

    const optimal = stateManager.getOptimalLayout(placed);
    stateManager.setLayout(optimal);

    const names = stateManager.getPlacedParticipantNames();
    this.createVideoSlots();
    names.forEach((name, idx) => {
      const slot = document.querySelector(`#slot-${idx}`);
      if (slot) this.addParticipantToSlot(name, slot);
    });
    stateManager.publishPlacementUpdate();
  }
};
