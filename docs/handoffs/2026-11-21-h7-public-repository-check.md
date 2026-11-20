---
model: claude-sonnet-5-5 (scan), claude-fable-5-2 (review, rewrite and push)
effort: high
agent: sub-agent of the hub session for the scan; the hub for all changes
stage: H7, check of the public repository
---

# H7: check of the public repository, and the history rewrite

Back to the [status](../STATUS.md).

## Goal

The repository became public on 2026-11-21. The operator wanted a scan for information that must not be public, and an approval for each removal, one item at a time.

## Scope of the scan

- The 96 tracked files and all 265 file versions in the 65 commits, also files that were deleted later.
- All commit and tag messages, and the commit identities.
- The GitHub side: 0 issues, 0 pull requests, 0 releases, 0 forks, 0 workflow runs.

A sub-agent made the scan, read-only. It read each captured fixture and each internal record in full. It scanned the user documents and the source code with patterns only. The hub checked the three main findings with commands.

## Result

Clean: no API key, token, password, private key or cookie. No real e-mail address, telephone number, IP address or machine name. All commits use a GitHub "noreply" address.

The operator decided each item on 2026-11-21:

| No. | Item | Decision |
|---|---|---|
| 1 | A stray capture file in one old commit. It held the Windows account name in a path and one session id. | Remove, with a history rewrite |
| 2 | An old version of one handoff file. One line held the Windows account name. | Remove, with a history rewrite |
| 3 | The incident record of stage H5. Three lines held details of a different project of the operator. | Remove, also from the history |
| 4 | Session, thread and conversation ids in the captured fixtures | Keep |
| 5 | Account state in captures (a usage limit, an expired sign-in, an account type) | Keep |
| 6 | The list of programs on the operator's machine, with versions | Keep |
| 7 | Counts and names from the operator's tool configuration | Keep |
| 8 | Local paths without the account name | Keep |
| 9 | The operator's persona prompt in `AGENTS.md` | Keep |
| 10 | Cost figures and the install record | Keep |
| 11 | The session-dispatch records | Keep |
| 12 | Statements about defects in third-party products | Keep |
| 13 | Test results about the read modes of vendor products | Keep |
| 14 | `LICENSE`: the copyright line named a different owner | Change to the operator's name |
| 15 | GitHub settings: an old description, and secret scanning off | Change both |

## The history rewrite

- Tool: `git filter-repo`, first in a separate clone as a rehearsal, then in the working repository. The two runs gave the same commit ids.
- Rules: remove the stray file from all commits; replace the account name in paths with `%USERPROFILE%`; replace the three incident details with neutral text; replace one session id prefix in old versions of the status file and in one commit message.
- Effect: 65 commits became 63. Two commits became empty and were removed: the commit that deleted the stray file, and the commit that removed the account name from the handoff. The first two commits kept their ids. All later commits and all 7 release tags have new ids.
- Check after the rewrite: a search of every commit and every message for the removed strings gave 0 hits. The file tree of the last commit differs from the old one in one file only, the H5 record. The tests pass: 198 tests, 190 pass, 0 fail, 8 skipped.
- The commit ids that the older handoff files name were changed to the new ids (41 places).
- The branch and the tags were pushed with force.

## Limits

- A rewrite does not fully undo a publication. GitHub can keep the old commits reachable by their full id for some time. A person who cloned the repository before the rewrite has the old data. The repository had 0 forks.
- The sure method is to delete the repository on GitHub and to push the clean history to a new one. Only the operator can do that.
- The removed data was an account name, one session id and details of a different project. No credential was public, so no credential needs a replacement.
- A clone that was made before 2026-11-21 cannot merge with the new history. Make a new clone.

## Session dispatch decisions

- Scan: the calculator gave 3.15 USD to continue and 3.45 USD for a sub-agent at 12 calls (inside the 10 percent band, so the rule decides against a session that was summarised), and 4.25 USD against 3.70 USD at 16 calls. Verdict: a sonnet sub-agent at high effort. The brief was kept outside the repository, because it named the places of the private items.
- Questions to the operator: session dispatch not run, under 10 turns, no other trigger.
- Rewrite and push: continued in the hub. The steps are destructive and outward-facing, the operator approved them in the hub, and the hub must verify each result itself, so a hand-off saves nothing.

Measured cost of the scan sub-agent: 70 calls, 2.51 USD (`session-cost.mjs`, table `2026-11-20`). The projection was 1.1 USD: the full read of each capture and each record needed more context than the estimate.
