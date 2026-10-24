# Pushing this repository to GitHub

The sandbox that builds this project has **no GitHub credentials** (no `gh`
CLI, no `GITHUB_TOKEN`, no SSH keys), so the final `git push` must be done
either by you or by an environment that has a token.

Everything below is already prepared:

- a clean commit history on branch `main` (secrets, database files, logs and
  tool artifacts are excluded via `.gitignore`; `.env` is ignored),
- `LICENSE` (Apache-2.0) and `NOTICE.md` (ZCode attribution),
- a git bundle snapshot at `/home/z/payswap-zcode-workspace.bundle`.

## Option A — GitHub CLI (fastest)

```bash
cd /home/z/my-project
gh auth login                      # or: export GH_TOKEN=<your token>
gh repo create payswap-zcode-workspace --public --source=. --remote=origin --push
```

## Option B — plain git + a personal access token

```bash
cd /home/z/my-project
git remote add origin https://github.com/<your-org>/payswap-zcode-workspace.git
git push -u origin main            # prompts for username + token as password
```

## Option C — restore from the bundle anywhere

```bash
git clone /home/z/payswap-zcode-workspace.bundle payswap-zcode-workspace
cd payswap-zcode-workspace
git remote set-url origin https://github.com/<your-org>/payswap-zcode-workspace.git
git push -u origin main
```

Suggested repo description:

> PaySwap economic-goal workspace on ZCode foundations — routines, network
> opportunities, sandbox checkout, dockable browser/terminal. Apache-2.0.
