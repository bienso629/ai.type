import urllib.request
import re
import json

def parse_markdown(url, text):
    lines = text.split('\n')
    
    # We are looking for something like:
    # Text input: whether it has prompt
    # Images: maximum number of images in `image_url` or similar
    # Videos: maximum number of videos in `video_url` or similar
    
    info = {
        "text": False,
        "max_images": 0,
        "max_videos": 0
    }
    
    content_lower = text.lower()
    if "prompt" in content_lower or "text" in content_lower or "messages" in content_lower:
        info["text"] = True
        
    # Attempt to find table rows talking about image or video
    # like | image_url | array | ... max 1 image ... |
    # or max 5 images
    image_matches = re.findall(r'max(?:imum)? (\d+) image', content_lower)
    if image_matches:
        info["max_images"] = max(int(m) for m in image_matches)
    elif "image_url" in content_lower or "image" in content_lower:
        # if the doc mentions image but doesn't explicitly state max count, we assume at least 1
        info["max_images"] = 1
        
    video_matches = re.findall(r'max(?:imum)? (\d+) video', content_lower)
    if video_matches:
        info["max_videos"] = max(int(m) for m in video_matches)
    elif "video_url" in content_lower or "video" in content_lower:
        info["max_videos"] = 1
        
    # Some overrides based on URL category
    if "image_api" in url:
        info["text"] = True
    if "audio_api" in url:
        info["text"] = True
    if "video_api" in url:
        info["text"] = True
        
    return info

results = {}

try:
    with urllib.request.urlopen("https://astraflow.scloudsg.com/sitemap.xml") as response:
        xml = response.read().decode("utf-8")
        locs = re.findall(r"<loc>(.*?)</loc>", xml)
        models = [loc for loc in locs if "modelverse/modelverse" in loc]
        
        for loc in models:
            if loc.endswith("models") or loc.endswith("api-key") or "quick-start" in loc or "error-code" in loc or "certificate" in loc or "qa" in loc:
                continue
                
            model_id = loc.split("/")[-1]
            md_url = loc + ".md"
            print(f"Fetching {md_url}...")
            
            try:
                req = urllib.request.Request(md_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=5) as res:
                    text = res.read().decode("utf-8")
                    info = parse_markdown(loc, text)
                    results[model_id] = info
            except Exception as e:
                print(f"Failed {md_url}: {e}")

    with open("model_hints.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Done writing to model_hints.json")
except Exception as e:
    print("Error:", e)
