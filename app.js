/* ============================================================
   СУММА — app.js
   Логика приложения (v1.0)
   ============================================================ */

const DB_KEY='summa_db_v1';
const MASTER_PIN='0537';

let DB=null,ROLE=null,AUTHED=false;
let CONTRACT_TAB='active';
let CAL_DATE=new Date();
let _months=6;

/* ============ ИНИЦИАЛИЗАЦИЯ ============ */
function loadDB(){
  try{const r=localStorage.getItem(DB_KEY);if(r)return JSON.parse(r);}catch(e){}
  return{
    clients:[],contracts:[],partners:[],
    categories:['Телефоны','Мебель','Бытовая техника','Одежда','Электроника'],
    audit:[],
    created:new Date().toISOString()
  };
}
function saveDB(){localStorage.setItem(DB_KEY,JSON.stringify(DB));}

/* ============ УТИЛИТЫ ============ */
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const fmt=n=>Math.round(n).toLocaleString('ru-RU');
const fmtR=n=>fmt(n)+' ₽';
const todayISO=()=>new Date().toISOString().slice(0,10);
const monthPrefix=()=>{const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
const parseD=s=>{if(!s)return new Date();
  const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const fmtDate=s=>{if(!s)return'—';
  const d=typeof s==='string'?parseD(s):s;
  return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});};

function toast(m){
  const t=document.getElementById('toast');
  if(!t)return;
  t.textContent=m;t.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>t.classList.remove('show'),2000);
}
function logAudit(a,d){
  DB.audit.unshift({id:uid(),action:a,details:d,role:'owner',
    date:new Date().toISOString()});
  if(DB.audit.length>500)DB.audit.length=500;
  saveDB();
}

/* ============ ВХОД ============ */
function tryLogin(){
  const pin=(document.getElementById('pinInput').value||'').trim();
  if(pin===MASTER_PIN){
    AUTHED=true;ROLE='owner';
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appScreen').style.display='block';
    document.getElementById('whoAmI').textContent='Владелец';
    refreshAll();
  }else{
    toast('Неверный PIN');
    document.getElementById('pinInput').value='';
  }
}
function logout(){
  if(!confirm('Выйти?'))return;
  AUTHED=false;ROLE=null;
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('appScreen').style.display='none';
  document.getElementById('pinInput').value='';
}

/* ============ НАВИГАЦИЯ ============ */
function nav(s){
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  const el=document.getElementById('screen-'+s);
  if(el)el.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const nb=document.querySelector('.nav-btn[data-screen="'+s+'"]');
  if(nb)nb.classList.add('active');
  document.getElementById('topbar').style.display=s==='summary'?'none':'flex';
  window.scrollTo(0,0);
  refreshAll();
}

/* ============ МОДАЛКА ============ */
function openModal(t,h){
  document.getElementById('modalTitle').textContent=t;
  document.getElementById('modalBody').innerHTML=h;
  document.getElementById('modalBg').classList.add('active');
}
function closeModal(){
  document.getElementById('modalBg').classList.remove('active');
}

/* ============ ОБНОВЛЕНИЕ ============ */
function refreshAll(){
  renderSummary();
  renderClients();
  renderContracts();
  renderCalc();
  renderCalendar();
}

/* ============ СВОДКА ============ */
function renderSummary(){
  const act=DB.contracts.filter(c=>c.status==='active');
  const turnover=act.reduce((s,c)=>s+(c.total||0),0);
  const mp=monthPrefix();
  const collected=DB.contracts.flatMap(c=>c.schedule||[])
    .filter(p=>p.paid&&p.paidDate&&p.paidDate.startsWith(mp))
    .reduce((s,p)=>s+(p.amount||0),0);
  const expected=DB.contracts.flatMap(c=>c.schedule||[])
    .filter(p=>!p.paid&&p.date&&p.date.startsWith(mp))
    .reduce((s,p)=>s+(p.amount||0),0);
  let overdue=0;const oc=new Set();const now=new Date();
  DB.contracts.forEach(c=>(c.schedule||[]).forEach(p=>{
    if(!p.paid&&p.date&&parseD(p.date)<now){
      overdue+=p.amount||0;oc.add(c.clientId||c.id);
    }
  }));
  document.getElementById('s-turnover').textContent=fmt(turnover);
  document.getElementById('s-collected').textContent=fmt(collected);
  document.getElementById('s-expected').textContent=fmtR(expected);
  const card=document.getElementById('s-overdue-card');
  if(overdue>0){
    card.style.display='block';
    document.getElementById('s-overdue').textContent=fmt(overdue);
    document.getElementById('s-overdue-hint').textContent=oc.size+' должников';
  }else card.style.display='none';

  const rl=document.getElementById('recentList');
  const list=[...DB.contracts]
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  if(!list.length){
    rl.innerHTML='<div class="card"><div class="empty-title">'+
      'Договоров пока нет</div><div class="empty-desc">'+
      'Нажмите «Новый договор», чтобы создать первый.</div></div>';
    return;
  }
  rl.innerHTML=list.map(c=>{
    const cl=DB.clients.find(x=>x.id===c.clientId);
    return '<div class="list-item" onclick="openContract(\''+c.id+'\')">'+
      '<div class="main"><div class="title">'+(cl?cl.name:'—')+'</div>'+
      '<div class="sub">'+(c.product||'—')+' · '+fmtR(c.total)+'</div></div>'+
      '<div style="color:var(--muted)">›</div></div>';
  }).join('');
}

