# 바다의 주인 — 최종 설계 문서 (v8)

> v8 변경: 섬 사이 항해를 해도(노드) 선택에서 **탑다운 바다 맵 직접 조종**으로 바꿨다(3-3). 그래픽(6-2), 씬(7-3), 스키마(8), 구조(9), 저장(11), 로드맵 M6(13), 미정(14)을 함께 수정.

> 오염된 바다에 노한 신, 물에 잠긴 세상. "바다는 누구의 것인가"를 묻는 2D 도트 낚시 게임
> **스토리 모드**(진실을 밝힘) → **무한 모드**(점수 · 오염 보스 · 순위 경쟁)
> **TypeScript 웹 코드 + Electron** · 웹 체험판 / Windows exe 정식판 (추후 Steam 출시) · 아이디·비밀번호 로그인 · Neon (DB · 파일 저장소 · Functions)

---

## 0. 세계관 · 스토리

### 0-1. 한 줄 요약

> 사람들이 더럽힌 바다에 **'바다의 주인'**이 노했고, 세상이 물에 잠겼다.
> 진실을 알게 된 낚시꾼들은 오늘도 바다로 나간다. 그리고 묻는다. **"바다는 누구의 것인가?"**

### 0-2. 세계

- 옛 사람들은 모든 물길을 다스리는 거대한 물고기를 **'바다의 주인'**이라고 불렀다.
- 옛 세계는 바다를 마음대로 썼다. 기름을 쏟고, 쓰레기를 버리고, 폐기물을 심해에 묻었다. 그물로 바닥까지 긁어 갔다.
- 어느 날 바다의 주인이 깨어나 노했다. 바닷물이 끝없이 불어나 도시와 산과 대륙을 삼켰다. 이 사건을 **'대범람'**이라고 부른다.
- 지금 남은 땅은 바다 위의 섬 몇 개뿐이다. 섬마다 사람들이 살고, 상점과 물가와 바다를 대하는 태도가 조금씩 다르다.
- 얕은 바다 아래로 옛 도시가 보이고, 낚싯줄에는 옛 세계의 쓰레기가 걸려 올라온다.
- 바다 깊은 곳에서는 오염에 물든 거대한 물고기, **'오염체'**가 목격되고 있다.

### 0-3. 주인공

- 작은 섬에서 자란 젊은 낚시꾼이다.
- 할아버지가 남긴 물건은 세 가지다.
  1. 낡은 통통배
  2. **검게 얼룩진 거대한 비늘 한 장**
  3. 페이지가 찢긴 **항해일지**
- 할아버지의 마지막 말:
  > "바다는 누구 것이냐… 그 답을 찾거라."

### 0-4. 핵심 질문: "바다는 누구의 것인가?"

섬과 사람마다 답이 다르다. 플레이어는 여행하며 그 **대답**들을 모은다(도감의 '대답' 탭).

| 누가 | 그들의 답 (예시) |
|---|---|
| 어부 | "잡는 사람 것이지." |
| 상인 | "값을 치르는 사람 것이지." |
| 옛 세계의 문서 | "개발하는 자의 것." |
| 섬의 노인 | "바다는 바다 것이다." |
| 아이 | "다 같이 쓰는 거 아냐?" |

→ 스토리 모드가 끝나면 이 질문은 **순위표**로 이어진다. 주간 1위는 **'바다의 주인'** 칭호를 얻는다. 답을 강요하지 않고, 끝없이 경쟁하는 플레이어 자신이 그 질문의 한 답이 되는 아이러니를 노린다.

### 0-5. 스토리 모드: 진실을 밝혀가는 여정

| 막 | 흐름 | 밝혀지는 것 |
|---|---|---|
| **프롤로그** | 할아버지의 유품. 첫 낚시에 물고기 대신 비닐봉지가 걸린다. 거대한 그림자가 배 밑을 지나간다 | 튜토리얼 |
| **1막 · 두려움** | 섬들을 돌며 신에 대한 소문과 대답을 모은다 | 섬사람들은 신이 변덕스러워서 바다를 일으켰다고 믿는다 |
| **2막 · 진실** | 깊은 바다의 잠긴 도시에서 유물(기름 드럼, 폐기물 운반 장부, 뉴스 기사)을 낚는다 | 옛 세계가 바다에 한 일. 신의 분노에는 이유가 있었다 |
| **3막 · 상처** | 항해일지의 마지막 조각을 찾는다. 먹빛 바다의 **'버려진 골'**(옛 폐기물 투기 해역)에 도착한다 | 할아버지는 폐기물 운반선 *'번영호'*의 선원이었다. 그물과 쓰레기에 감겨 고통받는 바다의 주인을 보았고, 그때 떨어진 비늘을 평생 간직했다 |
| **진실 (마무리 컷신)** | 버려진 골에서 거대한 바다의 주인을 처음으로 직접 본다. 몸에 감긴 그물과 드럼에서 검은 물이 번지고, 그 오염이 바다 곳곳의 물고기를 **오염체**로 바꾸고 있었다. 바다의 주인은 아무 말 없이 심연으로 가라앉는다 | **스토리 모드 완료 → 무한 모드 해금** |

- 스토리 모드에는 **보스전도 엔딩 분기도 없다.** 진실을 아는 것이 목표다.
- 스토리 진행 장치:
  - **항해일지 조각**: 의뢰, 물고기 배 속, 난파선에서 얻는다
  - **주인의 흔적**: 섬과 바다 구역마다 1개. 모두 모으면 '버려진 골'이 해도에 표시된다
  - **유물**: 잠긴 도시 포인트에서 낚인다
  - **대답**: 섬 NPC에게서 얻는다

---

## 1. 한눈에 보기

| 항목 | 결정 |
|---|---|
| 제목 | **바다의 주인** |
| 주제 | 환경오염 · "바다는 누구의 것인가" |
| 장르 | 2D 도트 낚시. 스토리 모드 → 무한 순위 경쟁 |
| 시점 | 섬 사이 바다는 **탑다운 맵에서 배를 직접 조종**, 섬 허브·낚시는 **측면 화면** |
| 플랫폼 | **웹 체험판** (브라우저) + **Windows exe 정식판** (Electron) → 추후 **Steam** |
| 클라이언트 | **TypeScript + Vite + React(UI) + Canvas 2D(게임)**. 엔진 없이 직접 구현 |
| 데스크톱 | **Electron** + electron-builder (NSIS 설치 파일 + 포터블 exe) |
| 서버 | **Neon Functions** (Node.js 24 + Hono): API, 주간 마감 트리거. DB와 같은 Neon 프로젝트·리전(싱가포르) |
| 정적 웹 | **Cloudflare Pages** (랜딩, 웹 체험판, 웹 순위 페이지) + **itch.io** (체험판) |
| 로그인 | **아이디 + 비밀번호** (자체 계정 테이블). 추후 Steam 계정 연동 |
| DB | **Neon Postgres** + Drizzle ORM + `pg` (Functions 안에서 Pool 재사용) |
| 파일 저장 | **Neon Object Storage**: 어탁(트로피 카드) 이미지 |
| 렌더링 | 내부 해상도 **640×360**, 정수 배율 (720p / 1080p / 1440p / 4K) |
| 그래픽 | **Claude가 직접 제작** (코드로 정의한 픽셀 → 스크립트로 PNG 시트 생성) |
| 사운드 | WebAudio로 합성 |
| 개발·테스트 | **로컬** (서버 + 클라이언트 + Electron 동시 실행) |
| 배포 | API는 `neon deploy`, 정적 웹은 Cloudflare Pages / itch.io, exe는 GitHub Releases(초기) → Steam |
| 운영 비용 | 소규모는 **0원** (Neon Free + Cloudflare Pages). 넘치면 Neon Launch(쓴 만큼 과금). 12장 참고 |

---

## 2. 플랫폼 전략: 체험판 vs 정식판

