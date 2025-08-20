# اتصال بسيط — Flask + Socket.IO + WebRTC (عربي)
- كل زائر يحصل على رقم تلقائي (محفوظ محليًا).
- دردشة نصية فورية بين رقمين.
- مكالمة صوتية عبر WebRTC (STUN مجاني — قد تحتاج TURN للإنتاج).

## تشغيل محلي
```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
# افتح http://127.0.0.1:5000
```
## النشر على Render (مجاني)
1) أنشئ مستودع GitHub وضع هذه الملفات.
2) في Render: New → Web Service → اربط المستودع.
3) Build Command:
```
pip install -r requirements.txt
```
4) Start Command:
```
gunicorn wsgi:app -k eventlet -w 1 -b 0.0.0.0:$PORT
```
5) افتح الرابط الناتج. يمكنك مشاركة رقمك برابط `/?to=الرقم`.

> للمكالمات المستقرة في كل الشبكات استخدم TURN (خادم coturn أو خدمة مدفوعة).

## ملاحظات
- لا يتم حفظ الرسائل أو التسجيلات صوتيًا؛ كل شيء داخل الذاكرة فقط (MVP).
- حسّن الأمان قبل الإنتاج (CORS، Rate limit، مصادقة، إلخ).