/* ============ КЛИЕНТЫ ============ */
function renderClients(){
  const q=(document.getElementById('clientSearch').value||'').toLowerCase();
  const list=DB.clients.filter(c=>!q||c.name.toLowerCase().includes(q)||
    (c.phone||'').includes(q));
  const el=document.getElementById('clientsList');
  if(!list.length){
    el.innerHTML='<div class="card"><div class="empty-title">'+
      'Клиентов пока нет</div><div class="empty-desc">'+
      'Добавьте первого.</div>'+
      '<button class="btn btn-dark" onclick="openClientForm()">'+
      'Добавить</button></div>';
    return;
  }
  el.innerHTML=list.map(c=>{
    const ini=(c.name||'?').split(' ').map(w=>w[0]).slice(0,2)
      .join('').toUpperCase();
    return '<div class="list-item" onclick="openClientCard(\''+c.id+'\')">'+
      '<div style="display:flex;align-items:center;gap:12px;flex:1">'+
      '<div class="avatar">'+ini+'</div><div class="main">'+
      '<div class="title">'+c.name+'</div>'+
      '<div class="sub">'+(c.phone||'—')+'</div></div></div>'+
      '<div style="color:var(--muted)">›</div></div>';
  }).join('');
}
function openClientForm(){
  openModal('Новый клиент',
    '<div class="field"><label>ФИО</label><input id="cf-name"></div>'+
    '<div class="field"><label>Телефон</label>'+
      '<input id="cf-phone" type="tel"></div>'+
    '<div class="field"><label>Дата рождения</label>'+
      '<input id="cf-birth" type="date"></div>'+
    '<div class="field"><label>Адрес</label><input id="cf-address"></div>'+
    '<div class="field"><label>Паспорт</label><input id="cf-passport"></div>'+
    '<div class="field"><label>Свидетель</label><input id="cf-witness"></div>'+
    '<button class="btn btn-dark btn-block" onclick="saveClient()">'+
    'Сохранить</button>');
}
function saveClient(){
  const name=document.getElementById('cf-name').value.trim();
  if(!name){toast('Введите имя');return;}
  DB.clients.push({
    id:uid(),name,
    phone:document.getElementById('cf-phone').value.trim(),
    birth:document.getElementById('cf-birth').value||'',
    address:document.getElementById('cf-address').value.trim(),
    passport:document.getElementById('cf-passport').value.trim(),
    witness:document.getElementById('cf-witness').value.trim(),
    createdAt:new Date().toISOString()
  });
  saveDB();logAudit('Клиент добавлен',name);
  closeModal();refreshAll();toast('Клиент добавлен');
}
function openClientCard(id){
  const c=DB.clients.find(x=>x.id===id);if(!c)return;
  const cts=DB.contracts.filter(x=>x.clientId===id);
  openModal(c.name,
    (c.phone?'<div style="color:var(--muted);margin-bottom:6px">📞 '+
      c.phone+'</div>':'')+
    (c.birth?'<div style="color:var(--muted);margin-bottom:6px">🎂 '+
      fmtDate(c.birth)+'</div>':'')+
    (c.address?'<div style="color:var(--muted);margin-bottom:6px">📍 '+
      c.address+'</div>':'')+
    (c.passport?'<div style="color:var(--muted);margin-bottom:6px">🪪 '+
      c.passport+'</div>':'')+
    (c.witness?'<div style="color:var(--muted);margin-bottom:6px">👤 '+
      c.witness+'</div>':'')+
    '<div style="margin:14px 0"><b>Договоров: '+cts.length+'</b></div>'+
    (c.phone?'<button class="btn btn-outline btn-block" '+
      'style="margin-bottom:10px" onclick="waClient(\''+id+'\')">'+
      '📲 WhatsApp</button>':'')+
    '<button class="btn btn-outline btn-block" style="margin-bottom:10px" '+
      'onclick="editClient(\''+id+'\')">Редактировать</button>'+
    '<button class="btn btn-outline btn-block" '+
      'style="color:var(--danger)" onclick="deleteClient(\''+id+'\')">'+
      'Удалить</button>');
}
function waClient(id){
  const c=DB.clients.find(x=>x.id===id);
  window.open('https://wa.me/'+(c.phone||'').replace(/\D/g,''),'_blank');
}
function editClient(id){
  const c=DB.clients.find(x=>x.id===id);
  openModal('Изменить',
    '<div class="field"><label>ФИО</label>'+
      '<input id="cf-name" value="'+(c.name||'')+'"></div>'+
    '<div class="field"><label>Телефон</label>'+
      '<input id="cf-phone" value="'+(c.phone||'')+'"></div>'+
    '<div class="field"><label>Дата рождения</label>'+
      '<input id="cf-birth" type="date" value="'+(c.birth||'')+'"></div>'+
    '<div class="field"><label>Адрес</label>'+
      '<input id="cf-address" value="'+(c.address||'')+'"></div>'+
    '<div class="field"><label>Паспорт</label>'+
      '<input id="cf-passport" value="'+(c.passport||'')+'"></div>'+
    '<div class="field"><label>Свидетель</label>'+
      '<input id="cf-witness" value="'+(c.witness||'')+'"></div>'+
    '<button class="btn btn-dark btn-block" '+
      'onclick="updateClient(\''+id+'\')">Сохранить</button>');
}
function updateClient(id){
  const c=DB.clients.find(x=>x.id===id);
  c.name=document.getElementById('cf-name').value.trim();
  c.phone=document.getElementById('cf-phone').value.trim();
  c.birth=document.getElementById('cf-birth').value||'';
  c.address=document.getElementById('cf-address').value.trim();
  c.passport=document.getElementById('cf-passport').value.trim();
  c.witness=document.getElementById('cf-witness').value.trim();
  saveDB();closeModal();refreshAll();toast('Сохранено');
}
function deleteClient(id){
  if(!confirm('Удалить?'))return;
  DB.clients=DB.clients.filter(x=>x.id!==id);
  saveDB();closeModal();refreshAll();toast('Удалён');
}

