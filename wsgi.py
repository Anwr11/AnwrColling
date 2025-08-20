from app import create_app, socketio
app = create_app()   # مهم يكون فيه كائن اسمه app

# ملاحظة: عند التشغيل على Render نستخدم gunicorn، أما هذا الكود يفيدك محلياً فقط:
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
