# MEMORY — Fouth

Lessons from mistakes and operational gotchas in this project. Format: what happened /
root cause / correct behavior.

## 2026-11-02 — `brew install openjdk@21` "succeeded" but installed nothing
- **What happened:** the command exited 0, but `/usr/local/opt/openjdk@21/bin/java` did not exist; piping through `tail -15` hid the real messages.
- **Root cause:** this Mac is Intel x86_64, a Homebrew Tier 3 config with no prebuilt bottles.
- **Correct behavior:** after any install, check the binary: `test -x "$(brew --prefix openjdk@21)/bin/java"`. On this machine, use the Temurin tarball from `https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=mac&vendor=eclipse` (verify sha256) and set `JAVA_HOME` to its `Contents/Home`.

## 2026-11-02 — commit landed on someone else's branch in a shared folder
- **What happened:** another session checked out `docs/plan` in this folder at 12:28 and wrote an untracked PLAN.md (private job notes). My `git add -A` + commit went onto `docs/plan` and included PLAN.md; `git push origin feature/v0.1-rate-engine` then pushed the stale branch. Nothing private reached GitHub, by luck.
- **Root cause:** assumed HEAD was still my branch, and staged everything without reviewing files I did not create.
- **Correct behavior:** right before every commit run `git branch --show-current` and `git status -s`; stage explicit paths, never `git add -A`; ask about any file I did not write. When another session shares the folder, work in a separate `git worktree`. Private notes (`PLAN.md`, `OrangeCap_Interview_Prep.*`) are in `.gitignore`.