/* ============ ДОГОВОРЫ ============ */
function switchTab(t){
  CONTRACT_TAB=t;
  document.querySelectorAll('#screen-contracts .tabs button')
    .forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  renderContracts();
}
function renderContracts(){
  const list=DB.contracts.filter(c=>
    CONTRACT_TAB==='active'?c.status==='active':c.status==='closed');
  const el=document.getElementById('contractsList');
  if(!list.length){
    el.innerHTML='<div class="card"><div class="empty-title">'+
      (CONTRACT_TAB==='active'?'Договоров пока нет':'Архив пуст')+
      '</div></div>';
    return;
  }
  el.innerHTML=list.map(c=>{
    const cl=DB.clients.find(x=>x.id===c.clientId);
    const paid=(c.schedule||[]).filter(p=>p.paid).length;
    const total=(c.schedule||[]).length;
    const pct=total?Math.round(paid/total*100):0;
    return '<div class="list-item" onclick="openContract(\''+c.id+'\')">'+
      '<div class="main"><div class="title">'+(cl?cl.name:'—')+'</div>'+
      '<div class="sub">'+(c.product||'—')+' · '+fmtR(c.total)+'</div>'+
      '<div class="progress"><div style="width:'+pct+'%"></div></div>'+
      '<div class="sub">'+paid+'/'+total+' мес</div></div>'+
      '<div style="color:var(--muted)">›</div></div>';
  }).join('');
}

/* ============ КАЛЬКУЛЯТОР ============ */
function syncFromRange(which){
  const priceEl=document.getElementById('c-price');
  const downEl=document.getElementById('c-down');
  const monthsEl=document.getElementById('c-months');
  if(!priceEl)return;
  if(which==='price'){
    downEl.max=Math.round(+priceEl.value/2);
    if(+downEl.value<priceEl.value*0.2)
      downEl.value=Math.round(priceEl.value*0.2);
  }
  const price=+priceEl.value;
  const down=Math.min(+downEl.value,price);
  const months=+monthsEl.value;
  _months=months;
  document.getElementById('c-price-v').value=fmtR(price);
  document.getElementById('c-down-v').value=fmtR(down);
  document.getElementById('c-months-v').value=months;
  updateCalcDisplay(price,down,months);
}
function updateCalcDisplay(price,down,months){
  const fin=price-down;
  const markup=fin*0.05*months;
  const total=price+markup;
  const monthly=Math.round((fin+markup)/months);
  document.getElementById('c-monthly').textContent=fmtR(monthly);
  document.getElementById('c-markup').textContent=fmtR(markup);
  document.getElementById('c-total').textContent=fmtR(total);
}
function editNum(which){
  const map={price:'c-price-v',down:'c-down-v',months:'c-months-v'};
  const el=document.getElementById(map[which]);
  el.value=el.value.replace(/\D/g,'');
  el.select();
}
function applyNum(which){
  const mapR={price:'c-price',down:'c-down',months:'c-months'};
  const mapV={price:'c-price-v',down:'c-down-v',months:'c-months-v'};
  const rangeEl=document.getElementById(mapR[which]);
  const valueEl=document.getElementById(mapV[which]);
  let val=parseInt(valueEl.value.replace(/\D/g,''))||0;
  if(which==='months'){val=Math.max(1,Math.min(24,val));}
  if(which==='price'){val=Math.max(1000,Math.min(1000000,val));}
  if(which==='down'){
    const p=+document.getElementById('c-price').value;
    val=Math.max(Math.round(p*0.2),Math.min(p,val));
  }
  rangeEl.value=val;
  syncFromRange(which==='down'?'price':which);
  if(which==='down')syncFromRange('price');
}
function renderCalc(){syncFromRange('price');}

