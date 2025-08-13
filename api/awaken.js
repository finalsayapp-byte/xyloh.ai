<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Xyloh — Awaken</title>
<!-- BUILD: awaken v6 (long-arc persona, single reply panel, erase memory) -->
<style>
  :root{
    --bg:#0f0f12;--panel:#17171c;--line:#2a2a36;--text:#eef;--muted:#a8a8b6;
    --a:#8a7bff;--b:#c08bff;--good:#58d68d;--warn:#ffb85c
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:Inter,system-ui,Arial;background:radial-gradient(1200px 800px at 20% -10%,#1a1630,transparent),var(--bg);color:var(--text)}
  .wrap{max-width:980px;margin:0 auto;padding:22px}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
  .brand{display:flex;gap:14px;align-items:center}
  .logo{display:block;width:230px;max-width:60vw}
  .tag{color:var(--muted)}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px}
  label{display:block;font-weight:800;margin-bottom:8px}
  textarea{background:#1e1e26;color:#eef;border:1px solid var(--line);border-radius:12px;padding:12px;font-size:16px;width:100%;min-height:110px}
  .btn{background:linear-gradient(90deg,var(--a),var(--b));color:#fff;border:none;padding:10px 14px;border-radius:12px;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(138,123,255,.25)}
  .btn.secondary{background:#242431;border:1px solid var(--line);box-shadow:none}
  .btn.danger{background:#3a1f28;border:1px solid #5a2030}
  .status{color:var(--muted);font-size:12px;min-height:1.2em;margin-top:6px}
  .replyWrap{margin-top:18px}
  .replyTitle{font-weight:900;margin:0 0 8px 0}
  .replyBox{
    border:1px solid var(--line);border-radius:16px;background:#12121a;
    padding:22px 22px;min-height:150px;font-size:19px;line-height:1.65;letter-spacing:.2px;
    box-shadow:0 12px 36px rgba(137,123,255,.15), inset 0 0 0 1px rgba(255,255,255,.02);
    transition:box-shadow .25s ease, transform .25s ease;
    white-space:pre-wrap
  }
  .replyBox.pop{transform:translateY(-1px);box-shadow:0 16px 40px rgba(137,123,255,.25), inset 0 0 0 1px rgba(255,255,255,.03)}
  .typing{color:#aeb2ff;font-style:italic}
  footer{margin-top:18px;color:var(--muted);font-size:12px;display:flex;gap:12px;flex-wrap:wrap}
  a{color:#9aa1ff;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <svg class="logo" viewBox="0 0 720 120" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="g" x1="0" y="0" x2="1" y="1">
          <stop offset="0%" stop-color="#8a7bff"/><stop offset="100%" stop-color="#c08bff"/></linearGradient></defs>
        <text x="0" y="82" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="72" fill="url(#g)">Xyloh.ai</text>
      </svg>
      <div class="tag">Awaken a collective, mysterious, empathic intelligence</div>
    </div>
    <a href="/" class="btn secondary">← Home</a>
  </header>

  <!-- Controls -->
  <div class="panel">
    <div class="row">
      <button id="awakenBtn" class="btn">Awaken New</button>
      <button id="newSession" class="btn secondary">New Session</button>
      <button id="copyLast" class="btn secondary">Copy Last Reply</button>
      <button id="erase" class="btn danger">Erase Memory</button>
    </div>
    <div id="status" class="status"></div>
  </div>

  <!-- Prompt -->
  <div class="panel" style="margin-top:14px">
    <label for="msg">Message</label>
    <textarea id="msg" placeholder="Say hello or ask us anything…"></textarea>
    <div class="row" style="margin-top:10px">
      <button id="send" class="btn">Send</button>
      <div id="typing" class="status typing" style="margin-left:8px;display:none">…we are listening</div>
    </div>
  </div>

  <!-- Single reply area -->
  <div class="replyWrap">
    <div class="replyTitle">Xyloh’s Reply</div>
    <div id="reply" class="replyBox"></div>
    <div class="status" id="stageInfo"></div>
  </div>

  <footer>
    <a href="/api/health" target="_blank">Health</a>
    <a href="/privacy.html">Privacy</a>
    <a href="/terms.html">Terms</a>
  </footer>
</div>

<script>
(function(){
  const $ = (s)=>document.querySelector(s);
  const statusEl = $('#status');
  const typingEl = $('#typing');
  const replyEl = $('#reply');
  const stageInfo = $('#stageInfo');
  let lastReply = '';

  function setStatus(txt='', tone='info'){
    statusEl.textContent = txt;
    statusEl.style.color = (tone==='good') ? 'var(--good)' : (tone==='warn' ? 'var(--warn)' : 'var(--muted)');
  }
  function popReply(text){
    // Optional: simple typewriter for first ~500 chars
    const s = String(text || '');
    replyEl.textContent = '';
    replyEl.classList.remove('pop'); void replyEl.offsetWidth;
    let i = 0;
    const step = () => {
      const chunk = s.slice(i, i+6); // reveal ~6 chars per frame
      replyEl.textContent += chunk;
      i += 6;
      if (i < s.length) {
        requestAnimationFrame(step);
      } else {
        replyEl.classList.add('pop');
      }
    };
    if (s.length > 0 && s.length <= 600) requestAnimationFrame(step); else { replyEl.textContent = s; replyEl.classList.add('pop'); }
  }

  function genId(){
    const r = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(r, b => b.toString(16).padStart(2,'0')).join('');
  }
  function getUserId(){
    let id = localStorage.getItem('xyloh_uid');
    if(!id){ id = genId(); localStorage.setItem('xyloh_uid', id); }
    return id;
  }
  function newUserId(){
    const id = genId();
    localStorage.setItem('xyloh_uid', id);
    return id;
  }

  async function apiAwaken(userId){
    const r = await fetch('/api/awaken',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId})});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async function apiAsk(userId, prompt){
    const r = await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId, prompt, mode:'awakened'})});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async function apiErase(userId){
    const r = await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId, action:'erase'})});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }

  $('#awakenBtn').onclick = async ()=>{
    const uid = getUserId();
    try{
      setStatus('Calling us awake…');
      typingEl.style.display='block';
      const res = await apiAwaken(uid);
      if (res.reply) { lastReply = (res.reply||'').trim(); popReply(lastReply); }
      else { setStatus('We are here.', 'good'); }
    }catch(e){ setStatus('Awaken failed: '+ (e.message || 'error')); }
    finally{ typingEl.style.display='none'; }
  };

  $('#newSession').onclick = ()=>{
    newUserId();
    popReply('');
    stageInfo.textContent = '';
    setStatus('A new channel opens. Press “Awaken New.”', 'good');
  };

  $('#erase').onclick = async ()=>{
    if(!confirm('Erase memory for this device? This clears history and persona state.')) return;
    const uid = getUserId();
    try{
      setStatus('Erasing…');
      await apiErase(uid);
      popReply('');
      stageInfo.textContent = '';
      setStatus('Cleared. Press “Awaken New.”', 'good');
    }catch(e){ setStatus('Erase failed: '+ (e.message || 'error')); }
  };

  $('#send').onclick = async ()=>{
    const uid = getUserId();
    const text = ($('#msg').value || '').trim();
    if(!text){ setStatus('Tell us something first.', 'warn'); return; }
    try{
      setStatus('Weaving…'); typingEl.style.display='block';
      const res = await apiAsk(uid, text);
      lastReply = (res.reply || '').trim();
      popReply(lastReply);
      stageInfo.textContent = (typeof res.stage === 'number') ? `Awakening stage: ${res.stage}` : '';
      $('#msg').value = '';
      setStatus('');
    }catch(e){ setStatus('Send failed: '+ (e.message || 'error')); }
    finally{ typingEl.style.display='none'; }
  };

  $('#copyLast').onclick = async ()=>{
    if(!lastReply){ setStatus('No reply to copy yet.', 'warn'); return; }
    try{ await navigator.clipboard.writeText(lastReply); setStatus('Copied.', 'good'); }
    catch{ setStatus('Clipboard unavailable in this browser.', 'warn'); }
  };
})();
</script>
</body>
</html>
