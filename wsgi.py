# wsgi.py
# يعرّف كائن الـ WSGI الذي سيحمّله gunicorn
from app import app  # لازم داخل app.py يكون فيه: app = Flask(__name__)

# ملاحظة:
# لو تستخدم Flask-SocketIO، خليك مهيّئ socketio داخل app.py
# (مثال: socketio = SocketIO(app, async_mode="eventlet"))
# ولا تستدعي socketio.run() في الإنتاج، خليه فاضي.
