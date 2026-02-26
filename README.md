# Multiplexer
> 실시간 디스플레이 공유가 가능한 임베디드 소프트웨어
---

### 🎥 시연 영상
## ▶️ [Watch on YouTube](https://youtube.com/watch?v=rJxngGRAIlM)


[![Video Title](https://img.youtube.com/vi/rJxngGRAIlM/0.jpg)](https://youtube.com/watch?v=rJxngGRAIlM)


---

## 📋 작품 설명

### 💬 개발 개요 
#### 1. 개발 배경 및 필요성
   
&nbsp;&nbsp;현대의 회의나 발표 환경에서는 다수의 참여자가 각자의 화면을 공유해야 하는 상황이 빈번하게 발생한다. 특히 발표자가 바뀔 때마다 HDMI 케이블을 연결하고 해제하는 과정을 반복하거나, 별도의 프로그램을 설치해 공유 권한을 설정하는 등의 번거로운 절차가 요구된다. 이러한 방식은 회의 흐름을 끊고 불필요한 시간을 소모하게 만들며, 전환 과정이 매끄럽지 않아 발표 집중도가 떨어진다. 

#### 2. 개발 목표

> 본 프로젝트는 이러한 현실적인 불편함을 해소하고자, WebRTC의 P2P 통신 기술을 기반으로 **별도의 설치 없이** 브라우저에서 바로 실행 가능한 실시간 화면 공유 시스템을 구현하는 것을 목표로 한다. 클라이언트는 **자신의 화면을 손쉽게 공유**하고, 와이파이 기능을 가진 임베디드 장치(Multiplexer라 호칭)로 **실시간 디스플레이 공유**가 가능하며, 관리자가 이를 제어할 수 있는 구조로, **발표 전환을 유연하게 하고 협업의 집중도를 높일 수 있는 환경을 제공**한다.

<img width="300" src="https://github.com/Jeong-dawon/MultiFlexer/blob/master/src/%E1%84%80%E1%85%A2%E1%84%87%E1%85%A1%E1%86%AF%E1%84%80%E1%85%A2%E1%84%8B%E1%85%AD0.png"> <img width="310" src="https://github.com/Jeong-dawon/MultiFlexer/blob/master/src/%E1%84%80%E1%85%A2%E1%84%87%E1%85%A1%E1%86%AF%20%E1%84%86%E1%85%A9%E1%86%A8%E1%84%91%E1%85%AD.png">

* HDMI 케이블 교체 없이 **즉시** 화면 전환
* Wifi 통신으로 Multiplexer와 클라이언트 간 **무선 연결**
* 여러 회의 참석자의 화면 **동시 수신**
* 여러 사용자의 발표 화면을 **분할**하여 표시
* **음성 인식**으로 화면 전환 및 분할 지시

#### 3. 세부 개발 목표

- **고속 스위칭 멀티 플렉서 소프트웨어**  
  멀티 플렉서 소프트웨어가 매우 빠른 속도로 클라이언트 화면을 전환한다.

- **와이파이 기반 연결**  
  와이파이 기반 무선 연결로 편리하게 화면을 공유한다.

- **WebRTC P2P 연결로 사용자 스크린 실시간 전송**  
  서버 경유 없이 직접 연결하여 지연 시간을 최소화한다.

- **GStreamer 프레임워크 상에 파이프라인을 구축하여 다중 화면 지원** 
  각 사용자의 비디오 스트림을 동시에 수신하고 각 스트림 별로 독립적인 GStreamer 프레임워크 파이프라인을 구축하여 동시 처리한다.

- **범용 호환성 확보**  
  100% 소프트웨어 기반으로 구현하여 별도의 전용 하드웨어 필요 없이 임베디드 디바이스, 노트북, 데스크톱 등 다양한 하드웨어를 지원하고, 브라우저만 있으면 별도 앱 설치 없이 바로 화면 공유가 가능하다.

- **비디오 디코딩 시간을 최소화하기 위해 GPU에 내장된 하드웨어 디코더 활용**
  GPU에 내장된 하드웨어 디코더를 활용하여 빠른 비디오 디코딩을 달성한다.

---

### ⚙️ 개발 환경 설명 
#### 1. 하드웨어 구성
* 임베디드 Multiplexer 장치
  * Jetson Orin NX Super 임베디드 보드
  * HDMI로 대형 디스플레이 연결
  * UHD/FHD/HD 디스플레이 지원
  * Wi-Fi AP로 네트워크 공유 환경 제공
 
<img width="400" src="https://github.com/Jeong-dawon/MultiFlexer/blob/master/src/Jetson%20Orin%20NX%20Super.png">
    
* 클라이언트
  * Wi-Fi 연결이 가능한 모든 PC, 노트북
  * 운영체제 관계 없이 브라우저만으로 연결

#### 2. 소프트웨어 구성
<img width="600" src="https://github.com/Jeong-dawon/MultiFlexer/blob/master/src/%E1%84%89%E1%85%A9%E1%84%91%E1%85%B3%E1%84%90%E1%85%B3%E1%84%8B%E1%85%B0%E1%84%8B%E1%85%A5%20%E1%84%80%E1%85%AE%E1%84%89%E1%85%A5%E1%86%BC.png">

* **Multiplexer**: Ubuntu Linux에서 WebRTC로 화면 스트림을 수신하며 하드웨어 디코더를 이용해서 빠르게 영상 수신 및 출력
  * WebRTC 시그널링 서버: 화면 전송 클라이언트와 GStreamer 프레임워크 간 연결
  * GStreamer + MQTT 브로커: 다중 파이프라인 스트리밍 처리 및 제어
  * Flask 웹 애플리케이션: 클라이언트 접속 및 웹 인터페이스 제공
  * MQTT 브로커: 실시간 메시징 통신
  * HW H.264 Decoder: 하드웨어 가속 비디오 처리

* **클라이언트**: 브라우저 기반으로 별도 앱 설치업싱 브라우저만으로 화면 공유 및 관리
  * 일반 사용자: 웹 페이지에 접속하여 실시간으로 화면 스트리밍
  * 관리자: 관리자 웹 페이지에 접속하여 화면 분할, 레이아웃 변경, 클라이언트 화면 배치 관리

#### 3. 클라이언트와 Multiplexer 간 WebRTC 시그널링 및 P2P 연결
<img width="600" src="https://github.com/Jeong-dawon/MultiFlexer/blob/master/src/P2P.png">

1) 화면을 공유할 클라이언트가 웹 페이지에 접속하여 화면 공유 시작
2) WebRTC 시그널링 서버를 통해 연결 협상
3) Multiplexer가 새로운 클라이언트를 감지, GStreamer 프레임워크 상에 파이프라인 생성
4) Webrtcbin 플러그인이 WebRTC 협상을 시작하여 P2P 연결 구축

