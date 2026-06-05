import base64
import json
import os
import subprocess
import threading
import urllib.error
import urllib.request


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SYNC_LOCK = threading.Lock()


def _enabled():
    return os.environ.get("GIT_SYNC_ENABLED", "true").lower() not in {"0", "false", "no", "off"}


def _strict():
    return os.environ.get("GIT_SYNC_STRICT", "true").lower() not in {"0", "false", "no", "off"}


def _run(args):
    try:
        return subprocess.run(
            args,
            cwd=BASE_DIR,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(args, 1, "", str(exc))


def _current_branch():
    configured = os.environ.get("GIT_SYNC_BRANCH")
    if configured:
        return configured
    result = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    branch = result.stdout.strip()
    if result.returncode == 0 and branch and branch != "HEAD":
        return branch
    return "main"


def _push_target(branch):
    token = os.environ.get("GITHUB_TOKEN")
    repo = _repo()
    if token and repo:
        return f"https://x-access-token:{token}@github.com/{repo}.git", f"HEAD:{branch}"
    return os.environ.get("GIT_SYNC_REMOTE", "origin"), f"HEAD:{branch}"


def _push_current_branch(detail=None):
    branch = _current_branch()
    remote, refspec = _push_target(branch)
    push = _run(["git", "push", remote, refspec])
    if push.returncode != 0:
        api_result = _sync_with_github_api(detail)
        if api_result:
            return api_result
        return _handle_failure("git push failed", push)
    return {"ok": True, "branch": branch}


def sync_data_to_github(detail="admin data update"):
    if not _enabled():
        return {"ok": True, "skipped": True, "reason": "disabled"}

    with SYNC_LOCK:
        status = _run(["git", "status", "--porcelain", "--", "data"])
        if status.returncode != 0:
            api_result = _sync_with_github_api(detail)
            if api_result:
                return api_result
            return _handle_failure("git status failed", status)
        if not status.stdout.strip():
            pushed = _push_current_branch(detail)
            pushed["skipped"] = True
            pushed["reason"] = "no data changes"
            return pushed

        add = _run(["git", "add", "data"])
        if add.returncode != 0:
            return _handle_failure("git add failed", add)

        message = os.environ.get("GIT_SYNC_COMMIT_MESSAGE") or f"Update carnival data: {detail}"
        author_name = os.environ.get("GIT_SYNC_AUTHOR_NAME", "Carnival Admin")
        author_email = os.environ.get("GIT_SYNC_AUTHOR_EMAIL", "admin@missionpossible.local")
        commit = _run([
            "git",
            "-c",
            f"user.name={author_name}",
            "-c",
            f"user.email={author_email}",
            "commit",
            "-m",
            message,
            "--",
            "data",
        ])
        if commit.returncode != 0:
            if "nothing to commit" in (commit.stdout + commit.stderr).lower():
                return {"ok": True, "skipped": True, "reason": "nothing to commit"}
            return _handle_failure("git commit failed", commit)

        pushed = _push_current_branch(detail)
        pushed["commit"] = commit.stdout.strip()
        return pushed


def _repo():
    return os.environ.get("GITHUB_REPO") or os.environ.get("GITHUB_REPOSITORY")


def _sync_with_github_api(detail):
    token = os.environ.get("GITHUB_TOKEN")
    repo = _repo()
    if not token or not repo:
        return None

    updated = []
    for filename in _data_files(detail):
        content = _read_data_file(filename)
        if content is None:
            continue
        _put_github_file(repo, token, filename, content)
        updated.append(filename)
    return {"ok": True, "method": "github_api", "updated": updated, "branch": _current_branch()}


def _data_files(detail):
    if detail and detail.endswith(".json"):
        return [detail]
    data_dir = os.path.join(BASE_DIR, "data")
    try:
        return [name for name in os.listdir(data_dir) if name.endswith(".json")]
    except OSError:
        return []


def _read_data_file(filename):
    path = os.path.join(BASE_DIR, "data", filename)
    try:
        with open(path, "rb") as fh:
            return fh.read()
    except OSError:
        return None


def _github_request(url, token, method="GET", payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    return urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "MissionPossible2026",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def _put_github_file(repo, token, filename, content):
    branch = _current_branch()
    url = f"https://api.github.com/repos/{repo}/contents/data/{filename}"
    sha = None
    try:
        req = _github_request(f"{url}?ref={branch}", token)
        with urllib.request.urlopen(req, timeout=30) as resp:
            sha = json.loads(resp.read().decode("utf-8")).get("sha")
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise RuntimeError(f"GitHub API lookup failed for {filename}: {exc.code}")
    payload = {
        "message": os.environ.get("GIT_SYNC_COMMIT_MESSAGE") or f"Update carnival data: {filename}",
        "content": base64.b64encode(content).decode("ascii"),
        "branch": branch,
    }
    if sha:
        payload["sha"] = sha
    req = _github_request(url, token, method="PUT", payload=payload)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"GitHub API update failed for {filename}: {exc.code}")


def _handle_failure(label, result):
    message = f"{label}: {_scrub((result.stderr or result.stdout or '').strip())}"
    if _strict():
        raise RuntimeError(message)
    return {"ok": False, "error": message}


def _scrub(text):
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        text = text.replace(token, "***")
    return text
