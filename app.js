
(() => {
  const cfg = window.APP_CONFIG || {};
  const app = document.getElementById('app');
  const TOKEN_KEY = 'listaCasaDeviceToken';
  let sb = null;
  let state = { session:null, users:[], items:[], products:[], history:[], tab:'lista', buyMode:false, timer:null };

  const configured = () => cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('COLE_AQUI') && !cfg.SUPABASE_ANON_KEY.includes('COLE_AQUI');

  const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
  const qs = (sel, root=document) => root.querySelector(sel);
  const initials = n => (n||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();

  async function rpc(name, args={}) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function boot(){
    if(!configured()) return renderNotConfigured();
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth:{persistSession:false, autoRefreshToken:false}
    });
    const token = localStorage.getItem(TOKEN_KEY);
    if(token){
      try{
        const s = await rpc('session_info',{p_token:token});
        if(s && s.length){ state.session=s[0]; await refreshAll(); startSync(); return render(); }
      }catch(e){ console.warn(e); }
      localStorage.removeItem(TOKEN_KEY);
    }
    renderLogin();
  }

  function renderNotConfigured(){
    app.innerHTML = `<div class="center-card"><div class="auth-card">
      <div class="logo">⌂</div><h1>Lista da Casa</h1>
      <p class="sub">O aplicativo está pronto, mas falta conectar o banco de dados.</p>
      <div class="notice"><b>Próximo passo:</b> abra o arquivo <code>config.js</code> e informe a Project URL e a chave anon/publishable do Supabase.</div>
      <p style="color:var(--muted);font-size:14px">Consulte o arquivo <b>GUIA-DE-INSTALACAO.md</b> incluído no pacote.</p>
    </div></div>`;
  }

  function renderLogin(){
    app.innerHTML = `<div class="center-card"><div class="auth-card">
      <div class="logo">⌂</div><h1>Lista da Casa</h1><p class="sub">Sua lista de compras compartilhada</p>
      <form id="accessForm">
        <div class="field"><label>Código da casa</label><input id="houseCode" autocomplete="off" value="${esc(cfg.HOUSE_CODE_SUGGESTION||'')}" required></div>
        <div class="field"><label>PIN</label><input id="pin" inputmode="numeric" type="password" maxlength="8" required></div>
        <button class="btn btn-primary">Continuar</button><div id="msg"></div>
      </form>
    </div></div>`;
    qs('#accessForm').onsubmit = async e => {
      e.preventDefault(); setMsg('');
      try{
        const code=qs('#houseCode').value.trim(), pin=qs('#pin').value.trim();
        const users = await rpc('house_users',{p_house_code:code,p_pin:pin});
        if(!users?.length) throw new Error('Código ou PIN inválido.');
        state._login={code,pin}; state.users=users; renderUserChoice();
      }catch(err){ setMsg(err.message || 'Não foi possível entrar.','error'); }
    };
  }

  function renderUserChoice(){
    app.innerHTML = `<div class="center-card"><div class="auth-card">
      <div class="logo">⌂</div><h1>Quem está usando?</h1><p class="sub">Este aparelho ficará identificado.</p>
      <div id="userButtons"></div><button class="btn btn-ghost" style="width:100%;margin-top:10px" id="back">Voltar</button><div id="msg"></div>
    </div></div>`;
    const wrap=qs('#userButtons');
    state.users.forEach(u=>{
      const b=document.createElement('button'); b.className='btn btn-secondary'; b.style='width:100%;margin:6px 0';
      b.textContent=u.name; b.onclick=()=>loginAs(u.id); wrap.appendChild(b);
    });
    qs('#back').onclick=renderLogin;
  }

  async function loginAs(userId){
    try{
      const rows = await rpc('login_house',{p_house_code:state._login.code,p_pin:state._login.pin,p_user_id:userId});
      if(!rows?.length) throw new Error('Falha ao autorizar o aparelho.');
      localStorage.setItem(TOKEN_KEY, rows[0].device_token);
      state.session=rows[0]; state._login=null;
      await refreshAll(); startSync(); render();
    }catch(err){ setMsg(err.message||'Erro ao entrar.','error'); }
  }

  function setMsg(txt,type=''){
    const el=qs('#msg'); if(el) el.innerHTML=txt?`<div class="msg ${type}">${esc(txt)}</div>`:'';
  }

  async function refreshAll(){
    if(!state.session) return;
    const t=localStorage.getItem(TOKEN_KEY);
    const [items,products] = await Promise.all([
      rpc('list_items',{p_token:t}),
      rpc('list_products',{p_token:t})
    ]);
    state.items=items||[]; state.products=products||[];
    if(state.tab==='mais') state.history=(await rpc('list_history',{p_token:t,p_limit:50}))||[];
  }

  function startSync(){
    clearInterval(state.timer);
    state.timer=setInterval(async()=>{
      if(document.hidden || !state.session) return;
      try{ await refreshAll(); renderContentOnly(); }catch(e){ console.warn('sync',e); }
    }, cfg.SYNC_INTERVAL_MS || 5000);
  }

  function layout(content){
    const s=state.session;
    return `<div class="app-shell ${state.buyMode?'mode-buy':''}">
      <header class="topbar"><div class="topline">
        <div class="title-wrap"><h1>${state.buyMode?'Modo Compra':'Lista da Casa'}</h1><small><span class="status-dot"></span>${esc(s.house_code)} · ${esc(s.user_name)}</small></div>
        <div class="avatar">${esc(initials(s.user_name))}</div>
      </div></header>
      <main id="mainContent">${content}</main>
      ${state.tab==='lista' && !state.buyMode?'<button class="fab" id="fab">+</button>':''}
      <nav class="bottom-nav">
        ${nav('lista','🛒','Lista')}${nav('revisar','🏠','Revisar')}${nav('produtos','📦','Produtos')}${nav('mais','⚙️','Mais')}
      </nav>
    </div>`;
  }
  const nav=(id,ico,label)=>`<button class="nav-btn ${state.tab===id?'active':''}" data-tab="${id}"><span>${ico}</span>${label}</button>`;

  function render(){
    app.innerHTML=layout(contentForTab());
    bindCommon();
  }
  function renderContentOnly(){
    const main=qs('#mainContent');
    if(main){ main.innerHTML=contentForTab(); bindTab(); }
  }
  function bindCommon(){
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
      state.tab=b.dataset.tab; state.buyMode=false; render();
      if(state.tab==='mais') refreshAll().then(renderContentOnly).catch(console.warn);
    });
    if(qs('#fab')) qs('#fab').onclick=()=>openAddItem();
    bindTab();
  }

  function contentForTab(){
    if(state.tab==='lista') return listView();
    if(state.tab==='revisar') return reviewView();
    if(state.tab==='produtos') return productsView();
    return moreView();
  }

  function listView(){
    const open=state.items.filter(i=>!i.bought_at), done=state.items.filter(i=>i.bought_at).slice(0,8);
    const fav=state.products.filter(p=>p.favorite).slice(0,8);
    const urgent=open.filter(i=>i.priority==='acabou');
    const low=open.filter(i=>i.priority!=='acabou');
    return `
      ${state.buyMode?`<div class="row" style="margin-bottom:12px"><button class="btn btn-ghost" id="exitBuy">← Sair do modo compra</button><span class="pill">${open.length} itens</span></div>`:
      `<div class="summary"><div class="pill"><b>${open.length}</b> para comprar</div><button class="btn btn-secondary" id="buyMode">🛒 Iniciar compra</button></div>
       ${fav.length?`<section class="quick"><div class="quick-head"><b>Adicionar rápido</b><small>Favoritos</small></div><div class="chips">${fav.map(p=>`<button class="chip" data-quick="${p.id}">＋ ${esc(p.name)}</button>`).join('')}</div></section>`:''}`}
      ${sectionItems('🔴 Acabou',urgent,'red')}
      ${sectionItems('🟡 Está acabando',low,'yellow')}
      ${done.length && !state.buyMode?`<div class="section-title">Comprados recentemente</div>${done.map(itemHtml).join('')}`:''}
      ${!open.length?'<div class="empty">🎉 Nenhum item pendente.</div>':''}`;
  }
  function sectionItems(title,arr,badge){
    if(!arr.length)return '';
    return `<div class="section-title">${title}</div>${arr.map(i=>itemHtml(i,badge)).join('')}`;
  }
  function itemHtml(i,badge=''){
    const done=!!i.bought_at;
    return `<div class="item">
      <button class="check ${done?'done':''}" data-toggle="${i.id}">${done?'✓':''}</button>
      <div class="item-main"><div class="item-name">${esc(i.product_name||i.custom_name)} ${i.quantity?`· ${esc(i.quantity)}`:''}</div>
      <div class="item-meta">${i.unit?esc(i.unit):''}${i.note?` · ${esc(i.note)}`:''}${i.added_by_name?` · por ${esc(i.added_by_name)}`:''}</div></div>
      ${!state.buyMode?`<div class="item-actions"><button class="icon-btn" data-del="${i.id}" title="Excluir">⋯</button></div>`:''}
    </div>`;
  }

  function reviewView(){
    const groups={};
    state.products.forEach(p=>{ const c=p.category||'Outros'; (groups[c] ||= []).push(p); });
    const cats=Object.keys(groups).sort();
    return `<div class="notice">Faça uma revisão rápida da casa. Toque em <b>Adicionar</b> quando algo estiver acabando ou tiver acabado.</div>
      ${cats.length?cats.map(c=>`<div class="card"><div class="cat-head">${esc(c)}</div>${groups[c].map(p=>`
        <div class="product-row"><div class="name"><b>${esc(p.name)}</b><div class="item-meta">${esc(p.default_unit||'')}</div></div>
        <button class="btn btn-secondary" data-review-add="${p.id}">＋ Adicionar</button></div>`).join('')}</div>`).join(''):
      '<div class="empty">Cadastre produtos para montar a revisão da casa.</div>'}`;
  }

  function productsView(){
    const groups={};
    state.products.forEach(p=>{ const c=p.category||'Outros'; (groups[c] ||= []).push(p); });
    return `<div class="row" style="margin-bottom:14px"><div><b>${state.products.length} produtos</b><div class="item-meta">Catálogo permanente da casa</div></div><button class="btn btn-primary" style="width:auto" id="newProduct">＋ Produto</button></div>
      ${Object.keys(groups).sort().map(c=>`<div class="card"><div class="cat-head">${esc(c)}</div>${groups[c].map(p=>`
      <div class="product-row"><button class="star" data-star="${p.id}">${p.favorite?'★':'☆'}</button><div class="name"><b>${esc(p.name)}</b><div class="item-meta">${esc(p.brand||'')}${p.default_unit?` · ${esc(p.default_unit)}`:''}</div></div><button class="btn btn-secondary" data-add-prod="${p.id}">Adicionar</button></div>`).join('')}</div>`).join('')}`;
  }

  function moreView(){
    return `<div class="card"><h3>Casa</h3>
      <div class="row"><span>Código</span><b>${esc(state.session.house_code)}</b></div>
      <div class="row"><span>Usuário</span><b>${esc(state.session.user_name)}</b></div>
      <div class="row"><span>Perfil</span><b>${esc(state.session.role==='admin'?'Administrador':'Usuário')}</b></div>
    </div>
    <div class="card"><h3>Histórico recente</h3>
      ${state.history.length?state.history.slice(0,20).map(h=>`<div class="row"><div><b>${esc(h.product_name||h.custom_name)}</b><div class="item-meta">${new Date(h.bought_at).toLocaleString('pt-BR')}</div></div><span>✓</span></div>`).join(''):'<div class="item-meta">Ainda não há compras concluídas.</div>'}
    </div>
    <button class="btn btn-danger" style="width:100%" id="logout">Trocar usuário / sair deste aparelho</button>`;
  }

  function bindTab(){
    if(qs('#buyMode')) qs('#buyMode').onclick=()=>{state.buyMode=true;render()};
    if(qs('#exitBuy')) qs('#exitBuy').onclick=()=>{state.buyMode=false;render()};
    document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>toggleItem(b.dataset.toggle));
    document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteItem(b.dataset.del));
    document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>quickAdd(b.dataset.quick));
    document.querySelectorAll('[data-review-add]').forEach(b=>b.onclick=()=>openAddProductToList(b.dataset.reviewAdd));
    document.querySelectorAll('[data-add-prod]').forEach(b=>b.onclick=()=>openAddProductToList(b.dataset.addProd));
    document.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>toggleStar(b.dataset.star));
    if(qs('#newProduct')) qs('#newProduct').onclick=openNewProduct;
    if(qs('#logout')) qs('#logout').onclick=logout;
  }

  async function toggleItem(id){
    try{ await rpc('toggle_item_bought',{p_token:localStorage.getItem(TOKEN_KEY),p_item_id:id}); await refreshAll(); renderContentOnly(); }
    catch(e){ alert(e.message); }
  }
  async function deleteItem(id){
    if(!confirm('Excluir este item da lista?'))return;
    try{ await rpc('delete_item',{p_token:localStorage.getItem(TOKEN_KEY),p_item_id:id}); await refreshAll(); renderContentOnly(); }
    catch(e){ alert(e.message); }
  }
  async function quickAdd(pid){
    try{ await rpc('add_item',{p_token:localStorage.getItem(TOKEN_KEY),p_product_id:pid,p_custom_name:null,p_quantity:'1',p_unit:null,p_priority:'acabando',p_note:null}); await refreshAll(); renderContentOnly(); }
    catch(e){ alert(e.message); }
  }
  async function toggleStar(pid){
    try{ await rpc('toggle_product_favorite',{p_token:localStorage.getItem(TOKEN_KEY),p_product_id:pid}); await refreshAll(); renderContentOnly(); }
    catch(e){ alert(e.message); }
  }

  function modal(html){
    const d=document.createElement('div'); d.className='modal-backdrop'; d.innerHTML=`<div class="modal"><div class="modal-handle"></div>${html}</div>`;
    d.onclick=e=>{if(e.target===d)d.remove()}; document.body.appendChild(d); return d;
  }
  function openAddItem(){
    const m=modal(`<h2>Adicionar item</h2>
      <div class="field"><label>Produto já cadastrado</label><select id="mProduct"><option value="">— Novo / digitar —</option>${state.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Nome (se for novo)</label><input id="mName" placeholder="Ex.: Carvão"></div>
      <div class="inline"><div class="field"><label>Quantidade</label><input id="mQty" value="1"></div><div class="field"><label>Unidade</label><input id="mUnit" placeholder="un., kg, pacote"></div></div>
      <div class="field"><label>Situação</label><select id="mPriority"><option value="acabando">🟡 Está acabando</option><option value="acabou">🔴 Acabou</option></select></div>
      <div class="field"><label>Observação</label><input id="mNote" placeholder="Opcional"></div>
      <button class="btn btn-primary" id="mSave">Adicionar à lista</button>`);
    qs('#mSave',m).onclick=async()=>{
      const pid=qs('#mProduct',m).value||null, name=qs('#mName',m).value.trim()||null;
      if(!pid&&!name)return alert('Escolha ou informe um produto.');
      try{
        await rpc('add_item',{p_token:localStorage.getItem(TOKEN_KEY),p_product_id:pid,p_custom_name:name,p_quantity:qs('#mQty',m).value.trim()||'1',p_unit:qs('#mUnit',m).value.trim()||null,p_priority:qs('#mPriority',m).value,p_note:qs('#mNote',m).value.trim()||null});
        m.remove(); await refreshAll(); renderContentOnly();
      }catch(e){alert(e.message)}
    };
  }
  function openAddProductToList(pid){
    const p=state.products.find(x=>x.id===pid);
    const m=modal(`<h2>${esc(p?.name||'Adicionar')}</h2>
      <div class="inline"><div class="field"><label>Quantidade</label><input id="mQty" value="1"></div><div class="field"><label>Unidade</label><input id="mUnit" value="${esc(p?.default_unit||'')}"></div></div>
      <div class="field"><label>Situação</label><select id="mPriority"><option value="acabando">🟡 Está acabando</option><option value="acabou">🔴 Acabou</option></select></div>
      <div class="field"><label>Observação</label><input id="mNote" placeholder="Opcional"></div>
      <button class="btn btn-primary" id="mSave">Adicionar à lista</button>`);
    qs('#mSave',m).onclick=async()=>{
      try{ await rpc('add_item',{p_token:localStorage.getItem(TOKEN_KEY),p_product_id:pid,p_custom_name:null,p_quantity:qs('#mQty',m).value.trim()||'1',p_unit:qs('#mUnit',m).value.trim()||null,p_priority:qs('#mPriority',m).value,p_note:qs('#mNote',m).value.trim()||null}); m.remove(); await refreshAll(); renderContentOnly(); }
      catch(e){alert(e.message)}
    };
  }
  function openNewProduct(){
    const m=modal(`<h2>Novo produto</h2>
      <div class="field"><label>Nome</label><input id="pName" placeholder="Ex.: Café"></div>
      <div class="field"><label>Categoria</label><input id="pCat" placeholder="Ex.: Despensa"></div>
      <div class="inline"><div class="field"><label>Marca (opcional)</label><input id="pBrand"></div><div class="field"><label>Unidade padrão</label><input id="pUnit" placeholder="500 g"></div></div>
      <div class="field"><label>Local de compra (opcional)</label><input id="pPlace" placeholder="Supermercado, açougue..."></div>
      <label style="display:flex;gap:8px;align-items:center;margin:14px 0"><input type="checkbox" id="pFav"> Favorito / adicionar rápido</label>
      <button class="btn btn-primary" id="pSave">Salvar produto</button>`);
    qs('#pSave',m).onclick=async()=>{
      const name=qs('#pName',m).value.trim(); if(!name)return alert('Informe o nome.');
      try{ await rpc('create_product',{p_token:localStorage.getItem(TOKEN_KEY),p_name:name,p_category:qs('#pCat',m).value.trim()||'Outros',p_brand:qs('#pBrand',m).value.trim()||null,p_default_unit:qs('#pUnit',m).value.trim()||null,p_purchase_place:qs('#pPlace',m).value.trim()||null,p_favorite:qs('#pFav',m).checked}); m.remove(); await refreshAll(); renderContentOnly(); }
      catch(e){alert(e.message)}
    };
  }
  function logout(){
    localStorage.removeItem(TOKEN_KEY); state.session=null; clearInterval(state.timer); renderLogin();
  }

  window.addEventListener('online',()=>refreshAll().then(renderContentOnly).catch(()=>{}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.session)refreshAll().then(renderContentOnly).catch(()=>{})});
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
  boot();
})();
