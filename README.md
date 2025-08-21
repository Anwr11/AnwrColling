
# Video Chat (Flask + Socket.IO + WebRTC)

## Features
- Arabic UI, modern theme
- Auto numbers starting with 33
- Text chat + Video calls (WebRTC)
- Incoming call modal (accept / reject)

## Run locally
```bash
pip install -r requirements.txt
python app.py
# open http://127.0.0.1:5000
```

## Deploy on Render
- **Start Command:**
```
gunicorn wsgi:app -w 1 -b 0.0.0.0:$PORT --timeout 120
```
- No eventlet/gevent needed (falls back to long‑polling for signaling).  
- For stricter networks, consider adding TURN later.
