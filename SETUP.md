# 출입 관리 시스템 설정 가이드

## 1. Supabase 프로젝트 생성

1. https://supabase.com 접속 → 새 프로젝트 생성
2. Project Settings → API 에서 아래 두 값 복사

## 2. .env.local 설정

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 3. 데이터베이스 테이블 생성

Supabase → SQL Editor → `supabase/schema.sql` 파일 내용 붙여넣고 실행

## 4. 실행

`시작.bat` 더블클릭 → http://localhost:3000

## 엑셀 업로드 형식

첫 번째 시트, 첫 번째 행이 헤더여야 합니다:

| 번호 | 이름 | 소속 | 바코드 |
|------|------|------|--------|
| 1 | 홍길동 | 강남의원 | 20260000001 |
