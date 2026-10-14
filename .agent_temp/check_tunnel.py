import os, re
if os.path.exists("/tmp/cf.log"):
    c = open("/tmp/cf.log").read()
    m = re.search(r"https://[a-zA-Z0-9-]+.trycloudflare.com", c)
    print("TUNNEL_URL:", m.group(0) if m else "NOT_FOUND_IN_LOG")
else:
    print("NO_CF_LOG")
import subprocess
r = subprocess.run(["pgrep", "-f", "cloudflared"], capture_output=True, text=True)
print("CLOUDFLARED_PROCS:", r.stdout.strip() or "NONE")
r2 = subprocess.run(["pgrep", "-f", "uvicorn"], capture_output=True, text=True)
print("UVICORN_PROCS:", r2.stdout.strip() or "NONE")
