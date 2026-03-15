#!/usr/bin/env python3
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def as_int(x, default=0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def build_speech_index(speeches: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    meeting_key -> speeches sorted in stable reading order
    """
    by_meeting: Dict[str, List[Dict[str, Any]]] = {}
    for sp in speeches:
        if not isinstance(sp, dict):
            continue
        mk = sp.get("meeting_key")
        if not mk:
            continue
        by_meeting.setdefault(mk, []).append(sp)

    for mk, arr in by_meeting.items():
        arr.sort(
            key=lambda s: (
                as_int(s.get("start_page"), 0),
                as_int(s.get("end_page"), as_int(s.get("start_page"), 0)),
                str(s.get("speech_id", "")),
            )
        )
    return by_meeting


def speeches_overlapping(
    meeting_speeches: List[Dict[str, Any]],
    start_page: int,
    end_page: int,
) -> List[Dict[str, Any]]:
    """
    Select speeches whose [start_page, end_page] intersects segment [start_page, end_page].
    """
    out: List[Dict[str, Any]] = []
    for sp in meeting_speeches:
        sp_start = as_int(sp.get("start_page"), 0)
        sp_end = as_int(sp.get("end_page"), sp_start)
        if sp_end >= start_page and sp_start <= end_page:
            out.append(sp)
    return out


def update_items(items: List[Dict[str, Any]], speeches_by_meeting: Dict[str, List[Dict[str, Any]]]) -> Tuple[int, int]:
    updated = 0
    total = 0

    for item in items:
        if not isinstance(item, dict):
            continue
        segments = item.get("segments")
        if not isinstance(segments, list):
            continue

        for seg in segments:
            if not isinstance(seg, dict):
                continue

            mk = seg.get("meeting_key")
            sp0 = as_int(seg.get("start_page"), 0)
            sp1 = as_int(seg.get("end_page"), 0)

            if not mk or sp0 <= 0 or sp1 <= 0:
                raise SystemExit(f"Bad segment (missing meeting_key/start_page/end_page): {seg}")

            if mk not in speeches_by_meeting:
                raise SystemExit(f"Segment meeting_key not found in speeches.all.json: {mk}")

            meeting_speeches = speeches_by_meeting[mk]
            overlaps = speeches_overlapping(meeting_speeches, sp0, sp1)

            if not overlaps:
                # Hard fail: don’t silently produce broken boundaries
                raise SystemExit(
                    f"No overlapping speeches for segment: meeting_key={mk} pages={sp0}-{sp1}\n"
                    f"Segment: {seg}"
                )

            new_start_id = str(overlaps[0].get("speech_id", ""))
            new_end_id = str(overlaps[-1].get("speech_id", ""))

            if not new_start_id or not new_end_id:
                raise SystemExit(f"Found overlap speeches without speech_id for segment: {seg}")

            old_start = seg.get("start_speech_id")
            old_end = seg.get("end_speech_id")

            if old_start != new_start_id or old_end != new_end_id:
                seg["start_speech_id"] = new_start_id
                seg["end_speech_id"] = new_end_id
                updated += 1

            total += 1

    return updated, total


def main():
    ROOT = Path(__file__).resolve().parent
    DATA_DIR = ROOT / "src" / "data"

    SPEECHES_ALL = DATA_DIR / "speeches.all.json"
    ITEMS_IN = DATA_DIR / "items.json"
    ITEMS_OUT = DATA_DIR / "itemsfrompages.json"  

    speeches = load_json(SPEECHES_ALL)
    if not isinstance(speeches, list):
        raise SystemExit("speeches.all.json must be a JSON array")

    items = load_json(ITEMS_IN)
    if not isinstance(items, list):
        raise SystemExit("items.json must be a JSON array")

    speeches_by_meeting = build_speech_index(speeches)
    updated, total = update_items(items, speeches_by_meeting)

    save_json(ITEMS_OUT, items)

    print(f"Segments processed: {total}")
    print(f"Segments updated:   {updated}")


if __name__ == "__main__":
    main()