/* ============ АНКЕТА ИЗ КАЛЬКУЛЯТОРА ============ */
function openClientFormFromCalc(){
  const price=+document.getElementById('c-price').value;
  const down=+document.getElementById('c-down').value;
  const months=+document.getElementById('c-months').value;
  openModal('Анкета клиента',
    '<div style="color:var(--muted);font-size:13px;margin-bottom:14px">'+
    'Цена: <b>'+fmtR(price)+'</b> · Взнос: <b>'+fmtR(down)+
    '</b> · Срок: <b>'+months+' мес.</b></div>'+
    '<div class="field"><label>ФИО *</label><input id="a-name"></div>'+
    '<div class="field"><label>Телефон *</label>'+
      '<input id="a-phone" type="tel"></div>'+
    '<div class="field"><label>Дата рождения</label>'+
      '<input id="a-birth" type="date"></div>'+
    '<div class="field"><label>Адрес</label><input id="a-address"></div>'+
    '<div class="field"><label>Паспорт</label>'+
      '<input id="a-passport"></div>'+
    '<div class="field"><label>Свидетель</label>'+
      '<input id="a-witness"></div>'+
    '<div class="field"><label>Товар *</label>'+
      '<input id="a-product"></div>'+
    '<button class="btn btn-dark btn-block" '+
    'onclick="saveContractFromForm()">Создать договор</button>');
  window._calcData={price,down,months};
}
function saveContractFromForm(){
  const name=document.getElementById('a-name').value.trim();
  const phone=document.getElementById('a-phone').value.trim();
  const product=document.getElementById('a-product').value.trim();
  if(!name){toast('Введите имя');return;}
  if(!product){toast('Введите товар');return;}
  const cid=uid();
  DB.clients.push({
    id:cid,name,phone,
    birth:document.getElementById('a-birth').value||'',
    address:document.getElementById('a-address').value.trim(),
    passport:document.getElementById('a-passport').value.trim(),
    witness:document.getElementById('a-witness').value.trim(),
    createdAt:new Date().toISOString()
  });
  const cd=window._calcData;
  const fin=cd.price-cd.down;
  const markup=Math.round(fin*0.05*cd.months);
  const total=cd.price+markup;
  const monthly=Math.round((fin+markup)/cd.months);
  const start=new Date();
  const schedule=[];
  for(let i=1;i<=cd.months;i++){
    const d=new Date(start.getFullYear(),start.getMonth()+i,start.getDate());
    schedule.push({n:i,date:d.toISOString().slice(0,10),
      amount:monthly,paid:false,paidDate:null});
  }
  const contractId=uid();
  DB.contracts.push({
    id:contractId,clientId:cid,product,
    price:cd.price,down:cd.down,months:cd.months,
    markup,total,monthly,
    startDate:start.toISOString().slice(0,10),
    schedule,status:'active',
    createdBy:ROLE,createdAt:new Date().toISOString()
  });
  saveDB();
  logAudit('Договор создан',name+' — '+product+' — '+fmtR(total));
  closeModal();refreshAll();toast('Договор создан');
  setTimeout(()=>openContract(contractId),300);
}

/* ============ НОВЫЙ ДОГОВОР ============ */
function openNewContract(){
  const clientOpts=DB.clients
    .map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
  if(!DB.clients.length){
    toast('Сначала добавьте клиента');
    nav('clients');
    return;
  }
  openModal('Новый договор',
    '<div class="field"><label>Клиент</label>'+
      '<select id="n-client">'+clientOpts+'</select></div>'+
    '<div class="field"><label>Товар</label>'+
      '<input id="n-product"></div>'+
    '<div class="field"><label>Категория</label>'+
      '<select id="n-category">'+
        DB.categories.map(c=>'<option>'+c+'</option>').join('')+
      '</select></div>'+
    '<div class="field"><label>Цена товара (₽)</label>'+
      '<input id="n-price" type="number" value="50000" '+
      'oninput="updateNewCalc()"></div>'+
    '<div class="field"><label>Первый взнос (мин. 20%)</label>'+
      '<input id="n-down" type="number" value="10000" '+
      'oninput="updateNewCalc()"></div>'+
    '<div class="field"><label>Срок (1-24 мес)</label>'+
      '<input id="n-months" type="number" value="6" min="1" max="24" '+
      'oninput="updateNewCalc()"></div>'+
    '<div class="field"><label>Дата первого платежа</label>'+
      '<input id="n-start" type="date" value="'+todayISO()+'"></div>'+
    '<div id="n-calc" style="background:var(--dark);color:#fff;'+
      'border-radius:20px;padding:18px;margin-bottom:14px"></div>'+
    '<button class="btn btn-dark btn-block" onclick="saveContract()">'+
    'Создать</button>');
  updateNewCalc();
}
function updateNewCalc(){
  const price=+document.getElementById('n-price').value||0;
  const down=+document.getElementById('n-down').value||0;
  const months=Math.max(1,Math.min(24,
    +document.getElementById('n-months').value||6));
  const fin=Math.max(0,price-down);
  const markup=Math.round(fin*0.05*months);
  const total=price+markup;
  const monthly=Math.round((fin+markup)/months);
  document.getElementById('n-calc').innerHTML=
    '<div style="font-size:13px;opacity:.8">Ежемесячный платёж</div>'+
    '<div style="font-size:24px;font-weight:800;color:var(--lime)">'+
      fmtR(monthly)+'</div>'+
    '<div style="display:flex;justify-content:space-between;'+
      'margin-top:10px;font-size:13px">'+
      '<span>Наценка</span><span>'+fmtR(markup)+'</span></div>'+
    '<div style="display:flex;justify-content:space-between;font-size:13px">'+
      '<span>Итого</span><span>'+fmtR(total)+'</span></div>';
}
function saveContract(){
  const clientId=document.getElementById('n-client').value;
  const product=document.getElementById('n-product').value.trim();
  const category=document.getElementById('n-category').value;
  const price=+document.getElementById('n-price').value||0;
  const down=+document.getElementById('n-down').value||0;
  const months=Math.max(1,Math.min(24,
    +document.getElementById('n-months').value||6));
  const startStr=document.getElementById('n-start').value||todayISO();
  if(!product){toast('Введите товар');return;}
  if(price<=0){toast('Введите цену');return;}
  if(down<price*0.2){toast('Минимум 20%');return;}
  const fin=price-down;
  const markup=Math.round(fin*0.05*months);
  const total=price+markup;
  const monthly=Math.round((fin+markup)/months);
  const start=parseD(startStr);
  const schedule=[];
  for(let i=1;i<=months;i++){
    const d=new Date(start.getFullYear(),start.getMonth()+i,start.getDate());
    schedule.push({n:i,date:d.toISOString().slice(0,10),
      amount:monthly,paid:false,paidDate:null});
  }
  const cid=uid();
  DB.contracts.push({
    id:cid,clientId,product,category,price,down,months,
    markup,total,monthly,startDate:startStr,schedule,
    status:'active',createdBy:ROLE,
    createdAt:new Date().toISOString()
  });
  saveDB();
  const cl=DB.clients.find(x=>x.id===clientId);
  logAudit('Договор создан',(cl?cl.name:'?')+' — '+product);
  closeModal();refreshAll();toast('Создан');
  setTimeout(()=>openContract(cid),300);
}

