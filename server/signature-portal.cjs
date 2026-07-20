'use strict';
const {randomBytes,scryptSync,timingSafeEqual,createHash,randomUUID}=require('node:crypto');

const defaultSignature={fullName:'Taylor Morgan',jobTitle:'Service Director',email:'taylor@msp.example',phone:'(202) 555-0100',mobile:'(202) 555-0199',photoUrl:'',portalRole:'Admin',companyName:'Example MSP',website:'https://msp.example',facebookUrl:'https://facebook.com/examplemsp',xUrl:'https://x.com/examplemsp',linkedinUrl:'https://www.linkedin.com/company/example-msp',primaryColor:'#0f2747',accentColor:'#2563eb',eventHeadline:'Technology strategy briefing',ctaText:'Reserve a seat',bannerUrl:'https://msp.example',bannerImageUrl:'/signature-it-banner.png',bannerEffect:'tech-pulse',eventTop:'IT',eventMiddle:'+',eventBottom:'YOU',dateLine1:'Next month',dateLine2:'10 AM',bannerColor:'#8fb4ff',panelColor:'#61d4c7',disclaimer:'This email and any attachments may contain confidential information intended only for the recipient. If you received it in error, please notify the sender and delete it.',showDisclaimer:'on',template:'event-card',cardColor:'#ffffff',outerColor:'#0f2747',socialColor:'#eef3f9',radius:'12',signatureWidth:'650',useUtm:'on',utmSource:'email_signature',utmMedium:'email',utmCampaign:'technology_briefing',utmContent:'signature_banner',packageName:'example-msp-signatures'};
const defaultTemplates=[['Conference push',{template:'event-card',eventHeadline:'Join our conference',ctaText:'Book now',eventTop:'AI',eventMiddle:'in',eventBottom:'tech',dateLine1:'12th May',dateLine2:'7pm',bannerImageUrl:'/signature-it-banner.png',panelColor:'#f39bd2',outerColor:'#5367d8'}],['Security review',{template:'event-card',eventHeadline:'Free security review',ctaText:'Schedule',eventTop:'MFA',eventMiddle:'+',eventBottom:'EDR',dateLine1:'This week',dateLine2:'30 min',bannerImageUrl:'/signature-it-banner.png',panelColor:'#31bed1',outerColor:'#0b1830'}],['Clean everyday',{template:'clean-card',eventHeadline:'',bannerImageUrl:'',outerColor:'#eef3f7'}]];

function hashPassword(password,salt=randomBytes(16).toString('hex')){return `${salt}:${scryptSync(String(password),salt,64).toString('hex')}`}
function verifyPassword(password,stored){const [salt,hash]=String(stored||'').split(':');if(!salt||!hash)return false;const actual=scryptSync(String(password),salt,64);const expected=Buffer.from(hash,'hex');return expected.length===actual.length&&timingSafeEqual(actual,expected)}
function tokenHash(token){return createHash('sha256').update(token).digest('hex')}
function cookie(req,name){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x[0]))[name]}
function sessionCookie(token,maxAge,secure){return `sig_session=${encodeURIComponent(token||'')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${secure?' Secure;':''}`}
function profileFrom(row,sig){
  const profile=sig.profile||{};
  return {
    fullName:profile.fullName||sig.fullName||row.display_name||'',
    jobTitle:profile.jobTitle||sig.jobTitle||'',
    email:profile.email||sig.email||row.email||'',
    phone:profile.phone||sig.phone||'',
    mobile:profile.mobile||sig.mobile||'',
    photoUrl:profile.photoUrl||sig.photoUrl||''
  };
}
function userDto(row){const raw={...defaultSignature,...JSON.parse(row.signature_json||'{}')};const profile=profileFrom(row,raw);return{id:row.id,email:row.email,displayName:row.display_name,role:row.role,status:row.status,signature:{...raw,...profile,profile},lastLoginAt:row.last_login_at}}
function templateDto(row){return{id:row.id,name:row.name,patch:JSON.parse(row.template_json||'{}')}}
function installDto(row){
  if(!row)return{configured:false,profileName:'',databaseProvider:'sqlite',deploymentTarget:'node',publicUrl:'',options:{}};
  return{configured:true,id:row.id,profileName:row.profile_name,databaseProvider:row.database_provider,deploymentTarget:row.deployment_target,publicUrl:row.public_url||'',options:JSON.parse(row.options_json||'{}'),updatedAt:row.updated_at};
}
function canonicalDb(value){const v=String(value||'sqlite').toLowerCase().replace(/[^a-z0-9]/g,'');if(['sqlserver','mssql'].includes(v))return'sqlserver';if(['postgres','postgresql','pg'].includes(v))return'postgres';return'sqlite'}
function canonicalTarget(value){const v=String(value||'node').toLowerCase();if(v.includes('docker'))return'docker';if(v.includes('iis'))return'iis-reverse-proxy';if(v.includes('windows'))return'windows-service';return'node'}
function canonicalRole(value){const role=String(value||'editor').toLowerCase();return['admin','editor','viewer'].includes(role)?role:'editor'}
function canonicalStatus(value){const status=String(value||'active').toLowerCase();return status==='disabled'?'disabled':'active'}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''))}

