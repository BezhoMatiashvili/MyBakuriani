Same behavior as /split but wraps each agent in a ralph-loop command.

Read and follow the entire process described in .claude/commands/split.md with one change:

In the SPLIT_COMMANDS.md output, Step 2 should show each agent tab using ralph-loop instead of a plain prompt:

/ralph-loop:ralph-loop "Read .claude/prompts/split-{N}-{short-name}.md and execute all instructions. Output DONE when complete." --max-iterations {M}

Auto-calculate iterations based on task complexity per agent:
- Documentation or comments only: 3
- Single file fix: 5
- Multi-file fix 2-5 files: 8
- Complex feature or migration: 12
- Large refactor 10+ files: 15

INPUT: $ARGUMENTS (path to a .md file)

After generating everything, show the user: how many agents, what each one does, estimated time per agent, total iterations, and any deferred items.