/* ============ КАРТОЧКА ДОГОВОРА ============ */
function openContract(id){
  const c=DB.contracts.find(x=>x.id===id);if(!c)return;
  const cl=DB.clients.find(x=>x.id===c.clientId)||{};
  const paidSum=(c.schedule||[])
    .reduce((s,p)=>s+(p.paid?p.amount:0),0);
  const pct=c.total?Math.round(paidSum/c.total*100):0;
  const now=new Date();
  const rows=(c.schedule||[]).map((p,i)=>{
    const isOverdue=!p.paid&&parseD(p.date)<now;
    const cls=p.paid?'paid':isOverdue?'overdue':'';
    const icon=p.paid?'✅':isOverdue?'⏰':'⏳';
    return '<div class="schedule-row '+cls+'">'+
      '<div class="info"><div class="date">'+fmtDate(p.date)+'</div>'+
      '<div class="amt">'+fmtR(p.amount)+'</div></div>'+
      '<div class="check" onclick="togglePaid(\''+c.id+'\','+i+')">'+
        icon+'</div></div>';
  }).join('');
  openModal('Договор',
    '<div style="margin-bottom:8px"><b>'+(cl.name||'—')+'</b></div>'+
    '<div style="color:var(--muted);margin-bottom:14px">'+
      c.product+'</div>'+
    '<div style="display:flex;justify-content:space-between;'+
      'margin-bottom:6px"><span>Цена:</span><b>'+fmtR(c.price)+'</b></div>'+
    '<div style="display:flex;justify-content:space-between;'+
      'margin-bottom:6px"><span>Наценка:</span><b>'+fmtR(c.markup)+
      '</b></div>'+
    '<div style="display:flex;justify-content:space-between;'+
      'margin-bottom:6px"><span>Итого:</span><b>'+fmtR(c.total)+'</b></div>'+
    '<div style="display:flex;justify-content:space-between;'+
      'margin-bottom:14px"><span>Платёж/мес:</span><b>'+
      fmtR(c.monthly)+'</b></div>'+
    '<div class="progress"><div style="width:'+pct+'%"></div></div>'+
    '<div style="text-align:center;font-size:13px;color:var(--muted);'+
      'margin-bottom:18px">'+
      'Выплачено '+pct+'% · остаток '+fmtR(c.total-paidSum)+'</div>'+
    '<div class="section-label" style="margin-top:0">График</div>'+
    '<div class="card" style="padding:8px 18px">'+rows+'</div>'+
    '<div class="btn-row" style="margin-top:14px">'+
      '<button class="btn btn-outline" style="flex:1" '+
        'onclick="printContract(\''+c.id+'\')">📄 Договор</button>'+
      '<button class="btn btn-outline" style="flex:1" '+
        'onclick="whatsappSchedule(\''+c.id+'\')">📲 График</button>'+
    '</div>'+
    (c.status==='active'?
      '<button class="btn btn-dark btn-block" style="margin-top:10px" '+
      'onclick="closeContract(\''+c.id+'\')">'+
      'Завершить и в архив</button>':'')+
    '<button class="btn btn-outline btn-block" '+
      'style="margin-top:10px;color:var(--danger)" '+
      'onclick="deleteContract(\''+c.id+'\')">Удалить</button>');
}
function togglePaid(cid,idx){
  const c=DB.contracts.find(x=>x.id===cid);
  const p=c.schedule[idx];
  p.paid=!p.paid;
  p.paidDate=p.paid?todayISO():null;
  saveDB();
  logAudit('Оплата',(p.paid?'✓ ':'✗ ')+fmtR(p.amount));
  closeModal();refreshAll();
  toast(p.paid?'Оплата ✓':'Снята');
  setTimeout(()=>openContract(cid),200);
}
function closeContract(cid){
  const c=DB.contracts.find(x=>x.id===cid);
  c.status='closed';saveDB();
  closeModal();refreshAll();toast('В архиве');
}
function deleteContract(cid){
  if(!confirm('Удалить?'))return;
  DB.contracts=DB.contracts.filter(x=>x.id!==cid);
  saveDB();closeModal();refreshAll();toast('Удалён');
}

