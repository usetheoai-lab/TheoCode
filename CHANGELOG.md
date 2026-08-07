# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The ACP surface no longer registers `request_user_input`, a tool it could not answer — every such call used to stall for five minutes waiting on a bridge only the terminal UI listens to (B-001)
- An authentication failure now surfaces as an authentication failure instead of being passed downstream as an empty key, which made the real cause resurface later as an unrelated provider error (B-007)

### Removed

- The unused `apiKey()` accessor and the transport dependency it fed: it was threaded through two modules and never read (B-007)

### Added

- `BACKLOG.md` — the single maintenance registry for TheoCode, seeded with 17 items derived from the TheoCode ↔ theokit cross-validation of 2026-08-07 (`.claude/knowledge-base/reviews/theokit-crossval-review-2026-08-07.md`)
- `CHANGELOG.md` — this file, required by Unbreakable Rule 6 and recorded as finding CI-010 in that same review
