from __future__ import annotations
import re, datetime
from pathlib import Path
from collections import Counter, defaultdict

LOG = Path(__file__).resolve().parent.parent / "logs" / "dashmap_uploads.log"

DATE_RX = re.compile(r"^(\d{4}-\d\d-\d\d)")  # 2025-07-25
ACTION_RX = re.compile(r"\b(UPLOAD|DELETE)\b")  # action word
CODE_RX = re.compile(r"\[(\d{3})]|HTTP (\d{3})")  # [200]  OR  HTTP 200


def _iter_entries():
    if not LOG.exists():
        return
    with LOG.open(encoding="utf-8") as fh:
        for line in fh:
            m_date = DATE_RX.match(line)
            m_act = ACTION_RX.search(line)
            m_code = CODE_RX.search(line)
            if not (m_date and m_act):
                continue
            date_str = m_date.group(1)
            action = m_act.group(1)
            code = (m_code.group(1) or m_code.group(2)) if m_code else ""
            yield date_str, action, code


def get_stats():
    if not LOG.exists():
        blank = {
            "uploads": 0,
            "deletions": 0,
            "errors": 0,
            "success_pct": 0,
            "avg_uploads_7d": 0,
        }
        return blank, []

    uploads = deletions = ok_up = ok_del = 0
    daily: dict[str, Counter] = defaultdict(
        lambda: Counter({"upload": 0, "delete": 0, "ok_up": 0, "ok_del": 0})
    )

    for date_str, action, code in _iter_entries():
        is_ok = code.startswith("2")

        if action == "UPLOAD":
            uploads += 1
            daily[date_str]["upload"] += 1
            if is_ok:
                ok_up += 1
                daily[date_str]["ok_up"] += 1
        else:  # DELETE
            deletions += 1
            daily[date_str]["delete"] += 1
            if is_ok:
                ok_del += 1
                daily[date_str]["ok_del"] += 1

    total = uploads + deletions
    success = ok_up + ok_del
    pct = round(success / total * 100, 1) if total else 0
    errors = total - success

    today = datetime.date.today()
    last7 = [(today - datetime.timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    chart = [
        {
            "date": d,
            "upload": daily[d]["upload"],
            "delete": daily[d]["delete"],
            "success": daily[d]["ok_up"],
        }
        for d in last7
    ]

    avg_uploads = round(sum(day["upload"] for day in chart) / 7, 1)

    counters = {
        "uploads": uploads,
        "deletions": deletions,
        "errors": errors,
        "success_pct": pct,
        "avg_uploads_7d": avg_uploads,
    }
    return counters, chart
