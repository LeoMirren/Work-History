# Agent kit

The agent kit is stored in this repo at `.claude/agent-kit/agent-kit-v2.zip`.

When I say to set up, install or update the agent kit, or when `~/.claude/skills/build-loop/SKILL.md` does not exist on this machine, do the following once, without asking me first:

1. From the repo root, run `unzip -o .claude/agent-kit/agent-kit-v2.zip -d ~ && bash ~/agent-kit-v2/install.sh`.
2. If the installer says `~/.claude/CLAUDE.md` is my own and was left alone, merge `~/.claude/CLAUDE.agent-kit.md` into it the way the installer's message describes.
3. Create `.agent/queue.md` if it is missing, with the content given in step 5 of `~/.claude/skills/setup-repo/SKILL.md`, and add `.agent/` to `.git/info/exclude`.
4. Add this repo's absolute path to `~/.claude/repos.txt` if it is not already listed.
5. Tell me what was installed, then carry on with what I asked for.

The evaluator, the planner and the build-loop skill are already in this repo's `.claude/` folder, so the build loop works here before the kit is installed.
