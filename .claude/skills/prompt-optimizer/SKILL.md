---
name: prompt-optimizer
description: "Auto-triggers when Claude detects a vague, unstructured, or ambiguous user prompt. Triggers on: optimize prompt, improve prompt, rewrite prompt, make this better, vague task descriptions without specific file paths or concrete requirements."
alwaysApply: false
---

# Prompt Optimizer Skill

When triggered, follow this process:

1. Analyze the raw prompt for ambiguity and missing context
2. Scan the codebase to find relevant files, patterns, and current state
3. Rewrite the prompt using the 4-element pattern:
   - File/location: specific paths discovered from codebase
   - Expected behavior: what should happen
   - Observed behavior: what currently happens (if bug fix)
   - Tech stack context: versions, frameworks, relevant config
4. Add: logical task ordering, edge cases, validation criteria, abort conditions
5. Present the optimized prompt to the user in a code block
6. Ask: "Execute this? (yes / edit / ralph N iterations)"
7. Execute based on response