#### 4. GStreamer 프레임워크 상의 파이프라인 기반 실시간 화면 스트리밍
<img width="600" src="https://github.com/Jeong-dawon/MultiFlexer/blob/master/src/GStreamer.png">

1) 웹 브라우저에서 사용자 화면을 캡쳐하여 H.264로 실시간 인코딩
2) 인코딩된 비디오를 RTP 패킷으로 Multiplexer에 전송
3) 클라이언트별로 독립적인 GStreamer 파이프라인 동적으로 생성
4) 클라이언트 os에 맞는 하드웨터 디코더를 활용한 가속 디코딩
5) 처리된 비디오를 PyQt5 위젯에 렌더링, HDMI 케이블로 연결된 디스플레이에 출력

#### 5. MQTT 통신 기반 다중 사용자 화면 배치 제어
<img width="600" src="https://github.com/Jeong-dawon/MultiFlexer/blob/master/src/MQTT.png">

1) 관리자가 웹 페이지에 접속하여 MQTT 브로커와 연결
2) 사용자 목록과 현재 화면 배치 상태를 실시간으로 수신
3) 사용자의 화면 배치 조정, 최대 4분할 레이아웃 제공
4) MQTT를 통해 배치 사항을 Multiplexer에 전송
5) Multiplexer가 PyQt5 UI에서 화면 분할 및 사용자 재배치
6) Google Speech-to-Text로 사용자 음성 인식 시 해당 사용자 화면 자동 전환

---

### 📝 개발 프로그램 설명
#### 1. 파일 구성

> 키 포인트: **WebRTC P2P**, **GStreamer 디코딩**, **MQTT 동기화**, **PyQt5 UI**, **Google STT API 연동**

<details>
<summary><b>Multiplexer (클라이언트 화면 수신/배치)</b></summary><br>

- `signalingServer.js` — **WebRTC 시그널링 서버**: Offer/Answer SDP 교환 및 ICE 후보 중계 처리  
- `ui_components.py` — **PyQt5 UI 컴포넌트**: 메인 윈도우, 비디오 위젯, 레이아웃 관
- `peer_receiver.py` — **피어 수신**:GStreamer 프레임워크 파이프라인 구성, **하드웨어 비디오 디코딩**  
- `receiver_manager.py` — **다중 송신자 연결 관리**: 송신자 목록 관리 및 **화면 배치 조정**
- `mqtt_manager.py` — **MQTT 통신**(참여자 목록, 레이아웃 동기화): 참여자 상태 브로드캐스트, **배치 명령** 수신
</details>

<details>
<summary><b>화면 전송 클라이언트</b></summary><br>

- `client.html` — **화면 전송 클라이언트 페이지** - 이름 입력 UI 및 화면 공유 시작 인터페이스
- `client.js` — **화면 공유 WebRTC 클라이언트** : 화면 캡쳐, H.264 인코딩, RTP 전송
</details>

