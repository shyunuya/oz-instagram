# oz-instagram

[@seoulcity.the.brightest](https://www.instagram.com/seoulcity.the.brightest/)에 서울 지역별 사진을 캐러셀로 자동 게시하는 봇입니다.

- 사진: [한국관광공사 관광사진 정보 API](https://www.data.go.kr/data/15101914/openapi.do)(공공누리 제1유형). 게시물마다 작가, 연도, 출처를 코드가 붙입니다.
- 게시물: 서울의 한 지역을 주제로 5~6장, 세로 4:5(1080×1350).
- 필터: 낮 사진은 Clean(대비와 채도를 살짝 올리고 선명하게), 야경은 Moody(어둡고 대비 강하게, 청록 톤과 비네트). 야경은 관광공사 제목과 키워드, 밝기로 판단합니다. 거의 새까만 사진은 뺍니다.
- 캡션: 지역별 영어 캡션 묶음(`config/areas.json`의 `captions`)을 돌려 씁니다.
- `ANTHROPIC_API_KEY`를 넣으면: Claude(`claude-opus-5-5`)가 후보 8장 중 겹치거나 약한 사진을 빼고 순서를 정한 뒤, 사진에 맞는 영어 캡션을 씁니다.
- 승인: 매주 PR을 머지해야 그 주 게시물이 올라갑니다.

## 흐름

| 언제 | 무엇 | 워크플로 |
|---|---|---|
| 매주 목 12:00 KST | 다음 주 큐(`queue/<주>/posts.json`, `media/<주>/*.jpg`)와 미리보기 README를 만들어 PR을 엽니다 | `plan-week` |
| 사람이 검토 (다음 목요일 전까지) | 빼고 싶은 사진/게시물에 `"skip": true`, 캡션은 `body` 수정 → **머지 = 승인**. 머지 전 PR의 사진은 다음 주 계획이 모르므로, 다음 목요일 전에 머지해 주세요 | `ci`가 검증 |
| 08:00, 12:00, 20:00 KST | 게시 시각이 지난 승인된 게시물 하나를 올리고 `data/posted.json`에 기록합니다 | `publish` |
| 매주 월 | 인스타 장기 토큰(60일)을 갱신합니다 | `refresh-token` |

하루 게시 수는 `config/schedule.json`의 `postsPerDayByWeek`(워밍업: 1주차 1개, 이후 2개)와 `slotsKst`로 정합니다. 지역은 `config/areas.json`에서 고칩니다. `anyYear: true`인 지역(궁궐, 산, 한양도성)은 2015년 이전 사진도 씁니다.

## 로컬 실행

```sh
cp .env.example .env    # 키 입력
npm install
npm run plan-week -- --week 2026-W43    # 큐와 미리보기 생성
MEDIA_BASE_URL=https://raw.githubusercontent.com/<owner>/oz-instagram/main/ npm run publish -- --dry-run
npm test && npm run typecheck && npm run validate
```

`publish --dry-run`은 캐러셀 컨테이너까지만 만들고 게시하지 않습니다. 게시하지 않은 컨테이너는 24시간 뒤 사라집니다.

## GitHub 설정

레포는 **public**이어야 합니다. 인스타그램이 `raw.githubusercontent.com`에서 이미지를 직접 가져가기 때문입니다.

- **Settings → Secrets and variables → Actions:**
  - `KTO_SERVICE_KEY`: 공공데이터포털 인증키
  - `IG_ACCESS_TOKEN`: Meta 앱 `oz-run`에서 발급한 인스타 토큰
  - `ANTHROPIC_API_KEY`: 선택. 없으면 캡션 묶음을 쓰고 사진은 앞에서부터 고릅니다
  - `SECRETS_PAT`: 이 레포의 Secrets 쓰기 권한만 준 fine-grained PAT (토큰 자동 갱신용)
- **Settings → Actions → General:** "Allow GitHub Actions to create and approve pull requests"를 켭니다.

## 문제가 생기면

- 게시물이 조건에 맞지 않으면 `publish`가 실패로 기록하고(`data/posted.json`의 `failed`) 다음 게시물로 넘어갑니다. 고친 뒤 그 항목을 지우면 다시 시도합니다.
- 게시 직후 기록 전에 작업이 끊겨도, 다음 실행이 최근 게시물의 캡션을 비교해 중복 게시하지 않습니다.
- 토큰이 만료됐다면 Meta 앱에서 다시 발급해 `IG_ACCESS_TOKEN`을 바꿉니다.
