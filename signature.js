const els={loginView:document.getElementById('loginView'),loginForm:document.getElementById('loginForm'),form:document.getElementById('signatureForm'),preview:document.getElementById('signaturePreview'),htmlOutput:document.getElementById('htmlOutput'),toast:document.getElementById('toast'),employeeSelect:document.getElementById('employeeSelect'),templateRail:document.getElementById('templateRail'),sessionLabel:document.getElementById('sessionLabel'),exportPackage:document.getElementById('exportPackage'),bannerLibrary:document.getElementById('bannerLibrary'),effectLibrary:document.getElementById('effectLibrary'),profileToggle:document.getElementById('profileToggle'),profileMenuToggle:document.getElementById('profileMenuToggle'),accountMenu:document.getElementById('accountMenu'),notificationToggle:document.getElementById('notificationToggle'),notificationMenu:document.getElementById('notificationMenu'),notificationCount:document.getElementById('notificationCount'),notificationList:document.getElementById('notificationList'),markNotificationsRead:document.getElementById('markNotificationsRead'),profilePanel:document.getElementById('profilePanel'),profileForm:document.getElementById('profileForm'),profileSummary:document.getElementById('profileSummary'),accountActivity:document.getElementById('accountActivity'),headerAvatar:document.getElementById('headerAvatar'),accountAvatar:document.getElementById('accountAvatar'),headerName:document.getElementById('headerName'),accountName:document.getElementById('accountName'),headerRole:document.getElementById('headerRole'),templatePanel:document.getElementById('templatePanel'),templateForm:document.getElementById('templateForm')};
let state={me:null,users:[],templates:[],activeUserId:null,notificationRead:new Set(),dirty:false,runtime:{publicUrl:'',assetBaseUrl:'',mediaBaseUrl:''}};
const bannerChoices=[
  ['Managed IT Assessment','/event-banners/managed-it-services-assessment.png'],
  ['Cybersecurity Readiness','/event-banners/cybersecurity-readiness-event.png'],
  ['Backup & Recovery','/event-banners/backup-disaster-recovery-webinar.png'],
  ['Cloud Modernization','/event-banners/cloud-services-modernization.png'],
  ['IT Health Check','/event-banners/it-health-check-network-assessment.png'],
  ['Executive Strategy','/event-banners/executive-it-strategy-session.png'],
  ['Healthcare & Pro Services','/event-banners/healthcare-professional-services-it.png'],
  ['Proactive Monitoring','/event-banners/proactive-monitoring-support.png'],
  ['Original Tech Banner','/signature-it-banner.png']
];
const effectChoices=[['Tech pulse','tech-pulse'],['Starfield','starfield'],['Lightning','lightning'],['Signal rings','signal-rings'],['Clean','clean'],['None','none']];

