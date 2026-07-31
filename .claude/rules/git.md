# Git Workflow

How this project commits, branches, and pushes. Conventions enforced by `@commitlint/config-conventional` (see root `package.json`).

## Commit messages

Follow Conventional Commits:

```text
<type>(<scope>): <subject>

<body>

<footer>
```

Types in use across this repo:

- `feat` — new feature or capability
- `fix` — bug fix
- `chore` — tooling, config, dependency bumps, no production change
- `docs` — documentation only
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adds or fixes tests
- `perf` — performance improvement
- `build` — build system or external dependency change

Subject line:

- imperative mood ("add", not "added")
- lowercase after the colon (`feat(search): add suggest endpoint`)
- no trailing period
- header total length ≤ 100 characters (strictly enforced by `@commitlint/config-conventional`)
- commit body must explain **WHY** the change was made, not just what changed

## Auto-commit policy

**Never auto-commit.** The user generates commit messages for substantial work. Only commit when the user explicitly asks.

## Branches

- `main` is the long-lived default branch.
- Feature branches follow `<type>/<scope>` (e.g. `feature/search-station`, `fix/inventory-grpc-timeout`).
- Squash-merge feature branches into `main` with a Conventional Commits subject.

## Commit body / footer

End commits authored by Claude with:

```text
Co-Authored-By: Claude <noreply@anthropic.com>
```

End PR bodies with:

```text
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## When to ask

Always ask before:

- `git commit` / `git push`
- `git merge` / `git rebase` / `git tag`
- `git reset --hard` / `git clean -fdx`
- `git push --force`

Never rewrite history on a shared branch.
