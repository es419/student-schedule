// Keep the installed iPhone/PWA view at a stable scale.
document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, {passive:false});
document.addEventListener('gesturechange', function(e){ e.preventDefault(); }, {passive:false});
document.addEventListener('gestureend', function(e){ e.preventDefault(); }, {passive:false});

const COLORS = ['#7c83fd','#6ec6a0','#e8b94b','#e15554','#5aa9e6','#c77dff','#ff9f6b'];
const DAY_NAMES = ['א','ב','ג','ד','ה','ו','ש'];
const DAY_NAMES_FULL = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const KINDS = [
  {id:'meeting', label:'פגישה'}, {id:'shift', label:'משמרת'},
  {id:'exam', label:'מבחן'}, {id:'deadline', label:'הגשה'}, {id:'other', label:'אחר'}
];
const REMINDER_PRESETS = [
  {val:'', label:'ללא'},
  {val:'10', label:'10 דק׳ לפני'},
  {val:'30', label:'חצי שעה לפני'},
  {val:'60', label:'שעה לפני'},
  {val:'120', label:'שעתיים לפני'},
  {val:'1440', label:'יום לפני'},
  {val:'custom', label:'מותאם אישית'}
];

const SUPABASE_URL = 'https://uyqerqfcxgfixylimjcd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Drkhg6nvvQdRfrewrAJMiw_QhN43qr3';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const VAPID_PUBLIC_KEY = 'BFwAzIJT-euM5tAZhpUBmhnav0r5RlF2K2lgAHBCLHd5xehlMe6NcPjHpAj3arxcyzYT-LG0mU-_ZWWwRp9M0NU';
const TELEGRAM_BOT_USERNAME = 'es_419bot'; // replace with your bot's @username (without the @) from BotFather