/* ============ ПЕЧАТЬ ДОГОВОРА ============ */
function printContract(cid){
  const c=DB.contracts.find(x=>x.id===cid);
  const cl=DB.clients.find(x=>x.id===c.clientId)||{};
  const rows=(c.schedule||[]).map(p=>
    '<tr><td>'+fmtDate(p.date)+'</td>'+
    '<td style="text-align:right">'+fmtR(p.amount)+'</td></tr>').join('');
  const lastDate=(c.schedule||[]).slice(-1)[0]?.date||'';
  const today=new Date().toLocaleDateString('ru-RU');
  const seller=prompt('ФИО продавца:',
    'Магомедов Лабазан Алиевич')||'';
  const witness=prompt('ФИО свидетеля:',
    'Аджиев Динислам Султанович')||'';
  document.getElementById('printArea').innerHTML=
    '<h1>Договор от '+today+' г.</h1>'+
    '<h2>С именем Аллаха Милостивого и Милосердного.</h2><ul>'+
    '<li>Я, <b>'+seller+'</b>'+
      (witness?' (свидетель <b>'+witness+'</b>)':'')+
      ' отдаю в рассрочку <b>'+(cl.name||'—')+'</b>'+
      (cl.passport?', паспорт '+cl.passport:'')+
      ' <b>'+c.product+'</b> на сумму <b>'+fmt(c.total)+
      '</b> ('+toWords(c.total)+') рублей на срок <b>'+
      c.months+' месяцев</b>.</li>'+
    '<li>Сумма ежемесячного платежа — <b>'+fmt(c.monthly)+
      '</b> ('+toWords(c.monthly)+') рублей.</li>'+
    '<li>Окончательный день оплаты <b>'+fmtDate(lastDate)+
      '</b>.</li>'+
    '<li>В случае резкого удешевления рубля (девальвация) '+
      'вопрос рассматривается в Шариатском суде.</li>'+
    '<li>Настоящий Договор вступает в силу с момента подписания.</li>'+
    '<li>Покупателю запрещается использовать Товар для обналичивания.</li>'+
    '<li>При невозможности платежа — уведомить Продавца за 3 дня.</li>'+
    '<li>Договор заключён в соответствии с нормами Исламского '+
      'права (Шариата).</li>'+
    '<li>Как пришло в Хадисе: «У нечестного нет веры, '+
      'у не исполняющего обещаний нет религии».</li>'+
    '</ul><h3>График платежей</h3>'+
    '<table><tr><th>Дата</th><th>Сумма</th></tr>'+rows+'</table>'+
    '<div class="signatures"><div class="sign-row">'+
    '<div class="sign-col"><div>'+seller+'</div>'+
      '<div class="sign-line"></div>'+
      '<div class="sign-label">(подпись)</div></div>'+
    '<div class="sign-col"><div>'+(cl.name||'—')+'</div>'+
      '<div class="sign-line"></div>'+
      '<div class="sign-label">(подпись)</div></div>'+
    '</div><div class="sign-row">'+
    '<div class="sign-col"><div>'+(witness||'Свидетель')+'</div>'+
      '<div class="sign-line"></div>'+
      '<div class="sign-label">(подпись)</div></div>'+
    '<div class="sign-col"></div></div></div>';
  setTimeout(()=>window.print(),100);
}
function toWords(n){
  const ones=['','один','два','три','четыре','пять','шесть','семь',
    'восемь','девять','десять','одиннадцать','двенадцать','тринадцать',
    'четырнадцать','пятнадцать','шестнадцать','семнадцать',
    'восемнадцать','девятнадцать'];
  const tens=['','','двадцать','тридцать','сорок','пятьдесят',
    'шестьдесят','семьдесят','восемьдесят','девяносто'];
  const hunds=['','сто','двести','триста','четыреста','пятьсот',
    'шестьсот','семьсот','восемьсот','девятьсот'];
  const n2=Math.round(n);
  if(n2===0)return 'ноль';
  if(n2<20)return ones[n2];
  if(n2<100){
    const t=Math.floor(n2/10);const o=n2%10;
    return tens[t]+(o?' '+ones[o]:'');
  }
  if(n2<1000){
    const h=Math.floor(n2/100);const r=n2%100;
    return hunds[h]+(r?' '+toWords(r):'');
  }
  if(n2<1000000){
    const t=Math.floor(n2/1000);const r=n2%1000;
    return toWords(t)+' тысяч'+(r?' '+toWords(r):'');
  }
  const m=Math.floor(n2/1000000);const r=n2%1000000;
  return toWords(m)+' миллион'+(r?' '+toWords(r):'');
}

/* ============ WHATSAPP ============ */
function whatsappSchedule(cid){
  const c=DB.contracts.find(x=>x.id===cid);
  const cl=DB.clients.find(x=>x.id===c.clientId)||{};
  const phone=(cl.phone||'').replace(/\D/g,'');
  const rows=(c.schedule||[]).map(p=>
    '• '+fmtDate(p.date)+' — '+fmtR(p.amount)+
    (p.paid?' ✅':'')).join('\n');
  const text='Ассаляму алейкум, '+(cl.name||'')+'!\n\n'+
    'Ваш договор на «'+c.product+'»\n'+
    'Сумма: '+fmtR(c.total)+'\n'+
    'Платёж: '+fmtR(c.monthly)+' × '+c.months+' мес.\n\n'+
    'График платежей:\n'+rows+'\n\n'+
    'Баракаллаху фикум!';
  const url=phone?
    'https://wa.me/'+phone+'?text='+encodeURIComponent(text):
    'https://wa.me/?text='+encodeURIComponent(text);
  window.open(url,'_blank');
}

