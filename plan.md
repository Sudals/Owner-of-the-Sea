# 도트 낚시 게임 — 설계 문서 v2

> 웹 브라우저에서 동작하는 2D 도트 낚시 게임
> 자체 제작 도트 그래픽 · 맵 선택 · Google 로그인 · Neon(Postgres + Object Storage) · Vercel 배포

---

## 1. 한눈에 보기

| 항목 | 결정 |
|---|---|
| 프레임워크 | **Next.js (App Router) + TypeScript** — 게임은 클라이언트 Canvas, 계정·저장은 서버 API |
| 게임 렌더링 | Canvas 2D 직접 구현 (엔진 없음), 내부 해상도 **640×360**, 정수 배율 |
| 그래픽 | **Claude가 직접 제작** (코드로 정의한 픽셀 → 스크립트로 PNG 시트 생성). 외부 에셋은 정말 막힐 때만 |
| 사운드 | WebAudio로 합성 (파일 없음) |
| 로그인 | **Google** (Neon Auth 사용) — 카카오는 2차 옵션 |
| DB | **Neon Postgres** + Drizzle ORM + `@neondatabase/serverless` 드라이버 |
| 파일 저장 | **Neon Object Storage** — 어탁(트로피 카드) 이미지 |
| 개발·테스트 | **로컬** (`npm run dev`, 확인은 `npm run build && npm run start`) |
| 배포 | **Vercel** (서버리스 런타임에 Neon HTTP 드라이버가 잘 맞음) |

---

## 2. 로그인: Google vs 카카오 → **Google 선택**

| | Google | 카카오 |
|---|---|---|
| Neon Auth 지원 | 기본 소셜 프로바이더로 지원 | 기본 제공 아님 → generic OAuth 설정 필요 |
| 개발자 설정 | Google Cloud Console에서 OAuth 클라이언트 1개 | Kakao Developers 앱 등록 + 동의항목 + (이메일 받으려면) 비즈 앱 검수 |
| 이메일 수집 | 기본 제공 | 비즈 앱 전환 전엔 이메일 못 받음 |

→ **Google로 먼저 구현**, 한국 유저 타깃이 확실해지면 카카오를 generic OAuth로 추가.
게스트 플레이(로그인 없이 바로 낚시)도 허용하고, 로그인하면 진행상황을 서버에 저장하는 구조로 간다.

---

## 3. 그래픽 — 직접 제작

### 3-1. 제작 방식: "코드로 그린 픽셀 → PNG 빌드"

```
sprites/*.ts (팔레트 + 문자열 픽셀 그리드, 프레임 배열)
      │  npm run sprites   (scripts/build-sprites.ts, pngjs 사용)
      ▼
public/assets/*.png (스프라이트 시트) + *.json (프레임 좌표)
      │  Playwright로 미리보기 페이지 스크린샷 → Claude가 직접 보고 수정
      ▼
게임에서 로드
```

- **공통 팔레트 32색** 하나로 모든 그래픽을 그린다. 화풍이 자동으로 통일된다.
- 픽셀 데이터를 텍스트로 관리하므로 Claude가 수정하기 쉽고, git diff로 변경 내용도 보인다.
- **미리보기 페이지**(`/dev/sprites`)에 모든 시트를 확대해서 띄워 둔다. 스크린샷을 찍어 확인하고 수정하는 과정을 반복해서 품질을 올린다.
- 단색 덩어리로 끝내지 않는다. 외곽선, 2~3단 음영, 하이라이트 픽셀을 넣어 너무 저화질로 보이지 않게 한다.

### 3-2. 제작 목록

