#!/usr/bin/env bash
# shellcheck shell=bash
# Safe .env loader: does not expand $ / backticks inside values (needed for GitHub PATs).
# Usage: source this file, then: load_dotenv /path/to/.env

load_dotenv() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  # Prefer Python so values with $, !, spaces, etc. stay intact
  if command -v python3 >/dev/null 2>&1; then
    # shellcheck disable=SC1090
    eval "$(
      python3 - "$file" <<'PY'
import shlex
import sys
from pathlib import Path

path = Path(sys.argv[1])
for raw in path.read_text(encoding="utf-8").splitlines():
    line = raw.strip().lstrip("\ufeff")
    if not line or line.startswith("#"):
        continue
    if "=" not in line:
        continue
    key, val = line.split("=", 1)
    key = key.strip()
    if not key or not key.replace("_", "").isalnum() or key[0].isdigit():
        continue
    val = val.strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in "'\"":
        val = val[1:-1]
    print(f"export {key}={shlex.quote(val)}")
PY
    )"
    return 0
  fi

  # Fallback: line-by-line without word-splitting expansion of value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "${line// /}" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *"="* ]] && continue
    local key="${line%%=*}"
    local val="${line#*=}"
    key="$(echo -n "$key" | tr -d '[:space:]')"
    [[ -z "$key" ]] && continue
    if [[ ${#val} -ge 2 && ( "${val:0:1}" == '"' && "${val: -1}" == '"' || "${val:0:1}" == "'" && "${val: -1}" == "'" ) ]]; then
      val="${val:1:${#val}-2}"
    fi
    printf -v "$key" '%s' "$val"
    export "$key"
  done < "$file"
}
