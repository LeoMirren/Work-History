---
name: fanout
description: Runs wide, parallel work (audits, migrations, reviews across several dimensions, the same change in many places or repos) as a dynamic workflow with named agents and cross-checked results. Use on your own when work splits into three or more independent parts, and whenever I ask for a workflow, a swarm, a graph or parallel agents.
argument-hint: [task]
---
Task: $ARGUMENTS

I installed this skill so that wide work runs as a workflow. Using it is my request for the Workflow tool.

1. Decide whether this needs a workflow. With fewer than three independent units, do the work directly or with one or two named subagents.

2. Use a workflow with four phases.
   - Discover: list the units (files, routes, packages, repos).
   - Work: one agent per unit, each with a self-contained prompt that uses absolute paths and states the check that proves its unit is done. Agents that change files work in an isolated copy.
   - Check: independent agents test the findings or changes that matter. Do not spend an agent on every unit that reports a clean pass.
   - Merge: one ranked summary with the evidence for each unit.

   Set `agentType` on every `agent()` call, because an agent without it runs as an unnamed generic worker. Use this repo's own agents from `.claude/agents/` where one fits, `Explore` for discovery, a reviewer or `evaluator` for the check phase, and `general-purpose` only when nothing fits. Give each agent a `label` that names its unit. The script starts the agents, and `workflow()` runs one child workflow. An agent whose own unit splits into independent parts may start named agents of its own; say so in its prompt.

   When the workers need to talk to each other while they work, use an agent team instead (`/agent-teams:team-feature`, `/agent-teams:team-review`, `/agent-teams:team-debug`).

3. Limits. Stay within the workflow size guideline in force. For iterative searches, stop when two rounds in a row add nothing new. Use low effort or a cheaper model for well-specified unit work. A failed unit gets one retry with the checker's output, then is reported as blocked.

4. Run it on a small slice first, and report the agent count and token use before the full run.

5. If workflows are not available in this session, run the same four phases with subagents, four at a time.

6. If the run is worth repeating, tell me to save it from /workflows with `s`.