| 분류 | 내용 | 크기 / 프레임 | 제작 방식 |
|---|---|---|---|
| 낚시꾼 | Idle, 차징, 던지기, 대기, 챔질, 감기, 획득 포즈 | 32×48, 동작당 2~4프레임 | 픽셀 그리드 |
| 물고기 | 실루엣 6종 (소형·납작·길쭉·대형·장어형·특수) | 16×8 ~ 64×24 | 픽셀 그리드 + **팔레트 스왑으로 30~40종** |
| 찌·낚싯줄·소품 | 찌(2프레임), 양동이, 의자, 등대, 보트, 갈대, 바위 | 8~48px | 픽셀 그리드 |
| 타일 | 풀, 모래, 나무 데크, 돌 | 16×16 | 픽셀 그리드 |
| 배경 | 하늘, 산·숲 실루엣, 원경 바다 | 640×360 레이어 | **절차적 생성**(그라데이션, 디더링, 노이즈) → PNG로 굽기 |
| 물 | 수면 물결, 반사, 물보라 | 런타임 | 코드로 실시간 렌더링 (sin 오프셋, 파티클) |
| UI | 패널 9-slice, 버튼, 게이지, 아이콘(골드·도감·상점) | 16~32px | 픽셀 그리드 |
| 맵 선택 지도 | 섬 지도 한 장 + 핀 | 640×360 | 절차적 생성 + 수작업 소품 |
| 어탁 카드 | 물고기 + 크기 + 날짜 + 닉네임 | 320×180 → 2배 확대 | 서버나 클라이언트 캔버스에서 합성 |

- **시간대 표현**: 그래픽을 새로 그리지 않고 팔레트 LUT(아침/낮/노을/밤)로 색만 바꾼다.

### 3-3. 직접 만들지 않는 것

