# CareLink HealthCare 구조 문서

> CareLink는 React Native/Expo 모바일 앱, Spring Boot 백엔드, PostgreSQL 데이터베이스, FastAPI 기반 ECG AI 추론 서버를 분리한 모바일 헬스케어 플랫폼이다. 이 문서는 전체 시스템 구조, 주요 모듈, 데이터 흐름, ECG AI 모델, 배포 구조를 한 번에 파악할 수 있도록 정리한다.

---

## 1. 한눈에 보는 전체 구조

```text
[사용자]
  환자 / 보호자
     │
     │ 모바일 UI, 로컬 캐시, JWT 저장
     ▼
[React Native + Expo App]
  frontend/carelink-app
  - Expo Router
  - AuthContext / FontSizeContext
  - AsyncStorage cache
  - authFetch() API client
     │
     │ HTTPS + JSON
     │ Authorization: Bearer <JWT>
     ▼
[Spring Boot Backend]
  backend/healthcare-server
  - Auth / User / Vitals / Guardian
  - Medication / Notification / News
  - BrainTraining / ECG Proxy
     │                         │
     │ JPA / Hibernate          │ REST proxy
     ▼                         ▼
[PostgreSQL 16]          [FastAPI ECG AI Server]
  healthcare DB           ai/src/server.py
  - users                 - /health
  - health records        - /sample_window
  - guardian links        - /predict_window
  - medication            - CNN-CBAM-GRU model
  - alerts
```

### 핵심 설계 원칙

| 원칙 | 설명 |
|---|---|
| 모바일 앱과 AI 서버 분리 | 앱은 AI 서버를 직접 호출하지 않고 Spring Boot의 `/api/ecg` 프록시를 통해 접근한다. |
| JWT 중심 인증 | 로그인 후 발급된 access token과 refresh token을 앱에 저장하고, API 호출마다 `Authorization` 헤더에 access token을 첨부한다. |
| 데이터 영속성은 PostgreSQL | 사용자, 건강 기록, 보호자 연결, 알림, 복약 일정, 뇌훈련 기록을 관계형 DB에 저장한다. |
| ECG 추론은 별도 FastAPI 서버 | PyTorch 모델 로딩, 전처리, 추론, 후처리를 Python 서버가 담당한다. |
| 운영 배포는 컨테이너 기반 | Docker Compose와 GitHub Actions를 통해 GHCR 이미지 빌드 후 EC2에 배포한다. |
| 논문 재현성 고려 | ECG 모델 구조, 성능 측정 스크립트, Grad-CAM 결과, draw.io 다이어그램을 `thesis/`, `ai/`, `scripts/`에 보관한다. |

---

## 2. 루트 디렉토리 구조

```text
HealthCare/
├─ frontend/
│  └─ carelink-app/                  # React Native + Expo 모바일 앱
│     ├─ app/                         # Expo Router 화면 라우팅
│     ├─ components/                  # 공통 UI 컴포넌트
│     ├─ contexts/                    # 전역 Context
│     ├─ constants/                   # 디자인 토큰, 테마
│     ├─ utils/api.ts                 # JWT 자동 처리 API 클라이언트
│     ├─ assets/                      # 앱 아이콘, 이미지, 아바타
│     ├─ package.json
│     └─ app.json
│
├─ backend/
│  └─ healthcare-server/              # Spring Boot 3 백엔드
│     ├─ src/main/java/com/example/demo/
│     │  ├─ controller/               # REST API 진입점
│     │  ├─ service/                  # 비즈니스 로직
│     │  ├─ repository/               # JPA Repository
│     │  ├─ entity/                   # JPA Entity
│     │  ├─ dto/                      # Request/Response DTO
│     │  ├─ jwt/                      # JWT 발급/검증
│     │  ├─ security/                 # 접근 제어 보조 서비스
│     │  └─ scheduler/                # 뉴스/질병 트렌드 스케줄러
│     ├─ src/main/resources/
│     │  ├─ application.properties
│     │  └─ db/migration/             # Flyway 마이그레이션
│     ├─ build.gradle
│     └─ Dockerfile
│
├─ ai/                                # FastAPI ECG 추론 서버
│  ├─ src/
│  │  ├─ server.py                    # API 서버 + 모델 정의 + 추론 파이프라인
│  │  ├─ train_local.py               # 모델 학습
│  │  ├─ prepare_ptbxl.py             # PTB-XL 준비
│  │  ├─ step1_loader.py              # 데이터 로더
│  │  ├─ step2_preprocess.py          # 전처리
│  │  ├─ run_ablation.py              # ablation 실험
│  │  ├─ run_comparison.py            # 모델 비교
│  │  └─ grad_cam_viz.py              # Grad-CAM 시각화
│  ├─ models/                         # 모델 가중치, 분석 결과
│  ├─ figures/                        # Grad-CAM 결과 이미지
│  ├─ requirements.txt
│  └─ Dockerfile
│
├─ deploy/k8s/                        # Kubernetes 매니페스트
├─ docs/                              # 운영/CI 문서
├─ scripts/                           # 벤치마크, 측정, seed 스크립트
├─ thesis/                            # 논문 본문, 다이어그램, 그림
├─ .github/workflows/deploy.yml       # GitHub Actions 배포 파이프라인
├─ docker-compose.yml                 # 로컬/일반 배포용 Compose
├─ docker-compose.ec2-lite.yml        # EC2 경량 배포용 Compose
├─ ECG_INFERENCE_FLOW.md              # ECG 추론 흐름 상세 문서
└─ README.md
```

---

## 3. 기술 스택 요약

| 영역 | 기술 | 현재 역할 |
|---|---|---|
| Mobile | React Native `0.81.5`, Expo `54`, React `19.1.0` | 환자/보호자 모바일 앱 UI |
| Routing | Expo Router `6.0.23` | 파일 기반 화면 라우팅 |
| State | React Context | 인증 상태, 글자 크기 설정 |
| Local cache | AsyncStorage `2.2.0` | 토큰, 사용자명, 프로필 이미지, 보호자 목록 캐시 |
| Notification | expo-notifications `0.32.16` | 복약 알림 등 로컬 알림 |
| Backend | Spring Boot `3.5.7`, Java `21` | REST API, 인증, 비즈니스 로직 |
| Security | Spring Security, jjwt `0.12.5`, BCrypt | JWT 발급/검증, 비밀번호 해시 |
| Persistence | JPA/Hibernate, Flyway, PostgreSQL `16` | DB 매핑, 마이그레이션 |
| AI API | FastAPI `0.115.5`, Uvicorn | ECG 추론 API |
| AI Runtime | PyTorch `2.5.1`, NumPy, SciPy | CNN-CBAM-GRU 추론, 필터링, 리샘플링 |
| Infra | Docker, Docker Compose, GHCR, EC2 | 이미지 빌드와 운영 배포 |
| Research | PTB-XL, Grad-CAM, 벤치마크 스크립트 | 논문 실험과 성능 측정 |

---

## 4. 프론트엔드 구조

### 4.1 앱 진입 구조

```text
frontend/carelink-app/app/
├─ _layout.tsx
│  └─ FontSizeProvider
│  └─ AuthProvider
│  └─ Stack
│
└─ (tabs)/
   ├─ _layout.tsx
   │  └─ Tabs
   │  └─ AppHeader
   │  └─ 로그인 여부 검사
   │
   ├─ index.tsx                       # Welcome / 초기 화면
   ├─ profile.tsx                     # 사용자 프로필
   │
   ├─ auth/
   │  ├─ login.tsx
   │  ├─ signup.tsx
   │  ├─ find-id.tsx
   │  ├─ forgot-password.tsx
   │  ├─ reset-password.tsx
   │  ├─ data-agreement.tsx
   │  └─ Profile.tsx
   │
   ├─ Home/
   │  ├─ HomePage.tsx
   │  ├─ Vitals.tsx
   │  ├─ Insights.tsx
   │  ├─ ECGSimulatorScreen.tsx
   │  ├─ Medication.tsx
   │  ├─ Caregivers.tsx
   │  ├─ Notification.tsx
   │  ├─ News.tsx
   │  └─ Emergency.tsx
   │
   └─ setting/
      ├─ SettingsScreen.tsx
      └─ BrainTraining.tsx
```

### 4.2 전역 Provider 구조

| 파일 | 역할 |
|---|---|
| `app/_layout.tsx` | 최상위 레이아웃. `FontSizeProvider`, `AuthProvider`, 전역 `Toast`를 감싼다. |
| `contexts/AuthContext.tsx` | 로그아웃, 세션 만료 처리, AsyncStorage 세션 삭제, 루트 화면 이동을 담당한다. |
| `contexts/FontSizeContext.tsx` | 앱 전체 글자 크기 설정을 관리한다. |
| `components/ScaledText.tsx` | 글자 크기 Context를 반영한 텍스트 컴포넌트다. |
| `components/AppHeader.tsx` | 탭 화면 상단 공통 헤더다. |

### 4.3 인증 API 클라이언트

`frontend/carelink-app/utils/api.ts`

```text
authFetch(path, options)
  │
  ├─ AsyncStorage에서 token 조회
  ├─ Authorization: Bearer <token> 헤더 구성
  ├─ API 요청
  │
  ├─ 응답이 401이 아니면 그대로 반환
  │
  └─ 응답이 401이면
      ├─ refreshToken 조회
      ├─ POST /api/auth/refresh 호출
      ├─ 새 token 저장
      ├─ 원 요청 재시도
      └─ refresh 실패 시 세션 삭제 후 루트로 이동
```