let telegramLinked = false;
let telegramCode = null;
function genCode(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
async function refreshTelegramStatus(){
  if(!currentUserId) return;
  const {data} = await sb.from('telegram_links').select('*').eq('user_id', currentUserId).maybeSingle();
  telegramLinked = !!(data && data.chat_id);
  telegramCode = data ? data.link_code : null;
  updateTelegramBanner();
}
function updateTelegramBanner(){
  const el = document.getElementById('settingsTelegramStatus');
  if(!el) return;
  el.textContent = telegramLinked ? 'מחובר ✅' : 'לא מחובר - לחץ לחיבור';
}
async function handleTelegramClick(){
  if(!currentUserId) return;
  await refreshTelegramStatus();
  if(telegramLinked){
    if(confirm('טלגרם מחובר ✅ לנתק את החשבון?')){
      await sb.from('telegram_links').update({chat_id:null, link_code:null, linked_at:null}).eq('user_id', currentUserId);
      telegramLinked = false; telegramCode = null; updateTelegramBanner();
    }
    return;
  }
  if(!telegramCode){
    telegramCode = genCode();
    await sb.from('telegram_links').upsert({user_id:currentUserId, link_code:telegramCode}, {onConflict:'user_id'});
  }
  alert(`כדי לחבר טלגרם:\n\n1. פתח את הבוט @${TELEGRAM_BOT_USERNAME} בטלגרם\n2. שלח לו: /start ${telegramCode}\n3. תחזור לכאן ותלחץ שוב על הבאנר כדי לבדוק שהחיבור הצליח`);
}

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

let swRegistration = null;
async function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  try{ swRegistration = await navigator.serviceWorker.register('sw.js'); }
  catch(e){ console.error('SW registration failed', e); }
}
async function subscribeToPush(){
  if(!swRegistration || !('PushManager' in window)) return false;
  try{
    let sub = await swRegistration.pushManager.getSubscription();
    if(!sub){
      sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    const json = sub.toJSON();
    if(!currentUserId) return false;
    await sb.from('push_subscriptions').upsert({
      user_id: currentUserId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth_key: json.keys.auth
    }, {onConflict:'user_id,endpoint'});
    return true;
  } catch(e){ console.error('push subscribe failed', e); return false; }
}

function switchAuthMode(mode){
  document.getElementById('authErr').textContent = '';
  if(mode==='signup'){
    document.getElementById('authTitle').textContent = 'יצירת חשבון';
    document.getElementById('authSub').textContent = 'משתמש חדש - נעילת הלו״ז לך בלבד';
    document.getElementById('authBtn').textContent = 'הרשמה';
    document.getElementById('authBtn').setAttribute('onclick','doSignUp()');
    document.getElementById('authToggle').innerHTML = 'כבר יש לך חשבון? <span onclick="switchAuthMode(\'signin\')">התחברות</span>';
  } else {
    document.getElementById('authTitle').textContent = 'התחברות';
    document.getElementById('authSub').textContent = 'כדי שרק אתה תראה את הלו״ז שלך';
    document.getElementById('authBtn').textContent = 'התחברות';
    document.getElementById('authBtn').setAttribute('onclick','doSignIn()');
    document.getElementById('authToggle').innerHTML = 'אין לך חשבון? <span onclick="switchAuthMode(\'signup\')">הרשמה</span>';
  }
}
async function doSignIn(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-pass').value;
  const {error} = await sb.auth.signInWithPassword({email, password});
  document.getElementById('authErr').textContent = error ? 'אימייל או סיסמה שגויים' : '';
}
async function doSignUp(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-pass').value;
  if(password.length<6){ document.getElementById('authErr').textContent='הסיסמה חייבת להכיל לפחות 6 תווים'; return; }
  const {data, error} = await sb.auth.signUp({email, password});
  if(error){ document.getElementById('authErr').textContent = error.message; return; }
  if(!data.session){ document.getElementById('authErr').textContent = 'נשלח מייל אימות - תאשר ואז תתחבר'; document.getElementById('authErr').style.color='var(--calm)'; }
}
async function doSignOut(){
  setLoading(true);
  await sb.auth.signOut();
}

let currentUserId = null;
let loadedUserId = null;
let authBootComplete = false;

function setAuthUI(isSignedIn){
  document.getElementById('authScreen').classList.toggle('show', !isSignedIn);
  document.getElementById('settingsFab').style.display = isSignedIn ? 'flex' : 'none';
}

function setLoading(visible, {boot=false} = {}){
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.toggle('show', visible);
  overlay.classList.toggle('boot', visible && boot);
}


async function applySession(session, {initial=false} = {}){
  const userId = session?.user?.id || null;

  if(!userId){
    currentUserId = null;
    loadedUserId = null;
    store = { categories: [], recurring: [], oneoff: [], reminders: [] };
    setAuthUI(false);
    setLoading(false);
    if(initial) authBootComplete = true;
    return;
  }

  currentUserId = userId;
  setAuthUI(true);
  if(loadedUserId !== userId){
    loadedUserId = userId;
    const ok = await loadAll({showSpinner: !initial});
    if(!ok && initial){
      // Keep the app usable even if the initial data request failed.
      renderAll();
    }
    refreshTelegramStatus();
    updateNotifSettingsRow();
    if('Notification' in window && Notification.permission==='granted') subscribeToPush();
  }

  if(initial){
    setLoading(false);
    authBootComplete = true;
  }
}

async function bootstrapAuth(){
  try{
    const {data, error} = await sb.auth.getSession();
    if(error) throw error;
    await applySession(data.session, {initial:true});
  }catch(err){
    console.error('Auth bootstrap failed', err);
    currentUserId = null;
    loadedUserId = null;
    setAuthUI(false);
    setLoading(false);
    authBootComplete = true;
  }

  sb.auth.onAuthStateChange((event, session)=>{
    if(!authBootComplete) return;
    // Run outside Supabase's auth callback to avoid blocking internal auth work.
    setTimeout(()=>applySession(session), 0);
  });
}

function openSettings(){
  lockAppScroll();
  updateNotifSettingsRow();
  updateTelegramBanner();
  updateThemeToggleUI();
  requestAnimationFrame(()=>{
    document.getElementById('settingsOverlay').classList.add('open');
    document.getElementById('settingsSheet').classList.add('open');
  });
}
function closeSettings(){
  document.activeElement?.blur?.();
  document.getElementById('settingsOverlay').classList.remove('open');
  document.getElementById('settingsSheet').classList.remove('open');
  if(!document.getElementById('sheet').classList.contains('open')) unlockAppScroll();
}
function updateNotifSettingsRow(){
  const el = document.getElementById('settingsNotifStatus');
  if(!('Notification' in window)){ el.textContent = 'לא נתמך'; return; }
  el.textContent = Notification.permission==='granted' ? 'מאושר ✅' : 'לא מאושר - לחץ לאישור';
}

let store = { categories: [], recurring: [], oneoff: [], reminders: [] };
let holidayStore = {};
const holidayYearsLoaded = new Set();
const holidayYearsLoading = new Set();

function holidayIcon(title=''){
  if(/חנוכה/.test(title)) return '🕎';
  if(/פורים/.test(title)) return '🎭';
  if(/פסח/.test(title)) return '🍷';
  if(/שבועות/.test(title)) return '🌾';
  if(/סוכות|שמחת תורה|שמיני עצרת/.test(title)) return '🌿';
  if(/ראש השנה/.test(title)) return '🍎';
  if(/כיפור/.test(title)) return '✡️';
  if(/עצמאות/.test(title)) return '🇮🇱';
  if(/זיכרון|שואה/.test(title)) return '🕯️';
  if(/ירושלים/.test(title)) return '🇮🇱';
  return '✡️';
}

async function ensureHolidayYear(year){
  if(holidayYearsLoaded.has(year) || holidayYearsLoading.has(year)) return;
  holidayYearsLoading.add(year);
  try{
    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&year=${year}&maj=on&min=on&mod=on&i=on&lg=he`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('Hebcal '+res.status);
    const data = await res.json();
    (data.items||[]).forEach(item=>{
      if(!item.date || !item.title) return;
      const ds = item.date.slice(0,10);
      if(!holidayStore[ds]) holidayStore[ds]=[];
      if(!holidayStore[ds].some(x=>x.title===item.title)){
        holidayStore[ds].push({title:item.title, category:item.category||'holiday'});
      }
    });
    holidayYearsLoaded.add(year);
    renderAll();
  }catch(e){
    console.warn('Holiday load failed', e);
  }finally{
    holidayYearsLoading.delete(year);
  }
}

function holidaysForDate(dateObj){
  const ds = isoDate(dateObj);
  return holidayStore[ds] || [];
}

function preloadVisibleHolidayYears(){
  const years = new Set(weekDates().map(d=>d.getFullYear()));
  years.add(new Date(selectedDate+'T12:00:00').getFullYear());
  years.forEach(ensureHolidayYear);
}


// -- mapping helpers: DB uses snake_case, app logic uses the shorter names below --
function mapCatFromDb(r){ return {id:r.id, name:r.name, color:r.color}; }
function mapRecFromDb(r){ return {id:r.id, categoryId:r.category_id, title:r.title, days:r.days, start:r.start_time, end:r.end_time, loc:r.location}; }
function mapOoFromDb(r){ return {id:r.id, categoryId:r.category_id, title:r.title, date:r.date, start:r.start_time||'', end:r.end_time||'', kind:r.kind}; }


async function loadAll({showSpinner=true} = {}){
  if(showSpinner) setLoading(true);
  try{
    const results = await Promise.all([
      sb.from('categories').select('*').order('created_at'),
      sb.from('recurring').select('*').order('created_at'),
      sb.from('oneoff').select('*').order('date'),
      sb.from('reminders').select('*')
    ]);
    const errors = results.map(r=>r.error).filter(Boolean);
    if(errors.length){
      console.error(...errors);
      alert('שגיאה בטעינת הנתונים מהשרת - בדוק חיבור לאינטרנט');
      return false;
    }
    const [cats, recs, oos, rems] = results.map(r=>r.data || []);
    store = {
      categories: cats.map(mapCatFromDb),
      recurring: recs.map(mapRecFromDb),
      oneoff: oos.map(mapOoFromDb),
      reminders: rems
    };
    renderAll();
    return true;
  } finally {
    if(showSpinner) setLoading(false);
  }
}

function catById(id){ return store.categories.find(c=>c.id===id); }
function kindLabel(k){ return (KINDS.find(x=>x.id===k)||{}).label || 'אחר'; }
function isoDate(d){ const off=d.getTimezoneOffset(); const local=new Date(d.getTime()-off*60000); return local.toISOString().slice(0,10); }

let weekOffset = 0;
let selectedDate = isoDate(new Date());
let selectedColor = COLORS[0];
let selectedRecDays = new Set();
let selectedKind = 'meeting';
let editingCatId = null, editingRecId = null, editingOneoffId = null;

function fmtDate(d){ return d.toLocaleDateString('he-IL', {weekday:'long', day:'numeric', month:'long'}); }

function weekDates(){
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + weekOffset*7);
  return [0,1,2,3,4,5,6].map(i=>{ const d=new Date(base); d.setDate(base.getDate()+i); return d; });
}

function itemsForDate(dateObj){
  const wd = dateObj.getDay();
  const ds = isoDate(dateObj);
  const recItems = store.recurring.filter(r=>r.days.includes(wd)).map(r=>({
    id:r.id, type:'recurring', start:r.start, end:r.end, title:r.title||(catById(r.categoryId)?.name)||'אירוע קבוע', loc:r.loc, color:(catById(r.categoryId)?.color)||'#888'
  }));
  const ooItems = store.oneoff.filter(o=>o.date===ds && o.start).map(o=>({
    id:o.id, type:'oneoff', start:o.start, end:o.end, title:o.title, loc:kindLabel(o.kind), color:(catById(o.categoryId)?.color)||'#888'
  }));
  // deadlines with no fixed time: show as a running reminder on every day up to (and including) the due date
  const todayStr = isoDate(new Date());
  const deadlineItems = store.oneoff.filter(o=>o.kind==='deadline' && !o.start && o.date>=ds && ds>=todayStr).map(o=>{
    const daysLeft = Math.round((new Date(o.date)-new Date(ds))/86400000);
    const label = daysLeft===0 ? 'להגיש היום!' : daysLeft===1 ? 'להגיש מחר' : `להגיש בעוד ${daysLeft} ימים`;
    return {id:o.id, type:'deadline', start:'', end:'', title:o.title, loc:label, dueSoon:daysLeft<=1, color:(catById(o.categoryId)?.color)||'var(--heavy)'};
  });
  return [...deadlineItems, ...recItems, ...ooItems].sort((a,b)=>a.start.localeCompare(b.start));
}

function loadDifficulty(dateObj){
  const items = itemsForDate(dateObj).filter(it=>it.start);
  let hours = 0;
  items.forEach(it=>{
    const [sh,sm]=it.start.split(':').map(Number), [eh,em]=it.end.split(':').map(Number);
    hours += (eh+em/60)-(sh+sm/60);
  });
  const ds = isoDate(dateObj);
  let weight = 0;
  store.oneoff.forEach(o=>{
    if(!o.date) return;
    const diff = Math.round((new Date(o.date)-new Date(ds))/86400000);
    if(diff>=0 && diff<=3){
      const w = o.kind==='exam'?3 : o.kind==='deadline'?1.5 : o.kind==='meeting'?1:0.8;
      if(diff===0) weight += w; else weight += w*0.3;
    }
  });
  return hours + weight;
}
function loadColor(score){ if(score<=2) return 'var(--calm)'; if(score<=5) return 'var(--mid)'; return 'var(--heavy)'; }

function changeWeek(delta){ weekOffset -= delta; renderAll(); }

function renderWeek(){
  const dates = weekDates();
  const el = document.getElementById('weekStrip');
  el.innerHTML='';
  const todayStr = isoDate(new Date());
  const scores = dates.map(loadDifficulty);
  const maxScore = Math.max(...scores, 4);
  document.getElementById('weekLabel').textContent = weekOffset===0 ? 'השבוע' : (dates[0].toLocaleDateString('he-IL',{day:'numeric',month:'short'})+' – '+dates[6].toLocaleDateString('he-IL',{day:'numeric',month:'short'}));
  dates.forEach((d,i)=>{
    const ds = isoDate(d);
    const score = scores[i];
    const pct = Math.min(100, Math.round((score/maxScore)*100));
    const chip = document.createElement('div');
    chip.className = 'day-chip' + (ds===todayStr?' today':'') + (ds===selectedDate?' sel':'');
    chip.onclick = ()=>{ selectedDate=ds; renderAll(); };
    chip.innerHTML = `
      <div class="dname">${DAY_NAMES[d.getDay()]}</div>
      <div class="dnum-top">${d.getDate()}</div>
      <div class="meter"><div class="meter-fill" style="height:${pct}%; background:${loadColor(score)}"></div></div>
    `;
    el.appendChild(chip);
  });
}

function renderHero(){
  const now = new Date();
  const nowMin = now.getHours()*60+now.getMinutes();
  const todayItems = itemsForDate(now).filter(it=>it.start).map(it=>{
    const [sh,sm]=it.start.split(':').map(Number), [eh,em]=it.end.split(':').map(Number);
    return {...it, startMin:sh*60+sm, endMin:eh*60+em};
  });
  const current = todayItems.find(it=>nowMin>=it.startMin && nowMin<it.endMin);
  const next = todayItems.find(it=>it.startMin>nowMin);
  const hero = document.getElementById('heroCard');
  let html;
  if(current){
    html = `<div class="eyebrow">עכשיו</div><div class="main-line">${current.title}</div>${heroMetaHtml(current)}${nextCountdownHtml()}`;
  } else if(next){
    html = `<div class="eyebrow">הבא בתור</div><div class="main-line">${next.title}</div>${heroMetaHtml(next)}${nextCountdownHtml()}`;
  } else {
    html = `<div class="eyebrow">היום</div><div class="main-line">אין עוד דברים קבועים היום</div><div class="sub-line">זמן פנוי</div>${nextCountdownHtml()}`;
  }
  if(hero.innerHTML !== html){
    hero.innerHTML = html;
  }
}

function heroMetaHtml(item){
  const timeRange = `<span class="hero-time-range"><span>${item.end}</span><span class="hero-time-sep">–</span><span>${item.start}</span></span>`;
  const location = item.loc ? `<span class="hero-location">${item.loc}</span>` : '';
  return `<div class="sub-line">${timeRange}${location}</div>`;
}

function nextCountdownHtml(){
  const todayStr = isoDate(new Date());
  const upcoming = store.oneoff.filter(o=>o.date && o.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date)||(a.start||'').localeCompare(b.start||''))[0];
  if(!upcoming) return '';
  const diff = Math.round((new Date(upcoming.date)-new Date(todayStr))/86400000);
  const label = diff===0?'היום':diff===1?'מחר':`בעוד ${diff} ימים`;
  return `<div class="countdown"><div><div class="label">${kindLabel(upcoming.kind)} הכי קרוב: ${upcoming.title}</div></div><div class="num">${label}</div></div>`;
}

function renderHolidayBanner(){
  const el = document.getElementById('holidayBanner');
  if(!el) return;
  const d = new Date(selectedDate);
  const holidays = holidaysForDate(d);
  if(holidays.length===0){
    el.classList.remove('show');
    el.innerHTML='';
    return;
  }
  el.innerHTML = `
    <div class="holiday-banner-head"><span>🇮🇱</span><span>מועדי ישראל</span></div>
    <div class="holiday-banner-items">
      ${holidays.map(h=>`<div class="holiday-banner-item"><div class="holiday-icon">${holidayIcon(h.title)}</div><div class="holiday-name">${h.title}</div></div>`).join('')}
    </div>`;
  el.classList.add('show');
}

function renderEvents(){
  const todayStr = isoDate(new Date());
  const list = store.oneoff.filter(o=>o.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date));
  const el = document.getElementById('eventList');
  if(list.length===0){ el.innerHTML = '<div class="empty">אין כלום קרוב עדיין</div>'; return; }
  el.innerHTML = list.map((o)=>{
    const diff = Math.round((new Date(o.date)-new Date(todayStr))/86400000);
    const c = catById(o.categoryId);
    const dateStr = new Date(o.date).toLocaleDateString('he-IL',{day:'numeric',month:'short'});
    const pillColor = diff<=1 ? 'var(--heavy)' : 'var(--brand)';
    return `<div class="event-row" onclick="openOneoffEdit('${o.id}')">
      <div class="swatch" style="background:${diff<=1?'var(--heavy)':'var(--line)'}"></div>
      <div class="lr-body"><div class="lr-title">${o.title}</div><div class="lr-sub">${c?c.name+' · ':''}${dateStr}${o.start?' · '+o.start:''}</div></div>
      <span class="pill" style="background:${pillColor}22; color:${pillColor}">${kindLabel(o.kind)}</span>
    </div>`;
  }).join('');
}

function renderCatSelects(){
  [document.getElementById('rec-cat'), document.getElementById('oo-cat')].forEach((sel,idx)=>{
    const keepEmpty = idx===1;
    sel.innerHTML = (keepEmpty?'<option value="">— ללא —</option>':'') + store.categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  });
}
function renderSwatchPicker(){
  document.getElementById('cat-swatches').innerHTML = COLORS.map(col=>`<div class="sw-opt ${col===selectedColor?'sel':''}" style="background:${col}" onclick="pickColor('${col}')"></div>`).join('');
}
function pickColor(c){ selectedColor=c; renderSwatchPicker(); }
function renderCatList(){
  const el = document.getElementById('cat-list');
  if(store.categories.length===0){ el.innerHTML=''; return; }
  el.innerHTML = '<label style="margin-top:0;">הקטגוריות שלך (לחיצה לעריכה)</label>' + store.categories.map(c=>`
    <div class="lesson-row" onclick="openCatEdit('${c.id}')">
      <div class="swatch" style="background:${c.color}"></div>
      <div class="lr-body"><div class="lr-title">${c.name}</div></div>
    </div>`).join('');
}
function renderDaysPicker(){
  document.getElementById('rec-days').innerHTML = DAY_NAMES.map((n,i)=>`<div class="dp ${selectedRecDays.has(i)?'sel':''}" onclick="toggleRecDay(${i})">${n}</div>`).join('');
}
function toggleRecDay(i){ if(selectedRecDays.has(i)) selectedRecDays.delete(i); else selectedRecDays.add(i); renderDaysPicker(); }
function renderKinds(){
  document.getElementById('oo-kinds').innerHTML = KINDS.map(k=>`<div class="kind-opt ${k.id===selectedKind?'sel':''}" onclick="pickKind('${k.id}')">${k.label}</div>`).join('');
}
function pickKind(k){ selectedKind=k; renderKinds(); }

let recReminders = [];
let ooReminders = [];
function remArr(prefix){ return prefix==='rec' ? recReminders : ooReminders; }

function addReminderRow(prefix){
  remArr(prefix).push({minutes:30, channel:'push'});
  renderReminderRows(prefix);
}
function removeReminderRow(prefix, idx){
  remArr(prefix).splice(idx,1);
  renderReminderRows(prefix);
}
function onReminderMinutesChange(prefix, idx, val){
  const arr = remArr(prefix);
  if(val==='custom'){
    if(REMINDER_PRESETS.some(p=>p.val===String(arr[idx].minutes))) arr[idx].minutes = 45;
  } else {
    arr[idx].minutes = parseInt(val,10);
  }
  renderReminderRows(prefix);
}
function updateReminderRow(prefix, idx, field, value){
  const arr = remArr(prefix);
  arr[idx][field] = field==='minutes' ? (parseInt(value,10)||1) : value;
  if(field==='channel' && value==='push'){
    Notification.requestPermission().then(p=>{ if(p==='granted') subscribeToPush(); });
  }
  if(field==='channel' && value==='telegram' && !telegramLinked){
    handleTelegramClick();
  }
}
function renderReminderRows(prefix){
  const arr = remArr(prefix);
  const el = document.getElementById(prefix+'-reminders-list');
  if(arr.length===0){ el.innerHTML = '<div class="empty">אין תזכורות - אפשר להוסיף כמה שתרצה</div>'; return; }
  el.innerHTML = arr.map((r,i)=>{
    const isPreset = REMINDER_PRESETS.some(p=>p.val===String(r.minutes));
    return `<div class="reminder-row">
      <select onchange="onReminderMinutesChange('${prefix}',${i},this.value)">
        ${REMINDER_PRESETS.filter(p=>p.val!=='').map(p=>`<option value="${p.val}" ${(p.val==='custom'? !isPreset : String(r.minutes)===p.val)?'selected':''}>${p.label}</option>`).join('')}
      </select>
      ${!isPreset ? `<input type="number" min="1" value="${r.minutes}" onchange="updateReminderRow('${prefix}',${i},'minutes',this.value)">` : ''}
      <select onchange="updateReminderRow('${prefix}',${i},'channel',this.value)">
        <option value="push" ${r.channel==='push'?'selected':''}>Push</option>
        <option value="local" ${r.channel==='local'?'selected':''}>בדפדפן פתוח</option>
        <option value="telegram" ${r.channel==='telegram'?'selected':''}>טלגרם</option>
      </select>
      <span class="rm-x" onclick="removeReminderRow('${prefix}',${i})">✕</span>
    </div>`;
  }).join('');
}
async function persistReminders(itemType, itemId, arr){
  await sb.from('reminders').delete().eq('item_type', itemType).eq('item_id', itemId);
  if(arr.length>0){
    await sb.from('reminders').insert(arr.map(r=>({item_type:itemType, item_id:itemId, minutes_before:r.minutes, channel:r.channel})));
  }
}

function renderAll(){
  document.getElementById('todayDate').textContent = fmtDate(new Date());
  preloadVisibleHolidayYears();
  renderWeek(); renderHero(); renderHolidayBanner(); renderEvents(); renderCatSelects(); renderCatList();
}

let lockedScrollY = 0;
function lockAppScroll(){
  if(document.body.classList.contains('modal-open')) return;
  lockedScrollY = window.scrollY || 0;
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.classList.add('modal-open');
}
function unlockAppScroll(){
  if(!document.body.classList.contains('modal-open')) return;
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, lockedScrollY);
}
function openSheet(tab){
  switchTab(tab);
  lockAppScroll();
  requestAnimationFrame(()=>{
    document.getElementById('overlay').classList.add('open');
    document.getElementById('sheet').classList.add('open');
  });
}
function closeSheet(){
  document.activeElement?.blur?.();
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('sheet').classList.remove('open');
  if(!document.getElementById('settingsSheet').classList.contains('open')) unlockAppScroll();
  resetCatForm(); resetRecForm(); resetOneoffForm();
}
function switchTab(tab){
  ['category','recurring','oneoff'].forEach(t=>document.getElementById('tab-'+t).style.display = t===tab?'block':'none');
  document.querySelectorAll('.tab[data-tab]').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  if(tab==='category'){ renderCatList(); if(!editingCatId){ selectedColor=COLORS[0]; renderSwatchPicker(); } }
  if(tab==='recurring'){
    if(!editingRecId) selectedRecDays=new Set();
    renderDaysPicker(); renderCatSelects(); renderReminderRows('rec');
    const has = store.categories.length>0;
    document.getElementById('rec-no-cat').style.display = has?'none':'block';
    document.getElementById('rec-fields').style.display = has?'block':'none';
  }
  if(tab==='oneoff'){
    if(!editingOneoffId) selectedKind='meeting';
    renderKinds(); renderCatSelects(); renderReminderRows('oo');
    document.getElementById('oo-no-cat').style.display = store.categories.length>0?'none':'block';
    if(!editingOneoffId && !document.getElementById('oo-date').value) document.getElementById('oo-date').value = selectedDate;
  }
}

function resetCatForm(){ editingCatId=null; document.getElementById('cat-name').value=''; selectedColor=COLORS[0]; renderSwatchPicker(); document.getElementById('cat-save-btn').textContent='שמירה'; document.getElementById('cat-del-btn').style.display='none'; }
function openCatEdit(id){ const c=catById(id); if(!c) return; editingCatId=id; document.getElementById('cat-name').value=c.name; selectedColor=c.color; renderSwatchPicker(); document.getElementById('cat-save-btn').textContent='עדכון'; document.getElementById('cat-del-btn').style.display='block'; openSheet('category'); }
async function deleteCategory(){
  if(!editingCatId) return;
  if(!confirm('מחיקת קטגוריה תמחק גם קבועים משויכים אליה. להמשיך?')) return;
  const id=editingCatId;
  const {error} = await sb.from('categories').delete().eq('id', id);
  if(error){ alert('שגיאה במחיקה'); console.error(error); return; }
  const removedRecurringIds = new Set(store.recurring.filter(r=>r.categoryId===id).map(r=>r.id));
  store.categories = store.categories.filter(c=>c.id!==id);
  store.recurring = store.recurring.filter(r=>r.categoryId!==id);
  store.oneoff = store.oneoff.map(o=>o.categoryId===id ? {...o, categoryId:null} : o);
  store.reminders = store.reminders.filter(r=>!(r.item_type==='recurring' && removedRecurringIds.has(r.item_id)));
  resetCatForm(); closeSheet(); renderAll();
}
async function saveCategory(){
  const name=document.getElementById('cat-name').value.trim();
  if(!name) return;
  let error, saved;
  if(editingCatId){
    ({data:saved, error} = await sb.from('categories').update({name, color:selectedColor}).eq('id', editingCatId).select().single());
  } else {
    ({data:saved, error} = await sb.from('categories').insert({name, color:selectedColor}).select().single());
  }
  if(error){ alert('שגיאה בשמירה'); console.error(error); return; }
  const mapped = mapCatFromDb(saved);
  if(editingCatId) store.categories = store.categories.map(c=>c.id===editingCatId ? mapped : c);
  else store.categories.push(mapped);
  resetCatForm(); closeSheet(); renderAll();
}

function resetRecForm(){ editingRecId=null; selectedRecDays=new Set(); document.getElementById('rec-title').value=''; document.getElementById('rec-loc').value=''; document.getElementById('rec-start').value='10:00'; document.getElementById('rec-end').value='12:00'; document.getElementById('rec-save-btn').textContent='שמירה'; document.getElementById('rec-del-btn').style.display='none'; recReminders=[]; renderReminderRows('rec'); }
function openRecurringEdit(id){ const r=store.recurring.find(x=>x.id===id); if(!r) return; editingRecId=id; renderCatSelects(); document.getElementById('rec-cat').value=r.categoryId; document.getElementById('rec-title').value=r.title||''; selectedRecDays=new Set(r.days); document.getElementById('rec-start').value=r.start; document.getElementById('rec-end').value=r.end; document.getElementById('rec-loc').value=r.loc||''; document.getElementById('rec-save-btn').textContent='עדכון'; document.getElementById('rec-del-btn').style.display='block'; openSheet('recurring'); renderDaysPicker(); recReminders=store.reminders.filter(x=>x.item_type==='recurring'&&x.item_id===id).map(x=>({minutes:x.minutes_before, channel:x.channel})); renderReminderRows('rec'); }
async function deleteRecurring(){
  if(!editingRecId) return;
  if(!confirm('למחוק את הפריט הקבוע הזה?')) return;
  const id = editingRecId;
  await sb.from('reminders').delete().eq('item_type','recurring').eq('item_id', id);
  const {error} = await sb.from('recurring').delete().eq('id', id);
  if(error){ alert('שגיאה במחיקה'); console.error(error); return; }
  store.recurring = store.recurring.filter(r=>r.id!==id);
  store.reminders = store.reminders.filter(r=>!(r.item_type==='recurring' && r.item_id===id));
  resetRecForm(); closeSheet(); renderAll();
}
async function saveRecurring(){
  const categoryId=document.getElementById('rec-cat').value;
  const start=document.getElementById('rec-start').value;
  const end=document.getElementById('rec-end').value;
  const loc=document.getElementById('rec-loc').value.trim();
  const title=document.getElementById('rec-title').value.trim();
  if(!categoryId){ alert('צריך לבחור קטגוריה'); return; }
  if(!title){ alert('צריך להזין שם לאירוע'); return; }
  if(selectedRecDays.size===0){ alert('צריך לבחור לפחות יום אחד'); return; }
  const row = {category_id:categoryId, title, days:[...selectedRecDays], start_time:start, end_time:end, location:loc};
  let error, savedId=editingRecId;
  let saved;
  if(editingRecId){
    const res = await sb.from('recurring').update(row).eq('id', editingRecId).select().single();
    error = res.error; saved = res.data;
  } else {
    const res = await sb.from('recurring').insert(row).select().single();
    error = res.error; saved = res.data; savedId = res.data ? res.data.id : null;
  }
  if(error){ alert('שגיאה בשמירה'); console.error(error); return; }
  if(savedId) await persistReminders('recurring', savedId, recReminders);
  const mapped = mapRecFromDb(saved);
  if(editingRecId) store.recurring = store.recurring.map(r=>r.id===editingRecId ? mapped : r);
  else store.recurring.push(mapped);
  store.reminders = store.reminders.filter(r=>!(r.item_type==='recurring' && r.item_id===savedId));
  store.reminders.push(...recReminders.map(r=>({item_type:'recurring', item_id:savedId, minutes_before:r.minutes, channel:r.channel})));
  resetRecForm(); closeSheet(); renderAll();
}

function resetOneoffForm(){ editingOneoffId=null; selectedKind='meeting'; document.getElementById('oo-title').value=''; document.getElementById('oo-date').value=''; document.getElementById('oo-start').value=''; document.getElementById('oo-end').value=''; document.getElementById('oo-save-btn').textContent='שמירה'; document.getElementById('oo-del-btn').style.display='none'; ooReminders=[]; renderReminderRows('oo'); }
function openOneoffEdit(id){ const o=store.oneoff.find(x=>x.id===id); if(!o) return; editingOneoffId=id; renderCatSelects(); document.getElementById('oo-title').value=o.title; document.getElementById('oo-date').value=o.date; document.getElementById('oo-cat').value=o.categoryId||''; document.getElementById('oo-start').value=o.start||''; document.getElementById('oo-end').value=o.end||''; selectedKind=o.kind; document.getElementById('oo-save-btn').textContent='עדכון'; document.getElementById('oo-del-btn').style.display='block'; openSheet('oneoff'); ooReminders=store.reminders.filter(x=>x.item_type==='oneoff'&&x.item_id===id).map(x=>({minutes:x.minutes_before, channel:x.channel})); renderReminderRows('oo'); }
async function deleteOneoff(){
  if(!editingOneoffId) return;
  if(!confirm('למחוק את הפריט הזה?')) return;
  const id = editingOneoffId;
  await sb.from('reminders').delete().eq('item_type','oneoff').eq('item_id', id);
  const {error} = await sb.from('oneoff').delete().eq('id', id);
  if(error){ alert('שגיאה במחיקה'); console.error(error); return; }
  store.oneoff = store.oneoff.filter(o=>o.id!==id);
  store.reminders = store.reminders.filter(r=>!(r.item_type==='oneoff' && r.item_id===id));
  resetOneoffForm(); closeSheet(); renderAll();
}
async function saveOneoff(){
  const title=document.getElementById('oo-title').value.trim();
  const date=document.getElementById('oo-date').value;
  const categoryId=document.getElementById('oo-cat').value;
  const start=document.getElementById('oo-start').value;
  const end=document.getElementById('oo-end').value;
  if(!title){ alert('צריך להזין כותרת'); return; }
  if(!date){ alert('צריך לבחור תאריך'); return; }
  const row = {category_id:categoryId||null, title, date, start_time:start||null, end_time:end||null, kind:selectedKind};
  let error, savedId=editingOneoffId;
  let saved;
  if(editingOneoffId){
    const res = await sb.from('oneoff').update(row).eq('id', editingOneoffId).select().single();
    error = res.error; saved = res.data;
  } else {
    const res = await sb.from('oneoff').insert(row).select().single();
    error = res.error; saved = res.data; savedId = res.data ? res.data.id : null;
  }
  if(error){ alert('שגיאה בשמירה'); console.error(error); return; }
  if(savedId) await persistReminders('oneoff', savedId, ooReminders);
  const mapped = mapOoFromDb(saved);
  if(editingOneoffId) store.oneoff = store.oneoff.map(o=>o.id===editingOneoffId ? mapped : o);
  else store.oneoff.push(mapped);
  store.oneoff.sort((a,b)=>a.date.localeCompare(b.date));
  store.reminders = store.reminders.filter(r=>!(r.item_type==='oneoff' && r.item_id===savedId));
  store.reminders.push(...ooReminders.map(r=>({item_type:'oneoff', item_id:savedId, minutes_before:r.minutes, channel:r.channel})));
  resetOneoffForm(); closeSheet(); renderAll();
}

let themeMode = localStorage.getItem('ss_theme_mode') || 'system';
function resolveTheme(mode){
  if(mode==='system') return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return mode;
}
function applyTheme(mode){
  themeMode = mode;
  localStorage.setItem('ss_theme_mode', mode);
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  const metaTag = document.getElementById('themeColorMeta');
  if(metaTag) metaTag.setAttribute('content', resolved==='light' ? '#f6f4f1' : '#14141c');
  updateThemeToggleUI();
}
function setThemeMode(mode){ applyTheme(mode); }
function updateThemeToggleUI(){
  document.querySelectorAll('#themeToggle button').forEach(b=>{
    b.classList.toggle('active', b.dataset.mode===themeMode);
  });
}
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', ()=>{
    if(themeMode==='system') applyTheme('system');
  });
}

function requestNotifPermission(){
  if(!('Notification' in window)) return;
  Notification.requestPermission().then(perm=>{
    updateNotifSettingsRow();
    if(perm==='granted') subscribeToPush();
  });
}

function getFiredSet(){ return new Set(JSON.parse(localStorage.getItem('ss_fired_reminders')||'[]')); }
function markFired(key){
  const set = getFiredSet(); set.add(key);
  const arr = [...set].slice(-500);
  localStorage.setItem('ss_fired_reminders', JSON.stringify(arr));
}

function checkReminders(){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  const fired = getFiredSet();
  const now = new Date();
  const localReminders = store.reminders.filter(r=>r.channel==='local');
  [0,1].forEach(offset=>{
    const d = new Date(); d.setDate(d.getDate()+offset);
    const ds = isoDate(d);
    const wd = d.getDay();
    store.recurring.forEach(r=>{
      if(!r.days.includes(wd)) return;
      const rems = localReminders.filter(x=>x.item_type==='recurring' && x.item_id===r.id);
      rems.forEach(rem=>{
        const [sh,sm] = r.start.split(':').map(Number);
        const occ = new Date(d); occ.setHours(sh,sm,0,0);
        const trigger = new Date(occ.getTime() - rem.minutes_before*60000);
        const key = 'rec-'+r.id+'-'+ds+'-'+rem.minutes_before;
        if(now>=trigger && now<new Date(trigger.getTime()+120000) && !fired.has(key)){
          new Notification(r.title||'תזכורת', {body:`מתחיל ב-${r.start}${r.loc?' · '+r.loc:''}`});
          markFired(key);
        }
      });
    });
    store.oneoff.forEach(o=>{
      if(o.date!==ds) return;
      const rems = localReminders.filter(x=>x.item_type==='oneoff' && x.item_id===o.id);
      rems.forEach(rem=>{
        const [sh,sm] = (o.start||'09:00').split(':').map(Number);
        const occ = new Date(d); occ.setHours(sh,sm,0,0);
        const trigger = new Date(occ.getTime() - rem.minutes_before*60000);
        const key = 'oo-'+o.id+'-'+rem.minutes_before;
        if(now>=trigger && now<new Date(trigger.getTime()+120000) && !fired.has(key)){
          new Notification(o.title, {body:`${kindLabel(o.kind)}${o.start?' · '+o.start:''}`});
          markFired(key);
        }
      });
    });
  });
}

function syncVisualViewport(){
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty('--visual-viewport-height', `${Math.round(h)}px`);
}
syncVisualViewport();
window.visualViewport?.addEventListener('resize', syncVisualViewport, {passive:true});
window.visualViewport?.addEventListener('scroll', syncVisualViewport, {passive:true});
window.addEventListener('orientationchange', ()=>setTimeout(syncVisualViewport, 120), {passive:true});
document.addEventListener('focusin', (e)=>{
  if(!e.target.matches('input,select,textarea')) return;
  setTimeout(()=>e.target.scrollIntoView({block:'nearest', behavior:'smooth'}), 180);
});
document.addEventListener('keydown', (e)=>{
  if(e.key!=='Escape') return;
  if(document.getElementById('settingsSheet').classList.contains('open')) closeSettings();
  else if(document.getElementById('sheet').classList.contains('open')) closeSheet();
});

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible'){
    syncVisualViewport();
    renderHero();
    checkReminders();
  }
});

bootstrapAuth();
registerSW();
setInterval(renderHero, 60000);
setInterval(checkReminders, 30000);