/* ============ ПРОСРОЧКИ ============ */
function openOverdue(){
  const now=new Date();
  const buckets={'1-30':0,'31-60':0,'60+':0};
  const list=[];
  DB.contracts.forEach(c=>(c.schedule||[]).forEach(p=>{
    if(!p.paid&&p.date&&parseD(p.date)<now){
      const days=Math.floor((now-parseD(p.date))/86400000);
      const b=days<=30?'1-30':days<=60?'31-60':'60+';
      buckets[b]+=p.amount;
      list.push({c,p,days});
    }
  }));
  const rows=list.map(x=>{
    const cl=DB.clients.find(z=>z.id===x.c.clientId);
    return '<div class="schedule-row overdue">'+
      '<div class="info"><div class="date">'+(cl?cl.name:'—')+
      ' · '+x.days+' дн.</div>'+
      '<div class="amt">'+x.c.product+' · '+fmtR(x.p.amount)+
      '</div></div></div>';
  }).join('')||'<div class="empty-desc">Просрочек нет</div>';
  openModal('Возраст просрочки',
    '<div class="card"><div class="card-label">1-30 дней</div>'+
      '<div class="big-number" style="color:var(--danger)">'+
      fmtR(buckets['1-30'])+'</div></div>'+
    '<div class="card"><div class="card-label">31-60 дней</div>'+
      '<div class="big-number" style="color:var(--danger)">'+
      fmtR(buckets['31-60'])+'</div></div>'+
    '<div class="card"><div class="card-label">60+ дней</div>'+
      '<div class="big-number" style="color:var(--danger)">'+
      fmtR(buckets['60+'])+'</div></div>'+
    '<div class="section-label">Список</div>'+
    '<div class="card" style="padding:8px 18px">'+rows+'</div>');
}

/* ============ ЖУРНАЛ ============ */
function openAudit(){
  const rows=DB.audit.slice(0,50).map(a=>
    '<div style="padding:10px 0;border-bottom:1px solid var(--line);'+
    'font-size:13px">'+
    '<div style="font-weight:600">'+a.action+'</div>'+
    '<div style="color:var(--muted)">'+(a.details||'')+' · '+
    new Date(a.date).toLocaleString('ru-RU')+'</div></div>'
  ).join('')||'<div class="empty-desc">Журнал пуст</div>';
  openModal('Журнал действий','<div>'+rows+'</div>');
}

/* ============ ТОВАРЫ И МАРЖА ============ */
function openGoods(){
  const totalMarkup=DB.contracts.reduce((s,c)=>s+(c.markup||0),0);
  const cnt=DB.contracts.length;
  const avg=cnt?Math.round(totalMarkup/cnt):0;
  const cats=[...new Set(DB.contracts.map(c=>c.category).filter(Boolean))];
  const catsHtml=cats.map(cat=>{
    const sum=DB.contracts.filter(c=>c.category===cat)
      .reduce((s,c)=>s+(c.markup||0),0);
    return '<div class="list-item"><div class="main">'+
      '<div class="title">'+cat+'</div>'+
      '<div class="sub">Наценка: '+fmtR(sum)+'</div></div></div>';
  }).join('');
  openModal('Товары и маржа',
    '<div class="card"><div class="card-label">'+
      'Наценка по всем товарам</div>'+
      '<div class="big-number">'+fmtR(totalMarkup)+'</div>'+
      '<div class="card-hint">Заработанной станет, когда договоры '+
      'закроются</div></div>'+
    '<div class="card"><div class="card-label">Средняя маржа</div>'+
      '<div class="big-number">'+(cnt?fmtR(avg):'—')+'</div></div>'+
    '<div class="section-label">Категории</div>'+
    (catsHtml||'<div class="empty-desc">Категорий пока нет</div>')+
    '<div class="section-label">Новая категория</div>'+
    '<input id="newCat" placeholder="Например: ковры">'+
    '<button class="btn btn-dark btn-block" '+
    'onclick="addCategory()">Добавить</button>');
}
function addCategory(){
  const v=document.getElementById('newCat').value.trim();
  if(!v){toast('Введите название');return;}
  if(!DB.categories.includes(v))DB.categories.push(v);
  saveDB();toast('Добавлено');openGoods();
}

/* ============ ЗАЙМОДАТЕЛИ ============ */
function openPartners(){
  const rows=DB.partners.map(p=>{
    const inWork=DB.contracts
      .filter(c=>c.partnerId===p.id&&c.status==='active')
      .reduce((s,c)=>s+(c.price||0),0);
    return '<div class="card"><div class="card-label">'+p.name+
      '</div>'+
      '<div style="margin-top:8px">Вложено: <b>'+
      fmtR(p.deposit||0)+'</b></div>'+
      '<div>В работе: <b>'+fmtR(inWork)+'</b></div>'+
      '<div style="margin-top:8px"><button '+
      'class="btn btn-outline btn-sm" '+
      'onclick="deletePartner(\''+p.id+'\')">Удалить</button></div></div>';
  }).join('')||'<div class="empty-desc">Займодателей пока нет</div>';
  openModal('Займодатели',
    '<div class="empty-desc">Чьи деньги в каких сделках.</div>'+rows+
    '<div class="section-label">Новый займодатель</div>'+
    '<input id="pName" placeholder="Фамилия, имя и отчество">'+
    '<input id="pDeposit" type="number" placeholder="Сумма вклада (₽)">'+
    '<button class="btn btn-dark btn-block" '+
    'onclick="addPartner()">Добавить</button>');
}
function addPartner(){
  const name=document.getElementById('pName').value.trim();
  const dep=+document.getElementById('pDeposit').value||0;
  if(!name){toast('Введите имя');return;}
  DB.partners.push({id:uid(),name,deposit:dep});
  saveDB();toast('Добавлено');openPartners();
}
function deletePartner(id){
  if(!confirm('Удалить?'))return;
  DB.partners=DB.partners.filter(p=>p.id!==id);
  saveDB();openPartners();
}