| | 웹 체험판 | exe 정식판 |
|---|---|---|
| 실행 | 브라우저 (Cloudflare Pages의 `/demo`, itch.io) | Windows 설치 파일 / 포터블 exe |
| 콘텐츠 | 프롤로그 + 1막 일부 (섬 1~2개, 옥빛 바다) | 전체 스토리 + 무한 모드 + 순위 |
| 로그인 | 없음 | **필수** (아이디/비밀번호) |
| 저장 | 브라우저 localStorage | **서버** (Neon) |
| 네트워크 | 오프라인으로도 동작 (정적 파일) | 온라인 기본. 이벤트 자동저장 + **수동 저장**(11장). 저장 때만 서버와 통신 |
| 체험판 끝 | "정식판 다운로드" 화면 (Steam 출시 후에는 위시리스트 버튼) | — |

- 두 버전은 **같은 클라이언트 코드**를 쓴다. 빌드 모드(`demo` / `full`)에 따라 저장소 어댑터와 콘텐츠 범위만 바뀐다.
- 체험판 진행상황은 정식판으로 옮기지 않는다. 체험판 분량이 짧아서 옮길 필요가 없다.

---

## 3. 월드 구조: 섬 + 바다

```
[섬 A] ──바다 구역(옥빛)── [섬 B] ──바다 구역(청빛)── [섬 C] ── … ── [버려진 골]
  │                          │
 상점·의뢰·선착장 낚시      상점·의뢰·선착장 낚시
```

### 3-1. 섬 — **TBD (사용자가 직접 정함)**

| # | 이름 | 컨셉 / 분위기 | 상점·물가 특징 | 해금 조건 | 대답 / 흔적 / 단서 | 체험판 포함 |
|---|---|---|---|---|---|---|
| 1 | TBD | TBD | TBD | (시작 섬) | TBD | O |
| 2 | TBD | TBD | TBD | TBD | TBD | TBD |
| 3 | TBD | TBD | TBD | TBD | TBD | X |
| … | | | | | | |

**섬 공통 규칙 (확정)**

- 섬 하나는 **허브 화면**이다: 마을 배경, 상점, NPC 대화, 의뢰 게시판, 선착장 낚시 포인트.
- 섬마다 **시세가 다르다.** 같은 물고기라도 판매가가 다르고, 미끼·연료·얼음 가격도 다르다.
- 섬마다 대답이 1개 이상, 주인의 흔적이나 항해일지 조각이 최소 1개 있다.
- 해금 조건은 데이터로 정의한다. 조합 예: 도감 N종, 의뢰 완료, 선체 레벨, 특정 유물, 골드.

```ts
// packages/shared/data/islands.ts — 형식만 확정, 내용은 TBD
{ id:'tbd_1', name:'TBD', inDemo:true,
  priceMods:{ fish:{...}, items:{...} },
  shop:['rod_1','bait_basic', ...], quests:[...],
  unlock:{ dexCount:10, hullLv:1, quests:[], relics:[] },
  dockFishTable:[...], clue:'trace_scale_1' }
```

### 3-2. 바다 구역 (확정)

| 바다 색 | 깊이 | 필요 조건 | 특징 | 오염체 등급 |
|---|---|---|---|---|
| **옥빛** | 얕음 | 기본 배 | 잠긴 지붕과 도로가 비쳐 보임. 흔한 어종 | C |
| **청빛** | 중간 | 선체 Lv2 | 유물이 걸리기 시작함 | B |
| **남빛** | 깊음 | 선체 Lv3 + 연료 | 대형 어종 | A |
| **먹빛** | 심해 | 등불 + 선체 Lv4 | '버려진 골'이 있음 | S |

### 3-3. 항해 방식: 탑다운 바다 맵 (직접 조종)

> 섬 사이의 바다는 **위에서 내려다보는 탑다운 맵**이고, 배를 직접 몰고 다닌다.
> 섬 허브와 낚시는 지금처럼 **옆에서 보는 화면**을 유지한다.

```
[섬 허브 (측면)] ──출항──▶ [탑다운 바다 맵] ──포인트에서 멈추고 버튼──▶ [배 위 낚시 (측면)]
       ▲                    │      ▲                                       │
       └──── 부두에 접안 ────┘      └─────────────── 낚시 끝 ───────────────┘
```

**맵**

- 하나로 이어진 바다 맵이다(16px 타일). 카메라가 배를 따라가고, 화면은 640×360 그대로다.
- 시작 섬 근처가 옥빛이고, 멀어질수록 청빛 → 남빛 → 먹빛으로 깊어진다. 경계는 물 색과 파도 무늬로 보인다.
- 선체 레벨이 모자라는 바다에는 들어가지 못한다. 높은 파도에 밀려나고 "이 배로는 버티지 못할 것 같다"는 안내가 뜬다.
- 옥빛 바다에서는 수면 아래로 **잠긴 지붕과 도로가 비친다.** 깊어질수록 보이지 않는다.
- 섬 배치와 맵 크기는 섬 목록이 정해지면 확정한다(TBD). 맵 데이터는 `packages/shared/data/seaMap.ts`에 두고, 필요하면 Tiled(무료 맵 에디터) JSON으로 편집해서 가져온다.

**조종**

- 키보드 방향키/WASD, 게임패드 왼쪽 스틱으로 직접 조종한다. 약간의 관성이 있다.
- 마우스 클릭·터치: 찍은 곳까지 자동으로 항해한다(직선으로 가다가 장애물 앞에서 멈춤).
- 액션 버튼(클릭 / 스페이스 / 게임패드 A)은 탑다운 맵에서 "멈추고 낚시 시작"과 "접안"에 쓴다. 낚시 조작은 여전히 버튼 하나다.

**맵 위의 것들**

| 오브젝트 | 역할 |
|---|---|
| 섬·부두 | 부두 근처에서 버튼 → 섬 허브로 들어감(접안) |
| 낚시 포인트 | 물고기 떼(수면이 들끓음), 새 떼, 부표. 범위 안에서 멈추고 버튼 → 그 바다 색의 **배 위 낚시 화면**. 포인트마다 출현 테이블이 다르다 |
| 잠긴 도시 | 수면 아래 건물 윤곽이 보이는 구역. 유물이 걸리는 포인트 |
| 암초 | 바위·얕은 모래톱. 부딪히면 속도에 비례해 선체 내구도가 깎인다. 대신 암초 주변은 고급 낚시 포인트다 |
| 폭풍 | 맵 위를 천천히 이동하는 구름 지대. 안에서는 파도가 배를 밀고 시야가 좁아진다. 희귀종·오염체 확률 상승(무한 모드) |
| 난파선 | 항해일지 조각이 나오는 지점(스토리) |

**자원**

- **연료**: 이동한 거리만큼 줄어든다. 바닥나면 노를 저어 아주 느리게(30%) 움직인다. 연료 때문에 게임이 막히는 일은 없게 한다.
- **신선도**: 창고의 물고기는 **바다에 있는 시간**만큼 신선도가 떨어진다(얼음 창고로 완화).
- **선체 내구도**: 암초 충돌·폭풍으로 깎이고 섬에서 수리한다. 0이 되면 가장 가까운 섬으로 견인된다(수리비 + 창고 물고기 일부 손실).

**해도 (지도 화면)**

- M키 / 메뉴로 여는 양피지 지도. 가 본 곳만 드러나고(탐험 안개), 섬·낚시 포인트·흔적을 표시한다.
- '주인의 흔적'을 모두 모으면 '버려진 골'이 해도에 표시된다.

### 3-4. 배

| 부위 | 효과 |
|---|---|
| 선체 Lv1~4 | 들어갈 수 있는 바다 색, 내구도 최대치 |
| 연료통 | 한 번에 갈 수 있는 거리 |
| 등불 | 먹빛 바다 진입, 밤 낚시 보너스 |
| 얼음 창고 | 신선도가 떨어지는 속도 감소 |

---

## 4. 게임플레이

### 4-1. 기본 낚시 루프 (버튼 하나로 조작: 클릭 / 스페이스 / 터치 / 게임패드 A)

```
IDLE → [누르기] CHARGING (파워 게이지)
     → [떼기] CASTING ── 로컬에서 시드 RNG로 물고기 결정 (서버 통신 없음)
     → WAITING (2~8초)
     → BITE ("!" 표시, 0.6초 안에 눌러야 함)
     → REELING (텐션 미니게임)
     → CAUGHT → 로컬 기록 + 결과 카드(예상 점수) / ESCAPED → IDLE
       … 이벤트 자동저장 / 유저 수동 저장 때 한 번에 서버로 커밋 (11장 참고)
```

