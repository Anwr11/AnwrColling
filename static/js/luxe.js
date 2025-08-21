
// تبديل الثيم
document.getElementById('theme-btn').onclick = () => {
  document.body.classList.toggle('light');
};
// القائمة الجانبية
const drawer = document.getElementById('drawer');
document.getElementById('menu-btn').onclick = () => drawer.classList.toggle('hidden');
document.getElementById('fab').onclick = () => drawer.classList.toggle('hidden');
// المكالمات
const modal = document.getElementById('call-modal');
document.getElementById('call-btn').onclick = () => modal.classList.remove('hidden');
document.getElementById('end-btn').onclick = () => modal.classList.add('hidden');
document.getElementById('reject-call').onclick = () => modal.classList.add('hidden');
document.getElementById('accept-call').onclick = () => {
  modal.classList.add('hidden');
  alert('تم قبول المكالمة!');
};
// إرسال رسالة
document.getElementById('send-btn').onclick = () => {
  const input = document.getElementById('message-input');
  if(input.value.trim() !== ''){
    const msg = document.createElement('div');
    msg.textContent = input.value;
    msg.className = 'glass';
    document.getElementById('messages').appendChild(msg);
    input.value = '';
  }
};
