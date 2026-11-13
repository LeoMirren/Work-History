---
name: build-loop
description: Contract, build, independent evaluation, fix, repeat until it passes. Use on your own for any feature, any fix that spans several files, and any refactor, and whenever a /goal or the task queue names this skill. Not for small local edits.
argument-hint: [task]
effort: high
---
Task: $ARGUMENTS

Budgets: contract, one review round. Evaluation, at most 3 evaluator rounds. Whole run, the turn limit in the /goal condition if one is set.

1. Setup. Create `.agent/<task-slug>/` and add `.agent/` to `.git/info/exclude` if it is not there. If `progress.json` already exists in that folder, read it and resume from its last entry.

2. Spec, only if the request is vague or starts from nothing. Ask the planner subagent for a spec and save it as `spec.md`.

3. Contract. Write `contract.md`: numbered criteria, each one checkable by running the software, each with how to check it. Vague criteria get vague verdicts, so prefer many specific criteria over a few broad ones. Ask the evaluator subagent to review the contract only. Revise once, then start building.

4. Build until you believe every criterion holds and the repo's fast check passes.

5. Evaluate. Give the evaluator subagent only the contract path and how to install and run the project. Do not pass it your reasoning or what you expect to pass. Save its report as `eval-<n>.md` and append an entry to `progress.json`:
   `{"round": n, "tried": "...", "evaluator_found": ["..."], "fixed": ["..."], "result": "5 of 7 pass"}`

6. Decide.
   - Every criterion passes: stop. Done.
   - Some fail, and this round fixed at least one criterion that failed before (or this was round 1): fix the failures and the correctness defects, then go back to step 5.
   - The same criterion failed in two rounds: rebuild that part a different way instead of patching it again.
   - This round fixed nothing that failed before, or this was round 3: stop.
   - A criterion is NOT TESTED because it cannot be checked as written: rewrite it so it can, and note the change in `progress.json`. Do not weaken a criterion to make it pass.

7. Report, in the format from CLAUDE.md. Include the final PASS/FAIL table. If you stopped without a full pass, say what blocked you and what you would try next. If the task came from `.agent/queue.md`, change its line to `- [x]` on a full pass or `- [!]` when blocked.

Within a round, run each check once after the change it covers. Reproduce an evaluator failure once before fixing it, and do not re-verify its passing criteria yourself.