- 게임패드는 Gamepad API로 지원한다. Steam 출시 때 필요하니 처음부터 입력 계층에 넣어 둔다.

### 4-2. 텐션 미니게임

- 누르고 있으면 텐션이 오르고 거리가 줄어든다. 떼면 텐션이 내려간다.
- 물고기는 자기 패턴대로 당긴다(`pull`, `erratic`).
- 텐션이 최대를 넘으면 줄이 끊어지고, 텐션이 0인 상태가 1.5초 이상 이어지면 물고기가 도망간다.
- 장비 효과: 낚싯대는 감는 속도, 낚싯줄은 텐션 최대치, 미끼는 희귀종 확률에 영향을 준다.
- **오염체도 같은 미니게임을 쓴다.** 별도 보스전 화면은 없고 파라미터만 훨씬 세다.

### 4-3. 경제

- **골드**: 물고기를 팔아서 얻는다. 장비, 배, 미끼, 연료를 사는 데 쓴다.
- **교역**: 섬별 시세 × 신선도 = 판매가. 시세는 날짜를 시드로 매일 소폭 변동한다(계산식, DB 불필요).
- **의뢰**: 섬 NPC가 특정 물고기, 크기, 유물을 요청한다. 보상으로 골드, 항해일지 조각, 해금 조건이 주어진다.
- **도감**: 바다 색별 탭, 유물 탭, 대답 탭, **오염체 탭**.
- 골드(경제)와 점수(순위)는 **별개**다.

### 4-4. 무한 모드: 점수

스토리 모드를 완료하면 해금된다(정식판 전용). 이후 낚는 모든 물고기에 **점수**가 붙는다.

```
점수 = 기본점(희귀도) × 크기 배율 × 바다 색 배율 × 날씨 배율
```

| 요소 | 값 (초기안, `scoring.ts`에서 조정) |
|---|---|
| 기본점 | 일반 10 / 고급 30 / 희귀 100 / 전설 300 |
| 크기 배율 | 크기 ÷ 그 어종의 평균 크기 (0.5 ~ 2.0) |
| 바다 색 배율 | 옥빛 ×1 / 청빛 ×1.5 / 남빛 ×2 / 먹빛 ×3 |
| 날씨 배율 | 맑음 ×1 / 폭풍 ×1.3 |
| 쓰레기 | 고정 2점 |

### 4-5. 오염체 (보스 물고기) 스폰

**규칙**: 누적 점수가 **임계치**를 넘을 때마다, 일정 확률로 오염체가 나타날 **징조**가 생긴다.

```
[누적 점수가 다음 임계치를 넘음]
     │
     ▼ 서버가 확률 판정 (기본 35% + 보정)
 ┌───┴────┐
성공      실패 → 보정(pity) +15%, 다음 임계치로
 │
 ▼
"오염 징조" 발생
 · 경고 연출 (물이 검게 번짐, 비늘이 떨림, 사운드, 화면 흔들림)
 · 앞으로 3번의 캐스팅 안에 오염체가 확정으로 걸림
 · 등급은 현재 바다 색을 따름 (옥빛 C ~ 먹빛 S)
```

| 항목 | 초기안 |
|---|---|
| 임계치 간격 | 첫 임계치 1,000점. 이후 간격이 1.15배씩 늘어남 |
| 기본 확률 / 보정 | 35% / 실패할 때마다 +15% (성공하면 초기화) |
| 오염체 점수 | 등급 C ×10, B ×15, A ×25, S ×50 (일반 점수식 기준) |
| 놓쳤을 때 | 징조가 남아 있으면 같은 포인트에서 재도전 가능. 아니면 소멸 |
| 오염체 미니게임 | 당기는 힘 ×2~3, 불규칙도 높음, 감아야 할 거리 3배, 몸부림(텐션 급변) 패턴 |

**오염체 예시 (확장 가능)**

| 등급 | 오염체 | 모습 |
|---|---|---|
| C | 비닐감긴 숭어 | 몸에 비닐봉지가 칭칭 감김 |
| B | 기름먹은 고등어떼왕 | 무지갯빛 기름막, 검은 눈 |
| A | 그물을 끄는 상어 | 끊어진 그물을 꼬리에 매달고 다님 |
| S | 드럼통 고래 | 녹슨 폐기물 드럼이 등에 박힘, 검은 물을 뿜음 |
| **SS (제안)** | **바다의 주인의 그림자** | 먹빛 바다 + 폭풍 + S 징조에서 극히 낮은 확률. 잡으면 전체 공지 |

- 오염체를 잡으면 도감에 **정화된 모습**이 공개된다. 잡을수록 바다를 정화한다는 주제 표현이다.

### 4-6. 순위

| 순위표 | 기준 | 리셋 |
|---|---|---|
| **주간** (메인) | 이번 주 획득 점수 | 매주 월요일 00:00 KST |
| 누적 | 무한 모드 전체 점수 | 없음 |
| 오염체 사냥 | 오염체 포획 (등급 가중치) | 주간 / 누적 |
| 월척 | 어종별 최대 크기 | 없음 |

- **주간 1위**는 다음 한 주 동안 **'바다의 주인'** 칭호를 얻는다(닉네임 옆에 왕관 비늘 아이콘).
- 상위 10위 / 100위 칭호, 시즌 기록 보관.
- 순위는 게임 안과 **웹 순위 페이지**(`/ranking`) 양쪽에서 볼 수 있다. 웹 순위 페이지는 체험판 유저 유입용이다.
- **어탁 카드**: 오염체나 기록적인 물고기를 PNG 카드로 만들어 Object Storage에 저장하고 공유 링크를 만든다.

### 4-7. 시간대

아침 → 낮 → 노을 → 밤이 순환한다. 출현 어종과 배경 팔레트(LUT)가 바뀐다. 오염 징조가 뜨면 **오염 LUT**(탁한 보라와 검정)로 바뀐다.

---

## 5. 계정 · 로그인 (아이디 + 비밀번호)

### 5-1. 정책

| 항목 | 규칙 |
|---|---|
| 아이디 | 4~20자, 영문 소문자·숫자·`_`. 대소문자 구분 없음. 중복 불가 |
| 비밀번호 | 8~64자, 영문과 숫자 혼합 필수 |
| 닉네임 | 2~12자, 한글·영문·숫자. 중복 불가. 순위표에 표시됨. 가입 시 입력 |
| 이메일 | **받지 않는다** (간단한 가입). 그래서 비밀번호를 잊으면 복구할 수 없다는 점을 가입 화면에 안내한다 |
| 비밀번호 저장 | **argon2id** 해시 (`@node-rs/argon2`). 평문이나 단순 해시는 금지 |
| 세션 | 로그인하면 랜덤 토큰(32바이트)을 발급한다. DB에는 **토큰의 SHA-256 해시만** 저장한다. 유효기간 30일, 사용할 때마다 연장 |
| 전송 | `Authorization: Bearer <token>` 헤더. 쿠키를 쓰지 않으므로 Electron에서 단순하고 CSRF 걱정이 없다 |
| 클라이언트 보관 | Electron `safeStorage`(OS 키체인 암호화)로 암호화해서 userData 폴더에 저장. "자동 로그인" 옵션 |
| 무차별 대입 방지 | 아이디·IP별로 15분에 5회 실패하면 15분 잠금 (`auth_throttle` 테이블) |
| 로그아웃 | 세션 행 삭제. "모든 기기에서 로그아웃" 지원 |
| 비밀번호 변경 | 기존 비밀번호를 확인한 뒤 변경하고, 다른 세션은 전부 만료 |

### 5-2. API

```
POST /api/auth/signup   { username, password, nickname } → { token, account }
POST /api/auth/login    { username, password }           → { token, account }
POST /api/auth/logout                                     (Bearer)
POST /api/auth/logout-all                                 (Bearer)
POST /api/auth/password { current, next }                 (Bearer)
GET  /api/me                                              (Bearer) → account + player
```

- 모든 입력은 `zod` 스키마로 검증한다. 스키마는 `packages/shared`에 두고 클라이언트와 서버가 함께 쓴다.
- 서버 미들웨어 `requireAccount(req)`: Bearer 토큰 해시로 `sessions`를 조회하고, 만료 확인, 연장, `account_id`를 반환한다.

