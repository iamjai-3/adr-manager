import requests

BASE = "http://localhost:8000"
PROMPTS = ["generateDraft", "reviewAdr", "suggestAdrs", "search"]

def check(label, r):
    ok = "OK" if r.ok else "FAIL"
    print(f"[{ok}] {label}  ({r.status_code})")
    if not r.ok:
        print("     ", r.text[:300])
    return r.ok

print("=" * 55)
print("FastAPI Prompt Service - endpoint tests")
print("=" * 55)

r = requests.get(f"{BASE}/health", timeout=5)
check("GET /health", r)
if r.ok:
    print("     ", r.json())

print()

all_ok = True
for name in PROMPTS:
    r = requests.get(f"{BASE}/prompts/{name}", timeout=20)
    ok = check(f"GET /prompts/{name}", r)
    all_ok = all_ok and ok
    if ok:
        content = r.json().get("content", "")
        print(f"      {content[:80].strip()}...")

print()
print("=" * 55)
print("Result:", "ALL PASSED" if all_ok else "SOME FAILED")
print("=" * 55)
