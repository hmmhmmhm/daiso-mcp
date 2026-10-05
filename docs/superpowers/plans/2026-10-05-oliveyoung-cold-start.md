# 올리브영 준비 대기 보강 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** 브라우저 준비35초가 뒤따른 올리브영 조회를 만료시키는 회귀를 수정합니다.

**Architecture:** 준비된 세션에서 Worker60초/브라우저API watchdog18초를 목표 예산으로40초 bounded queue를 사용합니다. 준비·회수를 더한 전체60초 보장은 아닙니다. 인증·슬롯·상한·취소·캐시 계약을 보존합니다.

**Tech Stack:** TypeScript, Vitest fake timers, Playwright lifecycle.

## Task 1: cold-start queue

Files: Modify scripts/relay/oliveyoung.ts; tests/relay/oliveyoung.test.ts 또는 별도 tests/relay/cold-start.test.ts. Modify docs/oliveyoung* 적절한 기존 운영문서 또는 위 spec.

- [x] 현재코드 전체 테스트로 baseline 확인
- [x] 첫 operation이35초 걸리고 두번째 operation도200이 되는 실패 테스트를 먼저 실행
- [x] 두 만료 검사 위치에 명명된40초 상수 사용.60초-18초 예산 이유 한국어주석
- [x] 정확히40초 대기 요청은 실행하지 않는 경계 및 합류자 freshness/취소 테스트. 기존30초 만료 테스트를40초 경계로 수정
- [x] 준비 실패는200/빈재고로 반환하거나 성공캐시하지 않는 기존/새 테스트 확인
- [x] focused 테스트, check·coverage100%·build, 독립 명세 및 품질 리뷰
- [ ] 한국어중립커밋 후 draft PR 생성. 검증 스크립트 하나만 기존Mac중계에 원자적반영·정상재기동·실제재고검증

## 독립 조사

- [x] Daiso 현재판매3종×매장키워드2 운영 재고와 공식원본 대조
- [x] CU/SevenEleven Mac 성공과 Worker차단의 범위 설명
- [x] GS25 공식 공개배포의 인증지원 여부와 완전복구 조건 조사. 키/로그 노출 및 임의유료호출 없음
