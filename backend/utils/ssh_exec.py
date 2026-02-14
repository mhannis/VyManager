from __future__ import annotations

import os
import re
import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple


SSH_USERNAME_DEFAULT = "vyos"
SSH_PORT_DEFAULT = 22

_RE_IMAGE_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}(:[A-Za-z0-9][A-Za-z0-9._-]{0,127})?$")
_RE_ABS_PATH_SAFE = re.compile(r"^/[A-Za-z0-9._/-]{1,4095}$")


@dataclass(frozen=True)
class SshResult:
    host: str
    command: str
    exit_code: int
    stdout: str
    stderr: str

    @property
    def output(self) -> str:
        combined = (self.stdout or "") + (self.stderr or "")
        return combined.strip()


class SshCommandError(RuntimeError):
    def __init__(self, result: SshResult):
        super().__init__(result.output or f"SSH command failed (exit {result.exit_code})")
        self.result = result


def _repo_root() -> Path:
    """
    Return a stable writable root for dev-only artifacts.

    Important:
    - In Docker dev (`container/vymanager-dev/env-file-docker-compose.yml`) only
      `backend/` is bind-mounted into the backend container at `/app`.
    - Relying on the monorepo root would resolve to `/` inside the container and
      break key persistence (and likely permissions).

    Therefore we default to the backend root, with an env override for advanced
    setups.
    """
    override = os.getenv("VYMANAGER_DEV_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    # backend/utils/ssh_exec.py -> backend/utils -> backend (stable across host/docker)
    return Path(__file__).resolve().parents[1]


def _ssh_dir() -> Path:
    # Store dev-only ssh material outside tracked paths.
    return _repo_root() / ".devdata" / "ssh"


def _key_basename() -> str:
    return os.getenv("VYMANAGER_SSH_KEY_BASENAME", "vymanager_vyos_ed25519")


def get_private_key_path() -> Path:
    return _ssh_dir() / _key_basename()


def get_public_key_path() -> Path:
    return _ssh_dir() / f"{_key_basename()}.pub"


def get_known_hosts_path() -> Path:
    return _ssh_dir() / "known_hosts"


def ensure_ssh_keypair(comment: str = "vymanager") -> Tuple[Path, str, str]:
    """
    Ensure a local ed25519 keypair exists for SSH automation.

    Returns:
        (private_key_path, public_key_type, public_key_value)
    """
    ssh_dir = _ssh_dir()
    ssh_dir.mkdir(parents=True, exist_ok=True)

    private_key = get_private_key_path()
    public_key = get_public_key_path()

    if not private_key.exists() or not public_key.exists():
        # Generate without passphrase; this is dev automation material and should
        # live on the VyManager host only.
        subprocess.run(
            [
                "ssh-keygen",
                "-t",
                "ed25519",
                "-N",
                "",
                "-f",
                str(private_key),
                "-C",
                comment,
            ],
            check=True,
            capture_output=True,
            text=True,
        )

    # Parse public key line: "<type> <key> [comment]"
    parts = public_key.read_text(encoding="utf-8").strip().split()
    if len(parts) < 2:
        raise ValueError("Invalid SSH public key format")

    return private_key, parts[0], parts[1]


def validate_image_ref_or_raise(image: str) -> str:
    clean = (image or "").strip()
    if not clean:
        raise ValueError("Image reference is required")
    if not _RE_IMAGE_REF.match(clean):
        raise ValueError("Invalid image reference format")
    return clean


def validate_abs_path_or_raise(path: str, *, prefix: Optional[str] = None) -> str:
    clean = (path or "").strip()
    if not clean:
        raise ValueError("Path is required")
    if not _RE_ABS_PATH_SAFE.match(clean):
        raise ValueError("Invalid path format")
    # Prevent path traversal. We intentionally do not attempt to normalize paths
    # against the remote filesystem; instead we reject any dot segments.
    parts = [part for part in clean.split("/") if part]
    if any(part in {".", ".."} for part in parts):
        raise ValueError("Path traversal is not allowed")
    if prefix and not clean.startswith(prefix):
        raise ValueError(f"Path must start with {prefix}")
    return clean


def ssh_run(
    host: str,
    remote_command: str,
    *,
    port: int = SSH_PORT_DEFAULT,
    username: str = SSH_USERNAME_DEFAULT,
    timeout_seconds: int = 600,
) -> SshResult:
    """
    Run a single remote command using the locally-managed SSH keypair.
    """
    host = (host or "").strip()
    if not host:
        raise ValueError("SSH host is required")

    private_key, _pub_type, _pub_key = ensure_ssh_keypair()
    known_hosts = get_known_hosts_path()

    args = [
        "ssh",
        "-i",
        str(private_key),
        "-p",
        str(int(port)),
        "-o",
        "BatchMode=yes",
        "-o",
        f"UserKnownHostsFile={known_hosts}",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=4",
        f"{username}@{host}",
        remote_command,
    ]

    proc = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=int(timeout_seconds),
    )

    result = SshResult(
        host=host,
        command=remote_command,
        exit_code=proc.returncode,
        stdout=proc.stdout or "",
        stderr=proc.stderr or "",
    )
    if proc.returncode != 0:
        raise SshCommandError(result)
    return result


def ssh_mkdir_p(host: str, paths: list[str], *, prefix: str = "/config/containers/") -> SshResult:
    """
    Create missing host directories for container volume mounts (best-effort).

    Safety:
    - Only absolute paths are allowed
    - Enforces a prefix by default (so we don't write arbitrary filesystem locations)
    """
    cleaned: list[str] = []
    for raw in paths:
        cleaned.append(validate_abs_path_or_raise(raw, prefix=prefix))

    unique = sorted(set(cleaned))
    if not unique:
        return SshResult(host=host, command="", exit_code=0, stdout="", stderr="")

    quoted = " ".join(shlex.quote(p) for p in unique)
    cmd = f"sudo -n mkdir -p -- {quoted}"
    return ssh_run(host, cmd, timeout_seconds=60)


def ssh_pull_container_image(host: str, image: str) -> SshResult:
    """
    Pull a container image using VyOS op-mode wrapper.

    VyOS exposes this as: `add container image <image>`.
    The HTTPS API does not implement an `add` endpoint, so SSH is required.
    """
    image_ref = validate_image_ref_or_raise(image)
    cmd = "sudo -n /opt/vyatta/bin/vyatta-op-cmd-wrapper add container image " + shlex.quote(image_ref)
    return ssh_run(host, cmd, timeout_seconds=900)
