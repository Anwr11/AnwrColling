from app import create_app, socketio
app = create_app()
# يُستخدم مع: gunicorn wsgi:app -k eventlet -w 1 -b 0.0.0.0:$PORT