async function api(path,options={}){
  const res=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error?.message||'Request failed');
  return data;
}
function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function cleanUrl(v){const s=String(v||'').trim();if(!s)return'';if(s.startsWith('/')||s.startsWith('./')||s.startsWith('../'))return s;return /^https?:\/\//i.test(s)?s:`https://${s}`}
function trimSlash(v){return String(v||'').trim().replace(/\/+$/,'')}
function installBase(){return trimSlash(state.runtime.publicUrl)||trimSlash(state.runtime.assetBaseUrl)||location.origin}
function mediaBase(){return trimSlash(state.runtime.mediaBaseUrl)||trimSlash(state.runtime.assetBaseUrl)||installBase()}
function isLocalUrl(url){return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(String(url||''))}
function installUrl(url){const href=cleanUrl(url);if(!href)return'';if(isLocalUrl(href))return installBase();return href}
function mediaUrl(url,{absolute=false}={}){
  const href=cleanUrl(url);if(!href)return'';
  if(/^https?:\/\//i.test(href))return isLocalUrl(href)?href.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i,mediaBase()):href;
  if(!absolute)return href;
  return `${mediaBase()}${href.startsWith('/')?'':'/'}${href}`;
}
function displayDomain(label,url){
  const text=String(label||'').trim();
  if(text&&!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(text))return text;
  const href=installUrl(url)||installBase();
  return href.replace(/^https?:\/\//i,'').replace(/\/.*$/,'');
}
function initials(name){return String(name||'IDR').split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()}
function slug(v){return String(v||'signature').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'signature'}
function activeUser(){return state.users.find(u=>u.id===state.activeUserId)||state.users[0]}
function activeSig(){return activeUser()?.signature||{}}
function formData(){const data={};for(const el of els.form.elements){if(!el.name)continue;data[el.name]=el.type==='checkbox'?(el.checked?'on':''):el.value}return data}
function applyToForm(sig){for(const el of els.form.elements){if(!el.name)continue;if(el.type==='checkbox')el.checked=Boolean(sig[el.name]);else el.value=el.name==='bannerEffect'?(sig[el.name]||'tech-pulse'):(sig[el.name]??'')}}
function roleFromPortal(value){const role=String(value||'editor').toLowerCase();if(role==='admin')return'admin';if(role==='viewer')return'viewer';return'editor'}
function portalFromRole(value){return String(value||'editor').replace(/^\w/,c=>c.toUpperCase())}
function profileFromUser(user){const sig=user?.signature||{},p=sig.profile||{};return{fullName:p.fullName||sig.fullName||user?.displayName||'',jobTitle:p.jobTitle||sig.jobTitle||'',email:p.email||sig.email||user?.email||'',phone:p.phone||sig.phone||'',mobile:p.mobile||sig.mobile||'',photoUrl:p.photoUrl||sig.photoUrl||''}}
function signatureFor(user,patch=formData()){const profile=profileFromUser(user);return{...(user?.signature||{}),...patch,...profile,profile}}
function currentUserPayload(){const user=activeUser(), sig={...(user?.signature||{}),...formData()};delete sig.fullName;delete sig.jobTitle;delete sig.email;delete sig.phone;delete sig.mobile;delete sig.photoUrl;return{email:user.email,displayName:user.displayName,role:user.role,signature:sig}}
function canManageUsers(){return state.me?.role==='admin'}
function canEditActive(){return state.me?.role==='admin'||(state.me?.role==='editor'&&state.activeUserId===state.me.id)}
function showToast(msg){els.toast.textContent=msg;els.toast.classList.add('show');setTimeout(()=>els.toast.classList.remove('show'),2200)}
async function runBusy(button,work,label='Working...'){
  if(button?.disabled)return;
  const oldText=button?.textContent;
  if(button){button.disabled=true;button.textContent=label}
  try{return await work()}finally{if(button){button.disabled=false;button.textContent=oldText}}
}
async function writeClipboard(text,html){
  if(navigator.clipboard&&html&&window.ClipboardItem){
    await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);
    return;
  }
  if(navigator.clipboard){await navigator.clipboard.writeText(text);return}
  els.htmlOutput.focus();els.htmlOutput.select();document.execCommand('copy');
}
function tempPassword(){return Array.from(crypto.getRandomValues(new Uint32Array(3))).map(n=>n.toString(36)).join('-')}
function notificationStorageKey(){return `signature.notifications.read.${state.me?.id||'anon'}`}
function preferenceStorageKey(){return `signature.preferences.${state.me?.id||'anon'}`}
function loadNotificationReads(){try{state.notificationRead=new Set(JSON.parse(localStorage.getItem(notificationStorageKey())||'[]'))}catch{state.notificationRead=new Set()}}
function saveNotificationReads(){localStorage.setItem(notificationStorageKey(),JSON.stringify([...state.notificationRead]))}
function loadPreferences(){try{return{notifyUnsaved:true,compactPreview:false,...JSON.parse(localStorage.getItem(preferenceStorageKey())||'{}')}}catch{return{notifyUnsaved:true,compactPreview:false}}}
function savePreferences(prefs){localStorage.setItem(preferenceStorageKey(),JSON.stringify(prefs))}
function withUtm(url,v,content){
  const href=cleanUrl(url);if(!href||!v.useUtm||!/^https?:\/\//i.test(href))return href;
  const parsed=new URL(href);
  const campaign=v.utmCampaign||slug(v.eventHeadline)||'signature';
  const params={utm_source:v.utmSource||'email_signature',utm_medium:v.utmMedium||'email',utm_campaign:campaign,utm_content:v.utmContent||content};
  for(const [key,value] of Object.entries(params))if(value)parsed.searchParams.set(key,value);
  return parsed.toString();
}

function socialButton(url,label,color,primary){return url?`<a href="${esc(url)}" style="display:block;width:28px;height:28px;border-radius:14px;background:${color};color:${primary};font-family:Arial,sans-serif;font-size:10px;line-height:28px;text-align:center;text-decoration:none;font-weight:700;margin-bottom:8px;border:1px solid #dfe5ee;">${label}</a>`:''}
function faIcon(name,color){
  const paths={
    phone:'M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64c0 247.4 200.6 448 448 448 18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3l49.3-40.3c13.7-11.2 18.4-30 11.6-46.3l-40-96z',
    envelope:'M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4 0-26.5-21.5-48-48-48H48zM0 176v208c0 35.3 28.7 64 64 64h384c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z',
    globe:'M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm177.6 148h-74.9c-6.5-31.4-16.5-58.7-29.2-80.3 44.5 15 81.5 43.9 104.1 80.3zM256 56c17.4 25.2 31.5 59.8 39.7 100h-79.4C224.5 115.8 238.6 81.2 256 56zM64 256c0-16.6 3.2-32.5 8.9-47h84.4c-1.1 15.4-1.1 31.6 0 47s3.1 31.6 6 47H72.9C67.2 288.5 64 272.6 64 256zm14.4 99h74.9c6.5 31.4 16.5 58.7 29.2 80.3-44.5-15-81.5-43.9-104.1-80.3zM153.3 156H78.4c22.6-36.4 59.6-65.3 104.1-80.3-12.7 21.6-22.7 48.9-29.2 80.3zM256 456c-17.4-25.2-31.5-59.8-39.7-100h79.4C287.5 396.2 273.4 430.8 256 456zm51.8-151H204.2c-1.4-15.2-2.2-31.5-2.2-49s.8-33.8 2.2-49h103.6c1.4 15.2 2.2 31.5 2.2 49s-.8 33.8-2.2 49zm21.7 130.3c12.7-21.6 22.7-48.9 29.2-80.3h74.9c-22.6 36.4-59.6 65.3-104.1 80.3zM354.7 303c1.1-15.4 1.1-31.6 0-47s-3.1-31.6-6-47h84.4c5.7 14.5 8.9 30.4 8.9 47s-3.2 32.5-8.9 47h-78.4z'
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 512 512" aria-hidden="true" style="display:block;width:11px;height:11px;fill:${color};"><path d="${paths[name]}"></path></svg>`;
}
function contactIcon(name,primary){return `<span style="display:inline-block;width:15px;vertical-align:-1px;">${faIcon(name,primary)}</span>`}
function bannerEffect(value){const effect=String(value||'tech-pulse');return['tech-pulse','starfield','lightning','signal-rings','clean','none'].includes(effect)?effect:'tech-pulse'}
function bannerOverlay(effect){
  const veil='linear-gradient(90deg,rgba(5,10,30,.95),rgba(5,10,30,.54) 50%,rgba(5,10,30,.95))';
  if(effect==='none')return veil;
  if(effect==='clean')return `linear-gradient(90deg,rgba(5,10,30,.90),rgba(5,10,30,.46) 50%,rgba(5,10,30,.90))`;
  if(effect==='starfield')return `radial-gradient(circle at 14% 22%,rgba(255,255,255,.84) 0 1px,transparent 2px),radial-gradient(circle at 42% 62%,rgba(255,255,255,.62) 0 1px,transparent 2px),radial-gradient(circle at 78% 30%,rgba(49,190,209,.78) 0 1px,transparent 2px),radial-gradient(circle at 90% 72%,rgba(255,255,255,.58) 0 1px,transparent 2px),${veil}`;
  if(effect==='lightning')return `linear-gradient(112deg,transparent 0 47%,rgba(255,255,255,.32) 47.5%,rgba(49,190,209,.28) 48.5%,transparent 50.5% 100%),radial-gradient(circle at 70% 40%,rgba(49,190,209,.22),transparent 32%),${veil}`;
  if(effect==='signal-rings')return `radial-gradient(circle at 50% 50%,transparent 0 22%,rgba(255,255,255,.22) 23%,transparent 25%,transparent 38%,rgba(49,190,209,.24) 39%,transparent 42%,transparent 55%,rgba(255,255,255,.16) 56%,transparent 59%),${veil}`;
  return `radial-gradient(circle at 18% 26%,rgba(255,255,255,.72) 0 1px,transparent 2px),radial-gradient(circle at 72% 34%,rgba(255,255,255,.58) 0 1px,transparent 2px),radial-gradient(circle at 86% 68%,rgba(49,190,209,.72) 0 1px,transparent 2px),linear-gradient(135deg,transparent 0 28%,rgba(49,190,209,.20) 28.3%,transparent 29.1% 61%,rgba(255,255,255,.16) 61.3%,transparent 62.1%),${veil}`;
}
function absoluteAssetUrl(url){return mediaUrl(url,{absolute:true})}
function bannerContent(v,style='border-collapse:collapse;width:100%;'){
  const panelColor=/^#[0-9a-f]{6}$/i.test(String(v.panelColor||''))?v.panelColor:'#f39bd2';
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="${style}"><tr><td style="width:39%;padding:15px 14px;color:#fff;vertical-align:middle;"><div style="font-size:17px;line-height:19px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35);">${esc(v.eventHeadline)}</div><span style="display:inline-block;margin-top:8px;border:1px solid rgba(255,255,255,.72);background:rgba(255,255,255,.10);border-radius:14px;padding:5px 10px;font-size:11px;line-height:12px;color:#fff;">${esc(v.ctaText)}</span></td><td style="width:25%;text-align:center;vertical-align:middle;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="border-collapse:collapse;width:68px;height:68px;background:${panelColor};border:1px solid rgba(255,255,255,.88);"><tr><td style="font-size:19px;line-height:20px;color:#fff;font-weight:700;text-align:left;padding:7px 9px 0;">${esc(v.eventTop)}</td></tr><tr><td style="font-size:17px;line-height:17px;color:#fff;text-align:right;padding:0 10px;">${esc(v.eventMiddle)}</td></tr><tr><td style="font-size:19px;line-height:20px;color:#fff;font-weight:700;text-align:left;padding:0 9px 7px;">${esc(v.eventBottom)}</td></tr></table></td><td style="width:36%;padding:15px 15px;vertical-align:middle;text-align:right;color:#fff;font-size:16px;line-height:18px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.35);">${esc(v.dateLine1)}<br>${esc(v.dateLine2)}</td></tr></table>`;
}
function outlookBanner(v,bannerHref,bannerImageUrl,width){
  const src=absoluteAssetUrl(bannerImageUrl), vmlWidth=Math.max(420,Math.min(712,width-48)), vmlHeight=78;
  const fill=src?`<v:fill type="frame" src="${esc(src)}" color="#071024" />`:`<v:fill color="#071024" />`;
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(bannerHref||'#')}" arcsize="12%" stroked="false" style="width:${vmlWidth}px;height:${vmlHeight}px;v-text-anchor:middle;">${fill}<v:textbox inset="0,0,0,0"><div>${bannerContent(v,`border-collapse:collapse;width:${vmlWidth}px;height:${vmlHeight}px;`)}</div></v:textbox></v:roundrect><![endif]-->`;
}
function signatureHtml(v,{animated=false}={}){
  const primary=v.primaryColor||'#111936', width=Math.max(460,Math.min(760,Number(v.signatureWidth)||650)), radius=Number(v.radius)||12;
  const website=installUrl(v.website), photoUrl=mediaUrl(v.photoUrl,{absolute:!animated}), bannerUrl=installUrl(v.bannerUrl), bannerImageUrl=mediaUrl(v.bannerImageUrl,{absolute:!animated});
  const websiteHref=withUtm(website,v,'website'), bannerHref=withUtm(bannerUrl||website,v,'banner'), facebookHref=withUtm(v.facebookUrl,v,'facebook'), xHref=withUtm(v.xUrl,v,'x'), linkedinHref=withUtm(v.linkedinUrl,v,'linkedin');
  const photo=photoUrl?`<img src="${esc(photoUrl)}" width="82" height="82" alt="${esc(v.fullName)}" style="display:block;border:0;width:82px;height:82px;border-radius:41px;object-fit:cover;">`:`<div style="width:82px;height:82px;background:linear-gradient(135deg,#edf2f8,#dbe3ef);color:${primary};border-radius:41px;text-align:center;line-height:82px;font-family:Arial,sans-serif;font-size:24px;font-weight:700;letter-spacing:.02em;">${esc(initials(v.fullName))}</div>`;
  const mobile=v.mobile?`<span style="color:#98a2b3;"> / </span><a href="tel:${esc(v.mobile)}" style="color:${primary};text-decoration:none;">${esc(v.mobile)}</a>`:'';
  const compact=v.template==='compact', clean=v.template==='clean-card';
  const effect=bannerEffect(v.bannerEffect), overlay=bannerOverlay(effect);
  const layerCount=overlay.split('),').length;
  const overlaySizes=Array(layerCount).fill('100% 100%').join(',');
  const bannerBg=bannerImageUrl?`background-image:${overlay},url('${esc(bannerImageUrl)}');background-size:${overlaySizes},cover;background-position:center;`:`background-image:${overlay};background-color:${v.bannerColor||'#1b2d55'};background-size:${overlaySizes};background-position:center;`;
  const motionOverlay=animated&&effect!=='none'?`<div class="motion-banner-layer effect-${effect}" aria-hidden="true"><span class="motion-static"></span><span class="motion-stars"></span><span class="motion-lightning"></span><span class="motion-rings"></span><span class="motion-scan"></span></div>`:'';
  const bannerTableStyle=`border-collapse:collapse;width:100%;${animated?'position:relative;z-index:2;':''}`;
  const outlook=outlookBanner(v,bannerHref,bannerImageUrl,width);
  const normal=`<!--[if !mso]><!--><a href="${esc(bannerHref||'#')}" class="${animated?'motion-banner':''}" style="display:block;${bannerBg}color:#fff;text-decoration:none;border-radius:10px;font-family:Arial,sans-serif;overflow:hidden;${animated?'position:relative;':''}">${motionOverlay}${bannerContent(v,bannerTableStyle)}</a><!--<![endif]-->`;
  const banner=(!clean&&v.eventHeadline)?`<tr><td colspan="3" style="padding:18px 24px 0;">${outlook}${normal}</td></tr>`:'';
  const disclaimer=v.showDisclaimer&&v.disclaimer?`<tr><td colspan="3" style="padding:12px 24px 0;font-family:Arial,sans-serif;font-size:10px;line-height:15px;color:#5f6b7a;">${esc(v.disclaimer)}</td></tr>`:'';
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;width:100%;max-width:${width}px;background:${v.cardColor||'#fff'};border-radius:${radius}px;"><tr><td style="font-size:0;line-height:0;height:${compact?14:24}px;">&nbsp;</td><td></td><td></td></tr><tr><td style="width:${compact?76:116}px;vertical-align:top;padding:0 18px 0 24px;">${compact?'':photo}</td><td style="vertical-align:middle;padding:0 12px 0 ${compact?'24px':'0'};font-family:Arial,sans-serif;color:#101828;"><div style="font-size:${compact?17:20}px;line-height:23px;font-weight:400;color:${primary};">${esc(v.fullName)}</div><div style="font-size:13px;line-height:17px;color:#667085;">${esc(v.jobTitle)}</div><div style="height:8px;line-height:8px;font-size:8px;">&nbsp;</div>${v.phone?`<div style="font-size:12px;line-height:18px;color:#344054;">${contactIcon('phone',primary)}<a href="tel:${esc(v.phone)}" style="color:${primary};text-decoration:none;">${esc(v.phone)}</a>${mobile}</div>`:''}<div style="font-size:12px;line-height:18px;color:#344054;">${contactIcon('envelope',primary)}<a href="mailto:${esc(v.email)}" style="color:${primary};text-decoration:underline;">${esc(v.email)}</a></div><div style="font-size:12px;line-height:18px;color:#344054;">${contactIcon('globe',primary)}<a href="${esc(websiteHref||'#')}" style="color:${primary};text-decoration:none;">${esc(displayDomain(v.companyName,website))}</a></div></td><td style="width:42px;vertical-align:top;padding:0 24px 0 0;text-align:center;">${socialButton(facebookHref,'f',v.socialColor||'#eef1f6',primary)}${socialButton(xHref,'X',v.socialColor||'#eef1f6',primary)}${socialButton(linkedinHref,'in',v.socialColor||'#eef1f6',primary)}</td></tr>${banner}${disclaimer}<tr><td style="font-size:0;line-height:0;height:${compact?14:20}px;">&nbsp;</td><td></td><td></td></tr></table>`;
}
function render(){
  const user=activeUser(), sig=signatureFor(user,formData()); els.preview.innerHTML=signatureHtml(sig,{animated:true}); els.htmlOutput.value=signatureHtml(sig);
  const emailFrame=document.querySelector('.email-frame');emailFrame.style.background=sig.outerColor||'#5367d8';emailFrame.classList.toggle('compact-preview',Boolean(loadPreferences().compactPreview));
  els.employeeSelect.innerHTML=state.users.map(u=>`<option value="${u.id}" ${u.id===state.activeUserId?'selected':''}>${esc(profileFromUser(u).fullName||u.displayName)} - ${esc(u.role)}</option>`).join('');
  const canEditTemplates=state.me?.role!=='viewer';
  els.templateRail.innerHTML=state.templates.map(t=>`<span class="template-pill ${t.patch.template===sig.template?'active':''}"><button type="button" data-template-id="${t.id}">${esc(t.name)}</button>${canEditTemplates?`<button class="template-delete" type="button" data-delete-template="${t.id}" aria-label="Delete ${esc(t.name)}">x</button>`:''}</span>`).join('');
  els.bannerLibrary.innerHTML=bannerChoices.map(([label,url])=>`<button type="button" class="banner-choice ${sig.bannerImageUrl===url?'active':''}" data-banner-url="${esc(url)}"><img src="${esc(url)}" alt=""><span>${esc(label)}</span></button>`).join('');
  els.effectLibrary.innerHTML=effectChoices.map(([label,effect])=>`<button type="button" class="effect-choice effect-preview-${effect} ${bannerEffect(sig.bannerEffect)===effect?'active':''}" data-banner-effect="${esc(effect)}"><span></span><strong>${esc(label)}</strong></button>`).join('');
  renderProfileSummary();
  const editable=canEditActive(), admin=canManageUsers();
  document.querySelectorAll('[data-admin-only]').forEach(el=>el.hidden=!admin);
  document.getElementById('manageUsers').disabled=!admin;
  document.getElementById('saveUser').disabled=!editable;
  document.getElementById('duplicateTemplate').disabled=state.me?.role==='viewer';
  for(const el of els.form.elements)el.disabled=!editable;
  els.employeeSelect.disabled=false;
  els.exportPackage.disabled=false;
  renderHeader();
  renderNotifications();
}
function renderHeader(){
  const me=state.users.find(u=>u.id===state.me?.id)||state.me;if(!me)return;
  const p=profileFromUser(me), label=initials(p.fullName||me.displayName);
  els.headerName.textContent=p.fullName||me.displayName||'Signed in';
  els.accountName.textContent=p.fullName||me.displayName||'Signed in';
  els.headerRole.textContent=me.role==='admin'?'Administrator':portalFromRole(me.role);
  els.headerAvatar.textContent=label;
  els.accountAvatar.textContent=label;
}
function renderProfileSummary(){
  if(!els.profileSummary)return;
  const user=activeUser(), p=profileFromUser(user);
  els.profileSummary.innerHTML=`<div class="profile-summary-head"><span>Saved profile info</span><strong>${esc(p.fullName||user?.displayName||'No profile name')}</strong></div><dl><div><dt>Title</dt><dd>${esc(p.jobTitle||'Not set')}</dd></div><div><dt>Email</dt><dd>${esc(p.email||user?.email||'Not set')}</dd></div><div><dt>Phone</dt><dd>${esc([p.phone,p.mobile].filter(Boolean).join(' / ')||'Not set')}</dd></div></dl><div class="profile-note">These details are automatically used in the signature preview, copied HTML, and export package. To change them, open your profile menu in the top right and choose Account.</div>`;
}
function notifications(){
  const me=state.users.find(u=>u.id===state.me?.id)||state.me, profile=profileFromUser(me), items=[];
  const missing=[['job title',profile.jobTitle],['phone',profile.phone],['email',profile.email]].filter(x=>!x[1]);
  if(missing.length)items.push({id:`profile:${missing.map(x=>x[0]).join('-')}`,title:'Finish your profile',body:`Missing ${missing.map(x=>x[0]).join(', ')}. Your saved profile feeds every generated signature.`,action:'profile'});
  if(state.dirty&&loadPreferences().notifyUnsaved)items.push({id:`dirty:${state.activeUserId}`,title:'Unsaved signature changes',body:'Save this user before copying HTML or exporting the deployment package.',action:'save'});
  if(canManageUsers()){
    const disabled=state.users.filter(u=>u.status==='disabled').length;
    const never=state.users.filter(u=>!u.lastLoginAt).length;
    if(disabled)items.push({id:`disabled:${disabled}`,title:`${disabled} disabled user${disabled===1?'':'s'}`,body:'Review disabled accounts in Administration before deployment.',action:'users'});
    if(never)items.push({id:`never:${never}`,title:`${never} user${never===1?' has':'s have'} never signed in`,body:'Reset passwords or confirm onboarding from the Users area.',action:'users'});
  }
  if(state.templates.length<3)items.push({id:'templates:low',title:'Template library is light',body:'Save more campaign templates so deployments stay consistent.',action:'templates'});
  return items;
}
function renderNotifications(){
  if(!els.notificationList)return;
  const items=notifications(), unread=items.filter(item=>!state.notificationRead.has(item.id)).length;
  els.notificationCount.hidden=!unread;els.notificationCount.textContent=String(unread);
  els.markNotificationsRead.disabled=!items.length||!unread;
  els.notificationList.innerHTML=items.length?items.map(item=>`<button type="button" class="notification-item ${state.notificationRead.has(item.id)?'read':''}" data-notification-id="${esc(item.id)}" data-notification-action="${esc(item.action)}"><span><strong>${esc(item.title)}</strong><small>${esc(item.body)}</small></span></button>`).join(''):`<div class="notification-empty">No notifications right now.</div>`;
}
function openProfilePanel(){els.accountMenu.hidden=true;els.notificationMenu.hidden=true;els.profileMenuToggle.setAttribute('aria-expanded','false');els.notificationToggle.setAttribute('aria-expanded','false');els.profilePanel.hidden=false;fillProfileForm(profileFromUser(state.users.find(u=>u.id===state.me?.id)||state.me))}
function openTemplatePanel(){els.templateForm.reset();els.templateForm.elements.templateName.value=`${formData().eventHeadline||formData().template||'Signature'} template`;els.templatePanel.hidden=false;els.templateForm.elements.templateName.focus();els.templateForm.elements.templateName.select()}
function closeTemplatePanel(){els.templatePanel.hidden=true}
function markNotificationRead(id){state.notificationRead.add(id);saveNotificationReads();renderNotifications()}
function showAccountPane(id){
  const pane=document.querySelector(`[data-account-pane="${id}"]`)?id:'details';
  document.querySelectorAll('[data-account-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.accountTab===pane));
  document.querySelectorAll('[data-account-pane]').forEach(panel=>panel.classList.toggle('active',panel.dataset.accountPane===pane));
  document.getElementById('profileTitle').textContent={details:'Contact info used in your signature',security:'Password and sign-in security',preferences:'Account preferences',activity:'Recent account activity'}[pane]||'Account';
  els.profileForm.querySelector('button[type=submit]').hidden=pane==='activity';
}
function fillProfileForm(profile){
  if(!els.profileForm)return;
  for(const [key,value] of Object.entries(profile))if(els.profileForm.elements[key])els.profileForm.elements[key].value=value||'';
  const prefs=loadPreferences();
  if(els.profileForm.elements.notifyUnsaved)els.profileForm.elements.notifyUnsaved.checked=Boolean(prefs.notifyUnsaved);
  if(els.profileForm.elements.compactPreview)els.profileForm.elements.compactPreview.checked=Boolean(prefs.compactPreview);
  if(els.profileForm.elements.currentPassword)els.profileForm.elements.currentPassword.value='';
  if(els.profileForm.elements.newPassword)els.profileForm.elements.newPassword.value='';
  const me=state.users.find(u=>u.id===state.me?.id)||state.me;
  if(els.accountActivity&&me)els.accountActivity.innerHTML=`<div><strong>${esc(me.displayName||profile.fullName)}</strong><small>${esc(me.email||profile.email)}</small></div><div><strong>${me.role==='admin'?'Administrator':portalFromRole(me.role)}</strong><small>Status: ${esc(me.status||'active')}</small></div><div><strong>${me.lastLoginAt?new Date(me.lastLoginAt).toLocaleString():'Current session'}</strong><small>Last recorded sign-in</small></div>`;
  showAccountPane('details');
}
async function loadApp(){
  const session=await api('/api/signature/session');
  if(!session.user){
    els.loginView.classList.remove('hidden');
    try{
      const setup=await api('/api/signature/setup-status'), email=setup.install?.options?.adminEmail;
      if(email&&!els.loginForm.elements.email.value)els.loginForm.elements.email.value=email;
    }catch{}
    return;
  }
  state.me=session.user; els.loginView.classList.add('hidden'); els.sessionLabel.textContent='Email Signature Studio';
  loadNotificationReads();
  const [users,templates,runtime]=await Promise.all([api('/api/signature/users'),api('/api/signature/templates'),api('/api/signature/runtime-config')]);
  state.runtime=runtime||state.runtime;
  state.users=users.users.map(u=>({...u,signature:{...u.signature,portalRole:u.signature.portalRole||portalFromRole(u.role)}})); state.templates=templates.templates;
  const requestedUser=new URLSearchParams(location.search).get('user');
  state.activeUserId=requestedUser||state.activeUserId||session.user.id;
  if(!state.users.find(u=>u.id===state.activeUserId))state.activeUserId=state.users[0]?.id;
  fillProfileForm(profileFromUser(state.users.find(u=>u.id===state.me.id)||state.me));
  applyToForm(activeSig()); state.dirty=false; render();
}
async function copyHtml(){await writeClipboard(els.htmlOutput.value);showToast('HTML copied')}
async function copyRich(){const html=els.htmlOutput.value;await writeClipboard(els.preview.innerText,html);showToast('Signature copied')}
function csvCell(value){return `"${String(value??'').replace(/"/g,'""')}"`}
function deploymentFiles(){
  const current=formData();
  const users=state.users.filter(u=>state.me?.role==='admin'||u.id===state.me?.id);
  const files=[];
  const rows=[['Name','Email','Role','Signature File','Template','Campaign','UTM Source','UTM Medium','UTM Campaign'].map(csvCell).join(',')];
  const gallery=[];
  for(const user of users){
    const sig=signatureFor(user,user.id===state.activeUserId?current:user.signature);
    const html=signatureHtml(sig);
    const fileName=`signatures/${slug(sig.fullName||user.displayName)}-${slug(sig.email)}.html`;
    files.push({name:fileName,content:`<!doctype html><html><head><meta charset="utf-8"><title>${esc(sig.fullName)} Signature</title></head><body>${html}</body></html>`});
    rows.push([sig.fullName,user.email,user.role,fileName,sig.template,sig.eventHeadline,sig.utmSource,sig.utmMedium,sig.utmCampaign].map(csvCell).join(','));
    gallery.push(`<h2>${esc(sig.fullName||user.displayName)}</h2>${html}`);
  }
  files.push({name:'manifest.csv',content:rows.join('\r\n')});
  files.push({name:'all-signatures-preview.html',content:`<!doctype html><html><head><meta charset="utf-8"><title>Signature Preview</title><style>body{font-family:Arial,sans-serif;padding:24px;background:#f5f7fb}h1,h2{color:#101828}section{margin:0 0 28px}</style></head><body><h1>Email Signature Deployment Preview</h1>${gallery.map(item=>`<section>${item}</section>`).join('')}</body></html>`});
  files.push({name:'README.txt',content:`Example MSP email signature deployment package\n\nFiles:\n- signatures/*.html: one generated signature per user\n- manifest.csv: user and campaign mapping\n- all-signatures-preview.html: quick visual review\n\nNotes:\n- UTM tags are applied directly to website, social, and banner links when enabled.\n- Images must remain hosted at the URLs referenced in the HTML.\n- This package does not require click-tracking redirects or a separate tracking domain.\n`});
  return files;
}
function crc32(bytes){let c=-1;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1))}return(c^(-1))>>>0}
function u16(n){return [n&255,(n>>>8)&255]} function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
function zip(files){
  const enc=new TextEncoder();let offset=0;const local=[],central=[];
  for(const file of files){
    const name=enc.encode(file.name), data=enc.encode(file.content), crc=crc32(data), size=data.length;
    local.push(new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(size),...u32(size),...u16(name.length),...u16(0),...name,...data]));
    central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(size),...u32(size),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]));
    offset+=local[local.length-1].length;
  }
  const centralSize=central.reduce((n,x)=>n+x.length,0), end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(centralSize),...u32(offset),...u16(0)]);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