### 4.4 홈 화면 Cache-First 전략

`frontend/carelink-app/app/(tabs)/Home/HomePage.tsx`

| 단계 | 처리 |
|---|---|
| 1. 화면 포커스 | `useFocusEffect()`가 실행된다. |
| 2. 로컬 캐시 표시 | `userName`, `profileImageId`, `caregivers:list`를 AsyncStorage에서 먼저 읽는다. |
| 3. 서버 동기화 | `/api/users/{userId}`, `/api/vitals/insights?userId=...&range=7d`를 호출한다. |
| 4. 캐시 갱신 | 서버에서 받은 사용자명과 프로필 이미지를 AsyncStorage에 다시 저장한다. |
| 5. 중복 요청 방지 | `lastFetchRef`로 10초 이내 반복 호출을 막는다. |

이 구조는 네트워크 응답을 기다리기 전에 사용자 이름, 프로필 이미지, 보호자 목록을 즉시 보여준다. 측정 결과 기준 첫 화면 표시 시간은 캐시 읽기 시간에 가까운 수준으로 줄어든다.

### 4.5 ECG 시뮬레이터 화면

`frontend/carelink-app/app/(tabs)/Home/ECGSimulatorScreen.tsx`

| 구성 | 설명 |
|---|---|
| 입력 소스 | `SIM_CLEAN`, `SIM_NOISY`, `SERVER_SAMPLE` |
| 샘플링 | `fs = 500`, `viewSec = 10`, `targetL = 5000` |
| 화면 표시 | 12리드 중 Lead II를 SVG `Polyline`으로 렌더링 |
| 자동 추론 | 실행 중이면 2초마다 `/api/ecg/predict_window` 호출 |
| 서버 샘플 | `SERVER_SAMPLE` 모드에서 `/api/ecg/sample_window` 호출 |
| 결과 표시 | `probs`, `thresholds`, `active_labels`, `risk_level`, `top_label` 표시 |

프론트 화면에도 기본 임계치 `[0.6, 0.45, 0.5, 0.6, 0.7]`가 있으며, 서버 응답의 `thresholds`가 있으면 이를 우선 사용한다.

---

## 5. 백엔드 구조

### 5.1 계층 구조

```text
[Controller]
  REST 요청/응답 처리
      │
      ▼
[Service]
  비즈니스 로직, 트랜잭션, 외부 API 호출
      │
      ▼
[Repository]
  JPA Repository, DB 질의
      │
      ▼
[Entity]
  PostgreSQL 테이블 매핑
```

### 5.2 주요 패키지

| 패키지 | 역할 |
|---|---|
| `com.example.demo.controller` | REST API 엔드포인트 정의 |
| `com.example.demo.service` | 회원가입/로그인, 건강 기록, 보호자 연결, 알림, ECG 프록시 등 핵심 로직 |
| `com.example.demo.repository` | JPA Repository 인터페이스 |
| `com.example.demo.entity` | DB 테이블과 관계 매핑 |
| `com.example.demo.dto` | API 요청/응답 DTO |
| `com.example.demo.jwt` | JWT 생성, 검증, 필터 |
| `com.example.demo.security` | 접근 제어와 로그인 시도 보조 로직 |
| `com.example.demo.scheduler` | 뉴스 자동 수집, 질병 트렌드 알림 스케줄러 |

### 5.3 Controller 엔드포인트

| Controller | Base path | 주요 엔드포인트 |
|---|---|---|
| `AuthController` | `/api/auth` | `POST /login`, `/signup`, `/forgot-password`, `/reset-password`, `/refresh`, `/find-id` |
| `UserController` | `/api/users` | `GET /{userId}`, `PUT /{userId}` |
| `UserHealthController` | `/api/vitals` | `POST /`, `GET /summary`, `GET /insights` |
| `UserDiseaseController` | `/api/user-diseases` | `POST /`, `GET /` |
| `GuardianController` | `/api/guardian` | `POST /connect`, `DELETE /disconnect`, `GET /my-patients/{guardianId}`, `GET /my-guardians/{patientId}` |
| `MedicationController` | `/api/medications` | `GET /{userId}`, `POST /{userId}`, `PUT /{userId}/{medId}`, `DELETE /{userId}/{medId}` |
| `NotificationController` | `/api/notification` | `POST /send`, `GET /{userId}`, `PATCH /{userId}/{alertId}/read` |
| `EcgController` | `/api/ecg` | `POST /predict_window`, `GET /sample_window` |
| `NewsController` | `/api/news` | `POST /refresh`, `GET /` |
| `BrainTrainingController` | `/api/brain-training` | `POST /{userId}`, `GET /{userId}` |
| `NewsAutoCollectorTestController` | `/test/news-auto` | `POST /run`, `GET /trends` |

### 5.4 인증과 보안

`backend/healthcare-server/src/main/java/com/example/demo/SecurityConfig.java`

```text
요청
  │
  ▼
Spring Security Filter Chain
  │
  ├─ CORS 적용
  ├─ CSRF 비활성화
  ├─ SessionCreationPolicy.STATELESS
  ├─ /api/auth/** permitAll
  ├─ /actuator/health permitAll
  └─ 나머지 요청 authenticated
        │
        ▼
JwtAuthFilter
  │
  ├─ Authorization 헤더 검사
  ├─ Bearer token 추출
  ├─ access token 검증
  ├─ refresh token은 인증 토큰으로 사용하지 않음
  └─ SecurityContext에 userId와 role 저장
```

| 파일 | 핵심 내용 |
|---|---|
| `JwtProvider.java` | access token, refresh token 생성. subject는 `userId`, role claim은 `role`에 저장한다. |
| `JwtAuthFilter.java` | 요청의 Bearer token을 검증하고 `SecurityContextHolder`에 인증 정보를 저장한다. |
| `SecurityConfig.java` | stateless 인증, CORS, 인증 예외, BCrypt password encoder를 설정한다. |
| `AuthService.java` | 로그인, 회원가입, refresh, 아이디 찾기, 비밀번호 재설정을 처리한다. |

### 5.5 인증 흐름

```text
[앱 로그인 화면]
   │ POST /api/auth/login { userId, password }
   ▼
[AuthController]
   │
   ▼
[AuthService]
   ├─ userId 조회
   ├─ BCryptPasswordEncoder.matches()
   ├─ access token 생성
   └─ refresh token 생성
   ▼
{ success, message, token, refreshToken, userId }
   │
   ▼
[앱 AsyncStorage]
   ├─ token
   ├─ refreshToken
   └─ userId
```

토큰 만료 시 프론트의 `authFetch()`가 `/api/auth/refresh`를 호출한다. refresh token 검증에 실패하면 로컬 세션을 삭제하고 초기 화면으로 이동한다.

### 5.6 건강 기록 저장 흐름

`backend/healthcare-server/src/main/java/com/example/demo/service/UserHealthService.java`

```text
POST /api/vitals
  │
  ▼
UserHealthService.saveHealthRecord()
  │
  ├─ users에서 사용자 조회
  ├─ user_health_info 요약 row 조회 또는 생성
  ├─ user_health_records에 측정 기록 생성
  │   ├─ 혈압 저장
  │   ├─ 혈당 저장
  │   ├─ 심박수 저장
  │   ├─ ECG risk score 저장
  │   └─ 이상 여부 계산
  │
  ├─ 평균/최근 요약값 갱신
  │   ├─ avgBpSys / avgBpDia
  │   ├─ avgGlucose
  │   ├─ lastBpSys / lastBpDia
  │
  └─ 이상값이면 NotificationService로 알림 발송
```

이상 판단 기준은 현재 코드 기준으로 다음과 같다.

| 항목 | 이상 기준 |
|---|---|
| 고혈압 | 수축기 `>= 140` 또는 이완기 `>= 90` |
| 저혈압 | 수축기 `< 90` 또는 이완기 `< 60` |
| 고혈당 | 혈당 `>= 200` |
| 저혈당 | 혈당 `<= 70` |
| ECG 이상 | `ecgAbnormal == true` |

---

## 6. 데이터베이스 구조

### 6.1 핵심 ER 흐름

```text
users
  │
  ├─ 1:1 user_health_info
  │
  ├─ 1:N user_health_records
  │
  ├─ 1:N user_disease
  │
  ├─ 1:N user_medications
  │       └─ 1:N user_medication_schedules
  │
  ├─ 1:N BrainTrainingGame
  │
  ├─ patient 1:N user_guardian_links N:1 guardian
  │
  ├─ patient 1:N user_health_alert
  │
  └─ receiver 1:N user_health_alert

disease_trend
  └─ 1:N user_health_alert
```

### 6.2 주요 Entity와 테이블

