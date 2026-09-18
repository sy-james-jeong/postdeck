# PostDeck — Spec: Scheduled Publishing (예약발행)

- **작성일**: 2026-09-18 · **상태**: 자율(사용자 위임) → 실행 → 단위+매뉴얼 → 병합·푸시.
- **목적**: 미래 날짜로 예약해 둔 글을 때가 되면 자동 발행. "대시보드가 꺼져 있을 때 뭐가 트리거하나"의 정직한 답 = **외부 스케줄러(cron/GitHub Actions)가 `postdeck run-scheduled`를 주기 실행**. PostDeck은 데몬을 돌리지 않는다.

## 0. 결정 (자율)
1. **모델: 새 스키마 없음.** "예약" = `date`(발행일)가 있는 **draft**. 그 날짜가 지나면(`publishDate <= now`) 발행. → 기존 status/date 모델 재사용.
2. **안전장치: 날짜 없는 draft는 절대 자동발행 안 함**(작성중 초안 보호). 예약은 "draft에 발행일을 넣는" 옵트인.
3. non-draft(published/scheduled-live)는 대상 아님.
4. **트리거 = 외부 cron.** PostDeck은 `run-scheduled` 실행체만 제공(GitHub Actions/crontab 샘플 문서화). 데몬/상주 프로세스 없음.
5. `--deploy`로 발행분 배포까지(퍼블리시와 동일 규칙). 기본은 플립만.
6. **프로젝트 격리**: `--all`이라도 한 프로젝트 실패(예: cron 환경에 notion 토큰 없음)가 나머지를 막지 않음(try/catch per project).

## 1. 범위
- core `selectDuePosts(posts, now): Post[]` (순수): `status==='draft' && publishDate && publishDate<=now`.
- CLI `postdeck run-scheduled [--project <id> | --all] [--deploy] [--dry-run] [--config]`:
  - 타겟별로 `list()` → `toPost` → `selectDuePosts` → 각 `source.publish(id)`; `--deploy`면 발행 후 `deployProject`.
  - `--dry-run`: 무엇이 발행될지만 출력.
  - `main.ts`에 `run-scheduled` 서브커맨드.

## 2. 테스트
- 단위: `selectDuePosts`(과거/정각 due, 미래·무날짜·non-draft 제외); `parseRunScheduledArgs`.
- 매뉴얼(샌드박스): due(과거)·future·무날짜·published 4종 → dry-run이 due만, 실행이 due만 발행+커밋; 2회차 idempotent(nothing due); `--all` 동작. **완료.**
- 회귀 110 green, typecheck 클린.

## 3. 사용법 (문서)
글에 발행일을 미래로 두고 draft로 저장 → 아래를 주기 실행:
```yaml
# .github/workflows/scheduled-publish.yml (예시)
on:
  schedule: [{ cron: '0 * * * *' }]   # 매시
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: node apps/cli/bin/postdeck.mjs run-scheduled --all --deploy
        env: { GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}, NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}, NOTION_DB: ${{ secrets.NOTION_DB }} }
```
또는 로컬 crontab: `0 * * * * cd /path/to/postdeck && node apps/cli/bin/postdeck.mjs run-scheduled --all`.

## 4. 비목표 (이후)
- 대시보드에서 발행일 지정 input(현재는 frontmatter/Notion Date를 직접 설정 → 예약). 파일기반은 .md 수정이 자명, notion은 Date 속성.
- 시각(HH:MM)까지 정밀 예약 UI, 타임존 설정, 예약 취소 UI(= 날짜 지우거나 미래로).
