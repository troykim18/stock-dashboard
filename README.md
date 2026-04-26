# 미국→한국 주식 매핑 대시보드

미국 주요 종목과 ETF 움직임을 한국 관련 종목으로 매핑해서 보는 단일 페이지 대시보드입니다.

## 구성

- `index.html`: 대시보드 화면
- `api/fetch-data.js`: Vercel 서버리스 API. 미국 최신 일봉 종가, 한국 매핑 종목 가격, Finnhub, 네이버 뉴스, 구글 뉴스, 선택적 AI 번역/분석을 서버에서 호출합니다.
- `data/us-stocks.generated.json`: S&P500 전체 자동 수집/분류 초안
- `data/kr-stocks.generated.json`: KOSPI200 + 테마 핵심주 한국 유니버스 초안
- `data/sector-taxonomy.json`: 세부섹터/테마 분류 사전
- `data/theme-core-kr.json`: KOSPI200 밖이지만 매핑에 중요한 한국 테마 핵심주
- `scripts/build-universe.mjs`: 공개 표를 다시 가져와 데이터 파일을 재생성하는 스크립트
- `scripts/import-kosdaq150-csv.mjs`: KRX에서 받은 코스닥150 CSV를 한국 유니버스에 병합하는 스크립트
- `vercel.json`: Vercel 배포 설정. 무료 Hobby 플랜 기준으로 Cron은 하루 1회만 설정되어 있습니다.

## Vercel 환경변수

Vercel 프로젝트의 `Settings` → `Environment Variables`에 아래 값을 추가하세요.

```txt
FINNHUB_API_KEY=본인 Finnhub API Key
NAVER_CLIENT_ID=본인 Naver Client ID
NAVER_CLIENT_SECRET=본인 Naver Client Secret
```

AI 번역/분석까지 쓰려면 아래도 추가합니다.

```txt
OPENAI_API_KEY=본인 OpenAI API Key
```

모델을 직접 지정하고 싶으면 선택적으로 추가할 수 있습니다.

```txt
OPENAI_MODEL=gpt-5.4-nano
```

키는 절대 `index.html`이나 GitHub 저장소에 직접 넣지 마세요.

## 배포 방법

1. GitHub 저장소에 이 폴더의 파일을 그대로 올립니다.
2. Vercel에서 해당 GitHub 저장소를 Import 합니다.
3. 환경변수 3개를 추가합니다.
4. Deploy를 누릅니다.

## 업데이트 방식

무료 Hobby 플랜에서는 Vercel Cron이 자주 실행되지 않습니다. 그래서 이 프로젝트는 다음 방식으로 동작합니다.

- 페이지를 열면 `/api/fetch-data`를 통해 최신 가격/뉴스를 가져옵니다.
- 미국 종목은 최신 일봉 종가와 전 거래일 대비 등락률을 표시합니다.
- 한국 매핑 종목은 종목명 옆에 원화 가격과 등락률을 표시합니다.
- S&P500 전체 데이터는 자동 분류 초안입니다. 한국 매핑은 세부섹터별 후보를 먼저 붙이고, 최종 검수는 사람이 해야 합니다.

## 코스닥150 CSV 추가 방법

KRX 정보데이터시스템에서 코스닥150 구성종목 CSV를 받아서 추가할 수 있습니다.

1. KRX 정보데이터시스템 접속: `http://data.krx.co.kr`
2. 메뉴에서 `지수` → `주가지수` → `지수구성종목` 이동
3. 지수명에 `코스닥 150` 또는 `KOSDAQ 150` 검색
4. 조회 결과가 나오면 다운로드 버튼으로 CSV 또는 Excel 저장
5. Excel로 받은 경우 열어서 `다른 이름으로 저장` → `CSV UTF-8` 형식으로 저장
6. 파일 이름을 `kosdaq150.csv`로 바꿔서 `data/kosdaq150.csv` 위치에 넣기
7. 로컬에서 아래 명령 실행

```bash
node scripts/import-kosdaq150-csv.mjs
```

8. 실행 후 `data/kr-stocks.generated.json`에 코스닥150 종목이 병합됩니다.

CSV에는 최소한 아래 열이 있으면 됩니다. KRX 다운로드 파일의 열 이름이 조금 달라도 스크립트가 주요 이름을 자동으로 찾습니다.

```txt
종목코드, 종목명
```

업종 열이 있으면 1차 섹터 추정에 사용합니다. 세부섹터와 미국 종목 매핑은 이후 직접 검수하는 것이 좋습니다.
- 대시보드를 켜둔 동안에는 기존 실시간 버튼으로 주기 갱신할 수 있습니다.
- `vercel.json`의 Cron은 하루 1회 헬스체크/웜업 용도입니다.

5분마다 백그라운드 자동 수집을 하려면 Vercel Pro 또는 외부 Cron 서비스와 별도 저장소가 필요합니다.