### 5-3. 추후 Steam 연동 (구조만 미리 잡아 둠)

- `accounts.steam_id`(nullable, unique) 컬럼을 미리 만들어 둔다.
- Steam 출시 때: Electron에서 `steamworks.js`로 **세션 티켓**을 받는다 → 서버 `POST /api/auth/steam`이 Steam Web API(`ISteamUserAuth/AuthenticateUserTicket`)로 검증한다.
  - `steam_id`가 이미 연결된 계정이 있으면 그 계정으로 로그인한다.
  - 없으면 기존 아이디로 로그인해서 **연결**하거나, Steam으로 **새 계정**을 만든다.
- Steam 버전에서는 아이디/비밀번호 입력 없이 자동 로그인된다. 그러면 비밀번호 분실 문제도 자연스럽게 해결된다.
- 업적: `steamworks.js` achievement API. 오버레이: `electronEnableSteamOverlay()`.

---

## 6. 그래픽 — 직접 제작

### 6-1. 제작 파이프라인

```
packages/sprites/src/*.ts (팔레트 + 문자열 픽셀 그리드)
   │ pnpm sprites (build-sprites.ts, pngjs)
   ▼
apps/client/public/assets/*.png + *.json
   │ /dev/sprites 미리보기 → Playwright 스크린샷 → Claude가 보고 수정
   ▼
게임에서 로드
```

- **공통 팔레트 32색**을 쓰고, 시간대와 오염 상태는 팔레트 LUT로 바꾼다.
- 외곽선, 2~3단 음영, 하이라이트 픽셀을 넣어 너무 저화질로 보이지 않게 한다.

### 6-2. 제작 목록

| 분류 | 내용 | 크기 / 방식 |
|---|---|---|
| 낚시꾼 | Idle, 차징, 던지기, 대기, 챔질, 감기, 획득 | 32×48, 동작당 2~4프레임 |
| 배 (측면) | 통통배 (선체 레벨별 4단계), 흔들림 — 배 위 낚시 화면용 | 64×32 |
| 물고기 | 실루엣 6~8종 × 팔레트 스왑 → 40종 이상 | 16×8 ~ 64×24 |
| **오염체** | 등급별 4~5종. 기본 실루엣 + 오염 레이어(비닐, 기름, 그물, 드럼) + 정화된 버전 | 48×24 ~ 128×48 |
| 바다의 주인 | 그림자, 진실 컷신용 대형 실루엣 | 화면 절반 크기 |
| 쓰레기 | 비닐, 페트병, 타이어, 그물 뭉치, 기름 드럼 | 16~32px |
| 유물 | 신호등, 간판, 휴대폰, 투기 장부, 신문 | 16×16 아이콘 |
| 섬 배경 | 섬별 마을 배경 (내용 TBD) | 절차적 생성 + 소품 |
| 바다 배경 | 바다 색 4종 × 시간대, 잠긴 도시 실루엣 | 절차적 생성 |
| **배 (탑다운)** | 선체 Lv1~4 × 16방향, 항적(물결 자국), 노 젓기 | 32×32. 방향별 이미지는 빌드 때 기하 도형을 돌려서 다시 그림 |
| **바다 타일 (탑다운)** | 바다 색 4종 물 타일(물결 애니메이션), 색 경계 전이, 얕은 곳·모래톱·암초, 잠긴 지붕·도로가 비치는 타일(옥빛) | 16×16 타일 |
| **섬 (탑다운)** | 해안선 자동 타일(모래·풀·바위), 마을·부두·등대 (섬 내용 TBD) | 16×16 타일 + 소품 |
| 맵 오브젝트 | 물고기 떼, 새 떼, 부표, 난파선, 폭풍 구름, 잠긴 도시 표식 | 16~64px |
| 해도 (지도 화면) | 양피지 질감 지도, 탐험 안개, 섬·포인트·흔적 아이콘 | 640×360 |
| 물 | 물결, 반사, 물보라, 오염 번짐 | 런타임 렌더링 |
| UI | 9-slice 패널, 게이지, 대화창, 초상화, 순위표, 칭호, 로그인·가입 화면 | 16~48px |
| 앱 아이콘 | exe 아이콘(.ico 256/48/32/16), 파비콘 | 픽셀 → 배율별 내보내기 |

### 6-3. 직접 만들지 않는 것

