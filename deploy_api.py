import json
import requests

payload = {
    "name": "donttalk-api-final",
    "type": "web_service",
    "plan": "free",
    "region": "oregon",
    "repo": "https://github.com/123lai1234-create/ddd",
    "branch": "main",
    "buildCommand": "pip install -r site_api/requirements.txt",
    "startCommand": "uvicorn site_api.main:app --host 0.0.0.0 --port 10000",
    "serviceDetails": {
        "runtime": "python",
        "envSpecificDetails": {
            "pythonVersion": "3.11"
        },
        "envVariables": []
    },
    "ownerId": "tea-d819dsho3t8c73eehdjg"
}

payload_str = json.dumps(payload)
print("JSON string:", payload_str[:200])
print("buildCommand in JSON:", "buildCommand" in payload_str)

r = requests.post(
    "https://api.render.com/v1/services",
    headers={"Authorization": "Bearer rnd_Je79BBkGQhklY8W7tOt5nH39sfcU", "Content-Type": "application/json"},
    data=payload_str
)
print("Status:", r.status_code)
print("Response:", r.text[:2000])