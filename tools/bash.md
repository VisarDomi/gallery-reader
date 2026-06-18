# Bash / Git tool

## Failures

- `git checkout <commit> -- <file>` — overwrites the working tree, destroying uncommitted changes.

## Passes

- `git show <commit>:<path>` — reads a file from any commit without side effects.