| Entity | 테이블명 | 핵심 필드 | 설명 |
|---|---|---|---|
| `User` | `users` | `userId`, `password`, `name`, `gender`, `birthDate`, `phone`, `address`, `role`, `profileImageId`, `bloodType`, `allergies`, `medicalConditions` | 로그인 계정과 사용자 프로필 |
| `UserHealth` | `user_health_info` | `user`, `avgBpSys`, `avgBpDia`, `avgGlucose`, `lastBpSys`, `lastBpDia` | 현재/요약 건강 상태 |
| `UserHealthRecord` | `user_health_records` | `bpSys`, `bpDia`, `glucose`, `heartRate`, `ecgRiskScore`, `ecgAbnormal`, `overallAbnormal`, `measuredAt` | 개별 측정 기록 |
| `UserDisease` | `user_disease` | `user`, `diseaseName`, `diseaseCode`, `diagnosedAt` | 사용자 질병 진단 기록 |
| `UserGuardianLink` | `user_guardian_links` | `patient`, `guardian`, `relationType`, `contactPhone` | 환자-보호자 연결 |
| `UserMedication` | `user_medications` | `user`, `name`, `dosage`, `memo`, `startDate`, `endDate`, `isActive` | 복약 정보 |
| `UserMedicationSchedule` | `user_medication_schedules` | `medication`, `timeOfDay`, `daysOfWeek`, `timezone` | 복약 시간표 |
| `UserHealthAlert` | `user_health_alert` | `patient`, `receiver`, `alertType`, `title`, `message`, `readAt` | 건강 이상/질병 트렌드/복약 알림 |
| `DiseaseTrend` | `disease_trend` | `diseaseName`, `region`, `riskLevel`, `advisoryType`, `sourceUrl`, `advisoryText` | 질병 트렌드와 외부 뉴스/권고 정보 |
| `BrainTrainingGame` | `BrainTrainingGame` | `user`, `score`, `createdAt` | 뇌훈련 게임 기록 |

### 6.3 Flyway 마이그레이션

```text
backend/healthcare-server/src/main/resources/db/migration/
├─ V1__add_contact_phone_to_guardian_link.sql
└─ V2__add_missing_user_columns.sql
```

| 파일 | 변경 내용 |
|---|---|
| `V1__add_contact_phone_to_guardian_link.sql` | `user_guardian_links.contact_phone` 추가 |
| `V2__add_missing_user_columns.sql` | `users.blood_type`, `users.allergies`, `users.medical_conditions` 추가 |

운영 설정은 `spring.jpa.hibernate.ddl-auto=none`이다. 배포 후 DB 구조 변경은 기존 마이그레이션 수정이 아니라 새 버전 파일 추가로 처리해야 한다.

---

## 7. ECG AI 서버 구조

### 7.1 FastAPI 엔드포인트

`ai/src/server.py`

| 엔드포인트 | 메서드 | 인증 | 설명 |
|---|---|---|---|
| `/health` | `GET` | 없음 | 서버 상태와 모델 로딩 여부 반환 |
| `/sample_window` | `GET` | `X-API-Key` | 지정 label 또는 랜덤 label의 12-lead 샘플 반환 |
| `/predict_window` | `POST` | `X-API-Key` | 12-lead ECG window를 CNN-CBAM-GRU 모델로 추론 |

### 7.2 AI 서버 환경 변수

| 변수 | 기본값/예시 | 역할 |
|---|---|---|
| `MODEL_PATH` | `ai/models/best_model_multilabel.pth` | PyTorch 모델 가중치 경로 |
| `SAMPLE_DIR` | `ai/samples` | `/sample_window`에서 사용할 `.npy` 샘플 위치 |
| `AI_API_KEY` | 빈 값 | 설정 시 `X-API-Key` 검증 강제 |
| `ALLOWED_ORIGINS` | `http://localhost:8080,http://localhost:8081` | FastAPI CORS 허용 출처 |
| `THRESHOLDS` | `0.6,0.45,0.5,0.6,0.7` | 클래스별 활성 레이블 임계치 override |

### 7.3 ECG 입력 스펙

| 항목 | 값 |
|---|---|
| 입력 shape | `(12, 5000)` 또는 `(5000, 12)` |
| 리드 수 | 12 leads |
| 길이 | 5000 samples |
| 샘플링 레이트 | 500Hz |
| 시간 길이 | 10초 |
| 단위 | mV 기준 신호 |
| 출력 클래스 | `NORM`, `STTC`, `MI`, `CD`, `HYP` |
| 태스크 | 5-class multilabel classification |

### 7.4 ECG 전처리 파이프라인

```text
POST /predict_window
  │
  ▼
validate_request_matrix()
  ├─ 빈 배열 검사
  ├─ 2D 배열 검사
  ├─ jagged array 검사
  ├─ 숫자형 검사
  └─ NaN / Inf 검사
  │
  ▼
to_12xL()
  ├─ (12, L)이면 그대로 사용
  └─ (L, 12)이면 transpose
  │
  ▼
resample_12lead()
  └─ fs가 500Hz가 아니면 scipy.resample_poly 적용
  │
  ▼
ensure_len_12xL()
  ├─ 5000 초과: 뒤쪽 5000 샘플 사용
  └─ 5000 미만: 0 padding
  │
  ▼
Preprocessor.bandpass()
  └─ Butterworth 2차 0.5~45Hz filtfilt
  │
  ▼
compute_amp_feats()
  └─ lead별 ptp, std, rms 추출 → 36차원
  │
  ▼
Preprocessor.normalize()
  └─ lead별 z-score 정규화
  │
  ▼
torch tensor 변환
  ├─ ECG: (1, 12, 5000)
  └─ amp: (1, 36)
```

---

## 8. CNN-CBAM-GRU 모델 구조

### 8.1 모델 개요

| 항목 | 내용 |
|---|---|
| 모델명 | `CNN_CBAM_GRU` |
| 입력 | 12-lead ECG window `(batch, 12, 5000)` |
| 보조 입력 | 진폭 특징 `(batch, 36)` |
| CNN 채널 | `12 → 32 → 32` |
| Attention | CBAM 1D |
| Sequence model | BiGRU, hidden `64`, layers `2`, dropout `0.5` |
| Feature fusion | GRU pooled vector `128` + amp feature `36` = `164` |
| Classifier | `Linear(164, 128)` → ReLU → Dropout → `Linear(128, 5)` |
| 출력 | 클래스별 logits `(batch, 5)` |
| 후처리 | sigmoid → multilabel probabilities |

### 8.2 Forward 경로

```text
입력 ECG x: (1, 12, 5000)
입력 amp:   (1, 36)
   │
   ▼
ConvBlock 1
  Conv1d(12 → 32, kernel=3, padding=1)
  BatchNorm1d(32)
  ReLU
  MaxPool1d(2)
  CBAM(32)
   │
   ▼
(1, 32, 2500)
   │
   ▼
ConvBlock 2
  Conv1d(32 → 32, kernel=3, padding=1)
  BatchNorm1d(32)
  ReLU
  MaxPool1d(2)
  CBAM(32)
   │
   ▼
(1, 32, 1250)
   │
   ▼
permute
(1, 1250, 32)
   │
   ▼
BiGRU
  input_size=32
  hidden_size=64
  num_layers=2
  bidirectional=True
  dropout=0.5
   │
   ▼
(1, 1250, 128)
   │
   ▼
time mean pooling
(1, 128)
   │
   ▼
concat amp feature
(1, 128 + 36) = (1, 164)
   │
   ▼
FC classifier
  Linear(164 → 128)
  ReLU
  Dropout(0.5)
  Linear(128 → 5)
   │
   ▼
logits: (1, 5)
```

### 8.3 CBAM 1D 구조

```text
입력 feature map x: (B, C, T)
   │
   ├─ Channel Attention
   │   ├─ AdaptiveAvgPool1d(1)
   │   ├─ AdaptiveMaxPool1d(1)
   │   ├─ shared Conv1d MLP
   │   └─ Sigmoid
   │
   └─ Spatial Attention
       ├─ channel mean
       ├─ channel max
       ├─ concat
       ├─ Conv1d(2 → 1, kernel=7)
       └─ Sigmoid
```

CBAM 적용 순서는 다음과 같다.

```python
x_ca = x * ChannelAttention(x)
x_out = x_ca * SpatialAttention(x_ca)
```

ECG에서는 리드와 시간축 모두 중요하다. Channel Attention은 어떤 feature channel이 중요한지 조절하고, Spatial Attention은 시간축의 어느 구간이 중요한지 강조한다.

### 8.4 클래스와 의미

| 코드 | 의미 | 설명 |
|---|---|---|
| `NORM` | Normal | 정상 심전도 |
| `STTC` | ST/T Change | ST-T 변화 |
| `MI` | Myocardial Infarction | 심근경색 |
| `CD` | Conduction Disturbance | 전도 장애 |
| `HYP` | Hypertrophy | 심비대 |

### 8.5 출력 후처리

```text
logits
  │
  ▼
sigmoid(logits)
  │
  ▼
probs = [p_NORM, p_STTC, p_MI, p_CD, p_HYP]
  │
  ├─ active_labels
  │   └─ probs[i] >= thresholds[i]
  │
  ├─ risk_level
  │   ├─ max(abnormal probs) >= 0.8 → high
  │   ├─ max(abnormal probs) >= 0.6 → medium
  │   └─ otherwise → low
  │
  └─ top_label / top_confidence
      └─ argmax(probs)
```

기본 thresholds:

```python
THRESHOLDS = [0.6, 0.45, 0.5, 0.6, 0.7]
LABELS = ["NORM", "STTC", "MI", "CD", "HYP"]
```

응답 예시:

```json
{
  "probs": [0.12, 0.08, 0.91, 0.31, 0.05],
  "thresholds": [0.6, 0.45, 0.5, 0.6, 0.7],
  "active_labels": ["MI"],
  "risk_level": "high",
  "top_label": "MI",
  "top_confidence": 0.91
}
```

