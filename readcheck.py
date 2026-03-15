import json, re

sp = json.load(open("src/data/speeches.all.json","r",encoding="utf-8"))

re_bad = re.compile(r"\b(?:[A-Za-z]{2,}[A-Z][a-z]|I[a-z]{2,}|(?:and|or|but|the|to|of|in|on|for|with)[A-Za-z]{3,})\b")

scored = []
for s in sp:
    t = s.get("text","")
    scored.append((len(re_bad.findall(t)), s["speech_id"], s["meeting_key"], s.get("speaker_label","")))
scored.sort(reverse=True)

for x in scored[:15]:
    print(x)