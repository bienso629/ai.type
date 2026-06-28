import requests
import json
import time

url = "https://tts.type.vn/generate_audio_async"
payload = {
    "text": "Xin chào! Mình là Nguyễn Quang Yên",
    "ref_audio_name": "yen_ai_sample.wav", # Just guessing a name, maybe it will return 404 or something instead of CUDA
    "ref_text": "Xin chào",
    "speed": 1.0,
    "num_step": 16
}
headers = {'Content-Type': 'application/json'}

try:
    response = requests.post(url, json=payload)
    print("POST Response:", response.status_code, response.text)
    
    if response.status_code == 200:
        data = response.json()
        task_id = data.get("task_id")
        if task_id:
            print(f"Got task_id: {task_id}. Polling...")
            for _ in range(10):
                time.sleep(2)
                res = requests.get(f"https://tts.type.vn/status/{task_id}")
                print("STATUS:", res.text)
                if "done" in res.text or "error" in res.text:
                    break
except Exception as e:
    print(e)

