"""Scheduled local backups of both databases to an isolated directory
(paper 3.8.3, R-04 mitigation). Uses mysqldump from the MySQL install."""
from __future__ import annotations
import subprocess
from datetime import datetime
from pathlib import Path

from config import config


def _dump_one(db: str, out_dir: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = out_dir / f"{db}_{stamp}.sql"
    exe = Path(config.MYSQL_BIN) / "mysqldump.exe"
    cmd = [
        str(exe),
        f"--host={config.DB_HOST}", f"--port={config.DB_PORT}",
        f"--user={config.DB_USER}", f"--password={config.DB_PASSWORD}",
        "--single-transaction", "--routines", "--events", db,
    ]
    with open(target, "w", encoding="utf-8") as fh:
        proc = subprocess.run(cmd, stdout=fh, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        target.unlink(missing_ok=True)
        raise RuntimeError(f"mysqldump {db} failed: {proc.stderr.strip()}")
    return target


def run_backup() -> dict:
    out_dir = config.BACKUP_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    made = [_dump_one(config.OPS_DB, out_dir), _dump_one(config.DW_DB, out_dir)]

    # retention: keep the newest N dumps per database
    for db in (config.OPS_DB, config.DW_DB):
        dumps = sorted(out_dir.glob(f"{db}_*.sql"), key=lambda p: p.stat().st_mtime,
                       reverse=True)
        for old in dumps[config.BACKUP_KEEP:]:
            old.unlink(missing_ok=True)

    return {"files": [p.name for p in made], "dir": str(out_dir)}
