path = r"C:\Users\66\WorkBuddy\2026-07-27-14-44-52\ross-site\server\guestbook-api.py"
with open(path, "r", encoding="utf-8") as f:
    t = f.read()
if "os.makedirs(UPLOAD_DIR, exist_ok=True)" in t:
    print("already patched")
else:
    marker = 'if __name__ == "__main__":'
    i = t.find(marker)
    if i < 0:
        raise SystemExit("main not found")
    j = t.find("os.makedirs(DATA_DIR, exist_ok=True)", i)
    if j < 0:
        raise SystemExit("makedirs not found after main")
    insert_at = j + len("os.makedirs(DATA_DIR, exist_ok=True)")
    # preserve newline style after DATA_DIR line
    nl = "\r\n" if t[insert_at:insert_at + 2] == "\r\n" else "\n"
    t = t[:insert_at] + nl + "    os.makedirs(UPLOAD_DIR, exist_ok=True)" + t[insert_at:]
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(t)
    print("patched at", j)
