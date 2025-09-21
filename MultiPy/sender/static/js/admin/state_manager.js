// === 상태 관리 ===
const stateManager = {
    // 전체 참여자 목록 (MQTT로부터 받은 전체 사용자 - 객체 배열)
    allParticipants: [],


    // 비디오 영역에 배치된 참여자들
    placedParticipants: [], //[{id: "...", name: "..."}, ...] 형태


    // 현재 레이아웃
    currentLayout: 1,

    // 전체 참여자 목록 업데이트 (MQTT에서 호출)
    updateAllParticipants(participants) {
        this.allParticipants = [...participants];
        console.log("[STATE] 전체 참여자 목록 업데이트:", this.allParticipants);


        // 모든 참여자 이름 추출
        const allParticipantNames = this.getAllParticipantNames();


        //나간 참여자 = 이전 allParticipants에 있었지만 지금은 없는 사람
        const removedParticipants = this.placedParticipants.filter(
            p => !allParticipantNames.includes(p.name)
        );


        // placedParticipants에서 나간 사람 제거
        if (removedParticipants.length > 0) {
            this.handleParticipantLeave(removedParticipants);
        }

        // 기존 배치된 참여자 중 목록에서 제거된 사용자가 있는지 확인
        this.placedParticipants = this.placedParticipants.filter(placedParticipant =>
            allParticipantNames.includes(placedParticipant.name)
        );
        // UI 업데이트 - 모든 참여자 표시
        uiManager.updateParticipantList(allParticipantNames);
        // 대시보드용 업데이트
        uiManager.updateDashParticipantList(this.getPlacedParticipantNames());
    },

    handleParticipantLeave(removedParticipants) {
        removedParticipants.forEach(p => {
            this.removeFromVideoArea(p.name); // 상태 + MQTT 전송
            uiManager.removeParticipantFromUI(p.name); // UI 슬롯 제거
        });


        // 🔑 여기서 레이아웃 정리 실행
        uiManager.adjustLayoutAfterRemoval();
    },




    // 모든 참여자 이름 목록 반환 (활성/비활성 구분 없이)
    getAllParticipantNames() {
        return this.allParticipants.map(participant => participant.name);
    },


    // 이름으로 참여자 전체 정보 찾기
    getParticipantByName(participantName) {
        return this.allParticipants.find(p => p.name === participantName);
    },
    // 참여자를 비디오 영역에 배치
    addToVideoArea(participantName) {
        const allNames = this.getAllParticipantNames();


        if (!allNames.includes(participantName)) {
            console.warn("[STATE] 존재하지 않는 참여자:", participantName);
            return false;
        }


        // 이미 배치된 참여자인지 확인 (객체 배열에서 이름으로 확인)
        const isAlreadyPlaced = this.placedParticipants.some(p => p.name === participantName);
        if (!isAlreadyPlaced) {
            // 전체 정보 찾아서 추가
            const participantInfo = this.getParticipantByName(participantName);
            if (participantInfo) {
                this.placedParticipants.push({
                    id: participantInfo.id,
                    name: participantInfo.name
                });
                console.log("[STATE] 참여자 배치:", participantInfo);


                // MQTT로 화면 배치 상태 전송
                this.publishPlacementUpdate();
                return true;
            }
        }
        return false;
    },
    // 참여자를 비디오 영역에서 제거
    removeFromVideoArea(participantName) {
        const index = this.placedParticipants.findIndex(p => p.name === participantName);
        if (index > -1) {
            const removed = this.placedParticipants.splice(index, 1)[0];
            console.log("[STATE] 참여자 제거:", removed);


            // === 추가: 통계 DOM 제거 ===
            const statDiv = document.querySelector(`.stat-entry[data-name="${participantName}"]`);
            if (statDiv) {
                statDiv.remove();
            }


            // MQTT로 화면 배치 상태 전송
            this.publishPlacementUpdate();
            return true;
        }
        return false;
    },
    // 배치 상태를 MQTT로 전송
    publishPlacementUpdate() {
        if (window.publishPlacementState) {
            const placementData = {
                layout: this.currentLayout,
                participants: this.placedParticipants // 객체 배열 [{id, name}, ...]
            };
            window.publishPlacementState(JSON.stringify(placementData));
            console.log("[STATE] 배치 상태 전송:", placementData);
        }
    },


    /* 전송되는 데이터 구조
    {
    layout: 2,
    participants: [
    {id: "sender_id_123", name: "은비"},
    {id: "sender_id_456", name: "아린"}
    ]
    }
    */

    // 레이아웃 업데이트
    setLayout(layout) {
        if (this.currentLayout !== layout) {
            this.currentLayout = layout;
            console.log("[STATE] 레이아웃 변경:", layout);
        }
    },


    // 참여자가 비디오 영역에 배치되어 있는지 확인
    isPlaced(participantName) {
        return this.placedParticipants.some(p => p.name === participantName);
    },


    // 음성 인식에 사용할 참여자 이름 목록 반환
    getAllParticipants() {
        return this.getAllParticipantNames();
    },


    // 최적 레이아웃 계산
    getOptimalLayout(participantCount) {
        if (participantCount <= 1) return 1;
        if (participantCount <= 2) return 2;
        if (participantCount <= 3) return 3;
        return 4;
    },
    // 배치된 참여자 이름 목록만 반환 (UI 호환성을 위해)
    getPlacedParticipantNames() {
        return this.placedParticipants.map(p => p.name);
    },


    // 초기 접속 시 실시간으로 공유되고 있는 화면 상태 동기화
    updateSharingInfo(screenData) {
        try {
            // 서버 상태로 업데이트
            this.currentLayout = screenData.layout || 1;


            // 🔑 Unknown 같은 유효하지 않은 참가자 제거
            this.placedParticipants = (screenData.participants || []).filter(p => {
                return p.name && p.name !== "Unknown" &&
                    this.allParticipants.some(ap => ap.id === p.id);
            });


            console.log(`[STATE] 동기화: 레이아웃 ${this.currentLayout}, 참가자 ${this.placedParticipants.length}명`);


            // HTML UI를 서버 상태에 맞춰 업데이트
            this._syncWithServerState();


        } catch (error) {
            console.error("[STATE ERROR] 화면 상태 동기화 실패:", error);
        }
    },
    // 서버 상태와 HTML 동기화
    _syncWithServerState() {
        if (this.placedParticipants.length === 0) {
            // 서버에 배치된 참가자가 없으면 초기화
            uiManager.resetVideoArea();
            return;
        }


        // 서버의 레이아웃으로 HTML 화면 구성
        uiManager.selectLayout(this.currentLayout);


        // 서버에 배치된 참가자들을 HTML에 표시
        this.placedParticipants.forEach((participant, index) => {
            const targetSlot = document.querySelector(`#slot-${index}`);
            if (targetSlot && !targetSlot.hasAttribute('data-occupied')) {
                uiManager.addParticipantToSlot(participant.name, targetSlot);
            }
        });


        // 참가자 목록의 버튼 색상도 동기화
        this._updateParticipantButtonStates();
    },

    // 참가자 버튼 상태 동기화
    _updateParticipantButtonStates() {
        const placedNames = this.placedParticipants.map(p => p.name);


        // 모든 참가자 요소의 버튼 상태 업데이트
        document.querySelectorAll('.participant').forEach(participantElement => {
            const participantName = participantElement.querySelector('span').textContent;
            const isPlaced = placedNames.includes(participantName);
            uiManager.updateParticipantButtonColor(participantName, isPlaced);
        });
    }
};