---

## 9. 주요 서비스 흐름

### 9.1 로그인과 세션 유지

```text
[Login Screen]
   │ POST /api/auth/login
   ▼
[Spring AuthController]
   │
   ▼
[AuthService]
   ├─ userId 조회
   ├─ BCrypt 비밀번호 검증
   ├─ access token 생성
   └─ refresh token 생성
   ▼
[Mobile AsyncStorage]
   ├─ token
   ├─ refreshToken
   └─ userId
   │
   ▼
[authFetch()]
   ├─ 매 요청 Authorization 헤더 첨부
   └─ 401 발생 시 refresh 후 재시도
```

### 9.2 홈 화면 로딩

```text
[HomePage focus]
   │
   ├─ AsyncStorage 캐시 읽기
   │  ├─ userName
   │  ├─ profileImageId
   │  └─ caregivers:list
   │
   ├─ 캐시값으로 즉시 화면 표시
   │
   └─ 서버 동기화
      ├─ GET /api/users/{userId}
      └─ GET /api/vitals/insights?userId={userId}&range=7d
```

### 9.3 ECG 추론

```text
[ECGSimulatorScreen]
   │
   ├─ SIM_CLEAN / SIM_NOISY
   │   └─ 앱 내부 synthetic ECG 생성
   │
   └─ SERVER_SAMPLE
       └─ GET /api/ecg/sample_window
              │
              ▼
        [Spring EcgController]
              │ X-API-Key
              ▼
        [FastAPI /sample_window]
              │
              ▼
        12-lead ECG sample

사용자 또는 자동 루프
   │ POST /api/ecg/predict_window { x, fs }
   ▼
[Spring EcgAnalysisService]
   │ baseUrl + /predict_window
   │ connect timeout 5s
   │ read timeout 30s
   ▼
[FastAPI /predict_window]
   │ 전처리
   │ CNN-CBAM-GRU 추론
   │ 후처리
   ▼
{ probs, thresholds, active_labels, risk_level, top_label, top_confidence }
```

### 9.4 건강 이상 알림

```text
POST /api/vitals
  │
  ▼
UserHealthService.saveHealthRecord()
  │
  ├─ 혈압/혈당/ECG 이상 여부 계산
  ├─ user_health_records 저장
  ├─ user_health_info 요약 갱신
  └─ 이상값이면 NotificationService 호출
       │
       ▼
  user_health_alert 저장
       │
       ▼
  보호자/수신자 화면에서 알림 조회
```

### 9.5 보호자 연결

```text
[환자 또는 보호자]
   │ POST /api/guardian/connect
   ▼
[GuardianController]
   │
   ▼
[GuardianService]
   ├─ patient 조회
   ├─ guardian 조회
   ├─ 중복 연결 검사
   └─ user_guardian_links 저장
```

### 9.6 복약 관리

```text
[Medication Screen]
   │
   ├─ GET /api/medications/{userId}
   ├─ POST /api/medications/{userId}
   ├─ PUT /api/medications/{userId}/{medId}
   └─ DELETE /api/medications/{userId}/{medId}
      │
      ▼
[MedicationController]
      │
      ▼
[MedicationRepository]
      │
      ├─ user_medications
      └─ user_medication_schedules
```

앱 측에서는 `expo-notifications`를 이용해 로컬 복약 알림을 구성한다.

---

## 10. 배포와 운영 구조

### 10.1 Docker Compose 구성

`docker-compose.yml`

```text
db
  image: postgres:16-alpine
  port: 5432
  volume: postgres_data

backend
  image: ghcr.io/zzooonn/carelink/carelink-backend:latest
  port: 8080
  depends_on: db healthy
  AI_ECG_SERVER_URL: http://ai:8000

ai
  image: ghcr.io/zzooonn/carelink/carelink-ai:latest
  port: 8000
  volumes:
    ./ai/models:/app/models
    ./ai/data:/app/data
    ./ai/samples:/app/samples
```

서비스 간 내부 통신은 Compose 네트워크의 서비스명으로 처리한다.

```text
backend → http://ai:8000
backend → jdbc:postgresql://db:5432/healthcare
```

### 10.2 EC2 경량 Compose

`docker-compose.ec2-lite.yml`

| 서비스 | 메모리 제한 | 특징 |
|---|---:|---|
| `postgres` | `256m` | PostgreSQL shared_buffers, work_mem 등을 낮게 설정 |
| `backend` | `384m` | `JAVA_TOOL_OPTIONS`로 JVM 메모리 비율과 SerialGC 지정 |
| `ai` | `512m` | `profiles: ["ai"]`로 필요 시 선택 실행 |

### 10.3 GitHub Actions 배포 흐름

`.github/workflows/deploy.yml`

```text
push to main
  │
  ├─ 변경 경로 감지
  │   ├─ backend/healthcare-server/**
  │   ├─ ai/**
  │   ├─ docker-compose.yml
  │   └─ .github/workflows/deploy.yml
  │
  ├─ backend 변경 시
  │   └─ Docker build → GHCR push
  │
  ├─ ai 변경 시
  │   └─ Docker build → GHCR push
  │
  └─ deploy job
      ├─ docker-compose.yml을 EC2로 복사
      ├─ EC2에서 .env 생성
      ├─ GHCR login
      ├─ 변경된 서비스만 pull
      ├─ docker-compose up -d --no-deps
      └─ docker image prune -f
```

### 10.4 Kubernetes 매니페스트

```text
deploy/k8s/
├─ namespace.yaml
├─ postgres.yaml
├─ backend.yaml
├─ ai.yaml
├─ secret.example.yaml
└─ README.md
```

Kubernetes 구성은 컨테이너화된 배포를 다른 런타임으로 확장하기 위한 매니페스트다. 현재 운영 기준은 EC2와 Docker Compose가 중심이다.

---

## 11. 환경 변수 정리

### 11.1 Backend

| 변수 | 역할 |
|---|---|
| `SPRING_DATASOURCE_URL` | PostgreSQL JDBC URL |
| `SPRING_DATASOURCE_USERNAME` | DB 사용자 |
| `SPRING_DATASOURCE_PASSWORD` | DB 비밀번호 |
| `JWT_SECRET` | Base64 인코딩된 JWT 서명 키 |
| `JWT_EXPIRATION` | access token 만료 시간(ms) |
| `JWT_REFRESH_EXPIRATION` | refresh token 만료 시간(ms) |
| `PASSWORD_RESET_TOKEN_EXPIRATION_MS` | 비밀번호 재설정 토큰 TTL |
| `NEWS_API_KEY` | 뉴스 API 키 |
| `AI_ECG_SERVER_URL` | FastAPI AI 서버 주소 |
| `AI_ECG_API_KEY` | AI 서버 `X-API-Key` |
| `AI_ECG_CONNECT_TIMEOUT_MS` | AI 연결 타임아웃 |
| `AI_ECG_READ_TIMEOUT_MS` | AI 응답 대기 타임아웃 |
| `CORS_ALLOWED_ORIGINS` | 백엔드 CORS 허용 출처 |

### 11.2 Frontend

| 변수 | 역할 |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Spring Boot 백엔드 주소 |
| `EXPO_PUBLIC_AI_API_BASE_URL` | 현재 구조에서는 백엔드 프록시 주소를 사용하면 된다. |

### 11.3 AI Server

| 변수 | 역할 |
|---|---|
| `MODEL_PATH` | 모델 가중치 파일 |
| `SAMPLE_DIR` | ECG 샘플 `.npy` 디렉토리 |
| `AI_API_KEY` | AI 서버 API 키 |
| `ALLOWED_ORIGINS` | AI 서버 CORS 허용 출처 |
| `THRESHOLDS` | ECG 클래스별 임계치 |

---

## 12. 성능 지표 요약

실측 파일:

```text
benchmark_results.json
carelink_measured_metrics.json
```

### 12.1 백엔드 API

| 항목 | 평균 | p95 | 비고 |
|---|---:|---:|---|
| user profile | 약 `300ms` | 약 `321ms` | `/api/users/{userId}` |
| vitals insights 7d | 약 `299ms` | 약 `317ms` | `/api/vitals/insights` |
| notifications | 약 `300ms` | 약 `318ms` | `/api/notification/{userId}` |

### 12.2 ECG 추론

| 항목 | 값 |
|---|---:|
| 측정 요청 수 | `100` |
| 성공률 | `100%` |
| 평균 지연 | 약 `2396.58ms` |
| p50 | 약 `2336.01ms` |
| p95 | 약 `2725.98ms` |
| 최소 | 약 `2209.69ms` |
| 최대 | 약 `3462.95ms` |

### 12.3 모바일 Home Cache-First

| 항목 | 평균 | p95 |
|---|---:|---:|
| 캐시 읽기 | `0.29ms` | `0.46ms` |
| 네트워크 동기화 | `603.97ms` | `636.08ms` |
| 체감 첫 표시 | `0.29ms` | `0.46ms` |
| 개선율 | `99.95%` | - |

---

## 13. 주요 파일 역할

### 13.1 Frontend

