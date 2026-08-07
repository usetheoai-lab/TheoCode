# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The agent now introduces itself as TheoCode, on the SDK it actually runs on. It was calling itself "Theokit Builder" in the system prompt, the greeting, the banner, the composer placeholder and the directory-trust dialog — the last of which asked for filesystem and command-execution permission in the name of a product that does not exist (B-002)
- Pressing ESC on a pending question now unblocks the turn immediately. The question was removed from the screen but never withdrawn from the agent, so the model kept waiting on it for five minutes while the interface showed it as gone (B-004)
- The "a question is already pending" error now reads in English and can be caught by type from the package entrypoint, instead of being reachable only by matching its message (B-004)
- Session cleanup now refuses to run when it cannot read which session is live, instead of treating an unreadable pointer as "no session is live" and proceeding to delete (B-003)
- The ACP surface no longer registers `request_user_input`, a tool it could not answer — every such call used to stall for five minutes waiting on a bridge only the terminal UI listens to (B-001)
- An authentication failure now surfaces as an authentication failure instead of being passed downstream as an empty key, which made the real cause resurface later as an unrelated provider error (B-007)

### Removed

- The unused `apiKey()` accessor and the transport dependency it fed: it was threaded through two modules and never read (B-007)

### Added

- `BACKLOG.md` — the single maintenance registry for TheoCode, seeded with 17 items derived from the TheoCode ↔ theokit cross-validation of 2026-08-07 (`.claude/knowledge-base/reviews/theokit-crossval-review-2026-08-07.md`)
- `CHANGELOG.md` — this file, required by Unbreakable Rule 6 and recorded as finding CI-010 in that same review