function exportDeploymentPackage(){
  const files=deploymentFiles(), blob=zip(files), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=`${slug(formData().packageName||'email-signatures')}.zip`;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('Deployment package exported');
}

els.loginForm.addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button[type=submit]');await runBusy(button,async()=>{try{await api('/api/signature/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});await loadApp()}catch(err){showToast(err.message)}},'Signing in...')});
document.getElementById('logout').addEventListener('click',async e=>{await runBusy(e.currentTarget,async()=>{await api('/api/signature/logout',{method:'POST',body:'{}'});state={me:null,users:[],templates:[],activeUserId:null,notificationRead:new Set(),dirty:false};els.loginView.classList.remove('hidden');els.accountMenu.hidden=true;els.notificationMenu.hidden=true},'Signing out...')});
els.employeeSelect.addEventListener('change',()=>{state.activeUserId=els.employeeSelect.value;applyToForm(activeSig());render()});
els.profileMenuToggle.addEventListener('click',()=>{const open=els.accountMenu.hidden;els.accountMenu.hidden=!open;els.profileMenuToggle.setAttribute('aria-expanded',String(open))});
els.notificationToggle.addEventListener('click',()=>{const open=els.notificationMenu.hidden;els.notificationMenu.hidden=!open;els.notificationToggle.setAttribute('aria-expanded',String(open));els.accountMenu.hidden=true;els.profileMenuToggle.setAttribute('aria-expanded','false');if(open){for(const item of notifications())state.notificationRead.add(item.id);saveNotificationReads();renderNotifications()}});
document.addEventListener('click',e=>{if(!e.target.closest('.header-profile')){els.accountMenu.hidden=true;els.notificationMenu.hidden=true;els.profileMenuToggle.setAttribute('aria-expanded','false');els.notificationToggle.setAttribute('aria-expanded','false')}});
els.markNotificationsRead.addEventListener('click',()=>{for(const item of notifications())state.notificationRead.add(item.id);saveNotificationReads();renderNotifications()});
els.notificationList.addEventListener('click',e=>{const row=e.target.closest('[data-notification-id]');if(!row)return;markNotificationRead(row.dataset.notificationId);els.notificationMenu.hidden=true;els.notificationToggle.setAttribute('aria-expanded','false');if(row.dataset.notificationAction==='profile')openProfilePanel();if(row.dataset.notificationAction==='save')document.getElementById('saveUser').click();if(row.dataset.notificationAction==='users')location.href='admin.html#users';if(row.dataset.notificationAction==='templates')document.getElementById('duplicateTemplate').focus()});
els.profileToggle.addEventListener('click',openProfilePanel);
document.querySelectorAll('[data-account-tab]').forEach(btn=>btn.addEventListener('click',()=>showAccountPane(btn.dataset.accountTab)));
document.getElementById('adminJump').addEventListener('click',()=>{location.href='admin.html'});
document.getElementById('profileCancel').addEventListener('click',()=>{els.profilePanel.hidden=true});
els.profilePanel.addEventListener('click',e=>{if(e.target.closest('[data-close-profile]'))els.profilePanel.hidden=true});
document.getElementById('templateCancel').addEventListener('click',closeTemplatePanel);
els.templatePanel.addEventListener('click',e=>{if(e.target.closest('[data-close-template]'))closeTemplatePanel()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!els.profilePanel.hidden)els.profilePanel.hidden=true;if(!els.templatePanel.hidden)closeTemplatePanel()}});
els.profileForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const button=els.profileForm.querySelector('button[type=submit]');
  await runBusy(button,async()=>{
  try{
    const activePane=document.querySelector('[data-account-pane].active')?.dataset.accountPane||'details';
    const body=Object.fromEntries(new FormData(els.profileForm));
    if(activePane==='preferences'){
      savePreferences({notifyUnsaved:Boolean(body.notifyUnsaved),compactPreview:Boolean(body.compactPreview)});
      renderNotifications();showToast('Preferences saved');return;
    }
    if(!body.newPassword){delete body.currentPassword;delete body.newPassword}
    if(activePane==='security'&&!body.newPassword){showToast('Enter a new password');return}
    const saved=await api('/api/signature/profile',{method:'PUT',body:JSON.stringify(body)});
    const existing=state.users.find(u=>u.id===saved.user.id);
    if(existing)Object.assign(existing,saved.user);else state.users.push(saved.user);
    state.me=saved.user;
    els.sessionLabel.textContent='Email Signature Studio';
    fillProfileForm(profileFromUser(saved.user));
    state.dirty=false;render();
    showToast('Profile saved');
  }catch(err){showToast(err.message)}
  },'Saving...');
});
document.getElementById('saveUser').addEventListener('click',async e=>{await runBusy(e.currentTarget,async()=>{try{const u=activeUser();const saved=await api(`/api/signature/users/${u.id}`,{method:'PUT',body:JSON.stringify(currentUserPayload())});Object.assign(u,saved.user);state.dirty=false;showToast('User saved');render()}catch(err){showToast(err.message)}},'Saving...')});
document.getElementById('manageUsers').addEventListener('click',()=>{location.href='admin.html#users'});
document.getElementById('duplicateTemplate').addEventListener('click',openTemplatePanel);
els.templateForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const button=els.templateForm.querySelector('button[type=submit]');
  await runBusy(button,async()=>{
    try{
      const sig=formData(), name=String(els.templateForm.elements.templateName.value||'').trim();
      if(!name){showToast('Enter a template name');return}
      const template=await api('/api/signature/templates',{method:'POST',body:JSON.stringify({name,patch:{template:sig.template,eventHeadline:sig.eventHeadline,ctaText:sig.ctaText,eventTop:sig.eventTop,eventMiddle:sig.eventMiddle,eventBottom:sig.eventBottom,dateLine1:sig.dateLine1,dateLine2:sig.dateLine2,bannerImageUrl:sig.bannerImageUrl,bannerEffect:sig.bannerEffect,panelColor:sig.panelColor,outerColor:sig.outerColor}})});
      state.templates.push(template.template);closeTemplatePanel();render();showToast('Template saved');
    }catch(err){showToast(err.message)}
  },'Saving...');
});
els.templateRail.addEventListener('click',async e=>{
  const deleteBtn=e.target.closest('[data-delete-template]');
  if(deleteBtn){
    const template=state.templates.find(t=>t.id===deleteBtn.dataset.deleteTemplate);
    if(!template||!confirm(`Delete template "${template.name}"?`))return;
    try{
      await api(`/api/signature/templates/${encodeURIComponent(template.id)}`,{method:'DELETE'});
      state.templates=state.templates.filter(t=>t.id!==template.id);
      render();
      showToast('Template deleted');
    }catch(err){showToast(err.message)}
    return;
  }
  const btn=e.target.closest('[data-template-id]');if(!btn)return;
  Object.assign(activeSig(),state.templates.find(t=>t.id===btn.dataset.templateId).patch);applyToForm(activeSig());render();
});
els.bannerLibrary.addEventListener('click',e=>{const btn=e.target.closest('[data-banner-url]');if(!btn||!canEditActive())return;els.form.elements.bannerImageUrl.value=btn.dataset.bannerUrl;render()});
els.effectLibrary.addEventListener('click',e=>{const btn=e.target.closest('[data-banner-effect]');if(!btn||!canEditActive())return;els.form.elements.bannerEffect.value=btn.dataset.bannerEffect;render()});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-section]').forEach(s=>s.classList.toggle('active',s.dataset.section===b.dataset.tab))}));
els.form.addEventListener('input',()=>{state.dirty=true;render()});
document.getElementById('copyHtml').addEventListener('click',async e=>{await runBusy(e.currentTarget,copyHtml,'Copying...')});
document.getElementById('copyRich').addEventListener('click',async e=>{await runBusy(e.currentTarget,copyRich,'Copying...')});
els.exportPackage.addEventListener('click',async e=>{await runBusy(e.currentTarget,async()=>exportDeploymentPackage(),'Exporting...')});
loadApp().catch(err=>showToast(err.message));
