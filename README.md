# 미국→한국 주식 매핑 대시보드

미국 주요 종목과 ETF 움직임을 한국 관련 종목으로 매핑해서 보는 단일 페이지 대시보드입니다.

## 구성

- `index.html`: 대시보드 화면
- `api/fetch-data.js`: Vercel 서버리스 API. 미국 최신 일봉 종가, 한국 매핑 종목 가격, Finnhub, 네이버 뉴스, 구글 뉴스, 선택적 AI 번역/분석을 서버에서 호출합니다.
- `data/us-stocks.generated.json`: S&P500 전체 자동 수집/분류 초안
- `data/kr-stocks.generated.json`: KOSPI200 + 테마 핵심주 한국 유니버스 초안
- `data/sector-taxonomy.json`: 세부섹터/테마 분류 사전
- `data/theme-core-kr.json`: KOSPI200 밖이지만 매핑에 중요한 한국 테마 핵심주
- `data/us-korean-names.json`: 미국 주요 종목 한국어 표시명 사전
- `scripts/build-universe.mjs`: 공개 표를 다시 가져와 데이터 파일을 재생성하는 스크립트
- `scripts/import-kosdaq150-csv.mjs`: KRX에서 받은 코스닥150 CSV를 한국 유니버스에 병합하는 스크립트
- `supabase/schema.sql`: 자동 기록용 Supabase 테이블
- `.github/workflows/market-tracker.yml`: GitHub Actions 무료 스케줄러
- `scripts/generate-daily-signals.mjs`: 07:00 KST 미국장 기반 매핑 신호 생성
- `scripts/record-intraday-snapshots.mjs`: 09:00~20:10 KST 10분 간격 한국 매핑 종목 가격 기록
- `scripts/finalize-daily-results.mjs`: 장중 최고 반응/지속성/등급 계산
- `scripts/archive-old-snapshots.mjs`: 30일 지난 원본 스냅샷을 아카이브 테이블로 이동 후 삭제
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
- 종목 표에는 미국 티커/영문명과 함께 가능한 경우 한국어 회사명을 같이 표시합니다.
- 대분류 섹터를 누르면 세부섹터 필터가 나타납니다. 예: 반도체 → AI GPU/가속기, 메모리/HBM, 반도체 장비, 차량용/MCU/전력반도체 등.

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

## 자동 기록 시스템

무료로 컴퓨터를 꺼둔 상태에서도 기록하려면 `Supabase Free + GitHub Actions Free` 조합을 사용합니다.

동작 방식:

```txt
07:00 KST
미국장 종가/등락률 기준 daily_signals 생성

09:00~20:10 KST
매핑된 한국 종목 전체를 10분마다 기록
한국 가격은 네이버 금융을 먼저 조회하고, 실패하면 Yahoo Finance를 사용

20:20 KST
장중 최고 반응률, 종가/마지막가, 반납률, 지속성, 등급 계산

21:00 KST
30일 지난 intraday_snapshots 원본을 intraday_snapshots_archive로 이동하고,
Google Drive 설정이 있으면 CSV 백업 파일도 업로드한 뒤 원본 테이블에서 삭제
```

Supabase 설정:

1. Supabase 프로젝트 생성
2. Supabase SQL Editor에서 `supabase/schema.sql` 전체 실행
3. Project Settings → API에서 아래 값을 확인
   - Project URL
   - service_role key
4. GitHub 저장소 → `Settings` → `Secrets and variables` → `Actions` → `New repository secret`
5. 아래 2개 추가

```txt
SUPABASE_URL=Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
```

주의: `SUPABASE_SERVICE_ROLE_KEY`는 GitHub Secrets에만 넣고, `index.html`, Vercel 공개 환경변수, README 본문에 실제 값을 넣으면 안 됩니다.

## Google Drive 백업 설정

Google Drive 백업은 선택 사항입니다. 설정하지 않아도 Supabase 내부 아카이브 테이블(`intraday_snapshots_archive`)에는 계속 저장됩니다.

Google Drive까지 백업하려면 Google Cloud에서 서비스 계정을 만들고, 백업용 Drive 폴더를 그 서비스 계정 이메일에 공유한 뒤 GitHub Secrets에 아래 3개를 추가하세요.

```txt
GDRIVE_CLIENT_EMAIL=서비스 계정 이메일
GDRIVE_PRIVATE_KEY=서비스 계정 private_key
GDRIVE_FOLDER_ID=구글드라이브 백업 폴더 ID
```

백업 파일은 Drive 폴더에 `intraday_snapshots_archive_before_YYYY-MM-DD.csv` 형식으로 올라갑니다.

주의:

- `GDRIVE_PRIVATE_KEY`도 절대 GitHub 파일이나 README 본문에 직접 넣으면 안 됩니다.
- Google Drive 폴더는 반드시 서비스 계정 이메일에 공유해야 업로드됩니다.
- 백업은 30일 지난 데이터를 아카이브할 때 같이 실행됩니다.

GitHub Actions는 `.github/workflows/market-tracker.yml` 파일이 올라가면 자동으로 활성화됩니다. 수동 테스트는 GitHub 저장소의 `Actions` 탭에서 `Market Tracker` → `Run workflow`를 눌러 실행할 수 있습니다.

## 한국장 휴장일 처리

`data/kr-market-calendar.json`에 한국장 휴장일을 넣어두었습니다. 주말 또는 휴장일이면 아래 작업은 자동으로 `skipped` 처리됩니다.

- 07:00 KST 미국장 기반 신호 생성
- 09:00~20:10 KST 한국 종목 가격 기록
- 20:20 KST 일별 결과 계산

해가 바뀌면 `data/kr-market-calendar.json`의 `closedDates`에 다음 해 휴장일을 추가하면 됩니다.

임시공휴일처럼 갑자기 지정되는 휴장일은 현재 버전에서 자동으로 외부 사이트를 계속 조회해서 반영하지 않습니다. 임시공휴일이 생기면 `data/kr-market-calendar.json`의 `closedDates`에 날짜를 한 줄 추가해서 GitHub에 다시 올리면 됩니다.

대시보드 상단에는 한국시간 기준 오늘 날짜, 현재 시간, 장 상태가 표시됩니다. 이 표시는 `data/kr-market-calendar.json`을 기준으로 계산됩니다.

기록 등급 기준:

```txt
A: 장중 최고 반응 강함 + 유지율 높음
B: 장중 반응 있음 + 일부 유지
C: 장중 펌핑 후 반납
D: 약한 반응
F: 반대 방향
```
