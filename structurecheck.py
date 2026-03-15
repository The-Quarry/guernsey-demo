
import json
from collections import Counter

sp = json.load(open("src/data/speeches.all.json","r",encoding="utf-8"))
pg = json.load(open("src/data/hansard_pages.all.json","r",encoding="utf-8"))

print("speeches:", len(sp))
print("pages:", len(pg))

# required keys spot check
need_sp = {"speech_id","meeting_key","meeting_date","source_url","speaker_label","start_page","end_page","text"}
need_pg = {"meeting_key","meeting_date","page","text"}
bad_sp = [i for i,s in enumerate(sp) if not need_sp.issubset(s)]
bad_pg = [i for i,p in enumerate(pg) if not need_pg.issubset(p)]
print("speeches missing keys:", len(bad_sp))
print("pages missing keys:", len(bad_pg))

# duplicates
ids = [s.get("speech_id") for s in sp]
dupes = [k for k,v in Counter(ids).items() if k and v>1]
print("duplicate speech_id:", len(dupes))