<details>
<summary><b>화면 관리(Administrator) 클라이언트</b></summary><br>

- `admin.html` — **화면 관리 클라이언트 페이지** - 참여자 목록 표시 및 Drag&Drop UI
- `admin.js` — **관리자 UI 및 상태 관리** - 레이아웃 제어 로직 및 MQTT 통신
- `voiceHandler.js` — **음성 인식을 통한 참여자 호출 기능** - Google STT API 연동 및 이름 인식
</details>

#### 2. 기술의 차별성
* **GStreamer 프레임워크를 기반으로 안정적 미디어 스트리밍** 파이프라인 구축  
  업계 표준급 멀티미디어 프레임워크 활용으로 높은 안정성과 확장성을 확보한다.

* **GPU에 내장된 하드웨어 코덱을 활용** 고속 스트리밍 실현  
  하드웨어 디코딩 기반으로 빠른 스트리밍 서비스 구현한다.

* **소프트웨어 코덱 자동 풀백** 으로 높은 가용성 보장  
  하드웨어 가속이 불가능한 환경에서도 소프트웨어 디코딩으로 자동 전환되어 서비스 연속성을 유지한다.

* **WebRTC P2P 통신** 으로 빠른 비디오 전송  
  WebRTC P2P 통신으로 서버 경유 없이 여러 참가자가 동시에 화면을 공유하고 실시간으로 전환 가능하다.


---

### 🔥 개발 결과물의 차별성
#### 1. 작품의 차별성
* 다중 화면 공유 및 실시간 전환이 가능한 **임베디드 Multiplexer 소프트웨어** 개발
* **하드웨어 코덱 우선 활용**으로 고성능 스트리밍 실현
* **100% 소프트웨어** 기반으로 구현하여 전용 하드웨어 없이 즉시 사용 가능한 솔루션 제공
* 임베디드 디바이스, 노트북, 데스크톱 등 **다양한 하드웨어에서 호환** 가능

---


## 🖥️ 개발 환경
<span>
  <img src="https://img.shields.io/badge/linux-%23FCC624.svg?&style=for-the-badge&logo=linux&logoColor=black" />
  <img src="https://img.shields.io/badge/macos-%23000000.svg?&style=for-the-badge&logo=macos&logoColor=black" />
  <img src="https://img.shields.io/badge/windows-%230078D6.svg?&style=for-the-badge&logo=windows&logoColor=white" />
</span>

## 🖥️ 개발 언어
<span>
  <img src="https://img.shields.io/badge/javascript-%23F7DF1E.svg?&style=for-the-badge&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/html-%23E34F26.svg?&style=for-the-badge&logo=html&logoColor=white" />
  <img src="https://img.shields.io/badge/python-%233776AB.svg?&style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/css-%231572B6.svg?&style=for-the-badge&logo=css&logoColor=white" />
</span>

## 🖥️ 개발 도구 / 라이브러리
<span>
  <img src="https://img.shields.io/badge/mqtt-%23660066.svg?&style=for-the-badge&logo=mqtt&logoColor=white" />
  <img src="https://img.shields.io/badge/gstreamer-%23FF3131.svg?&style=for-the-badge&logo=gstreamer&logoColor=white" />
  <img src="https://img.shields.io/badge/webrtc-%23333333.svg?&style=for-the-badge&logo=webrtc&logoColor=white" />
  <img src="https://img.shields.io/badge/flask-%233BABC3.svg?&style=for-the-badge&logo=flask&logoColor=white" />
  <img src="https://img.shields.io/badge/socket.io-%23010101.svg?&style=for-the-badge&logo=socket.io&logoColor=white" />
  <img src="https://img.shields.io/badge/node.js-%235FA04E.svg?&style=for-the-badge&logo=node.js&logoColor=white" />
</span>


---

### ✨ 프로젝트 시연 및 소개


>아래는 Multiplexer를 활용한 데모 회의를 테스트 케이스로 삼아, 시스템의 전반적인 동작 과정과 기능을 효과적으로 시연하는 내용이 담겨 있다.

##


1. Multiplexer 앱 실행 시 초기 동작 과정
<img width="600" alt="image" src="https://github.com/user-attachments/assets/def7d549-735f-4f0f-8626-1b4d6888c3bf" />

2. 사용자 페이지와 관리자 페이지의 동작 과정
<img width="600" alt="image" src="https://github.com/user-attachments/assets/ddb1f6a7-5462-4068-9374-26297c79bc04" />

3. 관리자 페이지에서의 화면 분할 관리 동작 과정
<img width="600" height="1210" alt="image" src="https://github.com/user-attachments/assets/4591a481-8399-49db-9d4a-04232159791f" />

4. 모든 사용자 퇴장 시 Multiplexer 화면
<img width="600" alt="image" src="https://github.com/user-attachments/assets/d02ce24b-7f30-4b08-8550-55a790eb9517" />