| 파일 | 역할 |
|---|---|
| `frontend/carelink-app/app/_layout.tsx` | 최상위 Provider와 Stack 구성 |
| `frontend/carelink-app/app/(tabs)/_layout.tsx` | 탭 네비게이션, 로그인 보호, 공통 헤더 |
| `frontend/carelink-app/utils/api.ts` | `authFetch()` JWT 자동 첨부와 refresh 처리 |
| `frontend/carelink-app/contexts/AuthContext.tsx` | 로그아웃과 세션 만료 처리 |
| `frontend/carelink-app/app/(tabs)/Home/HomePage.tsx` | 캐시 우선 홈 대시보드 |
| `frontend/carelink-app/app/(tabs)/Home/ECGSimulatorScreen.tsx` | ECG 시뮬레이션과 추론 화면 |
| `frontend/carelink-app/app/(tabs)/Home/Vitals.tsx` | 건강 지표 입력/조회 |
| `frontend/carelink-app/app/(tabs)/Home/Medication.tsx` | 복약 관리 |
| `frontend/carelink-app/app/(tabs)/Home/Caregivers.tsx` | 보호자 연결 |
| `frontend/carelink-app/app/(tabs)/Home/Notification.tsx` | 알림 조회 |

### 13.2 Backend

| 파일 | 역할 |
|---|---|
| `backend/healthcare-server/src/main/resources/application.properties` | 서버 포트, DB, JWT, CORS, AI 서버 설정 |
| `backend/healthcare-server/src/main/java/com/example/demo/SecurityConfig.java` | Spring Security 설정 |
| `backend/healthcare-server/src/main/java/com/example/demo/jwt/JwtProvider.java` | JWT 생성/검증 |
| `backend/healthcare-server/src/main/java/com/example/demo/jwt/JwtAuthFilter.java` | Bearer token 인증 필터 |
| `backend/healthcare-server/src/main/java/com/example/demo/service/AuthService.java` | 로그인, 회원가입, refresh, 비밀번호 재설정 |
| `backend/healthcare-server/src/main/java/com/example/demo/service/UserHealthService.java` | 건강 기록 저장, 요약 갱신, 이상 알림 |
| `backend/healthcare-server/src/main/java/com/example/demo/service/EcgAnalysisService.java` | FastAPI ECG 서버 프록시 |
| `backend/healthcare-server/src/main/java/com/example/demo/controller/EcgController.java` | `/api/ecg` 엔드포인트 |
| `backend/healthcare-server/src/main/java/com/example/demo/entity/User.java` | 사용자 Entity |
| `backend/healthcare-server/src/main/java/com/example/demo/entity/UserHealthRecord.java` | 건강 측정 기록 Entity |

### 13.3 AI

| 파일 | 역할 |
|---|---|
| `ai/src/server.py` | FastAPI 앱, 모델 정의, 전처리, 추론 API |
| `ai/src/train_local.py` | ECG 모델 학습 |
| `ai/src/prepare_ptbxl.py` | PTB-XL 데이터 준비 |
| `ai/src/step1_loader.py` | 원천 데이터 로딩 |
| `ai/src/step2_preprocess.py` | 데이터 전처리 |
| `ai/src/run_ablation.py` | ablation 실험 |
| `ai/src/run_comparison.py` | 비교 모델 실험 |
| `ai/src/grad_cam_viz.py` | Grad-CAM 시각화 |
| `ai/models/best_model_multilabel.pth` | 운영 추론용 모델 가중치 |
| `ai/samples/{LABEL}.npy` | `/sample_window`용 클래스별 샘플 |

### 13.4 Thesis / Docs / Scripts

| 경로 | 역할 |
|---|---|
| `thesis/diagrams/fig3_1_system_architecture.drawio` | 전체 시스템 아키텍처 다이어그램 |
| `thesis/diagrams/fig3_4_er_diagram.drawio` | ER 다이어그램 |
| `thesis/diagrams/fig4_2_jwt_auth_flow.drawio` | JWT 인증 흐름 |
| `thesis/diagrams/fig4_3_cnn_cbam_gru_model.drawio` | ECG 모델 아키텍처 |
| `thesis/diagrams/fig4_4_ecg_sequence.drawio` | ECG 추론 시퀀스 |
| `thesis/figures/` | 논문용 Grad-CAM 이미지 |
| `scripts/benchmark_api.py` | API 부하 테스트 |
| `scripts/measure_carelink_metrics.py` | 실제 사용 흐름 기반 측정 |
| `scripts/generate_thesis_charts.py` | 논문 차트 생성 |

---

## 14. 개발 실행 순서

### 14.1 전체 서비스

```bash
docker compose up --build
```

기본 접속 주소:

| 서비스 | 주소 |
|---|---|
| Backend | `http://localhost:8080` |
| AI Server | `http://localhost:8000` |
| PostgreSQL | `localhost:5432` |

### 14.2 프론트엔드

```bash
cd frontend/carelink-app
npm install
npm run start
```

### 14.3 백엔드

```bash
cd backend/healthcare-server
./gradlew bootRun
```

Windows:

```bash
cd backend/healthcare-server
gradlew.bat bootRun
```

### 14.4 AI 서버

```bash
cd ai
python src/server.py
```

AI 서버 실행 전 `ai/models/best_model_multilabel.pth`가 존재해야 한다. Docker 실행 시에는 `./ai/models:/app/models` 볼륨으로 모델 파일을 컨테이너에 전달한다.

---

## 15. 운영 시 주의사항

| 항목 | 주의 내용 |
|---|---|
| Flyway | 배포 후 기존 migration 파일 수정 금지. 새 버전 파일만 추가한다. |
| DB 스키마 | `ddl-auto=none`이므로 Entity 변경만으로 테이블이 자동 변경되지 않는다. |
| JWT | `JWT_SECRET`은 Base64 디코딩 가능한 충분한 길이의 비밀키여야 한다. |
| AI 모델 파일 | `best_model_multilabel.pth`는 gitignore 대상이므로 운영 서버에 별도 배치해야 한다. |
| API Key | 운영에서는 `AI_ECG_API_KEY`와 AI 서버의 `AI_API_KEY`를 동일하게 맞춘다. |
| CORS | 프론트 주소, Expo 주소, 백엔드 주소를 환경변수로 명시한다. `*` 사용은 피한다. |
| EC2 SSH 키 | `carelink-key.pem` 같은 SSH 키는 절대 커밋하지 않는다. |
| ECG latency | CPU 환경에서는 BiGRU 추론과 필터링이 지연의 주요 원인이다. |
| 프론트 실험 기능 | `newArchEnabled: true`, `reactCompiler: true`가 켜져 있다. Expo/React Native 업그레이드 시 호환성 확인이 필요하다. |

---

## 16. 구조 요약

CareLink의 구조는 다음 한 문장으로 정리할 수 있다.

```text
React Native 앱이 JWT 기반으로 Spring Boot 백엔드에 접근하고,
Spring Boot는 PostgreSQL에 의료 데이터를 저장하며,
ECG 추론 요청만 FastAPI AI 서버로 프록시해 CNN-CBAM-GRU 모델 결과를 반환한다.
```

이 구조는 일반 헬스케어 기능과 AI 추론 기능을 분리한다. 백엔드는 인증, 권한, 데이터 무결성, 알림, 보호자 관계를 담당하고, AI 서버는 ECG 신호 전처리와 모델 추론에 집중한다. 모바일 앱은 Cache-First 전략과 Expo Router 기반 화면 구조를 통해 빠른 체감 응답성과 명확한 기능 분리를 제공한다.

---

## 17. 실제 코드 대조 감사 및 누락 보강

### 17.1 최종 판정

2026-06-06 기준으로 실제 저장소를 프론트엔드, 백엔드, AI 서버 서브 에이전트와 함께 나누어 대조했다. 결론은 다음과 같다.

| 항목 | 판정 |
|---|---|
| 전체 3계층 구조 | 일치한다. React Native/Expo 앱, Spring Boot 백엔드, PostgreSQL, FastAPI AI 서버 분리는 실제 코드와 맞다. |
| 주요 버전 | 대부분 일치한다. Expo `54.0.33`, React Native `0.81.5`, React `19.1.0`, Spring Boot `3.5.7`, Java `21`, FastAPI `0.115.5`, PyTorch `2.5.1`이 실제 파일과 맞다. |
| 프론트 라우팅 | 큰 화면 목록은 맞지만 루트 Welcome, 중첩 Stack layout, profile alias가 빠져 있었다. |
| 백엔드 API 표 | 컨트롤러 엔드포인트 표는 대체로 일치한다. 다만 권한 조건, CORS 메서드, 프록시 실패 처리, 복약 입력 제약은 문서보다 실제 코드가 더 구체적이다. |
| DB/마이그레이션 | Entity 기준 테이블 설명은 대체로 맞지만, 현재 Flyway만으로 빈 DB 초기 스키마를 만들 수 없다는 중요한 제약이 빠져 있었다. |
| AI 서버/모델 | 운영 추론 모델 설명은 `server.py`와 대체로 일치한다. 다만 샘플 fallback, 모델 파일 부재, 연구용 동명 모델과의 차이가 빠져 있었다. |
| 배포 구조 | GHCR 이미지 기반 EC2 Compose 배포는 맞다. 단 `docker compose up --build`가 현재 `image:` 기반 Compose에서 로컬 이미지를 새로 빌드하지 않는다는 차이를 적어야 한다. |

