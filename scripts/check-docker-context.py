#!/usr/bin/env python3
"""模擬 docker build：套用 .dockerignore 建出 build context，再驗證 Dockerfile 的每個 COPY 都拿得到檔案。

因為此環境無法啟動 docker daemon，用這個腳本抓「.dockerignore 與 Dockerfile 互相矛盾」這類問題。
"""
import fnmatch
import re
import shutil
import sys
from pathlib import Path

REPO = Path("/home/user/Tongue_Twister_Battle")
CTX = Path(sys.argv[1])


def load_ignore():
    lines = []
    f = REPO / ".dockerignore"
    if f.exists():
        for ln in f.read_text().splitlines():
            ln = ln.strip()
            if ln and not ln.startswith("#"):
                lines.append(ln)
    return lines


def ignored(rel: str, patterns) -> bool:
    """rel 是相對 repo 根的 posix 路徑。回傳是否被 .dockerignore 排除。"""
    parts = rel.split("/")
    for pat in patterns:
        p = pat[3:] if pat.startswith("**/") else pat
        # 整個路徑比對
        if fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(rel, p):
            return True
        # 任一路徑片段比對（處理 node_modules、dist 這種目錄名）
        if pat.startswith("**/") or "/" not in pat:
            if any(fnmatch.fnmatch(seg, p) for seg in parts):
                return True
        # 前綴目錄比對（client/src 會排除 client/src/...）
        if rel == pat or rel.startswith(pat.rstrip("/") + "/"):
            return True
    return False


def build_context():
    patterns = load_ignore()
    if CTX.exists():
        shutil.rmtree(CTX)
    CTX.mkdir(parents=True)
    copied = 0
    for src in REPO.rglob("*"):
        if not src.is_file():
            continue
        rel = src.relative_to(REPO).as_posix()
        if ignored(rel, patterns):
            continue
        dst = CTX / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
    return copied


def check_copies():
    """驗證 Dockerfile 裡每個 COPY 的來源都存在於 context 中。"""
    df = (REPO / "Dockerfile").read_text()
    problems = []
    checked = []
    for line in df.splitlines():
        line = line.strip()
        m = re.match(r"^COPY\s+(?!--from)(.+)$", line)
        if not m:
            continue
        toks = m.group(1).split()
        srcs = toks[:-1]  # 最後一個是目的地
        for s in srcs:
            if s.startswith("--"):
                continue
            target = CTX / s
            ok = target.exists()
            checked.append((s, ok))
            if not ok:
                problems.append(s)
    return checked, problems


n = build_context()
print(f"build context 檔案數（已套用 .dockerignore）：{n}")
checked, problems = check_copies()
print("\nDockerfile 的 COPY 來源檢查：")
for s, ok in checked:
    print(f"  {'✓' if ok else '✗ 找不到'}  {s}")
if problems:
    print(f"\n❌ 有 {len(problems)} 個 COPY 來源不在 context 中：{problems}")
    sys.exit(1)
print("\n✅ 所有 COPY 來源都存在")
