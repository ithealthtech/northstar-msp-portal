const form=document.getElementById('adminForm'), statusText=document.getElementById('statusText'), savebar=document.querySelector('.savebar'), userManagement=document.getElementById('userManagement'), userStatus=document.getElementById('userStatus'), passwordModal=document.getElementById('passwordModal'), passwordForm=document.getElementById('passwordForm'), resetPassword=document.getElementById('resetPassword'), passwordResult=document.getElementById('passwordResult'), passwordUser=document.getElementById('passwordUser'), createUserModal=document.getElementById('createUserModal'), createUserForm=document.getElementById('createUserForm'), createPassword=document.getElementById('createPassword'), createUserResult=document.getElementById('createUserResult');
const editablePanes=new Set(['app','database','api','security','deployment']);
let state={me:null,users:[],resetUserId:null};
async function api(path,options={}){
  const res=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error?.message||'Request failed');
  return data;
}
function setStatus(text,{persistent=false}={}){statusText.textContent=text;if(userStatus)userStatus.textContent=text;if(!persistent)setTimeout(()=>{if(statusText.textContent===text)statusText.textContent='';if(userStatus&&userStatus.textContent===text)userStatus.textContent=''},5000)}
function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function tempPassword(){return Array.from(crypto.getRandomValues(new Uint32Array(3))).map(n=>n.toString(36)).join('-')}
async function runBusy(button,work,label='Working...'){if(button?.disabled)return;const oldText=button?.textContent;if(button){button.disabled=true;button.textContent=label}try{return await work()}finally{if(button){button.disabled=false;button.textContent=oldText}}}
async function copyText(value){if(navigator.clipboard){await navigator.clipboard.writeText(value);return}const el=document.createElement('textarea');el.value=value;el.style.position='fixed';el.style.opacity='0';document.body.append(el);el.select();document.execCommand('copy');el.remove()}
function fillForm(install){
  const opts=install.options||{};
  const values={companyName:opts.companyName||'Example MSP',adminEmail:opts.adminEmail||'',domain:opts.domain||install.publicUrl||'',assetBaseUrl:opts.assetBaseUrl||'',mediaBaseUrl:opts.mediaBaseUrl||'',databaseProvider:install.databaseProvider||'sqlite',databaseHost:opts.databaseHost||'',databaseName:opts.databaseName||'',databaseUser:opts.databaseUser||'',apiBaseUrl:opts.apiBaseUrl||'',apiKeyLabel:opts.apiKeyLabel||'',smtpHost:opts.smtpHost||'',smtpFrom:opts.smtpFrom||'',sessionHours:opts.sessionHours||'12',deploymentTarget:install.deploymentTarget||'node',backupPath:opts.backupPath||''};
  for(const [key,value] of Object.entries(values))if(form.elements[key])form.elements[key].value=value;
  form.elements.requireMfa.checked=Boolean(opts.requireMfa);
  form.elements.allowSelfProfile.checked=opts.allowSelfProfile!==''&&opts.allowSelfProfile!==false;
}
function updateStats(stats){
  document.getElementById('statUsers').textContent=stats.users||0;
  document.getElementById('statActive').textContent=stats.activeUsers||0;
  document.getElementById('statTemplates').textContent=stats.templates||0;
  document.getElementById('statSessions').textContent=stats.sessions||0;
}
function updateReadiness(readiness){
  const list=document.getElementById('readinessList');if(!list)return;
  const checks=readiness?.checks||[];
  list.innerHTML=checks.length?checks.map(check=>`<div class="readiness-item ${check.ok?'ok':'fail'}"><strong>${esc(check.label)}</strong><span>${check.ok?'Ready':'Needs attention'}</span></div>`).join(''):'<div class="empty-users">No readiness checks available.</div>';
}
function showPane(id){
  const pane=document.querySelector(`[data-admin-pane="${id}"]`)?id:'overview';
  document.querySelectorAll('[data-admin-pane]').forEach(el=>el.classList.toggle('active',el.dataset.adminPane===pane));
  document.querySelectorAll('[data-admin-tab]').forEach(el=>el.classList.toggle('active',el.dataset.adminTab===pane));
  savebar.hidden=!editablePanes.has(pane);
  if(location.hash!==`#${pane}`)history.replaceState(null,'',`#${pane}`);
}
function renderUsers(){
  if(!userManagement)return;
  userManagement.innerHTML=state.users.length?state.users.map(user=>`<article class="user-row" data-user-id="${esc(user.id)}">
    <div class="user-id"><strong>${esc(user.displayName)}</strong><small>${esc(user.email)}${user.id===state.me?.id?' - signed in':''}</small></div>
    <label>Role<select data-role><option value="admin" ${user.role==='admin'?'selected':''}>Admin</option><option value="editor" ${user.role==='editor'?'selected':''}>Editor</option><option value="viewer" ${user.role==='viewer'?'selected':''}>Viewer</option></select></label>
    <label>Status<select data-status><option value="active" ${user.status==='active'?'selected':''}>Active</option><option value="disabled" ${user.status==='disabled'?'selected':''}>Disabled</option></select></label>
    <div class="user-actions"><button class="primary" type="button" data-save-user>Save</button><button type="button" data-edit-signature>Edit signature</button><button type="button" data-reset-password>Reset password</button><button class="danger" type="button" data-delete-user ${user.id===state.me?.id?'disabled':''}>Delete</button></div>
  </article>`).join(''):'<div class="empty-users">No users found.</div>';
}
function openPasswordModal(user){
  state.resetUserId=user.id;
  passwordUser.textContent=`Reset password for ${user.displayName} (${user.email}).`;
  resetPassword.value='';
  passwordResult.hidden=true;
  passwordResult.textContent='';
  passwordModal.hidden=false;
  resetPassword.focus();
}
function closePasswordModal(){passwordModal.hidden=true;state.resetUserId=null}
function openCreateUserModal(){
  createUserForm.reset();
  createUserForm.elements.role.value='editor';
  createUserForm.elements.status.value='active';
  createUserResult.hidden=true;
  createUserResult.textContent='';
  createUserModal.hidden=false;
  createUserForm.elements.displayName.focus();
}
function closeCreateUserModal(){createUserModal.hidden=true}
async function loadUsers(){
  const data=await api('/api/signature/users');
  state.users=data.users||[];
  renderUsers();
}
async function refreshAdminConfig(){const data=await api('/api/signature/admin-config');updateStats(data.stats||{});updateReadiness(data.readiness)}
async function load(){
  const session=await api('/api/signature/session');
  if(!session.user){location.href='signature.html';return}
  if(session.user.role!=='admin'){location.href='signature.html';return}
  state.me=session.user;
  const data=await api('/api/signature/admin-config');
  fillForm(data.install);updateStats(data.stats||{});updateReadiness(data.readiness);
  await loadUsers();
  showPane((location.hash||'#overview').slice(1));
}
form.addEventListener('submit',async e=>{
  e.preventDefault();
  await runBusy(e.submitter||form.querySelector('button[type=submit]'),async()=>{
  try{
    const body=Object.fromEntries(new FormData(form));
    body.requireMfa=form.elements.requireMfa.checked?'on':'';
    body.allowSelfProfile=form.elements.allowSelfProfile.checked?'on':'';
    const saved=await api('/api/signature/admin-config',{method:'PUT',body:JSON.stringify(body)});
    fillForm(saved.install);const latest=await api('/api/signature/admin-config');updateReadiness(latest.readiness);setStatus('Settings saved');
  }catch(err){setStatus(err.message)}
  },'Saving...');
});
document.getElementById('logout').addEventListener('click',async e=>{await runBusy(e.currentTarget,async()=>{await api('/api/signature/logout',{method:'POST',body:'{}'});location.href='signature.html'},'Signing out...')});
document.getElementById('newUser').addEventListener('click',openCreateUserModal);
userManagement.addEventListener('click',async e=>{
  const row=e.target.closest('[data-user-id]');if(!row)return;
  const user=state.users.find(u=>u.id===row.dataset.userId);if(!user)return;
  try{
    if(e.target.closest('[data-edit-signature]')){location.href=`signature.html?user=${encodeURIComponent(user.id)}`;return}
    if(e.target.closest('[data-save-user]')){
      const role=row.querySelector('[data-role]').value, status=row.querySelector('[data-status]').value;
      const saved=await api(`/api/signature/users/${user.id}`,{method:'PUT',body:JSON.stringify({email:user.email,displayName:user.displayName,role,status,signature:{...user.signature,portalRole:role.replace(/^\w/,c=>c.toUpperCase())}})});
      Object.assign(user,saved.user);renderUsers();await refreshAdminConfig();setStatus('User access saved');return;
    }
    if(e.target.closest('[data-reset-password]')){
      openPasswordModal(user);return;
    }
    if(e.target.closest('[data-delete-user]')){
      if(!confirm(`Delete ${user.displayName}?`))return;
      await api(`/api/signature/users/${user.id}`,{method:'DELETE'});
      state.users=state.users.filter(u=>u.id!==user.id);renderUsers();await refreshAdminConfig();setStatus('User deleted');
    }
  }catch(err){setStatus(err.message)}
});
document.getElementById('generatePassword').addEventListener('click',()=>{resetPassword.value=tempPassword();passwordResult.hidden=false;passwordResult.textContent=`Generated password: ${resetPassword.value}`});
document.getElementById('copyPassword').addEventListener('click',async()=>{if(!resetPassword.value){setStatus('No password to copy');return}await copyText(resetPassword.value);passwordResult.hidden=false;passwordResult.textContent='Password copied to clipboard.'});
document.getElementById('closePasswordModal').addEventListener('click',closePasswordModal);
passwordModal.addEventListener('click',e=>{if(e.target.closest('[data-close-password]'))closePasswordModal()});
document.getElementById('generateCreatePassword').addEventListener('click',()=>{createPassword.value=tempPassword();createUserResult.hidden=false;createUserResult.textContent=`Generated password: ${createPassword.value}`});
document.getElementById('copyCreatePassword').addEventListener('click',async()=>{if(!createPassword.value){setStatus('No password to copy');return}await copyText(createPassword.value);createUserResult.hidden=false;createUserResult.textContent='Password copied to clipboard.'});
document.getElementById('closeCreateUserModal').addEventListener('click',closeCreateUserModal);
createUserModal.addEventListener('click',e=>{if(e.target.closest('[data-close-create-user]'))closeCreateUserModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!passwordModal.hidden)closePasswordModal();if(!createUserModal.hidden)closeCreateUserModal()}});
createUserForm.addEventListener('submit',async e=>{
  e.preventDefault();
  await runBusy(e.submitter||createUserForm.querySelector('button[type=submit]'),async()=>{
  const data=Object.fromEntries(new FormData(createUserForm));
  data.displayName=String(data.displayName||'').trim();
  data.email=String(data.email||'').trim().toLowerCase();
  data.password=String(data.password||'');
  if(!data.displayName){createUserResult.hidden=false;createUserResult.textContent='Enter the employee full name.';return}
  if(!data.email){createUserResult.hidden=false;createUserResult.textContent='Enter the employee email.';return}
  if(data.password.length<10){createUserResult.hidden=false;createUserResult.textContent='Password must be at least 10 characters.';return}
  try{
    const signature={fullName:data.displayName,email:data.email,jobTitle:String(data.jobTitle||'').trim(),profile:{fullName:data.displayName,email:data.email,jobTitle:String(data.jobTitle||'').trim(),phone:'',mobile:'',photoUrl:''},portalRole:data.role.replace(/^\w/,c=>c.toUpperCase())};
    const saved=await api('/api/signature/users',{method:'POST',body:JSON.stringify({email:data.email,displayName:data.displayName,role:data.role,status:data.status,password:data.password,signature})});
    state.users.push(saved.user);renderUsers();await refreshAdminConfig();
    createUserResult.hidden=false;
    createUserResult.textContent=`Created ${saved.user.displayName}. Login: ${saved.user.email} Password: ${data.password}`;
    setStatus(`Created ${saved.user.displayName}. Password remains visible in the create-user window.`,{persistent:true});
  }catch(err){createUserResult.hidden=false;createUserResult.textContent=err.message}
  },'Creating...');
});
passwordForm.addEventListener('submit',async e=>{
  e.preventDefault();
  await runBusy(e.submitter||passwordForm.querySelector('button[type=submit]'),async()=>{
  const user=state.users.find(u=>u.id===state.resetUserId), password=resetPassword.value.trim();
  if(!user)return;
  if(password.length<10){passwordResult.hidden=false;passwordResult.textContent='Password must be at least 10 characters.';return}
  try{
    const saved=await api(`/api/signature/users/${user.id}`,{method:'PUT',body:JSON.stringify({email:user.email,displayName:user.displayName,role:user.role,status:user.status,password,signature:user.signature})});
    Object.assign(user,saved.user);renderUsers();
    passwordResult.hidden=false;
    passwordResult.textContent=`Password saved for ${user.displayName}. Password: ${password}`;
    setStatus(`Password reset for ${user.displayName}. Password: ${password}`,{persistent:true});
  }catch(err){passwordResult.hidden=false;passwordResult.textContent=err.message}
  },'Saving...');
});
document.querySelectorAll('[data-admin-tab]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showPane(a.dataset.adminTab)}));
window.addEventListener('hashchange',()=>showPane((location.hash||'#overview').slice(1)));
load().catch(err=>setStatus(err.message));