- 한글 폰트: **Galmuri** (OFL, npm `galmuri`). 앱 안에 포함하고 라이선스 파일을 동봉한다.
- (예비) 낚시꾼 애니메이션이 아쉬우면 [CraftPix 무료 낚시 팩](https://free-game-assets.itch.io/free-fishing-pixel-art-pack)으로 대체한다. 외부 에셋을 쓰면 `CREDITS.md`와 게임 내 크레딧에 기록한다.

---

## 7. 아키텍처

```
┌──────────────── 클라이언트 (apps/client: Vite + React + Canvas) ───────────────┐
│  React UI (타이틀, 로그인, HUD, 상점, 도감, 순위, 대화)                           │
│  └ <GameCanvas/> → packages/game (순수 TS 엔진: 루프·씬·렌더·입력·사운드)          │
│  GameBackend 인터페이스                                                         │
│   ├ LocalBackend  (demo 빌드: localStorage, 로컬 추첨)                          │
│   └ RemoteBackend (full 빌드: fetch → API, Bearer 토큰)                         │
└───────────────┬─────────────────────────────────────┬─────────────────────────┘
                │ 웹 체험판 (정적 파일)                  │ exe (Electron)
                ▼                                     ▼
   apps/web → Cloudflare Pages + itch.io     apps/desktop (main + preload)
   · 랜딩 · /demo · /ranking(공개 조회만)       · app:// 커스텀 프로토콜로 dist 로드
                │ GET /api/ranking (공개, 캐시)    · safeStorage 토큰 보관
                │                            · (추후) steamworks.js
                │                                     │ HTTPS (Bearer)
                ▼                                     ▼
        ┌──────────── apps/api (Hono on Neon Functions, Node.js 24) ────────────┐
        │ /api/auth/*, /api/me, /api/session/open, /api/save,                   │
        │ /api/ranking, /api/trophy, /api/health/{db,storage}                   │
        │ Function Trigger(cron): 주간 마감, 세션·잠금 정리                         │
        └──────────┬──────────────────────────────────────┬────────────────────┘
                   ▼  (같은 브랜치·같은 리전, DATABASE_URL 자동 주입)   ▼
            Neon Postgres                                Neon Object Storage
```

- Neon 프로젝트 하나에 **DB + 파일 저장소 + 서버(Functions)**가 모두 들어간다. 리전은 **AWS Asia Pacific (Singapore)**로 한다.
- Neon은 웹사이트 호스팅을 지원하지 않으므로, 정적 웹(랜딩, 체험판, 순위 페이지)만 무료 정적 호스팅으로 분리한다.

### 7-1. 핵심 설계 원칙

1. **`packages/game`은 React·Electron·서버를 모른다.** 순수 TS다.
2. **`GameBackend` 인터페이스 하나**로 체험판과 정식판을 갈아 끼운다. 게임 코드는 저장 위치를 모른다.
3. **결과의 최종 확정은 서버가 한다. 단, 매번 통신하지 않는다.** 서버가 발급한 시드로 클라이언트가 로컬에서 진행하고, 묶어서 커밋하면 서버가 재계산해서 확정한다(11장). 시드 RNG와 출현 테이블 계산은 `packages/shared`에 두어 양쪽이 **같은 코드**로 계산한다. 체험판은 로컬 시드로 똑같이 동작한다.
4. 정적 데이터(물고기, 섬, 장비, 대사, 점수 상수)는 `packages/shared`에 두고 양쪽이 함께 쓴다.

### 7-2. Electron 보안·구성

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- preload에서 `window.desktop` API만 노출: `getToken / setToken / clearToken`, `setFullscreen`, `getVersion`, `quit`
- 렌더러는 `app://` 커스텀 프로토콜로 로컬 파일을 로드한다(`file://`보다 안전하고 경로 문제가 없음).
- CSP: `connect-src`를 API 도메인으로만 제한한다.
- API CORS: Electron 요청(`app://` origin), 정적 웹 도메인(공개 순위 조회만), 로컬 개발 origin만 허용한다. 인증은 Bearer 방식이라 쿠키가 필요 없다.
- 자동 업데이트: 초기에는 `electron-updater` + GitHub Releases. Steam 출시 후에는 Steam이 업데이트를 담당한다.

### 7-3. 씬 구성

`Title` → `Login/Signup`(정식판) → `IslandHub`(측면) ⇄ `SeaMap`(탑다운 항해) → `FishingSpot`(측면: 선착장 / 배 위 / 잠긴 도시) → (스토리 완료 시) `TruthCutscene`
해도(지도 화면)는 `SeaMap` 위에 여는 오버레이다. 선착장 낚시는 `IslandHub`에서 바로 들어간다.
무한 모드는 별도 씬이 아니다. 같은 월드에 **점수 HUD와 오염 징조 시스템이 켜지는 상태**다.
체험판에서는 마지막 섬 이후 `DemoEnd` 화면으로 이어진다.

### 7-4. 치팅 방지 (순위 경쟁)

- 물고기(오염체 포함)와 크기는 **서버가 발급한 시드**로 정해진다. 클라이언트는 결과를 바꿀 수 없고, 서버는 커밋을 받을 때 같은 시드로 **재계산해서 대조**한다(11장).
- 점수, 임계치 판정, 징조 확정, 판매가, 해금은 커밋할 때 **서버가 최종 계산**한다. 클라이언트가 보여주는 값은 예상치일 뿐이다.
- 커밋 검증 항목:
  - 시드 서명(HMAC), 캐스트 인덱스 연속성, 배치 중복 여부
  - 캐스트 간 최소 간격, 최소 릴링 시간
  - 배치 전체 소요 시간이 현실적인지
- 시간당 점수 상한을 넘기면 플래그를 남기고 주간 순위에서 검토 대상으로 둔다. `accounts.banned`로 제재한다.
- 저장마다 `commits`에 요약을 남기고, 합계는 트랜잭션으로 갱신한다(감사 가능).

---

## 8. DB 스키마 (Drizzle)

```ts
// ── 계정 ──
accounts      (id uuid PK, username text UNIQUE,  -- 소문자 정규화 password_hash text,
               nickname text UNIQUE, steam_id text UNIQUE NULL,
               banned bool default false, created_at, last_login_at)
sessions      (id uuid PK, account_id FK, token_hash text UNIQUE,
               created_at, expires_at, last_seen_at, user_agent NULL)
auth_throttle (key text PK,               -- 'login:<username>' / 'ip:<ip>'
               fail_count int, window_start timestamptz, locked_until NULL)

// ── 게임 ──
players       (account_id PK, gold, location_id, day,
               sea_x real NULL, sea_y real NULL,   -- 바다에서 저장했을 때 배 위치(섬에 있으면 NULL)
               rod_lv, line_lv, hull_lv, hull_hp, fuel, has_lantern, ice_lv,
               cargo jsonb,                 -- 배 창고(미판매 물고기), 용량 상한
               story_flags jsonb, story_cleared_at NULL, created_at)
endless       (account_id PK,
               score_total bigint, next_threshold bigint, threshold_step bigint,
               spawn_bonus real, omen jsonb NULL, title NULL, updated_at)
season_scores (season_id, account_id, score bigint, boss_points int, updated_at)
               PK(season_id, account_id), INDEX(season_id, score DESC)
unlocks       (account_id, island_id, unlocked_at)               PK(account_id, island_id)
fish_sessions (id uuid PK, account_id, spot_id, seed bytea, next_index int,
               created_at, expires_at, closed_at NULL)        -- 낚시 세션(시드)
commits       (batch_id uuid PK, account_id, session_id, from_index, to_index,
               result jsonb, created_at)                    -- 저장 기록 + 낚시 요약(어종별 수량·점수 합계)
notable_catches (id PK, account_id, session_id, cast_index, fish_id, spot_id, size_cm,
               is_boss, boss_tier NULL, score int, season_id NULL, caught_at,
               reason['boss'|'rare'|'record'|'trophy'], trophy_key NULL)  -- 기록할 가치가 있는 것만
inventory     (account_id, item_id, qty)                         PK(account_id, item_id)
dex           (account_id, fish_id, first_caught_at, max_size_cm, count)
quests        (account_id, quest_id, status, updated_at)
titles        (season_id, account_id, title, rank)
```

- 아이디는 **소문자로 정규화해서 저장**한다(`username` UNIQUE). `citext` 확장이 Neon에서 사용 가능하면 대신 써도 된다.
- `season_id`는 `2026-W45` 형식(KST 기준 ISO 주차)이다.
- 주간 마감: **Neon Function Trigger**(schedule, 매주 월요일 00:05 KST = 일요일 15:05 UTC)가 칭호를 확정하고 `endless.title`을 갱신한다. 만료된 세션과 `auth_throttle` 정리도 같은 트리거에서 처리한다.

**용량 절약 원칙 (무료 한도 1GB 대응)**

- 물고기를 한 마리씩 전부 저장하지 않는다. 저장 1회의 결과는 `commits.result`에 **요약**(어종별 수량, 점수 합계, 최대 크기)으로 남긴다.
- 개별 행은 **기록할 가치가 있는 물고기**만 `notable_catches`에 남긴다: 오염체, 희귀 이상, 개인·어종 최대 크기 갱신, 어탁을 만든 물고기.
- 팔지 않은 물고기(배 창고)는 `players.cargo`(jsonb, 창고 용량만큼 상한)에 둔다. 팔면 거기서 빠진다.
- `commits`는 90일이 지나면 요약만 남기고 정리한다(트리거로 처리).

---

## 9. 리포지토리 구조 (pnpm 모노레포)

```
sea-lord/
├─ packages/
│  ├─ game/                      # 순수 TS 게임 엔진 (React·Electron 의존 없음)
│  │  └─ src/
│  │     ├─ engine.ts · input.ts (키보드·마우스·터치·게임패드) · assets.ts · audio.ts
│  │     ├─ scenes/ (title, islandHub, seaMap, fishing, truthCutscene, demoEnd)
│  │     ├─ systems/ (reel, sailing, timeOfDay, weather, freshness, omenFx)
│  │     └─ backend.ts           # GameBackend 인터페이스 정의
│  ├─ shared/                    # 클라이언트·서버 공용
│  │  ├─ data/ (fish, pollutants, relics, gear, boat, islands←TBD, seaMap,
│  │  │         quests, dialogue, story, scoring)
│  │  └─ schemas/                # zod: API 요청·응답 타입
│  └─ sprites/                   # 코드로 그린 픽셀 원본 + build-sprites.ts
├─ apps/
│  ├─ client/                    # Vite + React (웹 체험판 & 데스크톱 공용 UI)
│  │  ├─ src/
│  │  │  ├─ main.tsx · App.tsx
│  │  │  ├─ screens/ (Title, Login, Signup, Game, DemoEnd)
│  │  │  ├─ hud/ (ScoreHud, OmenAlert, Shop, Dex, QuestBoard, Dialogue, Cargo, Ranking, Settings)
│  │  │  ├─ backend/ (LocalBackend.ts, RemoteBackend.ts)
│  │  │  └─ dev/ (SpritePreview, CheatPanel)    # 개발 모드에서만
│  │  ├─ public/assets/           # 빌드된 스프라이트, 폰트
│  │  └─ vite.config.ts           # --mode demo | full
│  ├─ desktop/                   # Electron
│  │  ├─ src/main.ts · preload.ts · protocol.ts · tokenStore.ts
│  │  ├─ build/ (icon.ico)
│  │  └─ electron-builder.yml     # NSIS + portable, appId, 게임명
│  ├─ web/                       # 정적 웹 (Cloudflare Pages): 랜딩, /demo, /ranking
│  │  └─ (Vite 정적 빌드. client demo 빌드를 /demo에 포함)
│  └─ api/                       # Hono on Neon Functions (Node.js 24)
│     ├─ src/
│     │  ├─ index.ts              # Hono 앱 (fetch 핸들러), 라우트 등록
│     │  ├─ routes/ (auth, me, session, save, ranking, trophy, health, triggers)
│     │  ├─ db/ (pool.ts: pg Pool, schema.ts: Drizzle)
│     │  ├─ auth/ (password.ts, session.ts, throttle.ts, requireAccount.ts)
│     │  ├─ logic/ (rng, session, save, score, omen, shop, voyage, unlock, season)
│     │  └─ storage/client.ts
│     ├─ drizzle/                 # 마이그레이션
│     └─ neon.ts                  # Postgres · Object Storage · Function · Trigger 선언
├─ scripts/ (e2e.ts, e2e-electron.ts, sim.ts)
├─ CREDITS.md
├─ pnpm-workspace.yaml
└─ package.json                  # 루트 스크립트
```

**루트 스크립트**

| 명령 | 동작 |
|---|---|
| `pnpm dev` | API(`neon dev`) + client(:5173, full 모드) + Electron(Vite 개발 서버 로드)을 동시에 실행 |
| `pnpm dev:demo` | client를 demo 모드로 실행 (서버 없이 브라우저에서) |
| `pnpm sprites` | 스프라이트 PNG 빌드 |
| `pnpm build` | shared → game → client(demo + full) → web → api → desktop 순서로 빌드 |
| `pnpm dist:win` | electron-builder로 Windows 설치 파일과 포터블 exe 생성 |
| `pnpm db:generate` / `db:migrate` | Drizzle 마이그레이션 |
| `pnpm deploy:api` | `neon deploy` (API 함수 + 트리거) |
| `pnpm deploy:web` | Cloudflare Pages 배포 (+ itch.io `butler push`) |
| `pnpm e2e` | Playwright: 웹 체험판 흐름 + `_electron.launch`로 exe 흐름(가입 → 로그인 → 낚시) |
| `pnpm sim` | 점수와 오염체 출현 밸런스 시뮬레이션 |

---

## 10. Neon 셋업 · 로컬 테스트 · 배포

### 10-0. Neon 셋업 (제공받은 지침 + Functions 추가, `apps/api`에서 실행)

1. `npm i -g neon@latest` (실패하면 `npx neon@latest`)
   - 브라우저 로그인이 필요하면 사용자가 진행한다. 타임아웃이 나면 사용자가 `neon login`을 실행한 뒤 재시도한다.
2. 실행:
   ```bash
   neon init -y --org-id org-noisy-bird-73858946 --project-id bitter-water-95111864 \
     --branch production --services postgres,object-storage
   ```
3. Functions 추가: `neon config add function api` → `neon.ts`에 API 함수(엔트리 `src/index.ts`)와 스케줄 트리거(주간 마감)를 선언한다.
4. `neon deploy` → `neon.ts`에 선언한 서비스(Postgres, Object Storage, Function, Trigger)가 생성되고, 환경변수가 `.env.local`(또는 기존 `.env`)에 들어간다.
5. 설치된 Neon agent skill(`neon-functions` 등)을 참고해서 연동한다.
   - **서버 프레임워크**: Hono (`@neon/functions/hono`), `basePath('/api')`.
   - **DB 드라이버**: Functions 안에서는 **`pg` Pool**(모듈 범위에서 한 번 생성해 재사용) + `drizzle-orm/node-postgres`. Neon 서버리스 드라이버는 Functions에서 권장되지 않는다. 트랜잭션도 일반 Postgres처럼 쓴다.
   - **비밀번호 해시**: `@node-rs/argon2`. 네이티브 모듈이므로 `neon.ts`의 `externalPackages`에 등록한다(linux-arm64 빌드가 설치됨).
   - **Storage**: `@aws-sdk/client-s3`에 주입된 endpoint와 credential을 사용한다.
   - **비밀값**: `SESSION_PEPPER`, `SEED_HMAC_KEY` 같은 값은 `functions.api.env`에 선언하고 `neon deploy --env <file>`로 주입한다.
   - (Neon Auth는 사용하지 않는다. 자체 계정 테이블을 쓴다.)
6. 검증: `pnpm build` 통과 → `neon dev`로 API 실행 → 아래 항목 테스트 → 결과(명령 출력) 보고
   - `/api/health/db`: `select 1` + 테스트 행 insert/select/delete
   - `/api/health/storage`: 테스트 파일 put → get → delete
   - `/api/auth/signup` → `/api/auth/login` → `/api/me`(Bearer) → `/api/auth/logout` 흐름(curl)
   - 배포 후 `neon functions get api`로 invocation URL을 확인하고, 같은 테스트를 원격에서 반복

### 10-1. 로컬 테스트

- `pnpm dev` 하나로 API(`neon dev`, DB 접속 정보 자동 주입·핫 리로드), 클라이언트(Vite), Electron 창이 함께 뜬다. Electron은 로컬 API 주소에 붙는다.
- 로컬에서도 실제 Neon에 붙어서 테스트한다. **권장**: `dev` 브랜치를 따로 만들어 production 데이터를 보호한다. 브랜치를 만들면 Functions도 그 브랜치에 별도 복사본과 별도 URL이 생기므로 테스트 환경을 그대로 분리할 수 있다. 무료 플랜은 프로젝트당 브랜치 10개까지다.
- 배포 전 확인: `pnpm build` → 빌드된 Electron 앱(`pnpm --filter desktop start:prod`)을 `dev` 브랜치 API에 붙여서 확인.
- `pnpm e2e`: 체험판 흐름과 Electron 흐름을 자동으로 진행하고, 스크린샷 저장과 콘솔 에러 확인을 한다.
- 로그 확인: `neon logs query --branch dev --source function --since 1h`
- 개발 모드 치트 패널: 점수 지급, 징조 강제 발생, 스토리 완료 처리, 섬 해금(production 빌드에서는 비활성화).

### 10-2. 배포

**API → Neon Functions**

1. `pnpm db:migrate`로 production 브랜치에 마이그레이션을 적용한다.
2. `neon deploy --branch production --env .env.production` → API 함수와 트리거를 배포한다.
3. `neon functions get api`로 invocation URL을 확인한다. 이 주소를 클라이언트 full 빌드의 `VITE_API_BASE`에 넣는다. (커스텀 도메인은 필요할 때 검토)
4. health 라우트와 가입·로그인 흐름을 원격에서 확인한다.

**웹 (랜딩 + 체험판 + 순위 페이지) → Cloudflare Pages + itch.io**

- `apps/web`을 정적으로 빌드해서 **Cloudflare Pages**에 올린다. 무료이고 상업적 사용 제한이 없다.
- 체험판은 **itch.io**에도 HTML5 게임으로 올린다(`butler push`). 인디 게임 유저 유입 창구가 된다.
- 순위 페이지는 API의 공개 조회 엔드포인트(`GET /api/ranking`, 캐시 60초)만 호출한다.

**exe → GitHub Releases (Steam 이전)**

- Windows exe 빌드는 **Windows 환경**에서 한다: 사용자 PC에서 `pnpm dist:win`을 실행하거나, GitHub Actions `windows-latest` 러너를 쓴다.
- 코드 서명이 없으면 Windows SmartScreen 경고가 뜬다. 초기 배포에서는 감수하고, Steam으로 배포하면 문제가 되지 않는다.

**Steam 출시 시 (추후)**

- Steamworks 파트너 등록 + 앱 등록비, App ID 발급
- `steamworks.js` 연동: Steam 로그인(5-3), 업적, 오버레이
- 빌드 업로드는 SteamPipe(`steamcmd`)로 한다. Steam이 업데이트를 담당하므로 `electron-updater`는 끈다.
- 게임패드 지원과 1080p/4K 정수 배율 확인 (Steam Deck 대응 시 1280×800 레터박스)

---

## 11. 저장 · 동기화 전략 (서버 호출 최소화)

### 11-1. 원칙

> **"플레이는 로컬에서, 서버 저장은 특정 이벤트 때와 유저가 저장할 때만."**
> 물고기 한 마리마다 서버를 부르지 않는다. 저장하는 순간 그동안 쌓인 기록을 **한 번에** 서버로 보낸다.

| 방식 | 1시간 플레이(약 120마리) 기준 서버 호출 |
|---|---|
| 매번 통신 (cast + catch) | 약 240회 |
| 자동 배치 커밋 (20마리 / 5분) | 약 10~20회 |
| **채택안 (이벤트 자동저장 + 수동 저장)** | **약 3~8회** |

- **저장 = 서버 커밋**이다. 저장하기 전의 진행 내용은 로컬(PC)에만 있다.
- 순위와 점수는 **저장된 것만** 반영된다. 순위에 올리고 싶으면 저장해야 한다는 점이 자연스러운 동기가 된다.

### 11-2. 저장 시점

**자동저장 (이벤트)**

| 이벤트 | 이유 |
|---|---|
| **섬 해금** / 새 섬 도착 | 진행의 큰 단위 |
| **상점 이용 종료** (구매·판매·업그레이드 후 창 닫기) | 골드와 장비 상태 확정 |
| 스토리 진행 (항해일지 조각 획득, 진실 컷신) | 스토리 플래그 확정 |
| 예상 누적 점수가 **다음 임계치에 도달** | 오염 징조 판정은 서버가 해야 하므로 |
| **오염체**를 잡거나 놓침 | 보스 결과 확정 (리셋 꼼수 방지, 11-4) |
| 게임 종료 | "저장하고 종료 / 저장 안 하고 종료 / 취소" 확인창 |

**수동 저장 (유저)**

- 메뉴(ESC) → **저장**. 바다 위든 섬이든 어디서나 저장할 수 있다.
- 남용 방지: 저장 후 **30초 쿨다운**.
- HUD에 "마지막 저장: 12분 전 · 미저장 물고기 34마리"를 작게 표시한다. 30분 이상 저장하지 않았으면 아이콘이 깜빡인다(알림만, 자동저장은 아님).

### 11-3. 시드 세션: 결과는 서버가 정하고, 진행은 클라이언트가 한다

자주 통신하지 않아도 치팅을 막는 핵심 장치다.

```
[낚시 포인트 도착]
  POST /api/session/open { spotId }
   ← { sessionId, seed, startIndex, sig }        // sig = HMAC(서버 비밀키, sessionId|seed|accountId)

[낚시 N회: 통신 없음]
  cast #i → shared/rng(seed, i) → 어종, 크기, (징조 상태면) 오염체 여부
  · 무엇이 걸리는지는 시드(서버)가 정하고, 잡을지 놓칠지는 실력(클라이언트)이 정한다

[저장 = 커밋]
  POST /api/save { batchId, sessionId, sig, casts:[{i, result, reelMs, t}], shop:[…], flags:{…} }
   → 서버: 서명 확인 → 같은 시드로 재계산·대조 → 상점 거래·플래그 검증
          → 요약을 commits에, 주목할 물고기를 notable_catches에 저장, 점수·임계치·징조 판정, 골드·인벤토리·시즌 점수 갱신 (트랜잭션 1회)
   ← { confirmedState, omen?, nextSeed? }
```

- 낚시, 상점, 스토리 플래그를 **저장 한 번에 모두** 보낸다. 엔드포인트는 `/api/save` 하나다.
- 세션은 포인트를 떠날 때, 2시간이 지났을 때, 저장 응답으로 새 시드를 받았을 때 갱신된다.
- 서버 응답의 **확정 상태**로 로컬 상태를 덮어쓴다. 예상치와 어긋난 부분이 있으면 바로잡힌다.

### 11-4. 저장 안 하고 다시 하기 꼼수 방지

수동 저장 방식에서는 "결과가 마음에 안 들면 저장하지 않고 껐다 켜서 다시 하기"를 막아야 한다.

| 꼼수 | 막는 방법 |
|---|---|
| 껐다 켜서 다른 물고기 뽑기 | 열려 있는 세션이 있으면 `/api/session/open`이 **같은 시드와 마지막 저장 인덱스**를 돌려준다. 다시 해도 같은 순서로 같은 물고기가 걸린다 |
| 오염체를 놓치고 껐다 켜서 재도전 | 오염체 결과는 **즉시 자동저장**한다(11-2) |
| 항해 중 피해를 리셋 | 저장하지 않고 끄면 마지막 저장 지점(섬 또는 바다 위 위치)으로 돌아간다. 그 사이 잡은 물고기도 함께 사라지므로 이득이 없다. 오염체 결과는 즉시 자동저장이라 되돌릴 수 없다 |
| 판매가가 낮은 날 리셋 | 시세는 날짜 기반 계산이라 바뀌지 않는다 |

### 11-5. 로컬 임시 기록 (크래시 대비)

- 저장 전 기록은 Electron `userData/journal.jsonl`에 계속 기록한다(통신 없음).
- 강제 종료나 크래시 후 재실행하면 **"저장되지 않은 기록이 있습니다. 복구할까요?"**를 묻는다. 복구하면 바로 저장한다.
- 모든 저장 요청에는 `batchId`(UUID)가 붙고, 서버는 `commits` 테이블로 **멱등 처리**한다. 같은 저장을 두 번 보내도 한 번만 반영된다.
- 저장할 때 네트워크가 끊겨 있으면 "저장 실패, 연결되면 다시 시도" 메시지를 띄우고 기록은 그대로 보존한다.
- 체험판도 같은 구조를 쓴다. 저장 대상이 localStorage라는 점만 다르다.

### 11-6. 그 밖의 데이터

| 데이터 | 방식 |
|---|---|
| 항해 | 따로 요청하지 않는다. 저장할 때 **항해 기록**(현재 위치, 이동 거리, 연료 사용량, 선체 피해)을 함께 보낸다. 서버는 경과 시간 대비 이동 거리(최대 속도 이내)와 거리 대비 연료 소모가 현실적인지만 검증한다. 항해는 점수에 직접 들어가지 않아 이 정도 검증으로 충분하다 |
| 설정 (음량, 해상도, 키) | **로컬 전용** |
| 로그인 직후 | `/api/me`가 전체 상태를 한 번에 반환 (1회) |
| 순위표 | 서버 캐시(60초). 순위 창을 열 때만 요청 |

### 11-7. 서버 비용 관점

- 플레이어당 시간당 서버 호출이 **3~8회** 수준이다(세션 열기 + 저장 + 순위 조회).
- Neon Functions 무료 한도(월 100만 회 호출)로 초기 유저 규모를 충분히 감당하고, DB는 유휴 시간에 자동으로 일시정지된다. 자세한 비용은 12장 참고.
- 순위 조회는 캐시와 `season_scores` 인덱스로 처리해서 DB를 직접 두드리지 않는다.

---

## 12. 운영 비용 · Neon 요금제

> 2026년 11월 기준 Neon 공식 문서 확인 내용. 요금은 바뀔 수 있으므로 출시 전에 다시 확인한다.

### 12-1. Neon 요금제 비교

| 항목 | **Free** | **Launch** | Scale |
|---|---|---|---|
| 월 기본료 | 0원 | **최소 금액 없음** (쓴 만큼) | 최소 금액 없음 (쓴 만큼) |
| DB 컴퓨트 | 프로젝트당 월 **100 CU-시간** | $0.106 / CU-시간 | $0.222 / CU-시간 |
| DB 저장공간 | 프로젝트당 **1GB** | $0.35 / GB-월 | $0.35 / GB-월 |
| 파일 저장소 | 프로젝트당 **5GB** | $0.023 / GB-월 | $0.023 / GB-월 |
| 외부 전송량 (DB + 파일 + Functions 합산) | 프로젝트당 월 **5GB** | 월 500GB 포함, 초과 $0.10/GB | 월 500GB 포함, 초과 $0.10/GB |
| Functions 실제 계산 시간 | 월 **10 시간** | $0.10 / 시간 | $0.12 / 시간 |
| Functions 대기 시간 | 월 **400 시간** | $0.025 / 시간 | $0.03 / 시간 |
| Functions 호출 | 월 **100만 회** | $0.60 / 100만 회 | $0.60 / 100만 회 |
| 자동 일시정지 | 5분 유휴 시 (끌 수 없음) | 5분 (끌 수 있음) | 1분~상시 가동 설정 가능 |
| 최대 컴퓨트 | 2 CU | 16 CU | 16 CU 자동 확장 (고정 최대 56 CU) |
| 브랜치 | 프로젝트당 10개 | 10개 (추가 $1.50/월) | 25개 |
| 지원 | 커뮤니티 | 결제 지원 | 표준 지원 |

- 0.5달러 미만 청구서는 청구되지 않는다.
- Free 플랜에는 문서상 **비상업 용도 제한이 없다**(Vercel Hobby와 다른 점). 출시 전에 이용약관을 한 번 더 확인한다.
- Steam에 유료로 출시해도 Free로 시작할 수 있고, 한도를 넘기 시작하면 **Launch**로 올린다. 이 게임 규모라면 Scale은 필요 없다.

### 12-2. 무료 한도 안에서의 예상 사용량

가정: 일일 활성 유저 200명, 1인당 하루 2시간 플레이

| 항목 | 예상 사용량 | 무료 한도 | 판단 |
|---|---|---|---|
| Functions 호출 | 1인 시간당 약 8회 → 월 약 10만 회 | 100만 회 | 여유 |
| Functions 실제 계산 | 요청당 평균 20ms(로그인은 argon2로 약 100ms) → 월 1시간 미만 | 10시간 | 여유 |
| DB 컴퓨트 | 0.25 CU로 하루 약 12시간 깨어 있음 → 월 약 90 CU-시간 | 100 CU-시간 | **아슬아슬** |
| DB 저장공간 | 요약 저장 방식이면 유저당 수백 KB 수준 → 수백 MB | 1GB | 요약 저장이면 여유 |
| 전송량 | API 응답 평균 2~5KB, 어탁 이미지 약 30KB → 월 1~2GB | 5GB | 어탁 이미지를 작게 하면 여유 |
| 웹 체험판·랜딩 전송 | Cloudflare Pages / itch.io | Neon 한도와 무관 | — |

### 12-3. 무료 한도를 지키는 설정

1. **DB 컴퓨트 최대치를 0.25 CU로 고정**한다. 자동 확장을 막아 CU-시간 소모를 최소화한다.
2. **물고기 요약 저장**(8장 '용량 절약 원칙').
3. **어탁 이미지**: 320×180 인덱스 컬러 PNG(약 20~40KB). 클라이언트가 캐시하고, 같은 이미지는 다시 받지 않는다.
4. **순위 조회 캐시**: API 응답에 `Cache-Control: public, max-age=60`을 붙이고, Function 메모리에도 60초 캐시를 둔다. DB 쿼리와 전송량을 함께 줄인다.
5. **사용량 모니터링**: Neon 콘솔 사용량 화면을 주기적으로 확인한다. 한도의 80%에 도달하면 Launch 전환을 검토한다.

### 12-4. 한도를 넘으면 (Launch 전환 시 대략적 월 비용)

| 규모 (DAU) | DB 컴퓨트 (0.25~0.5 CU, 하루 18~24시간) | 저장·전송·Functions | 월 합계 (대략) |
|---|---|---|---|
| ~200 | Free 범위 | Free 범위 | **0원** |
| ~1,000 | 약 180~360 CU-시간 → $19~38 | 몇 달러 이하 | **약 $20~40** |
| ~5,000 | 0.5~1 CU 상시 → $40~80 | $5~10 | **약 $50~90** |

- 위 금액은 계산에 따른 추정치다. 실제 사용 패턴(접속 시간대 분포)에 따라 달라진다.
- (참고) 후속 실시간 기능의 Cloudflare 비용은 별도 계획서(`realtime-presence-plan.md`) 7장 참고. 동시 접속 100명 수준까지 무료다.

---

## 13. 개발 로드맵

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **M0 인프라** | 모노레포, Neon 셋업(Postgres·Storage·Functions), Hono API 골격, 스키마·마이그레이션, health 라우트 | build 통과 + DB·스토리지 왕복 성공 |
| **M1 계정** | 가입·로그인·로그아웃·세션·잠금, `/api/me` | curl로 가입 → 로그인 → me → 로그아웃 성공 |
| **M2 그래픽 & 렌더** | 팔레트, 스프라이트 파이프라인, 미리보기, 엔진, 선착장 배경, 낚시꾼 | 선명한 640×360 화면 + 스크린샷 확인 |
| **M3 낚시 코어** | 캐스팅 → 입질 → 텐션 미니게임 (LocalBackend) | 잡기·놓치기 가능, **손맛 튜닝** |
| **M4 Electron 셸 + 동기화** | Electron 앱, app:// 프로토콜, 로그인·가입 화면, safeStorage, RemoteBackend, 시드 세션, 이벤트 자동저장 + 수동 저장, 크래시 복구(11장) | 낚시 여러 번 → 저장 1회로 DB 반영. 강제 종료 후 복구 확인. 리셋 꼼수가 통하지 않음 |
| **M5 섬 허브 & 경제** | 섬 허브, 상점, 판매, 섬별 시세, 도감 | 임시 섬 2개로 교역 루프가 돌아감 |
| **M6 바다 & 배** | 탑다운 바다 맵(타일·카메라·직접 조종·클릭 이동), 섬 접안, 낚시 포인트 진입, 연료·신선도·암초·폭풍, 바다 색 4종 경계, 배 업그레이드, 해도(지도) 화면, 탑다운 그래픽 | 섬 사이를 직접 몰고 다니고, 포인트에 멈춰 낚시로 들어갈 수 있음 |
| **M7 스토리 모드** | 대화, 의뢰, 항해일지·대답·흔적·유물, 해금, 진실 컷신 | 프롤로그부터 진실 컷신까지 완주 가능 |
| **M8 무한 모드** | 점수, 임계치·징조·오염체, 오염체 미니게임 파라미터, 시뮬레이터 | 오염체가 의도한 간격으로 출현 |
| **M9 순위** | 주간·누적·오염체·월척, 시즌 마감 트리거, 칭호, 웹 순위 페이지, 치팅 검증 | 주간 마감 후 '바다의 주인' 칭호가 부여됨 |
| **M10 체험판** | demo 빌드, 콘텐츠 제한, DemoEnd, 랜딩 페이지 | `/demo`에서 체험판 완주 가능 |
| **M11 마감** | 효과음, 파티클, 오염 연출, 어탁, 설정(해상도·음량·키), 게임패드, 아이콘 | 완성도 점검 |
| **M12 배포** | `neon deploy`(production), Cloudflare Pages·itch.io, Windows 설치 파일, GitHub Releases, 자동 업데이트 | 설치 → 가입 → 플레이 → 순위 등재 |
| (추후) **Steam** | steamworks.js, Steam 로그인 연동, 업적, 스토어 페이지 | Steam 빌드 업로드 |

※ 섬 콘텐츠는 확정되는 대로 `packages/shared/data/islands.ts`에 반영한다. M5~M7은 임시 섬 데이터로 먼저 개발한다.

---

## 14. 미정 / 확인 필요

- **섬 목록과 각 섬의 이름·컨셉·물가·해금 조건, 체험판 포함 범위**: 사용자가 결정 (TBD)
- 오염체 목록과 이름 확정, SS 등급 '바다의 주인의 그림자'를 넣을지
- 점수식·임계치·확률 수치 → M8에서 시뮬레이터로 튜닝
- 스토리 완료 전에 잡은 물고기도 점수에 소급 반영할지 (현재안: 반영 안 함)
- 비밀번호 분실 대응: 현재는 복구 불가. 필요하면 "복구 코드"(가입 시 1회 표시) 방식을 추가 검토
- `neon init --services` 플래그 동작, `neon config add function`과 Function Trigger의 `neon.ts` 작성법 → M0에서 `--help`와 `neon-functions` skill 문서로 확인
- Neon Functions의 콜드 스타트 시간 (문서에 명시 없음) → M0에서 실측. 로그인·저장 응답 시간 목표 300ms 이내
- Neon 이용약관의 상업적 사용 조항 → 스팀 출시 전 최종 확인
- 커스텀 도메인(API·웹) 사용 여부
- 낚시꾼 애니메이션 품질 → M2에서 판단
- 탑다운 바다 맵의 크기와 섬·포인트 배치 → 섬 목록이 정해진 뒤 확정. Tiled로 편집할지
- 항해 수치: 배 속도·관성, 거리당 연료 소모, 충돌 피해량, 견인 페널티 → M6에서 플레이하며 조정
- 수동 저장 쿨다운(30초)과 미저장 알림 기준(30분) 수치
- 수동 저장 위치 제한 여부 (현재안: 어디서나 가능)
