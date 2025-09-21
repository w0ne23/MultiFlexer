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

            // 레이아웃 옵션에 드롭 이벤트 추가
            option.addEventListener('dragover', (e) => this.handleLayoutDragOver(e));
            option.addEventListener('drop', (e) => this.handleLayoutDrop(e, index + 1));
            option.addEventListener('dragleave', (e) => {
                e.target.style.background = '';
            });
        });

        // 마이크 버튼 이벤트
        this.setupMicrophoneButton();
    },
    // 마이크 버튼 이벤트 설정
    setupMicrophoneButton() {
        if (!this.micBtn) return;

        // 마우스 이벤트
        this.micBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (window.startPushToTalk) {
                window.startPushToTalk();
            }
        });

        this.micBtn.addEventListener('mouseup', (e) => {
            e.preventDefault();
            if (window.stopPushToTalk) {
                window.stopPushToTalk();
            }
        });

        this.micBtn.addEventListener('mouseleave', (e) => {
            e.preventDefault();
            if (window.stopPushToTalk) {
                window.stopPushToTalk();
            }
        });

        // 터치 이벤트
        this.micBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (window.startPushToTalk) {
                window.startPushToTalk();
            }
        });

        this.micBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (window.stopPushToTalk) {
                window.stopPushToTalk();
            }
        });

        // 키보드 이벤트 (스페이스바)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && window.isPushed && !window.isPushed()) {
                e.preventDefault();
                if (window.startPushToTalk) {
                    window.startPushToTalk();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && window.isPushed && window.isPushed()) {
                e.preventDefault();
                if (window.stopPushToTalk) {
                    window.stopPushToTalk();
                }
            }
        });
    },

    // 참여자 목록 UI 업데이트
    updateParticipantList(participantList) {
        if (!this.participantArea) return;

        // 기존 참여자 요소들 제거
        this.participantArea.innerHTML = '';

        // 참여자가 없을 때 메시지 표시
        if (participantList.length === 0) {
            const noParticipantsMsg = document.createElement('div');
            noParticipantsMsg.className = 'no-participants';
            noParticipantsMsg.textContent = '참여자를 기다리는 중...';
            noParticipantsMsg.style.cssText = `
                text-align: center;
                color: #888;
                padding: 20px;
                font-style: italic;
            `;
            this.participantArea.appendChild(noParticipantsMsg);
            this.participantElements = [];
            return;
        }

        // 새로운 참여자 목록으로 UI 생성
        participantList.forEach(userName => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant';
            participantDiv.draggable = true;
            participantDiv.setAttribute('data-name', userName);

            // 배치 상태에 따른 버튼 텍스트와 색상 설정
            const isPlaced = stateManager.isPlaced(userName);
            const buttonText = isPlaced ? '공유 중' : '공유 X';
            const buttonColor = isPlaced ? '#ff4444' : '#04d2af';

            participantDiv.innerHTML = `
                <span>${userName}</span>
                <button class="mute-btn" style="background: ${buttonColor}; color: white;">${buttonText}</button>
            `;

            // 드래그 이벤트 리스너 추가
            participantDiv.addEventListener('dragstart', (e) => this.handleDragStart(e));
            participantDiv.addEventListener('dragend', (e) => this.handleDragEnd(e));

            this.participantArea.appendChild(participantDiv);
        });

        // 참여자 요소 목록 업데이트
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
            noMsg.style.cssText = `
                text-align: center;
                color: #888;
                padding: 20px;
                font-style: italic;
            `;
            this.dashParticipantArea.appendChild(noMsg);
            return;
        }

        // === 전체보기 버튼 추가 ===
        const allBtn = document.createElement('button');
        allBtn.className = 'dash-participant all-btn';
        allBtn.textContent = '전체보기';
        allBtn.style.marginTop = '10px';
        allBtn.addEventListener('click', () => {
            showPlacedStats();
        });
        this.dashParticipantArea.appendChild(allBtn);

        // 공유 중인 참여자 버튼들 추가
        participantList.forEach(userName => {
            const btn = document.createElement('button');
            btn.className = 'dash-participant';
            btn.textContent = userName;
            btn.dataset.name = userName;

            // 클릭 이벤트 추가
            btn.addEventListener('click', () => {
                filterStatsByName(userName);
            });

            this.dashParticipantArea.appendChild(btn);
        });
    },

    // 드래그 관련 이벤트 처리
    handleDragStart(e) {
        const participantName = e.target.querySelector('span').textContent;

        // 4분할이고 4명이 모두 참여 중이면 드래그 방지
        if (stateManager.currentLayout === 4 && stateManager.placedParticipants.length >= 4) {
            e.preventDefault();
            return false;
        }

        // 이미 배치된 참여자면 드래그 방지 (객체 배열에서 이름으로 확인)
        if (stateManager.isPlaced(participantName)) {
            e.preventDefault();
            return false;
        }

        this.draggedParticipant = e.target;
        e.target.style.opacity = '0.5';
        e.dataTransfer.setData('text/plain', participantName);
        e.dataTransfer.effectAllowed = 'move';
    },

    handleDragEnd(e) {
        e.target.style.opacity = '1';
        this.draggedParticipant = null;
    },

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    },

    handleDragEnter(e) {
        e.preventDefault();
        // 빈 video-area에 드래그할 때만 레이아웃 메뉴 표시
        if (stateManager.placedParticipants.length === 0) {
            this.showLayoutMenu();
        }
    },

    handleDragLeave(e) {
        if (!this.videoArea.contains(e.relatedTarget)) {
            if (stateManager.placedParticipants.length === 0) {
                this.hideLayoutMenu();
            }
        }
    },
    handleDrop(e) {
        e.preventDefault();
        const participantName = e.dataTransfer.getData('text/plain');

        // 이미 배치된 참여자인지 확인
        if (stateManager.isPlaced(participantName)) {
            e.target.style.background = '';
            return;
        }

        // 4분할에서 4명이 모두 참여 중이면 드롭 방지
        if (stateManager.currentLayout === 4 && stateManager.placedParticipants.length >= 4) {
            return;
        }

        // 참여자가 없으면 1분할로 시작
        if (stateManager.placedParticipants.length === 0) {
            this.selectLayout(1);
        }

        // 빈 슬롯이 있으면 자동으로 배치
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
        e.target.style.background = '#008f77';
    },

    handleLayoutDrop(e, layout) {
        e.preventDefault();
        e.stopPropagation();

        const participantName = e.dataTransfer.getData('text/plain');

        // 이미 배치된 참여자인지 확인
        if (stateManager.isPlaced(participantName)) {
            e.target.style.background = '';
            return;
        }

        // 레이아웃 선택 및 참가자 추가
        this.selectLayout(layout);

        // 첫 번째 슬롯에 자동 배치
        const firstSlot = document.querySelector('.slot');
        if (firstSlot) {
            this.addParticipantToSlot(participantName, firstSlot);
            this.checkAndExpandLayout();
        }

        e.target.style.background = '';
    },

    // 레이아웃 메뉴 표시/숨김
    showLayoutMenu() {
        if (this.layoutMenu) {
            this.layoutMenu.classList.remove('hidden');
        }
        if (this.plusIcon) {
            this.plusIcon.style.display = 'none';
        }
    },
    hideLayoutMenu() {
        if (this.layoutMenu) {
            this.layoutMenu.classList.add('hidden');
        }
        if (stateManager.placedParticipants.length === 0 && this.plusIcon) {
            this.plusIcon.style.display = 'block';
        }
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

        // 기존 슬롯 제거
        const existingSlots = this.videoArea.querySelectorAll('.slot, .slots-container');
        existingSlots.forEach(slot => slot.remove());

        // 플러스 아이콘 숨김
        if (this.plusIcon) {
            this.plusIcon.style.display = 'none';
        }

        // 슬롯 컨테이너 생성
        const slotsContainer = document.createElement('div');
        slotsContainer.className = 'slots-container';

        if (currentLayout === 1) {
            this.create1Layout(slotsContainer);
        } else if (currentLayout === 2) {
            this.create2Layout(slotsContainer);
        } else if (currentLayout === 3) {
            this.create3Layout(slotsContainer);
        } else if (currentLayout === 4) {
            this.create4Layout(slotsContainer);
        }

        this.videoArea.appendChild(slotsContainer);
    },
    // 레이아웃별 슬롯 생성 메서드들
    create1Layout(container) {
        container.style.cssText = `
            display: flex;
            width: 100%;
            height: 100%;
            padding: 10px;
            box-sizing: border-box;
        `;

        const slot = this.createSlot('slot-0');
        slot.style.cssText = `
            width: 100%;
            height: 100%;
            background: transparent;
            border: 2px dashed rgba(255, 255, 255, 1);
            border-radius: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            font-weight: bold;
            box-sizing: border-box;
        `;
        container.appendChild(slot);
    },

    create2Layout(container) {
        container.style.cssText = `
            display: flex;
            flex-direction: row;
            width: 100%;
            height: 100%;
            padding: 10px;
            box-sizing: border-box;
            gap: 2%;
        `;

        for (let i = 0; i < 2; i++) {
            const slot = this.createSlot(`slot-${i}`);
            slot.style.cssText = `
                width: 49%;
                height: 100%;
                background: transparent;
                border: 2px dashed rgba(255, 255, 255, 1);
                border-radius: 10px;
                display: flex;
                justify-content: center;
                align-items: center;
                color: white;
                font-weight: bold;
                box-sizing: border-box;
            `;
            container.appendChild(slot);
        }
    },

    create3Layout(container) {
        container.style.cssText = `
            display: flex;
            flex-direction: row;
            width: 100%;
            height: 100%;
            padding: 10px;
            box-sizing: border-box;
            gap: 2%;
        `;

        // 큰 슬롯 (왼쪽)
        const mainSlot = this.createSlot('slot-0');
        mainSlot.style.cssText = `
            width: 65%;
            height: 100%;
            background: transparent;
            border: 2px dashed rgba(255, 255, 255, 1);
            border-radius: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            font-weight: bold;
            box-sizing: border-box;
        `;
        // 작은 슬롯들 컨테이너 (오른쪽)
        const smallSlotsContainer = document.createElement('div');
        smallSlotsContainer.style.cssText = `
            width: 33%;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 2%;
        `;

        // 작은 슬롯 2개
        for (let i = 1; i < 3; i++) {
            const smallSlot = this.createSlot(`slot-${i}`);
            smallSlot.style.cssText = `
                width: 100%;
                height: 49%;
                background: transparent;
                border: 2px dashed rgba(255, 255, 255, 1);
                border-radius: 10px;
                display: flex;
                justify-content: center;
                align-items: center;
                color: white;
                font-weight: bold;
                box-sizing: border-box;
            `;
            smallSlotsContainer.appendChild(smallSlot);
        }

        container.appendChild(mainSlot);
        container.appendChild(smallSlotsContainer);
    },

    create4Layout(container) {
        container.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            width: 100%;
            height: 100%;
            padding: 10px;
            box-sizing: border-box;
            gap: 2%;
        `;
        for (let i = 0; i < 4; i++) {
            const slot = this.createSlot(`slot-${i}`);
            slot.style.cssText = `
                width: 100%;
                height: 100%;
                background: transparent;
                border: 2px dashed rgba(255, 255, 255, 1);
                border-radius: 10px;
                display: flex;
                justify-content: center;
                align-items: center;
                color: white;
                font-weight: bold;
                box-sizing: border-box;
            `;
            container.appendChild(slot);
        }
    },

    // 슬롯 생성 헬퍼
    createSlot(id) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.id = id;
        slot.addEventListener('dragover', (e) => this.handleSlotDragOver(e));
        slot.addEventListener('drop', (e) => this.handleSlotDrop(e));
        slot.addEventListener('dragleave', (e) => {
            if (!e.target.hasAttribute('data-occupied')) {
                e.target.style.background = 'transparent';
                e.target.style.border = '2px dashed rgba(255, 255, 255, 1)';
            }
        });
        return slot;
    },

    // 슬롯 드래그 이벤트
    handleSlotDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!e.target.hasAttribute('data-occupied')) {
            e.target.style.background = '#0f172a';
            e.target.style.border = '2px dashed white';
        }
    },
    handleSlotDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        const participantName = e.dataTransfer.getData('text/plain');

        // 이미 배치된 참가자인지 확인
        if (stateManager.isPlaced(participantName)) {
            if (!e.target.hasAttribute('data-occupied')) {
                e.target.style.background = 'transparent';
                e.target.style.border = '2px dashed rgba(255, 255, 255, 1)';
            }
            return;
        }

        // 이미 점유된 슬롯인지 확인
        if (e.target.hasAttribute('data-occupied')) {
            return;
        }

        // 참가자 배치
        this.addParticipantToSlot(participantName, e.target);
        this.checkAndExpandLayout();
    },

    // 슬롯에 참가자 추가
    addParticipantToSlot(participantName, slot) {
        // 상태 관리자에 추가
        stateManager.addToVideoArea(participantName);

        // UI 업데이트
        slot.innerHTML = `
            <div style="text-align: center; position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #04d2af, #60aaff); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin-bottom: 10px;">
                    ${participantName.charAt(0)}
                </div>
                <div style="color: white; font-weight: bold;">${participantName}</div>
                <button onclick="uiManager.removeParticipant('${participantName}', this)" style="background: #ff4444; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; position: absolute; top: 5px; right: 5px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;">×</button>
            </div>
        `;

        slot.style.background = '#0f172a';
        slot.style.position = 'relative';
        slot.setAttribute('data-occupied', 'true');

        // 원본 참가자 요소의 시각적 표시 변경
        this.updateParticipantButtonColor(participantName, true);
        // === 대시보드 목록 갱신 추가 ===
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
                if (isPlaced) {
                    // 배치된 상태 - "공유 중" (빨간색)
                    muteBtn.style.background = '#ff4444';
                    muteBtn.style.color = 'white';
                    muteBtn.textContent = '공유 중';
                } else {
                    // 배치 안된 상태 - "공유 X" (초록색)
                    muteBtn.style.background = '#04d2af';
                    muteBtn.style.color = 'white';
                    muteBtn.textContent = '공유 X';
                }
            }
        }
    },
    // 참가자 제거
    removeParticipant(participantName, buttonElement) {
        // 슬롯에서 제거
        const slot = buttonElement.closest('.slot');
        slot.innerHTML = '';
        slot.removeAttribute('data-occupied');
        slot.style.background = 'transparent';
        slot.style.border = '2px dashed rgba(255, 255, 255, 1)';

        // 상태 관리자에서 제거
        stateManager.removeFromVideoArea(participantName);

        // 원본 참가자 요소의 버튼 색상을 원래대로 변경
        this.updateParticipantButtonColor(participantName, false);

        // === 추가: 해당 통계 DOM도 제거 ===
        const statDiv = document.querySelector(`.stat-entry[data-name="${participantName}"]`);
        if (statDiv) {
            statDiv.remove();
        }

        // 레이아웃 재조정
        this.adjustLayoutAfterRemoval();

        // === 대시보드 목록 갱신 추가 ===
        uiManager.updateDashParticipantList(stateManager.getPlacedParticipantNames());
    },
    removeParticipantFromUI(participantName) {
        const slot = Array.from(document.querySelectorAll('.slot[data-occupied]'))
            .find(s => s.querySelector('div div')?.textContent === participantName);

        if (slot) {
            slot.innerHTML = '';
            slot.removeAttribute('data-occupied');
            slot.style.background = 'transparent';
            slot.style.border = '2px dashed rgba(255, 255, 255, 1)';
            console.log(`[UI] 슬롯에서 자동 제거: ${participantName}`);
        }

        this.updateParticipantButtonColor(participantName, false);
    },


    // 레이아웃 자동 확장 체크
    checkAndExpandLayout() {
        const currentParticipantCount = stateManager.placedParticipants.length;
        let targetLayout = stateManager.currentLayout;

        // 자동 확장 규칙
        if (stateManager.currentLayout === 1 && currentParticipantCount === 2) {
            targetLayout = 2;
        } else if (stateManager.currentLayout === 2 && currentParticipantCount === 3) {
            targetLayout = 3;
        } else if (stateManager.currentLayout === 3 && currentParticipantCount === 4) {
            targetLayout = 4;
        }

        // 레이아웃 확장이 필요한 경우
        if (targetLayout > stateManager.currentLayout) {
            // 현재 참가자들 정보 백업
            const currentParticipantNames = stateManager.getPlacedParticipantNames();

            // 상태 초기화
            currentParticipantNames.forEach(name => {
                stateManager.removeFromVideoArea(name);
            });

            // 새 레이아웃 생성
            stateManager.setLayout(targetLayout);
            this.createVideoSlots();

            // 참가자들 재배치
            currentParticipantNames.forEach((name, index) => {
                const targetSlot = document.querySelector(`#slot-${index}`);
                if (targetSlot) {
                    this.addParticipantToSlot(name, targetSlot);
                }
            });
        }
    },
    // 비디오 영역 초기화
    resetVideoArea() {
        if (!this.videoArea) return;

        const slotsContainer = this.videoArea.querySelector('.slots-container');
        if (slotsContainer) {
            slotsContainer.remove();
        }

        if (this.plusIcon) {
            this.plusIcon.style.display = 'block';
        }

        // 상태 관리자 초기화
        stateManager.setLayout(1);

        // 모든 참가자 요소의 버튼 색상을 원래대로 복원
        this.participantElements.forEach(participant => {
            const participantName = participant.querySelector('span').textContent;
            this.updateParticipantButtonColor(participantName, false);
        });
    },
    // 참여자 호출 처리 (음성 인식에서 호출)
    handleParticipantCalled(participantName) {
        console.log(`[UI] '${participantName}' 호출됨`);

        // 해당 참여자가 전체 목록에 있는지 확인
        const allNames = stateManager.getAllParticipantNames();
        if (!allNames.includes(participantName)) {
            console.warn(`[UI] 존재하지 않는 참여자: ${participantName}`);
            return;
        }

        // 이미 배치된 참여자인지 확인
        if (stateManager.isPlaced(participantName)) {
            console.log(`[UI] 이미 배치된 참여자: ${participantName}`);
            return;
        }

        // 참여자가 없으면 1분할로 시작
        if (stateManager.placedParticipants.length === 0) {
            this.selectLayout(1);
        }

        // 빈 슬롯 찾기
        let emptySlot = document.querySelector('.slot:not([data-occupied])');

        // 빈 슬롯이 없다면 레이아웃 확장
        if (!emptySlot && stateManager.placedParticipants.length < 4) {
            const newParticipantCount = stateManager.placedParticipants.length + 1;
            const targetLayout = Math.min(newParticipantCount, 4);

            // 현재 참가자들 정보 백업
            const currentParticipantNames = stateManager.getPlacedParticipantNames();

            // 상태 초기화
            currentParticipantNames.forEach(name => {
                stateManager.removeFromVideoArea(name);
            });

            // 새 레이아웃 생성
            stateManager.setLayout(targetLayout);
            this.createVideoSlots();

            // 기존 참가자들 재배치
            currentParticipantNames.forEach((name, index) => {
                const targetSlot = document.querySelector(`#slot-${index}`);
                if (targetSlot) {
                    this.addParticipantToSlot(name, targetSlot);
                }
            });

            // 빈 슬롯 다시 찾기
            emptySlot = document.querySelector('.slot:not([data-occupied])');
        }

        // 빈 슬롯에 참여자 배치
        if (emptySlot) {
            this.addParticipantToSlot(participantName, emptySlot);
        }
    },

    adjustLayoutAfterRemoval() {
        const placedCount = stateManager.placedParticipants.length;

        if (placedCount === 0) {
            // 배치된 참가자가 없으면 전체 초기화
            this.resetVideoArea();
            return;
        }

        // 최적 레이아웃 계산
        const optimalLayout = stateManager.getOptimalLayout(placedCount);
        stateManager.setLayout(optimalLayout);

        // 현재 배치된 이름들 백업
        const currentNames = stateManager.getPlacedParticipantNames();

        // 레이아웃 새로 생성
        this.createVideoSlots();

        // 참가자들 다시 슬롯에 배치
        currentNames.forEach((name, index) => {
            const slot = document.querySelector(`#slot-${index}`);
            if (slot) {
                this.addParticipantToSlot(name, slot);
            }
        });
        stateManager.publishPlacementUpdate();
    }
};