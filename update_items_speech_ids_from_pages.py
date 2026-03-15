#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def load_json(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8"))


def save_json(p: Path, data: Any) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def speech_seq(speech_id: str) -> int:
    # speech_id like "sp_m_2023_01_25_00111" -> 111
    try:
        return int(speech_id.rsplit("_", 1)[-1])
    except Exception:
        return 0


def index_speeches_by_meeting(speeches: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    by_mk: Dict[str, List[Dict[str, Any]]] = {}
    for sp in speeches:
        if not isinstance(sp, dict):
            continue
        mk = sp.get("meeting_key")
        if not mk:
            continue
        by_mk.setdefault(mk, []).append(sp)

    # stable order
    for mk, arr in by_mk.items():
        arr.sort(
            key=lambda s: (
                int(s.get("start_page", 0) or 0),
                int(s.get("end_page", 0) or 0),
                speech_seq(str(s.get("speech_id", ""))),
            )
        )
    return by_mk


def find_speech_range_for_pages(
    speeches: List[Dict[str, Any]],
    start_page: int,
    end_page: int,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Return (start_speech_id, end_speech_id) for the first/last speech that overlaps [start_page, end_page].
    Overlap condition:
      speech.end_page >= start_page AND speech.start_page <= end_page
    """
    overlapping: List[Dict[str, Any]] = []
    for sp in speeches:
        sp_start = int(sp.get("start_page", 0) or 0)
        sp_end = int(sp.get("end_page", 0) or 0)
        if sp_end >= start_page and sp_start <= end_page:
            overlapping.append(sp)

    if not overlapping:
        return None, None

    # speeches already sorted by start/end/seq
    return str(overlapping[0].get("speech_id")), str(overlapping[-1].get("speech_id"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--speeches", required=True, help="Path to speeches.all.json")
    ap.add_argument("--items", required=True, help="Path to items.json")
    ap.add_argument("--out", required=True, help="Output path for updated items.json")
    args = ap.parse_args()

    speeches_all = load_json(Path(args.speeches))
    items = load_json(Path(args.items))

    if not isinstance(speeches_all, list):
        raise SystemExit("speeches file must be a JSON array")
    if not isinstance(items, list):
        raise SystemExit("items file must be a JSON array")

    by_meeting = index_speeches_by_meeting(speeches_all)

    missing = 0
    updated = 0

    for it in items:
        if not isinstance(it, dict):
            continue
        mk = it.get("meeting_key")
        if not mk:
            continue

        meeting_speeches = by_meeting.get(mk, [])
        segs = it.get("segments") or []
        if not isinstance(segs, list):
            continue

        for seg in segs:
            if not isinstance(seg, dict):
                continue
            sp0 = int(seg.get("start_page", 0) or 0)
            sp1 = int(seg.get("end_page", 0) or 0)
            if sp0 <= 0 or sp1 <= 0:
                continue

            start_id, end_id = find_speech_range_for_pages(meeting_speeches, sp0, sp1)
            if not start_id or not end_id:
                missing += 1
                seg["start_speech_id"] = None
                seg["end_speech_id"] = None
            else:
                seg["start_speech_id"] = start_id
                seg["end_speech_id"] = end_id
                updated += 1

    save_json(Path(args.out), items)

    print(f"Updated segments: {updated}")
    print(f"Segments with no overlapping speeches: {missing}")
    print(f"Wrote: {args.out}")


if __name__ == "__main__":
    main()