| 항목 | 대안 | 이유 |
|---|---|---|
| 한글 폰트 | **Galmuri** (OFL, npm `galmuri`) | 한글 도트 폰트를 직접 만드는 건 비효율적임 |
| (예비) 캐릭터 애니메이션 | 결과물이 마음에 안 들 때만 [CraftPix 무료 낚시 팩](https://free-game-assets.itch.io/free-fishing-pixel-art-pack)(상업 사용 가능) | 사람 동작 애니메이션은 난이도가 가장 높아서 대안을 남겨 둠 |

외부 에셋을 쓰게 되면 `CREDITS.md`와 게임 내 크레딧 화면에 출처를 표시한다.

---

## 4. 맵 (낚시터)

| ID | 이름 | 분위기 | 해금 조건 | 특징 |
|---|---|---|---|---|
| `willow_creek` | **버들잎 개울** | 아침 햇살, 갈대, 나무 다리 | 기본 | 쉬운 민물고기, 튜토리얼 |
| `mist_lake` | **안개 호수** | 새벽 안개, 보트 선착장 | 200G | 큰 민물고기, 밤에 희귀종 |
| `sunset_harbor` | **노을 항구** | 부두, 갈매기, 등대 | 1,000G + 낚싯대 Lv2 | 바다 물고기, 파도 |
| `coral_cliff` | **산호 절벽** | 깊고 푸른 바다, 절벽 끝 | 5,000G + 낚싯줄 Lv3 | 대형·전설 물고기, 줄이 잘 끊어짐 |

- **맵 선택 화면**: 지도 한 장 위에 핀 4개를 찍고, 잠긴 맵은 자물쇠와 해금 조건을 표시한다.
- **시간대**: 아침 → 낮 → 노을 → 밤이 순환한다(실시간 3분 = 게임 1시간 정도). 시간대에 따라 배경 팔레트와 출현하는 물고기가 바뀐다.
- 맵 정의는 데이터 파일 하나로 관리한다: 배경 레이어, 물 높이, 캐스팅 범위, 출현 테이블.

---

## 5. 게임플레이

### 5-1. 기본 루프 (버튼 하나로 조작: 클릭 / 스페이스 / 터치)

```
IDLE → [누르기] CHARGING (파워 게이지)
     → [떼기] CASTING (찌 날아감) ── 서버에 /api/cast 요청 → 물고기 결정
     → WAITING (2~8초, 찌가 살짝 움직임)
     → BITE ("!" 표시, 0.6초 안에 눌러야 함)
     → REELING (텐션 미니게임)
     → CAUGHT → /api/catch 저장 → 결과 카드
       ESCAPED → IDLE
```

### 5-2. 텐션 미니게임

- 누르고 있으면 텐션이 오르고 거리가 줄어든다. 떼면 텐션이 내려간다.
- 물고기는 자기 패턴대로 당긴다(`pull`, `erratic`).
- 텐션이 최대를 넘으면 줄이 끊어지고, 텐션이 0인 상태가 1.5초 이상 이어지면 물고기가 도망간다.
- 장비 효과: 낚싯대는 감는 속도, 낚싯줄은 텐션 최대치, 미끼는 희귀종 확률에 영향을 준다.

### 5-3. 성장 요소

- **도감**: 맵별 탭, 처음 잡은 날짜, 최대 크기, 잡은 횟수를 기록한다.
- **상점**: 물고기를 팔아 골드를 얻고, 낚싯대·낚싯줄·미끼를 업그레이드하고 맵을 해금한다.
- **어탁(트로피 카드)**: 잡은 물고기 카드를 PNG로 렌더링해서 Object Storage에 저장한다. 공유 링크가 생긴다.
- **랭킹**: 물고기 종류별 최대 크기 TOP 10을 보여준다.

---

## 6. 아키텍처

```
[브라우저]
  Next.js 페이지 ─ <GameCanvas/> (client component)
                     └ src/game/* (순수 TS 게임 엔진, React 의존 없음)
  ↕ fetch
[Next.js 서버 (Vercel)]
  app/api/*  ─ Neon Auth 세션 확인
             ─ Drizzle + @neondatabase/serverless → Neon Postgres
             ─ S3 호환 클라이언트 → Neon Object Storage
```

### 치팅 방지 (가벼운 수준)

- 어떤 물고기가 걸리는지(종류와 크기)는 **서버에서 결정**한다. `/api/cast`는 `castId`를 발급하고, 결과는 DB에 pending 상태로 저장한다.
- 클라이언트는 `/api/catch`에 `castId`와 결과만 보낸다. 서버는 다음을 확인한다.
  - 소유자가 맞는지
  - 이미 처리된 castId가 아닌지
  - 최소 소요 시간이 지났는지
- 게스트 모드에서는 로컬에서 추첨하고 localStorage에 저장한다. 로그인할 때 서버로 넘길지는 v2에서 결정한다(일단은 넘기지 않음).

---

## 7. DB 스키마 (Drizzle)

사용자 테이블은 Neon Auth가 관리한다(`neon_auth` 스키마). 게임 테이블은 `user_id`로 연결한다.

```ts
// db/schema.ts (요약)
players        (user_id PK, nickname, gold, rod_lv, line_lv, bait, current_map, created_at)
unlocked_maps  (user_id, map_id, unlocked_at)                       PK(user_id, map_id)
casts          (id PK uuid, user_id, map_id, fish_id, size_cm, status['pending'|'caught'|'escaped'],
                created_at, resolved_at)
catches        (id PK, user_id, fish_id, map_id, size_cm, trophy_key NULL, caught_at)
dex            (user_id, fish_id, first_caught_at, max_size_cm, count) PK(user_id, fish_id)
```

- 물고기·맵·장비 같은 **정적 데이터는 DB가 아니라 코드**(`src/data/*.ts`)에 둔다. 밸런스를 수정할 때 마이그레이션이 필요 없다.
- 랭킹은 `catches`에서 `fish_id`별 `max(size_cm)`를 뽑는 쿼리로 처리한다. 사용자가 많아지면 materialized view로 바꾼다.

---

## 8. Neon 셋업 절차

> 제공받은 셋업 지침 그대로. 구현 1단계에서 실행한다.

1. `npm i -g neon@latest` (실패하면 `npx neon@latest`)
   - 브라우저 로그인 창이 뜨면 사용자가 거기서 로그인을 마친다. 타임아웃이 나면 사용자가 `neon login`을 실행한 뒤 재시도한다.
2. 프로젝트 루트에서:
   ```bash
   neon init -y --org-id org-noisy-bird-73858946 --project-id bitter-water-95111864 \
     --branch production --services postgres,object-storage
   ```
3. `neon deploy` 실행 → `neon.ts`에 선언된 서비스가 생성되고, 환경변수가 `.env.local`(`.env`가 이미 있으면 `.env`)에 들어간다.
4. **Neon Auth 추가**: 위 services에 auth가 빠져 있으므로 `neon config add auth` → `neon deploy`로 반영한다. 그다음 Neon 콘솔에서 Google OAuth 클라이언트 ID/Secret을 등록한다.
5. 설치된 Neon agent skill(예: `neon-auth-nextjs`)을 참고해서 드라이버와 Auth 연동 방식을 확정한다.
   - DB: Vercel 서버리스이므로 `@neondatabase/serverless` + `drizzle-orm/neon-http`
   - Auth: `@neondatabase/auth`. 서버와 클라이언트의 import 경로를 구분하고, 세션이 바뀌면 `router.refresh()`를 호출한다.
   - Storage: S3 호환 클라이언트(`@aws-sdk/client-s3`)에 env의 endpoint와 credential을 사용한다.
6. **로컬 검증**
   - `npm run build`가 통과해야 한다.
   - `npm run start`로 로컬 서버를 띄운다(`http://localhost:3000`).
   - `/api/health/db`: `select 1`과 `players`에 insert/select가 되는지 확인한다.
   - `/api/health/storage`: 테스트 파일 put → get → delete가 되는지 확인한다.
   - 로그인: Google 로그인 후 `/api/me`가 user id를 반환하는지 확인한다.
   - 확인이 끝나면 각 결과(명령 출력)를 보고한다.

### 8-1. 로컬 테스트 환경

- 개발은 `npm run dev`, 배포 전 확인은 `npm run build && npm run start`로 한다.
- 로컬에서도 Neon DB와 스토리지에 실제로 붙어서 테스트한다(`.env.local` 사용).
- **권장**: 로컬 테스트용으로 Neon `dev` 브랜치를 따로 만든다(`neon branches create dev`). 그러면 production 데이터가 오염되지 않는다. 브랜치 생성은 즉시 끝나고 비용도 거의 없다.
- Google OAuth 승인된 리디렉션 URI에 `http://localhost:3000/...`을 등록한다.
- 자동 점검: Playwright 스크립트(`npm run e2e`)
  - 페이지 로드 → 캐스팅 → 입질 → 감기 과정을 자동으로 진행한다.
  - 스크린샷을 저장하고 콘솔 에러가 없는지 확인한다.
  - 스프라이트 미리보기 페이지도 캡처해서 Claude가 그래픽을 확인하는 데 쓴다.

### 8-2. Vercel 배포

1. GitHub 저장소를 Vercel 프로젝트에 연결한다(또는 `vercel` CLI 사용).
2. `.env.local`의 Neon 환경변수(DB URL, Auth, Storage)를 Vercel 프로젝트 환경변수로 등록한다. 이때 Production은 `production` 브랜치 값을 쓴다.
3. Google OAuth 리디렉션 URI에 Vercel 도메인(`https://<프로젝트>.vercel.app/...`)을 추가하고, Neon Auth에 허용 도메인으로 등록한다.
4. 마이그레이션은 배포 전에 로컬에서 `npm run db:migrate`로 production에 적용한다. 빌드 단계에 넣지 않는다.
5. 배포 후 `/api/health/db`, `/api/health/storage`를 호출하고 로그인을 한 번 해서 정상 동작을 확인한다.

---

## 9. 파일 구조

```
fishing-game/
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx                 # 타이틀 → 맵 선택 → 게임
│  ├─ play/[mapId]/page.tsx    # 게임 화면 (GameCanvas 마운트)
│  ├─ dex/page.tsx             # 도감
│  ├─ ranking/page.tsx
│  ├─ auth/[path]/page.tsx     # Neon Auth UI (로그인/로그아웃)
│  └─ api/
│     ├─ me/route.ts
│     ├─ cast/route.ts
│     ├─ catch/route.ts
│     ├─ shop/route.ts
│     ├─ trophy/route.ts       # 어탁 PNG 업로드 / URL 발급
│     └─ health/{db,storage}/route.ts
├─ components/
│  ├─ GameCanvas.tsx           # 엔진 생성·정리, HUD는 React로 위에 올림
│  ├─ MapSelect.tsx
│  └─ ui/...                   # 도트 스타일 버튼, 패널
├─ src/
│  ├─ game/
│  │  ├─ engine.ts             # 루프, 스케일링, 씬 전환
│  │  ├─ input.ts
│  │  ├─ assets.ts             # 스프라이트 시트 로딩·슬라이싱
│  │  ├─ audio.ts              # WebAudio 효과음
│  │  ├─ scenes/fishing.ts     # 상태 머신 + 렌더링
│  │  ├─ systems/reel.ts       # 텐션 미니게임 로직
│  │  ├─ systems/timeOfDay.ts
│  │  └─ api.ts                # 서버 호출 (게스트면 로컬 처리)
│  ├─ data/
│  │  ├─ fish.ts               # 물고기 정의
│  │  ├─ maps.ts               # 맵 정의 + 출현 테이블
│  │  ├─ gear.ts
│  │  └─ config.ts             # 튜닝 상수
│  ├─ db/
│  │  ├─ client.ts             # neon-http + drizzle
│  │  └─ schema.ts
│  ├─ storage/client.ts        # S3 호환 클라이언트
│  ├─ auth/                    # Neon Auth 서버/클라이언트 헬퍼
│  └─ server/                  # cast/catch 같은 서버 로직 (route에서 호출)
├─ sprites/                    # ★ 그래픽 원본 (코드로 그린 픽셀)
│  ├─ palette.ts               # 공통 32색 + 시간대 LUT
│  ├─ angler.ts                # 낚시꾼 프레임
│  ├─ fish.ts                  # 물고기 실루엣 + 종별 팔레트
│  ├─ props.ts / tiles.ts / ui.ts
│  └─ backgrounds.ts           # 맵별 절차적 배경 파라미터
├─ public/assets/              # 빌드된 PNG 시트 + json, 폰트
├─ scripts/
│  ├─ build-sprites.ts         # sprites/ → public/assets/*.png
│  └─ e2e.ts                   # Playwright 자동 점검·스크린샷
├─ app/dev/sprites/page.tsx    # 스프라이트 미리보기 (개발 모드에서만)
├─ drizzle/                    # 마이그레이션
├─ neon.ts                     # Neon 리소스 선언 (neon init이 생성)
├─ CREDITS.md
└─ .env.local
```

규칙은 하나만 둔다: **게임 엔진(`src/game`)은 React와 Next.js를 몰라야 한다.** 이렇게 해 두면 화면 쪽을 수정해도 게임 코드가 깨지지 않는다.

---

## 10. 개발 로드맵

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **M0 인프라** | Next.js 생성, Neon 셋업(8장), Drizzle 스키마와 마이그레이션, health 라우트 | build 통과 + DB·스토리지 왕복 테스트 성공 |
| **M1 그래픽 & 렌더** | 팔레트, 스프라이트 빌드 파이프라인, 미리보기 페이지, 엔진·입력·스케일링, 버들잎 개울 배경, 낚시꾼 Idle | 선명한 640×360 화면에 캐릭터가 서 있음 + 미리보기 스크린샷 확인 |
| **M2 낚시 코어** | 캐스팅 → 대기 → 입질 → 텐션 미니게임 (게스트, 로컬 처리) | 물고기를 잡거나 놓칠 수 있음. **손맛 튜닝은 여기서** |
| **M3 로그인 & 저장** | Google 로그인, `/api/cast`·`/api/catch`, 플레이어 데이터 | 로그인하면 잡은 물고기가 DB에 쌓임 |
| **M4 맵 & 성장** | 맵 4개, 맵 선택 화면, 시간대, 상점, 도감 | 골드를 모아 새 맵을 해금할 수 있음 |
| **M5 소셜** | 어탁 카드(Object Storage), 랭킹 | 공유 링크로 카드가 열림 |
| **M6 마감** | 효과음, 파티클(물보라, 반짝임), 크레딧, 모바일 대응, 전체 그래픽 다듬기 | 폰에서도 쾌적하게 플레이됨 |
| **M7 배포** | Vercel 연결, 환경변수, OAuth 도메인 등록 (8-2) | 배포 URL에서 로그인 → 낚시 → 저장까지 동작 |
| (옵션) | 카카오 로그인 추가 | |

---

## 11. 미정 / 확인 필요

- `neon init --services` 플래그와 Neon Auth의 Google 설정 방식은 CLI 버전에 따라 다를 수 있다 → M0에서 `neon init --help`와 설치된 skill 문서로 확인한다.
- 낚시꾼 동작 애니메이션 품질은 M1에서 직접 만들어 보고 판단한다. 아쉬우면 CraftPix 팩으로 대체한다.
- 게스트 진행상황을 로그인 후 서버로 이관할지는 v2에서 결정한다.
