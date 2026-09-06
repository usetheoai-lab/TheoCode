"""Cross-validation of BACKLOG.md against the git history that closed it.

What /review's cross-validation agent does, run mechanically: for every closed item, does the
commit named as its fix exist, and does its diff touch the code the item is about?

This is the gate the 2026-08-08 review RECOMMENDED after finding B-007's `fixed_in` commit never
touched the file its evidence named. Running it over the remediation that came out of that review
is the point.

Scoping, stated because a first version got it wrong: only `packages/**` paths count as "the code
the item is about". The `evidence:` line cites the REVIEW REPORT, which no fix should touch, and
`docs/` references are documentation the item talks about rather than code it changes. Counting
those produced 36 false findings — the exact fabrication this check exists to catch.
"""
import re, subprocess, sys, pathlib

t = pathlib.Path("BACKLOG.md").read_text(encoding="utf-8")
blocks = re.split(r"\n(?=## B-\d+ — )", t)
sh = lambda *a: subprocess.run(a, capture_output=True, text=True).stdout

ok, problems, skipped = [], [], []
for b in blocks:
    m = re.match(r"## (B-\d+) — (.*?)\s+\[(.)\]", b)
    if not m or m.group(3) != "x":
        continue
    bid = m.group(1)
    fx = re.search(r"^fixed_in: (.+)$", b, re.M)
    if not fx:
        problems.append((bid, "closed with no `fixed_in`", "nothing records which commit closed it"))
        continue
    raw = fx.group(1)

    # Every sha-shaped token, split on commas AND whitespace.
    #
    # Two coverage gaps measured 2026-09-03, both of which made this gate report health over items it
    # had not looked at:
    #
    #   - `x.strip().split()[0]` took the FIRST token of each comma-separated part, so a
    #     space-separated pair (`2eb9c26 ea99717`) had its second commit silently dropped. Five items
    #     were in that shape.
    #   - The skip was `"theokit" in raw`, a substring test. B-094's `fixed_in` reads
    #     `c969e25 (TheoCode) · @theokit/agents@7.5.0 · …` — a LOCAL commit plus the upstream releases
    #     it shipped with — and the whole item was skipped because the word appeared.
    #
    # An item is skipped now only when it has no local commit to check, which is what "no local commit
    # by design" claimed all along.
    candidates = [t for t in re.split(r"[,\s·]+", raw) if re.fullmatch(r"[0-9a-f]{7,40}", t)]
    local = [t for t in candidates if sh("git", "cat-file", "-t", t).strip() == "commit"]
    if not local:
        skipped.append((bid, "decision-only or upstream — no local commit by design"))
        continue

    touched = set()
    for s in candidates:
        if not re.fullmatch(r"[0-9a-f]{7,40}", s):
            continue
        if sh("git", "cat-file", "-t", s).strip() != "commit":
            problems.append((bid, "`fixed_in` names a commit that does not exist", s))
            continue
        touched |= set(sh("git", "show", "--name-only", "--format=", s).split())
    if not touched:
        problems.append((bid, "`fixed_in` commit(s) touched no files", raw))
        continue

    # only source paths count; drop the evidence line first so the report citation is not counted
    body = re.sub(r"^evidence:.*$", "", b, flags=re.M)
    named = set(re.findall(r"`(packages/[\w./-]+\.(?:ts|tsx))", body))
    named |= {f"packages/{p}" for p in re.findall(r"`((?:agent|cli|tui|shared)/src/[\w./-]+\.tsx?)", body)}
    named = {n for n in named if pathlib.Path(n).exists()}
    if not named:
        ok.append((bid, len(touched), "no source path named"))
        continue
    hit = {n for n in named if any(n in tf for tf in touched)}
    if not hit:
        problems.append((bid, "fix touched NONE of the source paths its own text names",
                         ", ".join(sorted(named))))
    else:
        ok.append((bid, len(touched), f"{len(hit)}/{len(named)} named source paths touched"))

print(f"closed items cross-validated : {len(ok) + len(problems)}")
print(f"  consistent                 : {len(ok)}")
print(f"  problems                   : {len(problems)}")
print(f"  skipped (decision/upstream): {len(skipped)}")
for bid, what, detail in problems:
    print(f"\n  {bid}  {what}\n        {detail[:160]}")
sys.exit(1 if problems else 0)
