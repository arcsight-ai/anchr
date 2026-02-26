# pull_request_target Safety — ANCHR Gate

## Why we use `pull_request_target`

The canonical gate workflow (`.github/workflows/anchr-gate.yml`) uses `pull_request_target` so that:

- The job runs in the **base** repository context with write permissions (required to post comments and create check runs).
- PRs from forks still get one ANCHR comment and one check run without exposing base-repo secrets to fork code.

## Safety requirement

`pull_request_target` is safe **only if** the workflow does not execute untrusted (PR/fork) code with those permissions.

We **do**:

- Check out base, then fetch and checkout the PR head.
- Run `anchr gate`, which **reads and parses** the repository’s source files (e.g. TypeScript/TSX) to build the dependency graph and detect violations.

We **must not**:

- `require()` or dynamically `import()` any **project** (user) code.
- Evaluate or execute project code (no `eval`, no plugin loader that runs user code).
- Run project tests, build scripts, or install scripts from the PR.

## Confirmation: ANCHR gate does not execute user code

The structural engine used by `anchr gate`:

- **Parses** source files (e.g. via TypeScript compiler API or regex/parse for imports) to build a dependency graph.
- **Does not** `require()`, `import()`, or dynamically load any module from the repository under analysis.
- **Does not** use `eval()` or `new Function()` on repository content.
- **Does not** run a plugin system or user-defined scripts.

Analysis is **read-only and parse-only**: file system reads and syntactic analysis. No execution of project code.

Therefore:

- Using **checkout of PR head** plus **`anchr gate`** in a `pull_request_target` workflow is **safe** with respect to the “no execution of untrusted code” requirement.
- If this contract is ever broken (e.g. gate or a script it calls starts executing project code), the workflow must be switched to `pull_request` and accept the resulting limitation (e.g. no comment/check for forks without a token that can write to the base repo).

## Documented as of

Prompt 5 hardening audit. No engine changes; documentation only.
