# Editorial Atelier design QA

final result: in_progress

## Scope

Full-site visual refactor using the local Editorial Atelier reference and the implementation plan. The formal service and D:\方寸数据 are out of scope for writes during the redesign.

## Safety baseline

- Backup: D:\方寸数据\backups\pre-upgrade\fangcun-pre-upgrade-2026-09-08T13-38-06-108Z.db
- Backup SHA-256: b0ff70bc1d2d69184fa1d7a2e71dd0c19fe5f9aa494b5c44382f715f20daa69b
- Baseline counts: book_editions=1, owned_copies=1, shelf_locations=2, categories=0, tags=0, loans=0, annotations=0, research_works=0, research_folders=0, concepts=0

## Current checks

- TypeScript: passed after the first three implementation rounds.
- Targeted lint: passed with warnings before import cleanup; import cleanup is complete and must be rerun.
- Desktop visual smoke: homepage, add, library, and manage screenshots captured at 1441x778.
- Mobile visual smoke: homepage, search, and manage screenshots captured at 375x812.
- Known iteration fixed: desktop navigation hidden below 1280px; mobile manage create input keeps usable width.
- Remaining: full route screenshots, interaction regression, isolated 0/1/5/100+ data checks, full lint, build, formal release publish and post-publish count comparison.

## Findings

P0: none recorded.
P1: none recorded.
P2: none recorded while in progress.