따라서 이 문서는 **전체 아키텍처 설명으로는 거의 맞지만, 실제 파일 구조와 운영 로직까지 완벽히 동일한 1:1 문서라고 보기는 어렵다.** 아래 항목들이 실제 코드 기준 보강 사항이다.

### 17.2 실제 루트 구조 보강

기존 루트 구조 표에는 핵심 개발 디렉토리가 잘 정리되어 있지만, 실제 저장소에는 다음 항목도 존재한다.

| 경로 | 실제 역할 |
|---|---|
| `.github/workflows/deploy.yml` | main push 시 backend/AI 이미지를 GHCR에 빌드하고 EC2에 배포한다. |
| `.dvc/`, `.dvcignore` | 데이터/모델 산출물 추적을 위한 DVC 흔적이다. 현재 문서 본문에는 언급이 없다. |
| `.expo/`, `frontend/.expo/` | Expo 실행 중 생성되는 로컬 상태 디렉토리다. 커밋 대상으로 보기 어렵다. |
| `.gradle/` | Gradle 캐시/로컬 상태 디렉토리다. |
| `.idea/`, `.vs/`, `.claude/` | IDE/도구 로컬 설정 디렉토리다. |
| `thesis_charts/` | 논문용 차트 PNG 산출물이다. `fig1_model_comparison.png`, `fig5_api_latency.png` 등이 있다. |
| `docs/superpowers/specs/` | ECG AI generative visualization 설계 문서가 있다. |
| `DEPLOYMENT_DOCKER_K8S.md` | Docker/Kubernetes 배포 설명 문서다. |
| `Docker+AWS.md` | AWS/EC2/Docker 운영 참고 문서다. |
| `AGENTS.md`, `CLAUDE.md` | 에이전트/도구용 프로젝트 안내 문서다. |
| `carelink-key.pem` | EC2 SSH 키 파일이다. 절대 커밋하면 안 된다. |
| `ngrok.exe` | 로컬 터널링 실행 파일이다. |

정확한 문서화를 위해 루트 구조는 “핵심 소스 구조”와 “로컬/운영 보조 파일”을 분리해 읽어야 한다.

### 17.3 프론트엔드 실제 구조 보강

#### 실제 라우팅

```text
frontend/carelink-app/app/
├─ _layout.tsx                       # FontSizeProvider -> AuthProvider -> Stack -> Toast
├─ index.tsx                         # 루트 WelcomeScreen
└─ (tabs)/
   ├─ _layout.tsx                    # Home/profile/setting 탭, index/auth 숨김
   ├─ index.tsx                      # 탭 내부 WelcomeScreen
   ├─ profile.tsx                    # auth/Profile.tsx re-export alias
   ├─ Home/
   │  ├─ _layout.tsx                 # Home 내부 Stack, initialRouteName=HomePage
   │  ├─ HomePage.tsx
   │  ├─ Vitals.tsx
   │  ├─ Insights.tsx
   │  ├─ ECGSimulatorScreen.tsx
   │  ├─ Medication.tsx
   │  ├─ Caregivers.tsx
   │  ├─ Notification.tsx
   │  ├─ News.tsx
   │  └─ Emergency.tsx
   ├─ auth/
   │  ├─ _layout.tsx                 # 인증 화면 내부 Stack
   │  ├─ login.tsx
   │  ├─ signup.tsx
   │  ├─ find-id.tsx
   │  ├─ forgot-password.tsx
   │  ├─ reset-password.tsx
   │  ├─ data-agreement.tsx
   │  └─ Profile.tsx
   └─ setting/
      ├─ _layout.tsx
      ├─ SettingsScreen.tsx
      └─ BrainTraining.tsx
```

`(tabs)/_layout.tsx`는 `AsyncStorage`의 `userId`, `token`을 확인한다. `auth`와 `index` 화면은 인증 검사를 건너뛰고, 나머지 탭/스택 화면에서 세션이 없으면 루트로 redirect한다.

#### 프론트 API 호출 구분

| 구분 | 실제 구현 |
|---|---|
| 보호 API | `utils/api.ts`의 `authFetch()`가 `EXPO_PUBLIC_API_BASE_URL + path`로 호출하고 `Authorization: Bearer <token>`을 붙인다. |
| token refresh | 401이면 `/api/auth/refresh`를 호출해 새 token을 저장하고 원 요청을 한 번 재시도한다. |
| refresh 실패 | `token`, `refreshToken`, `userId`만 삭제하고 루트로 이동한다. |
| 명시적 로그아웃 | `AuthContext.signOut()`은 `userId`, `token`, `refreshToken`, `userName`, `profileImageId`, `caregivers:list`까지 삭제한다. |
| 공개 인증 API | 로그인, 회원가입, 아이디 찾기, 비밀번호 확인/재설정은 각 화면에서 native `fetch()`를 직접 사용한다. |
| AI API | 프론트는 AI 서버를 직접 호출하지 않는다. `ECGSimulatorScreen.tsx`의 `aiFetch()`도 `/api/ecg/...` 백엔드 프록시를 `authFetch()`로 호출한다. |
| 미사용 환경 변수 | `EXPO_PUBLIC_AI_API_BASE_URL`은 문서에 있지만 현재 프론트 코드에서는 실질적으로 사용되지 않는다. |

#### 앱 설정

`app.json`의 실제 설정 중 문서에 추가로 남겨야 할 값은 다음과 같다.

| 설정 | 값 |
|---|---|
| `scheme` | `carelinkapp` |
| `web.output` | `static` |
| `ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads` | `true` |
| `android.edgeToEdgeEnabled` | `true` |
| `android.predictiveBackGestureEnabled` | `false` |
| `experiments.typedRoutes` | `true` |
| `experiments.reactCompiler` | `true` |

`tsconfig.json`은 `strict: true`, path alias `@/*`, `.expo/types/**/*.ts`, `expo-env.d.ts` include를 사용한다.

#### 화면별 실제 로직

| 화면 | 실제 로직 보강 |
|---|---|
| `HomePage.tsx` | `userName`, `profileImageId`, `caregivers:list`를 먼저 표시한다. 다만 `caregivers:list`는 홈에서 서버 동기화하지 않고 로컬 avatar 요약만 보여준다. 보호자 서버 동기화는 `Caregivers.tsx`가 담당한다. |
| `Vitals.tsx` | 혈압/혈당을 클라이언트에서 1차 판정하고 `POST /api/vitals`로 저장한다. |
| `Insights.tsx` | `range=7d`, `30d`, `365d` 선택에 따라 `/api/vitals/insights`를 조회한다. |
| `ECGSimulatorScreen.tsx` | `SIM_CLEAN`, `SIM_NOISY`, `SERVER_SAMPLE`을 지원한다. 실행 중 2초마다 `/api/ecg/predict_window`를 호출하고, 서버 샘플 모드에서는 6초마다 새 샘플을 자동 로드한다. 서버 응답의 `probs`와 `thresholds`를 기준으로 클라이언트에서 active labels, risk, top1을 다시 계산해 화면에 표시한다. |
| `Medication.tsx` | 서버 복약 CRUD와 `expo-notifications` 로컬 알림 예약/취소를 함께 수행한다. 알림은 매일 반복 트리거를 사용한다. |
| `News.tsx` | `POST /api/news/refresh` 후 `GET /api/news?userId=...&limit=5`를 호출하고, 검색/새로고침/외부 링크 열기를 처리한다. |
| `BrainTraining.tsx` | 카드 매칭 게임을 제공하고 점수는 `100 - moves`로 계산한다. `GET/POST /api/brain-training/{userId}`와 최근 점수 SVG trend chart가 있다. |
| `Emergency.tsx` | `caregivers:list` 캐시와 `/api/users/{userId}`의 `bloodType`, `allergies`, `medicalConditions`를 결합하고 `tel:119` 및 보호자 전화 연결을 제공한다. |
| 공통 UI | `WelcomeScreen`, `Toast`, `ScaledText`, `AppHeader`, `constants/design.ts`, `constants/theme.ts`가 실제 UI 일관성에 중요하다. |

일부 TypeScript 파일의 한국어 주석은 현재 터미널/파일 인코딩 기준에서 깨져 보이는 부분이 있다. 로직 자체와 별개로 유지보수성을 위해 주석 정리가 필요하다.

### 17.4 백엔드 실제 구조 보강

#### 설정 및 루트 클래스

| 항목 | 실제 상태 |
|---|---|
| Gradle 프로젝트명 | `settings.gradle` 기준 `demo` |
| Spring application name | `application.properties` 기준 `demo` |
| Java/Spring | Java toolchain `21`, Spring Boot `3.5.7` |
| 주요 의존성 | Web, Security, Validation, Data JPA, Flyway, PostgreSQL, Actuator, jjwt `0.12.5`, Lombok |
| 운영 JPA 설정 | `ddl-auto=none`, `open-in-view=false` |
| Actuator | `/actuator/health`만 노출 |
| 루트 보조 클래스 | `SecurityConfig.java`, `GlobalExceptionHandler.java`, `RequestLoggingFilter.java`, `DemoApplication.java` |
| 스케줄링 | `DemoApplication`에 `@EnableScheduling` 적용 |

문서에서 “CareLink 백엔드”로 설명하지만, 실제 Gradle/Spring 식별자는 아직 `demo`로 남아 있다.

#### 보안/JWT 실제 흐름

