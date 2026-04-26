# 미국→한국 주식 매핑 대시보드

미국 주요 종목과 ETF 움직임을 한국 관련 종목으로 매핑해서 보는 단일 페이지 대시보드입니다.

## 구성

- `index.html`: 대시보드 화면
- `api/fetch-data.js`: Vercel 서버리스 API. Finnhub, 네이버 뉴스, 구글 뉴스, 선택적 AI 번역/분석을 서버에서 호출합니다.
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
ANTHROPIC_API_KEY=본인 Anthropic API Key
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
- 대시보드를 켜둔 동안에는 기존 실시간 버튼으로 주기 갱신할 수 있습니다.
- `vercel.json`의 Cron은 하루 1회 헬스체크/웜업 용도입니다.

5분마다 백그라운드 자동 수집을 하려면 Vercel Pro 또는 외부 Cron 서비스와 별도 저장소가 필요합니다.
