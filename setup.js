const form=document.getElementById('setupForm');
const statusEl=document.getElementById('status');
function setStatus(message,error=false){statusEl.textContent=message;statusEl.classList.toggle('error',error)}
async function runBusy(button,work,label='Working...'){if(button?.disabled)return;const oldText=button?.textContent;if(button){button.disabled=true;button.textContent=label}try{return await work()}finally{if(button){button.disabled=false;button.textContent=oldText}}}
async function api(path,options={}){
  const res=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error?.message||'Request failed');
  return data;
}
async function load(){
  const {install}=await api('/api/signature/setup-status');
  if(install?.configured){
    const o=install.options||{};
    for(const [name,value] of Object.entries({domain:install.publicUrl,companyName:o.companyName,adminEmail:o.adminEmail,databaseProvider:install.databaseProvider,deploymentTarget:install.deploymentTarget,databaseHost:o.databaseHost,databaseName:o.databaseName,databaseUser:o.databaseUser,assetBaseUrl:o.assetBaseUrl,mediaBaseUrl:o.mediaBaseUrl,smtpHost:o.smtpHost,smtpFrom:o.smtpFrom})){
      const field=form.elements[name];if(field&&value)field.value=value;
    }
    setStatus('Setup already exists. Sign in as an admin before saving changes.');
  }
}
form.addEventListener('submit',async event=>{
  event.preventDefault();setStatus('Saving setup...');
  await runBusy(event.submitter||form.querySelector('button[type=submit]'),async()=>{
  try{
    const payload=Object.fromEntries(new FormData(form).entries());
    await api('/api/signature/setup',{method:'POST',body:JSON.stringify(payload)});
    setStatus('Setup complete. Redirecting to login...');
    setTimeout(()=>location.href='/signature.html',900);
  }catch(error){setStatus(error.message,true)}
  },'Saving...');
});
load().catch(error=>setStatus(error.message,true));