```text
POST /api/auth/login
  │
  ├─ AuthController
  │  ├─ LoginAttemptService.checkBlocked("login:{userId}")
  │  ├─ AuthService.login()
  │  ├─ 성공: recordSuccess()
  │  └─ 실패: recordFailure()
  │
  ├─ AuthService
  │  ├─ userId 조회
  │  ├─ BCrypt password 검증
  │  ├─ access token 생성: subject=userId, role claim 포함
  │  └─ refresh token 생성: subject=userId, type=refresh claim 포함
  │
  └─ LoginResponse { success, message, token, userId, refreshToken }
```

| 보안 요소 | 실제 구현 |
|---|---|
| 로그인 실패 제한 | `LoginAttemptService`가 15분 윈도우 내 5회 실패 시 429를 반환한다. 로그인과 비밀번호 찾기 신원 확인에 적용된다. |
| Access token | `role` claim을 포함한다. |
| Refresh token | `type=refresh` claim으로 구분한다. |
| JWT 필터 | refresh token은 인증 토큰으로 거부한다. 인증 성공 시 `ROLE_USER`와 실제 역할 권한을 함께 등록한다. |
| Password reset token | DB가 아니라 `PasswordResetTokenService`의 인메모리 `ConcurrentHashMap`에 저장된다. 기본 TTL은 `PASSWORD_RESET_TOKEN_EXPIRATION_MS`다. |
| 접근 제어 | `AccessControlService`가 본인, 연결 보호자, 보호자 역할 여부를 검사한다. |
| CORS 주의 | `SecurityConfig`의 allowed methods는 현재 `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`다. 컨트롤러에는 `PATCH /api/notification/{userId}/{alertId}/read`가 있으므로 브라우저/Expo web preflight에서 PATCH가 막힐 수 있다. |

#### DB/Flyway 실제 위험 지점

현재 마이그레이션은 다음 두 개뿐이다.

```text
V1__add_contact_phone_to_guardian_link.sql
V2__add_missing_user_columns.sql
```

두 파일은 모두 기존 테이블에 컬럼을 추가하는 `ALTER TABLE` 성격이다. `ddl-auto=none`이므로 빈 PostgreSQL에 배포할 경우 현재 Flyway 파일만으로 `users`, `user_health_records` 같은 초기 테이블을 만들 수 없다. 운영 DB가 이미 존재한다는 전제가 있거나, 별도의 `V0`/`V3` 초기 스키마 생성 마이그레이션이 필요하다.

실제 Entity 기준 관계 보강:

```text
users
  ├─ 1:1 user_health_info
  ├─ 1:N user_health_records
  ├─ 1:N user_disease
  ├─ 1:N user_medications
  │    └─ 1:N user_medication_schedules
  ├─ 1:N BrainTrainingGame
  ├─ 1:N disease_trend
  ├─ patient 1:N user_guardian_links N:1 guardian
  ├─ patient 1:N user_health_alert
  └─ receiver 1:N user_health_alert

disease_trend
  └─ 1:N user_health_alert (optional FK)

user_health_records
  └─ 1:N user_health_alert (optional FK)
```

`UserHealthAlert`에는 `disease_trend_id`, `health_record_id` FK 필드가 있으나 현재 `NotificationService`의 생성 로직은 patient, receiver, title, message, alertType만 채운다. 따라서 알림 row의 source FK는 null일 수 있다.

#### 주요 도메인 로직 보강

| 도메인 | 실제 구현 |
|---|---|
| 건강 기록 | `UserHealthService.saveHealthRecord()`가 혈압, 혈당, 심박수, ECG risk score, ECG abnormal을 저장한다. 혈압/혈당/ECG 이상은 `anomalyType`에 누적되며, 복수 이상값이면 알림도 종류별로 각각 발송한다. |
| 건강 요약 | 모든 기록 기준 혈압 평균과 혈당 평균을 다시 계산해 `user_health_info`에 반올림 저장한다. 최근 혈압은 `lastBpSys`, `lastBpDia`로 갱신한다. |
| 알림 | `NotificationService.sendEmergencyAlert()`가 환자 본인과 연결 보호자 모두에게 `user_health_alert` row를 저장한다. 실제 push 발송은 현재 로그 처리 수준이다. |
| 보호자 연결 | `GuardianController`는 연결/해제 시 `ensureSelf(patientId)`를 호출한다. 즉 보호자가 임의로 환자를 연결하는 구조가 아니라 환자 본인 토큰으로만 생성/해제할 수 있다. |
| 보호자 조회 | 보호자는 `ensureGuardianSelf(guardianId)`를 통과해야 `my-patients`를 조회할 수 있고, 환자는 본인 기준 `my-guardians`를 조회한다. |
| 복약 | `MedicationController`가 서비스 계층 없이 직접 처리한다. 입력은 `name`, `dosage`, `freq` 중심이며 `freq=HH:mm`을 단일 `timeOfDay`로 파싱하고 `daysOfWeek=EVERYDAY`, `timezone=Asia/Seoul`로 저장한다. Entity의 `memo`, `startDate`, `endDate`는 현재 API 로직에서 적극적으로 쓰이지 않는다. |
| 뉴스 자동 수집 | `NewsAutoCollectorScheduler`가 매일 09:00 실행되며 사용자 질병 코드 기반으로 NewsAPI를 조회해 `disease_trend`의 `NEWS` 행을 저장한다. |
| 질병 트렌드 알림 | `DiseaseTrendAlertScheduler`가 매일 09:00 실행되며 `riskLevel=HIGH` 트렌드를 대상으로 환자/보호자 알림을 생성한다. |
| 빈 서비스 | `PatientHealthService.java`는 파일은 존재하지만 현재 핵심 로직이 비어 있다. |

#### ECG 프록시 보강

Spring 백엔드는 ECG 요청을 저장/해석하는 서버가 아니라 AI 서버 raw JSON 프록시다.

```text
POST /api/ecg/predict_window
  │
  ├─ EcgController
  │  └─ x 누락만 400으로 검사
  │
  └─ EcgAnalysisService
     ├─ AI_ECG_SERVER_URL에서 trailing slash 제거
     ├─ /predict_window가 붙어 있으면 base URL로 정규화
     ├─ X-API-Key가 있으면 헤더 추가
     ├─ connect timeout 5s
     ├─ read timeout 30s
     └─ 실패 시 예외 대신 {"error": "..."} JSON 문자열 반환
```

`application.properties`의 기본 AI URL은 `https://zoon1-carelink-ai.hf.space/predict_window`처럼 path를 포함하지만, `EcgAnalysisService`가 이를 base URL로 정규화한다. ECG 추론 결과는 자동으로 `user_health_records`에 저장되지 않는다. 저장은 별도로 `POST /api/vitals`에 `ecgRiskScore`, `ecgAbnormal`, `ecgAnomalyType`이 들어올 때 수행된다.

### 17.5 AI 서버와 모델 실제 구조 보강

#### 서버 기동 조건

`ai/src/server.py`는 FastAPI lifespan에서 `MODEL_PATH`의 `best_model_multilabel.pth`를 반드시 로드한다. 현재 워크스페이스에는 `ai/models/best_model_multilabel.pth`가 보이지 않는다. 이 파일이 없거나 state dict가 serving 모델 구조와 맞지 않으면 서버는 기동 단계에서 실패한다. 따라서 `/health`는 서버가 정상 기동한 뒤에만 `{"ok": true, "model_loaded": true}` 형태로 의미 있게 확인할 수 있다.

#### `/sample_window` 실제 동작

```text
GET /sample_window?label={LABEL}
  │
  ├─ label이 없으면 NORM/STTC/MI/CD/HYP 중 랜덤 선택
  ├─ SAMPLE_DIR/{LABEL}.npy 존재 시 파일에서 로드
  │  ├─ 지원 shape: (N, 12, L), (N, L, 12), 단일 2D 배열
  │  ├─ to_12xL()
  │  └─ ensure_len_12xL(5000)
  │
  └─ 파일이 없으면 make_demo_window_12xL()로 synthetic demo 생성
```

현재 저장소에는 `ai/samples/` 디렉토리와 `{LABEL}.npy` 샘플 파일이 보이지 않는다. 따라서 기본 동작은 `from: "generated_demo"` fallback이다.

응답에는 문서에 있던 `x`, `fs`, `label` 외에도 `id`, `from`, `ts`가 포함된다.

#### `/predict_window` 실제 입력과 검증

| 항목 | 실제 동작 |
|---|---|
| 요청 DTO | `x`, `fs`, `amp`를 받을 수 있다. |
| 실효 입력 | 현재 추론에서 클라이언트가 보낸 `amp`는 사용하지 않는다. 서버가 bandpass 후 `compute_amp_feats()`로 항상 재계산한다. |
| shape | `(12, L)` 또는 `(L, 12)`만 허용한다. |
| sampling rate | `fs`가 없으면 500Hz로 보고, 500Hz가 아니면 `scipy.resample_poly()`로 리샘플링한다. |
| 길이 | 5000 초과는 뒤쪽 5000 샘플 사용, 5000 미만은 앞쪽 0 padding이다. |
| 필터 | Butterworth 2차 0.5~45Hz bandpass + `filtfilt`다. |
| 정규화 | lead별 z-score 정규화다. |
| 검증 실패 상태 | 내부 검증은 422 `HTTPException`을 만들지만, 현재 broad `except Exception`이 이를 500 `Server Error`로 감쌀 수 있다. |

