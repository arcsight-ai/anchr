/**
 * anchr install — Optional architectural hints on push only.
 * Never block pushes. Never surprise. No network after install.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { createInterface } from "readline";

const HOOK_MARKER_START = ">>> anchr";
const HOOK_MARKER_END = "<<< anchr";

const PRE_PUSH_BLOCK = `>>> anchr
if [ -f ".git/.anchr-enabled" ]; then
[ -n "$ANCHR_ALREADY_RAN" ] && exit 0
export ANCHR_ALREADY_RAN=1
REMOTE_NAME="$1"
PRIMARY=$(cat .git/.anchr-remote 2>/dev/null)
[ "$REMOTE_NAME" != "$PRIMARY" ] && exit 0
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$BUILD_NUMBER" ]; then
exit 0
fi
command -v node >/dev/null 2>&1 || exit 0
[ ! -f ".git/.anchr-bin/anchr-runner.js" ] && exit 0
git rev-parse --abbrev-ref HEAD | grep -q HEAD && exit 0
git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && exit 0
git rev-parse -q --verify REBASE_HEAD >/dev/null 2>&1 && exit 0
case "$2" in
refs/tags/*) exit 0 ;;
esac
BASE=$(git rev-parse --verify @{push} 2>/dev/null || git merge-base HEAD HEAD~1 2>/dev/null)
CHANGED=$(git diff --name-only HEAD "$BASE" 2>/dev/null | wc -l | tr -d ' ')
[ "$CHANGED" -gt 100 ] 2>/dev/null && exit 0
LAST=$(git rev-parse HEAD 2>/dev/null)
if [ -f ".git/.anchr-cache/last" ] && grep -q "$LAST" ".git/.anchr-cache/last" 2>/dev/null; then
exit 0
fi
(
node .git/.anchr-bin/anchr-runner.js audit-fast >/dev/null 2>&1 &
PID=$!
(sleep 0.6 && kill -9 $PID >/dev/null 2>&1) &
wait $PID 2>/dev/null
) || true
if [ -f ".git/.anchr-first-run" ]; then
rm -f ".git/.anchr-first-run"
echo "$LAST" > ".git/.anchr-cache/last"
exit 0
fi
node .git/.anchr-bin/anchr-runner.js share-compact 2>/dev/null || true
echo "$LAST" > ".git/.anchr-cache/last"
fi
<<< anchr
`;

function safeExec(cmd: string, cwd: string): string | null {
  try {
    const out = execSync(cmd, {
      encoding: "utf8",
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: 64 * 1024,
    });
    return typeof out === "string" ? out.trim() : null;
  } catch {
    return null;
  }
}

function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y|yes$/i.test(answer.trim()));
    });
  });
}

function detectPrimaryRemote(cwd: string): string {
  const upstream = safeExec("git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null", cwd);
  if (upstream) {
    const m = upstream.match(/^refs\/remotes\/([^/]+)\//);
    if (m) return m[1]!;
  }
  if (safeExec("git remote get-url origin 2>/dev/null", cwd)) return "origin";
  const list = safeExec("git remote 2>/dev/null", cwd);
  if (list) {
    const first = list.split(/\s+/)[0];
    if (first) return first;
  }
  return "origin";
}

function readHook(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function writeHook(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
  try {
    execSync("chmod +x " + path.replace(/ /g, "\\ "), { stdio: "ignore" });
  } catch {
    // best effort
  }
}

function replaceAnchrBlock(content: string): string {
  const startIdx = content.indexOf(HOOK_MARKER_START);
  const endIdx = content.indexOf(HOOK_MARKER_END);
  if (startIdx >= 0 && endIdx > startIdx) {
    return content.slice(0, startIdx) + PRE_PUSH_BLOCK.trimEnd() + "\n" + content.slice(endIdx);
  }
  return content + "\n" + PRE_PUSH_BLOCK;
}

function selfHealRunner(gitDir: string): boolean {
  const runnerPath = join(gitDir, ".anchr-bin", "anchr-runner.js");
  if (!existsSync(runnerPath)) return false;
  try {
    const st = statSync(runnerPath);
    if (st.size < 1000) return false;
  } catch {
    return false;
  }
  return true;
}

async function main(): Promise<number> {
  const cwd = process.cwd();
  const gitDir = join(cwd, ".git");

  if (!existsSync(gitDir) || !statSync(gitDir).isDirectory()) {
    console.error("anchr: not a git repository");
    return 1;
  }

  const primary = detectPrimaryRemote(cwd);
  const anchrRemote = join(gitDir, ".anchr-remote");
  writeFileSync(anchrRemote, primary, "utf8");

  const enabledPath = join(gitDir, ".anchr-enabled");
  if (!existsSync(enabledPath)) {
    const isTty = process.stdin.isTTY === true;
    if (!isTty) process.exit(0);
    const ok = await promptYesNo("Enable architectural hints on push? (y/n) ");
    if (!ok) process.exit(0);
    writeFileSync(enabledPath, "", "utf8");
    writeFileSync(join(gitDir, ".anchr-first-run"), "", "utf8");
  }

  const binDir = join(gitDir, ".anchr-bin");
  const cacheDir = join(gitDir, ".anchr-cache");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  const runnerPath = join(binDir, "anchr-runner.js");
  const scriptDir = resolve(dirname(process.argv[1] ?? cwd));
  const anchrRoot = resolve(scriptDir, "..");
  const doctorPath = join(anchrRoot, "scripts", "anchr-doctor.ts");
  const doctorJs = join(anchrRoot, "dist", "scripts", "anchr-doctor.js");
  const hasDoctor = existsSync(doctorPath) || existsSync(doctorJs);

  if (hasDoctor) {
    try {
      const outPath = resolve(cwd, runnerPath);
      if (existsSync(doctorPath)) {
        execSync(`npx tsx "${doctorPath}" --emit-runner "${outPath}"`, {
          cwd,
          stdio: "pipe",
          encoding: "utf8",
        });
      } else {
        execSync(`node "${doctorJs}" --emit-runner "${outPath}"`, {
          cwd,
          stdio: "pipe",
          encoding: "utf8",
        });
      }
    } catch {
      console.error("anchr: failed to install local runtime");
      return 1;
    }
  } else {
    try {
      execSync(`npx -y anchr@latest doctor --emit-runner "${resolve(cwd, runnerPath)}"`, {
        cwd,
        stdio: "pipe",
        encoding: "utf8",
      });
    } catch {
      console.error("anchr: failed to install local runtime");
      return 1;
    }
  }

  if (!selfHealRunner(gitDir)) {
    console.error("anchr: failed to install local runtime");
    return 1;
  }

  const hookPath = join(gitDir, "hooks", "pre-push");
  mkdirSync(dirname(hookPath), { recursive: true });
  const existing = readHook(hookPath);
  const shebang = existing.startsWith("#!") ? existing.split("\n")[0] + "\n" : "#!/bin/sh\n";
  const rest = existing.startsWith("#!") ? existing.slice(existing.indexOf("\n") + 1) : existing;
  const newContent = rest ? shebang + replaceAnchrBlock(rest) : shebang + PRE_PUSH_BLOCK;
  writeHook(hookPath, newContent);

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(1));
