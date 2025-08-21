// --- Centered toast helper ---
(function(){
  const toast = document.getElementById("toast") || (function(){
    const el = document.createElement("div");
    el.id = "toast"; el.className = "toast"; document.body.appendChild(el);
    return el;
  })();

  // showToast(message, {center:true/false, duration:ms})
  window.showToast = function(message, opts){
    opts = opts || {};
    toast.textContent = message;
    toast.classList.remove("center","show");
    if (opts.center) toast.classList.add("center");
    // trigger
    void toast.offsetWidth;
    toast.classList.add("show");
    const dur = Math.max(900, opts.duration || 1500);
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> toast.classList.remove("show","center"), dur);
  };
})();

// Expose convenience callbacks (optional)
window.__colling = window.__colling || {};
window.__colling.onCallStarted   = () => showToast("جاري الاتصال...", {center:true, duration:1400});
window.__colling.onCallConnected = () => showToast("تم الاتصال ✔", {center:true, duration:1200});
window.__colling.onCallEnded     = () => showToast("تم إنهاء المكالمة", {center:true, duration:1400});
window.__colling.onCallDeclined  = () => showToast("تم رفض المكالمة", {center:true, duration:1300});
window.__colling.onExitChat      = () => showToast("تم الخروج من المحادثة", {center:true, duration:1200});