#### 운영 serving 모델과 연구용 모델 분리

`server.py`/`train_local.py`의 `CNN_CBAM_GRU`가 운영 serving 구조다.

```text
Serving CNN_CBAM_GRU
  ConvBlock(12 -> 32)
  ConvBlock(32 -> 32)
  BiGRU(input=32, hidden=64, layers=2, bidirectional=True)
  mean pooling
  concat amp 36
  Linear(164 -> 128)
  ReLU
  Dropout(0.5)
  Linear(128 -> 5)
```

반면 `run_comparison.py`에도 같은 이름의 `CNN_CBAM_GRU`가 있지만, 이는 비교 실험용 확장 구조다. 비교 실험용 모델은 ConvBlock이 더 많고, `32 -> 64 -> 128`, residual skip, GRU hidden 128 등 serving 모델과 다르다. Grad-CAM 산출물도 이 실험용 모델 정의와 `best_cnn_cbam_gru.pth`/`best_resnet1d.pth` 계열을 기준으로 생성된다.

따라서 운영 가중치 `best_model_multilabel.pth`는 반드시 `server.py`/`train_local.py`의 serving 구조와 동일한 모델에서 생성되어야 한다. `test_api_with_real_ptbxl.py`의 구형 모델이나 비교 실험 모델 가중치를 그대로 쓰면 shape mismatch가 날 수 있다.

#### AI 파일과 의존성 보강

| 파일/경로 | 실제 역할 |
|---|---|
| `ai/src/make_demo_samples.py` | demo 샘플 생성 보조 스크립트다. 기존 주요 파일 표에 빠져 있었다. |
| `ai/src/test_api_with_real_ptbxl.py` | 실제 PTB-XL 기반 API 테스트/구형 모델 실험 코드다. serving 모델과 구조 차이에 주의해야 한다. |
| `ai/src/statistical_tests.py` | 실험 결과 통계 검정 스크립트다. |
| `ai/src/README.md` | AI 소스 설명 문서다. |
| `ai/data/processed/X_val.npy`, `y_val.npy` | 현재 존재하는 processed validation 산출물이다. |
| `ai/figures/gradcam/*.png` | Grad-CAM 이미지 산출물이다. |
| `ai/models/error_analysis/*.txt` | 모델별 error analysis 텍스트 산출물이다. |

`ai/requirements.txt`는 FastAPI 추론 컨테이너용 최소 의존성이다. PTB-XL 로딩, 학습, 비교 실험, Grad-CAM까지 재현하려면 별도 research 의존성이 필요하다.

| 용도 | 추가 필요 가능성이 큰 패키지 |
|---|---|
| PTB-XL 로딩 | `pandas`, `wfdb` |
| 전처리/평가 | `pandas`, `scikit-learn` |
| Grad-CAM/차트 | `matplotlib` |
| 비교/ablation | `scikit-learn`, 실험 산출물 저장용 CSV 의존성 |

### 17.6 배포/Compose 실제 차이

`docker-compose.yml`의 backend와 ai는 `build:`가 아니라 GHCR `image:`를 사용한다.

```text
backend image: ghcr.io/zzooonn/carelink/carelink-backend:latest
ai image:      ghcr.io/zzooonn/carelink/carelink-ai:latest
```

따라서 현재 루트에서 `docker compose up --build`를 실행해도 `backend/healthcare-server/Dockerfile`과 `ai/Dockerfile`을 로컬에서 새로 빌드하는 구조가 아니다. 실제 이미지 빌드는 GitHub Actions의 `docker/build-push-action`이 수행하고 GHCR에 push한다.

`docker-compose.ec2-lite.yml`은 경량 실행용이다. 이 파일의 `ai` 서비스는 `profiles: ["ai"]`로 선택 실행되며, 현재 `AI_API_KEY`, `ALLOWED_ORIGINS`, `THRESHOLDS`를 명시적으로 전달하지 않는다. 또한 lite compose의 backend도 `AI_ECG_SERVER_URL`, `AI_ECG_API_KEY`를 직접 지정하지 않으므로 `application.properties` 기본값인 Hugging Face Space URL을 사용할 수 있다. EC2 lite에서 로컬 AI 컨테이너까지 붙이려면 이 환경 변수를 별도로 맞춰야 한다.

### 17.7 성능 지표 출처 분리

성능 수치는 파일별 측정 시나리오가 다르므로 한 표로 섞어 읽으면 안 된다.

| 파일 | 성격 | 대표 값 |
|---|---|---|
| `carelink_measured_metrics.json` | 실제 사용자 흐름 기반 측정 | `user_profile` avg `300.50ms`, p95 `320.91ms`; `vitals_insights_7d` avg `298.50ms`, p95 `317.42ms`; `notifications` avg `299.94ms`, p95 `317.92ms`; AI direct avg `2396.58ms`, p95 `2725.98ms`; Home cache first avg `0.29ms` |
| `benchmark_results.json` | concurrency별 부하 테스트와 경계 테스트 | `health_check`는 concurrency 1/5/10/20에서 avg 약 `298~302ms`, p95 약 `316~320ms`; 별도 ECG n=30 측정은 avg `2382.85ms`, p95 `2698.16ms` |

문서의 12장은 주로 `carelink_measured_metrics.json` 기준으로 작성되어 있다. 논문이나 발표 자료에서는 어떤 파일의 어떤 측정 시나리오인지 함께 표기해야 한다.

### 17.8 현재 문서 기준 누락/불일치 요약

| 영역 | 빠졌거나 보정한 내용 |
|---|---|
| Frontend | 루트 `app/index.tsx`, 중첩 Stack layout, `profile.tsx` alias, 공개 인증 API와 보호 API 구분, Home caregiver cache 한계, 화면별 상세 흐름, app/tsconfig 세부 설정 |
| Backend | `demo` 식별자, 루트 보조 클래스, 로그인 rate limit, access control, reset token 인메모리 저장, CORS PATCH 주의, Flyway 초기 스키마 부재, ECG raw proxy와 저장 분리, 보호자 연결 권한, 복약 `freq=HH:mm` 제약 |
| Database | `users -> disease_trend` 관계, `UserHealthAlert`의 optional source FK와 현재 미사용 상태 |
| AI | 모델 파일 부재 시 기동 실패, `ai/samples` 부재와 generated demo fallback, `amp` 입력 미사용, 검증 에러 500 wrapping 가능성, serving 모델과 연구용 모델 분리, 연구 의존성 부족 |
| Deploy | Compose는 GHCR image 기반이며 `--build`로 로컬 Dockerfile을 빌드하지 않음, EC2 lite의 AI/env 차이 |
| Metrics | 측정 파일별 시나리오와 수치 출처 분리 필요 |

### 17.9 보강 후 한 문장 결론

```text
현재 CareLink 구조 문서는 핵심 아키텍처와 주요 모듈을 잘 설명하지만,
실제 저장소와 완전히 동일한 운영 명세로 쓰려면
프론트 중첩 라우팅, 백엔드 권한/마이그레이션 제약,
AI serving 모델과 연구 모델의 분리,
Compose 이미지 기반 배포 차이를 함께 봐야 한다.
```

---

## 합격 자소서 말투로 정리

**복잡한 시스템을 책임 단위로 분리해, 문제의 원인을 구조에서 찾는 엔지니어로 성장했습니다**

저는 CareLink 헬스케어 플랫폼을 개발하며, 하나의 서버에 모든 기능을 욱여넣기보다 책임을 명확히 나누는 설계가 운영 안정성을 좌우한다는 점을 배웠습니다. 초기에는 모바일 앱이 ECG 추론 서버를 직접 호출했는데, 인증과 데이터 검증이 분산되면서 장애 지점을 특정하기 어려운 문제를 확인했습니다. 이를 단순한 호출 실패로 보지 않고, 요청 경로를 기준으로 책임을 다시 분리했습니다. 인증과 데이터 무결성은 Spring Boot 백엔드가, 신호 전처리와 모델 추론은 FastAPI 서버가 맡도록 구조를 나누고, 앱은 백엔드의 `/api/ecg` 프록시만 바라보게 정리했습니다. 그 결과 장애가 발생해도 어느 계층의 문제인지 즉시 좁힐 수 있는 구조를 갖출 수 있었습니다.

성능 개선 과정에서도 같은 접근을 이어갔습니다. 홈 화면의 첫 표시가 네트워크 응답을 기다리느라 느려지는 문제를 확인했고, 이를 단순한 속도 이슈로 보지 않고 데이터 흐름을 캐시와 동기화로 분리했습니다. AsyncStorage에 저장된 사용자 정보를 먼저 그려 체감 응답을 확보하고, 서버 동기화는 뒤에서 수행하도록 바꾸어 첫 표시 시간을 캐시 읽기 수준까지 줄일 수 있었습니다. 이 과정에서 ECG 추론 지연의 주요 원인이 BiGRU 연산과 필터링에 있다는 점도 로그와 측정값을 근거로 분리해 파악했습니다.

이렇게 문제를 표면 현상이 아니라 구조와 데이터 흐름에서 분리해 원인을 규명한 경험은, 대규모 서비스의 안정성과 성능을 함께 책임지는 직무에 필요한 역량으로 이어진다고 생각합니다. 이러한 경험을 활용하여 시스템의 병목을 데이터 기준으로 진단하고 가용성을 높이는 일에 기여하고 싶습니다.