function createSignaturePortal({db,production,signature={},json,readJsonBody}){
  seed(db,signature);
  const loginAttempts=new Map();
  function loginAllowed(key){const now=Date.now(),windowMs=15*60*1000,limit=10;let entry=loginAttempts.get(key);if(!entry||now-entry.startedAt>=windowMs){entry={startedAt:now,count:0};loginAttempts.set(key,entry)}entry.count++;if(loginAttempts.size>2000)for(const[k,v]of loginAttempts)if(now-v.startedAt>=windowMs)loginAttempts.delete(k);return entry.count<=limit}
  function sameOrigin(req){const fetchSite=String(req.headers['sec-fetch-site']||'').toLowerCase();if(fetchSite==='cross-site')return false;const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===String(req.headers.host||'')}catch{return false}}
  function requireSession(req){
    const token=cookie(req,'sig_session');if(!token){const e=new Error('Not signed in.');e.status=401;e.code='SIGNATURE_AUTH_REQUIRED';throw e}
    const row=db.prepare(`SELECT s.*,u.* FROM signature_sessions s JOIN signature_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND u.status='active'`).get(tokenHash(token));
    if(!row){const e=new Error('Session expired.');e.status=401;e.code='SIGNATURE_SESSION_EXPIRED';throw e}
    db.prepare(`UPDATE signature_sessions SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(row.id);
    return userDto(row);
  }
  function requireAdmin(user){if(user.role!=='admin'){const e=new Error('Admin access required.');e.status=403;e.code='SIGNATURE_ADMIN_REQUIRED';throw e}}
  function requireEditor(user){if(!['admin','editor'].includes(user.role)){const e=new Error('Editor access required.');e.status=403;e.code='SIGNATURE_EDITOR_REQUIRED';throw e}}
  function installOptions(){const row=db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get();return row?JSON.parse(row.options_json||'{}'):{}}
  function sessionHours(){const hours=Number(installOptions().sessionHours||signature.sessionHours||12);return Math.max(1,Math.min(168,Number.isFinite(hours)?hours:12))}
  function readiness(){
    const install=installDto(db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get()), options=install.options||{};
    const checks=[
      {id:'configured',label:'Setup profile saved',ok:install.configured},
      {id:'publicUrl',label:'Public HTTPS URL configured',ok:/^https:\/\//i.test(install.publicUrl||'')},
      {id:'admin',label:'Active administrator exists',ok:db.prepare(`SELECT COUNT(*) AS count FROM signature_users WHERE role='admin' AND status='active'`).get().count>0},
      {id:'defaultAdmin',label:'Default development admin disabled for production',ok:production?!signature.allowDefaultAdmin:true},
      {id:'database',label:'Database provider selected',ok:Boolean(install.databaseProvider)},
      {id:'backup',label:'Backup path documented',ok:Boolean(options.backupPath)},
      {id:'session',label:'Session length set between 1 and 168 hours',ok:Number(options.sessionHours||signature.sessionHours||12)>=1&&Number(options.sessionHours||signature.sessionHours||12)<=168},
      {id:'assets',label:'Asset base URL configured',ok:Boolean(options.assetBaseUrl)}
    ];
    return{ready:checks.every(c=>c.ok),checks};
  }
  return async function handle(req,res,url,requestId){
    if(!url.pathname.startsWith('/api/signature/'))return false;
    if(!['GET','HEAD','OPTIONS'].includes(req.method||'GET')&&!sameOrigin(req))return json(res,403,{error:{code:'ORIGIN_NOT_ALLOWED',message:'Cross-site requests are not allowed.'}},requestId);
    if(url.pathname==='/api/signature/setup-status'&&req.method==='GET'){
      const profile=db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get();
      const adminCount=db.prepare(`SELECT COUNT(*) AS count FROM signature_users WHERE role='admin' AND status='active'`).get().count;
      return json(res,200,{install:installDto(profile),adminReady:adminCount>0},requestId);
    }
    if(url.pathname==='/api/signature/setup'&&req.method==='POST'){
      const existing=db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get();
      const adminCount=db.prepare(`SELECT COUNT(*) AS count FROM signature_users WHERE role='admin' AND status='active'`).get().count;
      if(existing&&adminCount>0){try{requireAdmin(requireSession(req))}catch{return json(res,403,{error:{code:'SETUP_LOCKED',message:'Setup is already complete. Sign in as an admin to run setup again.'}},requestId)}}
      const body=await readJsonBody(req,{limit:32768});
      const domain=String(body.domain||'').trim().replace(/\/+$/,'');
      const adminEmail=String(body.adminEmail||'').trim().toLowerCase();
      const adminPassword=String(body.adminPassword||'');
      const companyName=String(body.companyName||'Example MSP').trim().slice(0,120);
      if(!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(domain))return json(res,400,{error:{code:'DOMAIN_INVALID',message:'Enter a valid http or https domain.'}},requestId);
      if(!validEmail(adminEmail))return json(res,400,{error:{code:'ADMIN_EMAIL_INVALID',message:'Enter a valid admin email.'}},requestId);
      if(adminPassword.length<12)return json(res,400,{error:{code:'PASSWORD_WEAK',message:'Admin password must be at least 12 characters.'}},requestId);
      const databaseProvider=canonicalDb(body.databaseProvider), deploymentTarget=canonicalTarget(body.deploymentTarget);
      const assetBaseUrl=String(body.assetBaseUrl||domain).trim().replace(/\/+$/,''), mediaBaseUrl=String(body.mediaBaseUrl||assetBaseUrl).trim().replace(/\/+$/,'');
      if(assetBaseUrl&&!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(assetBaseUrl))return json(res,400,{error:{code:'ASSET_BASE_INVALID',message:'Enter a valid asset base URL.'}},requestId);
      if(mediaBaseUrl&&!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(mediaBaseUrl))return json(res,400,{error:{code:'MEDIA_BASE_INVALID',message:'Enter a valid media base URL.'}},requestId);
      const options={companyName,adminEmail,domain,databaseHost:String(body.databaseHost||'').trim(),databaseName:String(body.databaseName||'').trim(),databaseUser:String(body.databaseUser||'').trim(),assetBaseUrl,mediaBaseUrl,smtpHost:String(body.smtpHost||'').trim(),smtpFrom:String(body.smtpFrom||adminEmail).trim()};
      db.prepare(`INSERT INTO install_profiles(id,profile_name,database_provider,deployment_target,public_url,options_json,updated_at)
        VALUES ('signature-install',?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(id) DO UPDATE SET profile_name=excluded.profile_name,database_provider=excluded.database_provider,deployment_target=excluded.deployment_target,public_url=excluded.public_url,options_json=excluded.options_json,updated_at=excluded.updated_at`).run(`${companyName} signature portal`,databaseProvider,deploymentTarget,domain,JSON.stringify(options));
      const existingAdmin=db.prepare(`SELECT * FROM signature_users WHERE lower(email)=lower(?)`).get(adminEmail);
      const signature={...defaultSignature,fullName:companyName+' Admin',email:adminEmail,companyName:domain.replace(/^https?:\/\//,''),website:domain,bannerUrl:domain,packageName:`${companyName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-signatures`};
      if(existingAdmin)db.prepare(`UPDATE signature_users SET password_hash=?,display_name=?,role='admin',status='active',signature_json=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(hashPassword(adminPassword),`${companyName} Admin`,JSON.stringify({...JSON.parse(existingAdmin.signature_json||'{}'),...signature}),existingAdmin.id);
      else db.prepare(`INSERT INTO signature_users(id,email,password_hash,display_name,role,signature_json) VALUES (?,?,?,?,?,?)`).run(randomUUID(),adminEmail,hashPassword(adminPassword),`${companyName} Admin`,'admin',JSON.stringify(signature));
      return json(res,200,{ok:true,install:installDto(db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get())},requestId);
    }
    if(url.pathname==='/api/signature/session'&&req.method==='GET'){try{return json(res,200,{user:requireSession(req)},requestId)}catch{return json(res,200,{user:null},requestId)}}
    if(url.pathname==='/api/signature/login'&&req.method==='POST'){
      const body=await readJsonBody(req,{limit:8192});const email=String(body.email||'').trim().toLowerCase();const user=db.prepare(`SELECT * FROM signature_users WHERE lower(email)=lower(?) AND status='active'`).get(email);
      if(!loginAllowed(`${req.socket?.remoteAddress||'unknown'}:${email}`))return json(res,429,{error:{code:'LOGIN_RATE_LIMITED',message:'Too many sign-in attempts. Try again later.'}},requestId,{'Retry-After':'900'});
      if(!user||!verifyPassword(body.password,user.password_hash))return json(res,401,{error:{code:'INVALID_LOGIN',message:'Invalid email or password.'}},requestId);
      const hours=sessionHours(), token=randomBytes(32).toString('base64url'),expires=new Date(Date.now()+1000*60*60*hours).toISOString();
      db.prepare('INSERT INTO signature_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(randomUUID(),user.id,tokenHash(token),expires);
      db.prepare('UPDATE signature_users SET last_login_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?').run(user.id);
      return json(res,200,{user:userDto(user)},requestId,{'Set-Cookie':sessionCookie(token,60*60*hours,production)});
    }
    if(url.pathname==='/api/signature/logout'&&req.method==='POST'){const token=cookie(req,'sig_session');if(token)db.prepare('DELETE FROM signature_sessions WHERE token_hash=?').run(tokenHash(token));return json(res,200,{ok:true},requestId,{'Set-Cookie':sessionCookie('',0,production)})}
    const user=requireSession(req);
    if(url.pathname==='/api/signature/runtime-config'&&req.method==='GET'){
      const install=installDto(db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get()), options=install.options||{};
      return json(res,200,{publicUrl:install.publicUrl||'',assetBaseUrl:options.assetBaseUrl||install.publicUrl||'',mediaBaseUrl:options.mediaBaseUrl||options.assetBaseUrl||install.publicUrl||''},requestId);
    }
    if(url.pathname==='/api/signature/profile'&&['GET','PUT'].includes(req.method)){
      const row=db.prepare('SELECT * FROM signature_users WHERE id=?').get(user.id);
      if(!row)return json(res,404,{error:{code:'NOT_FOUND',message:'User not found.'}},requestId);
      const current=userDto(row);
      if(req.method==='GET')return json(res,200,{profile:current.signature.profile},requestId);
      const body=await readJsonBody(req,{limit:16384});
      const nextProfile={
        fullName:String(body.fullName||'').trim().slice(0,120),
        jobTitle:String(body.jobTitle||'').trim().slice(0,120),
        email:String(body.email||'').trim().toLowerCase().slice(0,180),
        phone:String(body.phone||'').trim().slice(0,60),
        mobile:String(body.mobile||'').trim().slice(0,60),
        photoUrl:String(body.photoUrl||'').trim().slice(0,600)
      };
      if(!nextProfile.fullName)return json(res,400,{error:{code:'PROFILE_NAME_REQUIRED',message:'Enter your full name.'}},requestId);
      if(!validEmail(nextProfile.email))return json(res,400,{error:{code:'PROFILE_EMAIL_INVALID',message:'Enter a valid email address.'}},requestId);
      const duplicate=db.prepare('SELECT id FROM signature_users WHERE lower(email)=lower(?) AND id<>?').get(nextProfile.email,user.id);
      if(duplicate)return json(res,409,{error:{code:'PROFILE_EMAIL_EXISTS',message:'That email is already assigned to another user.'}},requestId);
      const raw={...JSON.parse(row.signature_json||'{}'),profile:nextProfile,...nextProfile};
      let passwordSql='', params=[nextProfile.email,nextProfile.fullName,JSON.stringify(raw)];
      if(body.newPassword){
        if(String(body.newPassword).length<12)return json(res,400,{error:{code:'PASSWORD_WEAK',message:'Password must be at least 12 characters.'}},requestId);
        if(!verifyPassword(body.currentPassword,row.password_hash))return json(res,403,{error:{code:'CURRENT_PASSWORD_INVALID',message:'Current password is incorrect.'}},requestId);
        passwordSql=',password_hash=?';params.push(hashPassword(body.newPassword));
      }
      params.push(user.id);
      db.prepare(`UPDATE signature_users SET email=?,display_name=?,signature_json=?${passwordSql},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(...params);
      return json(res,200,{user:userDto(db.prepare('SELECT * FROM signature_users WHERE id=?').get(user.id))},requestId);
    }
    if(url.pathname==='/api/signature/admin-config'&&['GET','PUT'].includes(req.method)){
      requireAdmin(user);
      if(req.method==='GET'){
        const install=installDto(db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get());
        const stats={
          users:db.prepare('SELECT COUNT(*) AS count FROM signature_users').get().count,
          activeUsers:db.prepare(`SELECT COUNT(*) AS count FROM signature_users WHERE status='active'`).get().count,
          templates:db.prepare('SELECT COUNT(*) AS count FROM signature_templates').get().count,
          sessions:db.prepare(`SELECT COUNT(*) AS count FROM signature_sessions WHERE expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')`).get().count
        };
        return json(res,200,{install,stats,readiness:readiness()},requestId);
      }
      const body=await readJsonBody(req,{limit:32768});
      const current=installDto(db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get());
      const options={...(current.options||{}),
        companyName:String(body.companyName||current.options?.companyName||'Example MSP').trim().slice(0,120),
        adminEmail:String(body.adminEmail||current.options?.adminEmail||user.email).trim().toLowerCase().slice(0,180),
        domain:String(body.domain||current.publicUrl||'http://127.0.0.1:4173').trim().replace(/\/+$/,''),
        assetBaseUrl:String(body.assetBaseUrl||current.options?.assetBaseUrl||body.domain||current.publicUrl||'').trim().replace(/\/+$/,''),
        mediaBaseUrl:String(body.mediaBaseUrl||current.options?.mediaBaseUrl||body.assetBaseUrl||current.options?.assetBaseUrl||body.domain||current.publicUrl||'').trim().replace(/\/+$/,''),
        databaseHost:String(body.databaseHost||'').trim().slice(0,180),
        databaseName:String(body.databaseName||'').trim().slice(0,180),
        databaseUser:String(body.databaseUser||'').trim().slice(0,180),
        smtpHost:String(body.smtpHost||'').trim().slice(0,180),
        smtpFrom:String(body.smtpFrom||'').trim().slice(0,180),
        apiBaseUrl:String(body.apiBaseUrl||'').trim().replace(/\/+$/,'').slice(0,220),
        apiKeyLabel:String(body.apiKeyLabel||'').trim().slice(0,120),
        sessionHours:String(body.sessionHours||'12').replace(/[^0-9]/g,'').slice(0,3)||'12',
        requireMfa:body.requireMfa?'on':'',
        allowSelfProfile:body.allowSelfProfile?'on':'',
        backupPath:String(body.backupPath||'').trim().slice(0,260)
      };
      if(!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(options.domain))return json(res,400,{error:{code:'DOMAIN_INVALID',message:'Enter a valid public URL.'}},requestId);
      if(options.assetBaseUrl&&!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(options.assetBaseUrl))return json(res,400,{error:{code:'ASSET_BASE_INVALID',message:'Enter a valid asset base URL.'}},requestId);
      if(options.mediaBaseUrl&&!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(options.mediaBaseUrl))return json(res,400,{error:{code:'MEDIA_BASE_INVALID',message:'Enter a valid media base URL.'}},requestId);
      if(options.adminEmail&&!validEmail(options.adminEmail))return json(res,400,{error:{code:'ADMIN_EMAIL_INVALID',message:'Enter a valid admin email.'}},requestId);
      const databaseProvider=canonicalDb(body.databaseProvider||current.databaseProvider), deploymentTarget=canonicalTarget(body.deploymentTarget||current.deploymentTarget);
      db.prepare(`INSERT INTO install_profiles(id,profile_name,database_provider,deployment_target,public_url,options_json,updated_at)
        VALUES ('signature-install',?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(id) DO UPDATE SET profile_name=excluded.profile_name,database_provider=excluded.database_provider,deployment_target=excluded.deployment_target,public_url=excluded.public_url,options_json=excluded.options_json,updated_at=excluded.updated_at`).run(`${options.companyName} signature portal`,databaseProvider,deploymentTarget,options.domain,JSON.stringify(options));
      return json(res,200,{install:installDto(db.prepare(`SELECT * FROM install_profiles WHERE id='signature-install'`).get())},requestId);
    }
    if(url.pathname==='/api/signature/users'&&req.method==='GET'){const users=user.role==='admin'?db.prepare('SELECT * FROM signature_users ORDER BY display_name').all():db.prepare('SELECT * FROM signature_users WHERE id=?').all(user.id);return json(res,200,{users:users.map(userDto)},requestId)}
    if(url.pathname==='/api/signature/users'&&req.method==='POST'){
      requireAdmin(user);
      const body=await readJsonBody(req);
      const email=String(body.email||body.signature?.email||'').trim().toLowerCase();
      const displayName=String(body.displayName||body.signature?.fullName||'').trim();
      const password=String(body.password||'');
      if(!displayName)return json(res,400,{error:{code:'USER_NAME_REQUIRED',message:'Enter the employee full name.'}},requestId);
      if(!validEmail(email))return json(res,400,{error:{code:'USER_EMAIL_INVALID',message:'Enter a valid employee email.'}},requestId);
      if(password.length<12)return json(res,400,{error:{code:'PASSWORD_WEAK',message:'User password must be at least 12 characters.'}},requestId);
      if(db.prepare('SELECT id FROM signature_users WHERE lower(email)=lower(?)').get(email))return json(res,409,{error:{code:'USER_EMAIL_EXISTS',message:'A user with that email already exists.'}},requestId);
      const profile={fullName:displayName,email,jobTitle:String(body.signature?.jobTitle||'').trim(),phone:String(body.signature?.phone||'').trim(),mobile:String(body.signature?.mobile||'').trim(),photoUrl:String(body.signature?.photoUrl||'').trim()};
      const sig={...defaultSignature,...(body.signature||{}),...profile,profile,fullName:displayName,email};
      const row={id:randomUUID(),email,displayName,role:canonicalRole(body.role),status:canonicalStatus(body.status),passwordHash:hashPassword(password),signatureJson:JSON.stringify(sig)};
      db.prepare('INSERT INTO signature_users(id,email,password_hash,display_name,role,status,signature_json) VALUES (@id,@email,@passwordHash,@displayName,@role,@status,@signatureJson)').run(row);
      const created=db.prepare('SELECT * FROM signature_users WHERE id=?').get(row.id);
      return json(res,201,{user:userDto(created)},requestId);
    }
    const userMatch=url.pathname.match(/^\/api\/signature\/users\/([^/]+)$/);
    if(userMatch){const id=decodeURIComponent(userMatch[1]);if(req.method==='PUT'){const body=await readJsonBody(req);if(user.id!==id)requireAdmin(user);else requireEditor(user);const existing=db.prepare('SELECT * FROM signature_users WHERE id=?').get(id);if(!existing)return json(res,404,{error:{code:'NOT_FOUND',message:'User not found.'}},requestId);const sig={...JSON.parse(existing.signature_json||'{}'),...(body.signature||{})};const adminEdit=user.role==='admin';const nextRole=adminEdit?canonicalRole(body.role||existing.role):existing.role;const nextStatus=adminEdit?canonicalStatus(body.status||existing.status):existing.status;const nextEmail=String(body.email||existing.email).trim().toLowerCase();const nextName=String(body.displayName||sig.fullName||existing.display_name).trim();if(!nextName)return json(res,400,{error:{code:'USER_NAME_REQUIRED',message:'Enter the employee full name.'}},requestId);if(!validEmail(nextEmail))return json(res,400,{error:{code:'USER_EMAIL_INVALID',message:'Enter a valid employee email.'}},requestId);if(db.prepare('SELECT id FROM signature_users WHERE lower(email)=lower(?) AND id<>?').get(nextEmail,id))return json(res,409,{error:{code:'USER_EMAIL_EXISTS',message:'A user with that email already exists.'}},requestId);if(id===user.id&&(nextStatus!=='active'||nextRole!=='admin'))return json(res,400,{error:{code:'CANNOT_DEMOTE_SELF',message:'You cannot demote or disable your own admin account.'}},requestId);if(adminEdit&&body.password&&String(body.password).length<12)return json(res,400,{error:{code:'PASSWORD_WEAK',message:'User password must be at least 12 characters.'}},requestId);const passwordSql=adminEdit&&body.password?`,password_hash=?`:'';const params=[nextEmail,nextName,nextRole,nextStatus,JSON.stringify(sig)];if(passwordSql)params.push(hashPassword(body.password));params.push(id);db.prepare(`UPDATE signature_users SET email=?,display_name=?,role=?,status=?,signature_json=?${passwordSql},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(...params);if(nextStatus!=='active')db.prepare('DELETE FROM signature_sessions WHERE user_id=?').run(id);return json(res,200,{user:userDto(db.prepare('SELECT * FROM signature_users WHERE id=?').get(id))},requestId)}if(req.method==='DELETE'){requireAdmin(user);if(user.id===id)return json(res,400,{error:{code:'CANNOT_DELETE_SELF',message:'You cannot delete your own login.'}},requestId);db.prepare('DELETE FROM signature_users WHERE id=?').run(id);return json(res,200,{ok:true},requestId)}}
    if(url.pathname==='/api/signature/templates'&&req.method==='GET')return json(res,200,{templates:db.prepare('SELECT * FROM signature_templates ORDER BY name').all().map(templateDto)},requestId);
    if(url.pathname==='/api/signature/templates'&&req.method==='POST'){requireEditor(user);const body=await readJsonBody(req);const name=String(body.name||'').trim().slice(0,80);if(!name)return json(res,400,{error:{code:'TEMPLATE_NAME_REQUIRED',message:'Enter a template name.'}},requestId);const id=randomUUID();db.prepare('INSERT INTO signature_templates(id,name,template_json,created_by) VALUES (?,?,?,?)').run(id,name,JSON.stringify(body.patch||{}),user.id);return json(res,201,{template:templateDto(db.prepare('SELECT * FROM signature_templates WHERE id=?').get(id))},requestId)}
    const templateMatch=url.pathname.match(/^\/api\/signature\/templates\/([^/]+)$/);
    if(templateMatch&&req.method==='DELETE'){
      requireEditor(user);
      const id=decodeURIComponent(templateMatch[1]);
      const existing=db.prepare('SELECT id FROM signature_templates WHERE id=?').get(id);
      if(!existing)return json(res,404,{error:{code:'NOT_FOUND',message:'Template not found.'}},requestId);
      db.prepare('DELETE FROM signature_templates WHERE id=?').run(id);
      return json(res,200,{ok:true},requestId);
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId);
  };
}
function seed(db,signature={}){
  if(!db.prepare('SELECT COUNT(*) AS count FROM signature_templates').get().count)for(const [name,patch] of defaultTemplates)db.prepare('INSERT INTO signature_templates(id,name,template_json) VALUES (?,?,?)').run(randomUUID(),name,JSON.stringify(patch));
}
module.exports={createSignaturePortal};
