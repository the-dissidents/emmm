#!/usr/bin/env python3
"""Auto-build Windows executable for the-dissidents/emmm.

Periodically checks repository tags or `main` commits, dynamically parses
`apps/editor/src-tauri/Cargo.lock` to align `@tauri-apps/*` in `pnpm.overrides`,
strips single quotes from `build:pkgs`, and builds the Windows executable in
either `--mode local` or `--mode cloud`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_REPO = "the-dissidents/emmm"
DEFAULT_BRANCH = "main"
WORKFLOW_FILE = "build-windows.yml"
CARGO_LOCK_REL = Path("apps/editor/src-tauri/Cargo.lock")
PACKAGE_JSON_REL = Path("package.json")


def github_api_get(url: str, token: str | None = None) -> Any:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "auto-build-emmm-win/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_latest_target(repo: str, target_type: str, branch: str, token: str | None) -> tuple[str, str]:
    """Return (ref_name, commit_sha) for the latest tag or branch commit."""
    if target_type == "tag":
        tags = github_api_get(f"https://api.github.com/repos/{repo}/tags?per_page=1", token)
        if tags:
            return tags[0]["name"], tags[0]["commit"]["sha"]
    commit = github_api_get(f"https://api.github.com/repos/{repo}/commits/{branch}", token)
    return branch, commit["sha"]


def parse_cargo_lock_overrides(lock_path: Path) -> dict[str, str]:
    """Parse Cargo.lock to align @tauri-apps/* versions in pnpm.overrides."""
    overrides: dict[str, str] = {}
    if not lock_path.exists():
        return overrides

    content = lock_path.read_text(encoding="utf-8")
    blocks = content.split("[[package]]")[1:]
    for block in blocks:
        name_m = re.search(r'^name\s*=\s*"([^"]+)"', block, re.MULTILINE)
        ver_m = re.search(r'^version\s*=\s*"(\d+)\.(\d+)\.\d+[^"]*"', block, re.MULTILINE)
        if not name_m or not ver_m:
            continue
        name = name_m.group(1)
        major, minor = ver_m.group(1), ver_m.group(2)
        ver_range = f"~{major}.{minor}.0"
        if name == "tauri":
            overrides["@tauri-apps/api"] = ver_range
            overrides["@tauri-apps/cli"] = ver_range
        elif name.startswith("tauri-plugin-"):
            plugin_suffix = name[len("tauri-plugin-"):]
            overrides[f"@tauri-apps/plugin-{plugin_suffix}"] = ver_range
    return overrides


def patch_package_json(repo_dir: Path) -> None:
    """Update pnpm.overrides from Cargo.lock and strip single quotes from build:pkgs."""
    lock_path = repo_dir / CARGO_LOCK_REL
    pkg_path = repo_dir / PACKAGE_JSON_REL
    overrides = parse_cargo_lock_overrides(lock_path)

    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    pnpm_cfg = pkg.setdefault("pnpm", {})
    existing_overrides = pnpm_cfg.get("overrides", {})
    existing_overrides.update(overrides)
    pnpm_cfg["overrides"] = existing_overrides

    scripts = pkg.get("scripts", {})
    if "build:pkgs" in scripts and isinstance(scripts["build:pkgs"], str):
        scripts["build:pkgs"] = scripts["build:pkgs"].replace("'", "")

    pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")


def run_cmd(cmd: list[str], cwd: Path | None = None) -> None:
    print(f"+ {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def build_local(repo: str, ref_name: str, sha: str, workdir: Path) -> None:
    repo_dir = workdir / "emmm"
    if not repo_dir.exists():
        workdir.mkdir(parents=True, exist_ok=True)
        run_cmd(["git", "clone", f"https://github.com/{repo}.git", str(repo_dir)])
    else:
        run_cmd(["git", "fetch", "--all", "--tags"], cwd=repo_dir)

    run_cmd(["git", "checkout", "--force", sha], cwd=repo_dir)
    patch_package_json(repo_dir)
    run_cmd(["pnpm", "i", "--no-frozen-lockfile"], cwd=repo_dir)
    run_cmd(["pnpm", "run", "build-win"], cwd=repo_dir)
    print(f"Local build completed for {ref_name} ({sha[:7]}).", flush=True)


def build_cloud(repo: str, ref_name: str, workflow: str) -> None:
    run_cmd([
        "gh", "workflow", "run", workflow,
        "--repo", repo,
        "--ref", ref_name,
        "-f", f"ref={ref_name}",
    ])
    print(f"Triggered cloud workflow '{workflow}' for {ref_name}.", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-build Windows EXE for emmm.")
    parser.add_argument("--mode", choices=["local", "cloud"], required=True, help="Build mode")
    parser.add_argument("--repo", default=DEFAULT_REPO, help="GitHub repository (owner/name)")
    parser.add_argument("--track", choices=["tag", "commit"], default="tag", help="Track latest tag or branch commit")
    parser.add_argument("--branch", default=DEFAULT_BRANCH, help="Branch to track when --track commit")
    parser.add_argument("--interval", type=int, default=3600, help="Polling interval in seconds")
    parser.add_argument("--once", action="store_true", help="Run a single check/build and exit")
    parser.add_argument("--workdir", type=Path, default=Path("./build_work"), help="Local build workspace")
    parser.add_argument("--workflow", default=WORKFLOW_FILE, help="Workflow filename for cloud mode")
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    last_sha: str | None = None

    while True:
        try:
            ref_name, sha = get_latest_target(args.repo, args.track, args.branch, token)
            if sha != last_sha:
                print(f"Detected target {ref_name} @ {sha[:7]}", flush=True)
                if args.mode == "local":
                    build_local(args.repo, ref_name, sha, args.workdir)
                else:
                    build_cloud(args.repo, ref_name, args.workflow)
                last_sha = sha
            else:
                print(f"No new changes ({ref_name} @ {sha[:7]}).", flush=True)
        except (urllib.error.URLError, subprocess.CalledProcessError, Exception) as exc:
            print(f"Error during check/build: {exc}", file=sys.stderr, flush=True)
            if args.once:
                return 1

        if args.once:
            break
        time.sleep(args.interval)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
