# 미국→한국 주식 매핑 대시보드

## 주요 기능
- 200개+ 미국 주요 종목 (S&P500 전 섹터)
- 30개 섹터 ETF
- 코스피200 종목 매핑 + 상관도 표시
- 실시간 가격 추적 (30초 자동 새로고침)
- 종목별 뉴스 (Reuters, Bloomberg, CNBC 등 출처)
- AI 종합 분석 (웹 검색 기반)
- 정확도 추적

---

## 배포하기

### 1단계: GitHub 가입
1. https://github.com 접속 → "Sign up"
2. 이메일로 가입

### 2단계: 저장소 만들기
1. 우측 상단 **+** → **New repository**
2. 이름: `stock-dashboard`, **Public** 선택 → **Create repository**

### 3단계: 파일 업로드
1. 저장소 페이지 → **"uploading an existing file"** 클릭
2. `index.html`, `vercel.json`, `README.md` 드래그앤드롭
3. 아래 **Commit changes** 클릭

### 4단계: Vercel 배포
1. https://vercel.com 접속
2. **Continue with GitHub** 로그인
3. **Add New Project** → `stock-dashboard` 선택 → **Import**
4. 그대로 **Deploy** 클릭
5. 1분 후 링크 완성!

---

## Finnhub API 키 받기

실시간 데이터와 뉴스용 (없어도 Yahoo Finance 백업으로 작동).

1. https://finnhub.io/register 접속 후 가입 (무료, 이메일만)
2. Dashboard에서 **API Key** 복사
3. 사이트 우측 상단 **"API 설정"** 클릭 → 키 붙여넣기 → **저장 후 연결**
4. 무료 플랜: 분당 60회 (200종목 30초 갱신 충분)

---

## 수정 방법

저(Claude)한테 요청만 하세요. 수정된 파일을 받아서 GitHub에 다시 업로드하면 자동 반영됩니다.

---

## 사용 팁
1. **실시간 모드** — 우측 상단 "실시간 OFF" → "실시간 ON (30초)"
2. **종목 클릭** — 4개 탭 (개요/뉴스/AI 분석/한국 매핑)
3. **공유** — Vercel 링크 카톡으로 보내면 됨