/* ============ ССЫЛКА КЛИЕНТУ ============ */
function sendClientLink(){
  const url=location.origin+location.pathname+'?calc=1';
  const text='Ассаляму алейкум!\n\n'+
    'Рассчитайте рассрочку по ссылке:\n'+url+
    '\n\nС уважением, СУММА';
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
}

/* ============ КАЛЕНДАРЬ ============ */
function calShift(d){CAL_DATE.setMonth(CAL_DATE.getMonth()+d);renderCalendar();}
function renderCalendar(){
  const y=CAL_DATE.getFullYear(),m=CAL_DATE.getMonth();
  const title=CAL_DATE.toLocaleDateString('ru-RU',
    {month:'long',year:'numeric'});
  const ct=document.getElementById('calTitle');
  if(!ct)return;
  ct.textContent=title;
  const first=new Date(y,m,1);
  let startDow=first.getDay();if(startDow===0)startDow=7;
  startDow--;
  const daysInMonth=new Date(y,m+1,0).getDate();
  const byDay={};let sum=0;
  DB.contracts.forEach(c=>(c.schedule||[]).forEach(p=>{
    if(p.date&&p.date.startsWith(y+'-'+String(m+1).padStart(2,'0'))){
      if(!byDay[p.date])byDay[p.date]=[];
      byDay[p.date].push({p,c});
      if(!p.paid)sum+=p.amount;
    }
  }));
  document.getElementById('calSum').textContent=fmtR(sum);
  const heads=['пн','вт','ср','чт','пт','сб','вс']
    .map(h=>'<div class="cal-head">'+h+'</div>').join('');
  let cells='';
  for(let i=0;i<startDow;i++)cells+='<div class="cal-day empty"></div>';
  const todayStr=todayISO();
  for(let d=1;d<=daysInMonth;d++){
    const ds=y+'-'+String(m+1).padStart(2,'0')+'-'+
      String(d).padStart(2,'0');
    const items=byDay[ds]||[];
    const hasUnpaid=items.some(x=>!x.p.paid);
    const allPaid=items.length>0&&items.every(x=>x.p.paid);
    const isOverdue=hasUnpaid&&parseD(ds)<new Date();
    let cls='cal-day';
    if(isOverdue)cls+=' overdue';
    else if(hasUnpaid)cls+=' has-unpaid';
    else if(allPaid)cls+=' paid';
    if(ds===todayStr)cls+=' today';
    cells+='<div class="'+cls+'" onclick="showDay(\''+ds+'\')">'+
      d+'</div>';
  }
  document.getElementById('calGrid').innerHTML=
    '<div class="cal-grid">'+heads+cells+'</div>';
  document.getElementById('calDetails').innerHTML='';
}
function showDay(ds){
  const items=[];
  DB.contracts.forEach(c=>(c.schedule||[]).forEach(p=>{
    if(p.date===ds)items.push({p,c});
  }));
  if(!items.length){toast('Нет платежей');return;}
  const html=items.map(x=>{
    const cl=DB.clients.find(z=>z.id===x.c.clientId)||{};
    const isOverdue=!x.p.paid&&parseD(x.p.date)<new Date();
    const phone=(cl.phone||'').replace(/\D/g,'');
    const text='Ассаляму алейкум, '+(cl.name||'')+
      '! Напоминаем о платеже '+fmtR(x.p.amount)+
      ' по договору «'+x.c.product+'» на '+fmtDate(x.p.date)+'.';
    const waUrl=phone?
      'https://wa.me/'+phone+'?text='+encodeURIComponent(text):
      'https://wa.me/?text='+encodeURIComponent(text);
    return '<div class="schedule-row '+
      (x.p.paid?'paid':isOverdue?'overdue':'')+'">'+
      '<div class="info"><div class="date">'+(cl.name||'—')+'</div>'+
      '<div class="amt">'+x.c.product+' · '+fmtR(x.p.amount)+
      '</div></div>'+
      '<button class="btn btn-outline btn-sm" onclick="window.open(\''+
      waUrl+'\',\'_blank\')">📲</button></div>';
  }).join('');
  document.getElementById('calDetails').innerHTML=
    '<div class="section-label">'+fmtDate(ds)+'</div>'+
    '<div class="card" style="padding:8px 18px">'+html+'</div>';
}

/* ============ ЭКСПОРТ / ИМПОРТ ============ */
function exportData(){
  const blob=new Blob([JSON.stringify(DB,null,2)],
    {type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='summa-'+todayISO()+'.json';
  a.click();URL.revokeObjectURL(url);
  toast('Скачано');
}
function importData(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='.json';
  inp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const imp=JSON.parse(ev.target.result);
        if(imp.clients&&imp.contracts){
          const ids=new Set(DB.clients.map(c=>c.id));
          imp.clients.forEach(c=>{
            if(!ids.has(c.id))DB.clients.push(c);
          });
          const cids=new Set(DB.contracts.map(c=>c.id));
          imp.contracts.forEach(c=>{
            if(!cids.has(c.id))DB.contracts.push(c);
          });
          saveDB();refreshAll();toast('Импорт ✓');
        }else toast('Неверный формат');
      }catch(err){toast('Ошибка');}
    };
    r.readAsText(f);
  };
  inp.click();
}

/* ============ СТАРТ ============ */
DB=loadDB();
document.getElementById('pinInput').addEventListener('keypress',e=>{
  if(e.key==='Enter')tryLogin();
});
