'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {URL}=require('node:url');
const {createSignaturePortal}=require('./signature-portal.cjs');

const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};

function securityHeaders(){return{'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cross-Origin-Opener-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://alcdn.msauth.net; img-src 'self' data:; connect-src 'self' https://login.microsoftonline.com"}}
function json(res,status,payload,requestId,headers={}){const body=Buffer.from(JSON.stringify(payload));res.writeHead(status,{...securityHeaders(),...headers,'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store','X-Request-Id':requestId});res.end(body)}
function publicSession(session){const{authorizedCompanyIds,...safe}=session;return{id:safe.user.id,name:safe.user.name,email:safe.user.email,role:safe.role,platformRole:safe.platformRole||null,membershipRole:safe.membershipRole||null,companyId:safe.companyId,company:safe.company,tenant:safe.tenant,availableCompanies:safe.availableCompanies,permissions:safe.permissions,entitlements:safe.entitlements,scope:safe.scope,user:safe.user}}
function clientIp(req,trustProxy){if(trustProxy&&req.headers['x-forwarded-for'])return String(req.headers['x-forwarded-for']).split(',')[0].trim();return req.socket.remoteAddress||null}
function runtimeConfig(config){return`window.NORTHSTAR_AUTH=${JSON.stringify({clientId:config.auth.clientId,tenantId:config.auth.tenantId,redirectUri:config.auth.redirectUri,apiScope:config.auth.apiScope,clientAdminRoles:['ClientPortal.Admin','ClientPortal.Owner'],mspAdminRoles:['MSPPortal.Admin','MSPPortal.Owner'],demoMode:config.demoMode})};`}
function createRateLimiter({windowMs=60000,limit=300}={}){const buckets=new Map();return function check(key){const now=Date.now();let bucket=buckets.get(key);if(!bucket||now-bucket.startedAt>=windowMs){bucket={startedAt:now,count:0};buckets.set(key,bucket)}bucket.count++;if(buckets.size>5000)for(const[k,v]of buckets)if(now-v.startedAt>=windowMs)buckets.delete(k);return bucket.count<=limit}}
function readJsonBody(req,{limit=1048576}={}){
  return new Promise((resolve,reject)=>{
    let body='';req.setEncoding('utf8');
    req.on('data',chunk=>{body+=chunk;if(Buffer.byteLength(body)>limit){const error=new Error('Request body is too large.');error.status=413;error.code='PAYLOAD_TOO_LARGE';reject(error);req.destroy()}});
    req.on('end',()=>{if(!body)return resolve({});try{resolve(JSON.parse(body))}catch{const error=new Error('Invalid JSON request body.');error.status=400;error.code='INVALID_JSON';reject(error)}});
    req.on('error',reject);
  });
}

function createPortalHandler({config,repository,authenticate,connectWiseSync=null}){
  const root=fs.existsSync(path.join(config.staticRoot,'index.html'))?config.staticRoot:config.sourceRoot;
  const sourceMode=root===config.sourceRoot;
  const sourcePublicFiles=new Set(['index.html','app.js','auth.js','portal-api.js','portal-store.js','styles.css','management.css','settings.css','nav-sections.css','hierarchy.css','ops-settings.css','typography.css','interactions.css','enterprise.css','signature.html','signature.css','signature.js','admin.html','admin.css','admin.js','setup.html','setup.css','setup.js']);
  const signaturePortal=createSignaturePortal({db:repository.db,production:config.production,signature:config.signature,json,readJsonBody});
  const rateLimit=createRateLimiter();
  async function context(req){const principal=await authenticate(req);const session=repository.resolveSession(principal);return{principal,session}}
  function audit(req,requestId,session,event){repository.recordAudit({requestId,companyId:event.companyId||session?.companyId||null,actorUserId:session?.user?.id||null,actorEmail:session?.user?.email||event.actorEmail||null,actorRole:session?.platformRole||session?.membershipRole||session?.role||null,action:event.action,resourceType:event.resourceType||'request',resourceId:event.resourceId||null,outcome:event.outcome||'success',reasonCode:event.reasonCode||null,ipAddress:clientIp(req,config.trustProxy),userAgent:req.headers['user-agent'],metadata:event.metadata})}
  function serve(req,res,pathname,requestId){
    let relative;
    try{relative=decodeURIComponent(pathname)==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/, '')}catch{return json(res,400,{error:{code:'INVALID_PATH',message:'Invalid path.'}},requestId)}
    if(config.signatureOnly){
      if(relative==='index.html')relative='signature.html';
      const allowed=new Set(['signature.html','signature.css','signature.js','admin.html','admin.css','admin.js','setup.html','setup.css','setup.js','signature-it-banner.png']);
      if(!allowed.has(relative)&&!relative.startsWith('event-banners/'))return json(res,404,{error:{code:'SIGNATURE_ONLY_ROUTE_NOT_FOUND',message:'Route not available in signature-only mode.'}},requestId);
    }
    if(sourceMode&&!sourcePublicFiles.has(relative)&&!relative.startsWith('assets/')&&!fs.existsSync(path.join(config.sourceRoot,'public',relative))){
      if(path.extname(relative))return json(res,404,{error:{code:'STATIC_ASSET_NOT_FOUND',message:'Static asset not found.'}},requestId);
      relative='index.html';
    }
    let file=path.resolve(root,relative);
    if(sourceMode&&!fs.existsSync(file)&&fs.existsSync(path.join(config.sourceRoot,'public',relative)))file=path.join(config.sourceRoot,'public',relative);
    if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html'))return json(res,400,{error:{code:'INVALID_PATH',message:'Invalid path.'}},requestId);
    if(!sourceMode&&!fs.existsSync(file)&&sourcePublicFiles.has(relative)&&fs.existsSync(path.join(config.sourceRoot,relative)))file=path.join(config.sourceRoot,relative);
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){
      if(path.extname(relative))return json(res,404,{error:{code:'STATIC_ASSET_NOT_FOUND',message:'Static asset not found.'}},requestId);
      file=path.join(root,'index.html');
    }
    const stat=fs.statSync(file);const cacheControl=config.production&&path.extname(file)!=='.html'?'public, max-age=3600, immutable':'no-cache';res.writeHead(200,{...securityHeaders(),'Content-Type':contentTypes[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':cacheControl,'X-Request-Id':requestId});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res)
  }
  return async function handler(req,res){
    const requestId=randomUUID();const url=new URL(req.url||'/','http://portal.local');let principal=null,session=null;
    try{
      if(url.pathname.startsWith('/api/')&&!rateLimit(clientIp(req,config.trustProxy)||'unknown'))return json(res,429,{error:{code:'RATE_LIMITED',message:'Too many requests. Try again shortly.'}},requestId,{'Retry-After':'60'});
      if(url.pathname==='/auth-config.js'){
        if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, HEAD'});
        const payload=runtimeConfig(config);res.writeHead(200,{...securityHeaders(),'Content-Type':'application/javascript; charset=utf-8','Content-Length':Buffer.byteLength(payload),'Cache-Control':'no-store','X-Request-Id':requestId});return req.method==='HEAD'?res.end():res.end(payload)
      }
      if(url.pathname==='/api/health'){
        if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET'});
        repository.db.prepare('SELECT 1').get();const operations=repository.getOperationalHealth();const backupConfigured=Boolean(config.backup?.encryptionKey);const status=config.production&&(!backupConfigured||!operations.backup)?'degraded':'ok';return json(res,200,{status,service:'northstar-msp-portal',database:'ready',operations:{backupConfigured,lastBackupAt:operations.backup||null,lastRestoreVerificationAt:operations.restore_verification||null,lastRetentionAt:operations.retention||null},time:new Date().toISOString()},requestId)
      }
      if(url.pathname.startsWith('/api/signature/')){
        const handled=await signaturePortal(req,res,url,requestId);
        if(handled!==false)return handled;
      }
      if(config.signatureOnly&&url.pathname.startsWith('/api/'))return json(res,404,{error:{code:'SIGNATURE_ONLY_API_NOT_FOUND',message:'API route not available in signature-only mode.'}},requestId);
      if(url.pathname==='/api/session'){
        if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET'});
        ({principal,session}=await context(req));audit(req,requestId,session,{action:'session.validated',resourceType:'session'});return json(res,200,publicSession(session),requestId)
      }
      if(url.pathname==='/api/profile'){
        ({principal,session}=await context(req));
        if(req.method==='GET'){const profile=repository.getMyProfile(session);audit(req,requestId,session,{action:'profile.read',resourceType:'user_profile',resourceId:profile.id});return json(res,200,{profile},requestId)}
        if(req.method==='PATCH'){const body=await readJsonBody(req);const profile=repository.updateMyProfile(session,body);audit(req,requestId,session,{action:'profile.updated',resourceType:'user_profile',resourceId:profile.id,metadata:{fields:Object.keys(body).slice(0,20)}});return json(res,200,{profile},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, PATCH'});
      }
      if(url.pathname==='/api/companies'){
        ({principal,session}=await context(req));
        if(req.method==='GET'){const companies=repository.listCompanies(session);audit(req,requestId,session,{action:'companies.listed',resourceType:'company',metadata:{count:companies.length}});return json(res,200,{companies,scope:session.scope},requestId)}
        if(req.method==='POST'){const body=await readJsonBody(req);const company=repository.createCompany(session,body);audit(req,requestId,session,{action:'company.onboarded',resourceType:'company',resourceId:company.id,companyId:company.id,metadata:{name:company.name,status:company.status,planName:company.planName}});return json(res,201,{company},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, POST'});
      }
      const summaryMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/summary$/);
      if(summaryMatch){
        if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET'});
        ({principal,session}=await context(req));const companyId=decodeURIComponent(summaryMatch[1]);const summary=repository.getCompanySummary(session,companyId);audit(req,requestId,session,{action:'company.summary.read',resourceType:'company',resourceId:companyId,companyId});return json(res,200,summary,requestId)
      }
      const peopleMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/people$/);
      if(peopleMatch){
        ({principal,session}=await context(req));const companyId=decodeURIComponent(peopleMatch[1]);
        if(req.method==='GET'){const people=repository.listPeople(session,companyId);audit(req,requestId,session,{action:'company.people.read',resourceType:'person',companyId,metadata:{count:people.length}});return json(res,200,{people},requestId)}
        if(req.method==='POST'){const body=await readJsonBody(req);const person=repository.invitePerson(session,companyId,body);audit(req,requestId,session,{action:'company.person.invited',resourceType:'person',resourceId:person.id,companyId,metadata:{role:person.role,membershipStatus:person.membershipStatus}});return json(res,201,{person},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, POST'});
      }
      const personMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/people\/([^/]+)$/);
      if(personMatch){
        ({principal,session}=await context(req));const companyId=decodeURIComponent(personMatch[1]);const userId=decodeURIComponent(personMatch[2]);
        if(req.method==='PATCH'){const body=await readJsonBody(req);const person=repository.updatePerson(session,companyId,userId,body);audit(req,requestId,session,{action:'company.person.updated',resourceType:'person',resourceId:person.id,companyId,metadata:{role:person.role,membershipStatus:person.membershipStatus}});return json(res,200,{person},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'PATCH'});
      }
      const recordsMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/records$/);
      if(recordsMatch){
        ({principal,session}=await context(req));const companyId=decodeURIComponent(recordsMatch[1]);
        if(req.method==='GET'){const records=repository.listPortalRecords(session,companyId,{type:url.searchParams.get('type'),limit:url.searchParams.get('limit')});audit(req,requestId,session,{action:'portal.records.listed',resourceType:'portal_record',companyId,metadata:{count:records.length,type:url.searchParams.get('type')}});return json(res,200,{records},requestId)}
        if(req.method==='POST'){const body=await readJsonBody(req);const record=repository.upsertPortalRecord(session,companyId,body);audit(req,requestId,session,{action:'portal.record.saved',resourceType:'portal_record',resourceId:record.id,companyId,metadata:{type:record.type,title:record.title}});return json(res,201,{record},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, POST'});
      }
      const recordMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/records\/([^/]+)$/);
      if(recordMatch){
        ({principal,session}=await context(req));const companyId=decodeURIComponent(recordMatch[1]);const recordId=decodeURIComponent(recordMatch[2]);
        if(req.method==='PATCH'){const body=await readJsonBody(req);const record=repository.updatePortalRecord(session,companyId,recordId,body);audit(req,requestId,session,{action:'portal.record.updated',resourceType:'portal_record',resourceId:record.id,companyId,metadata:{type:record.type,title:record.title,status:record.status,priority:record.priority}});return json(res,200,{record},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'PATCH'});
      }
      const approvalsMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/approvals$/);
      if(approvalsMatch){
        ({principal,session}=await context(req));const companyId=decodeURIComponent(approvalsMatch[1]);
        if(req.method==='GET'){const approvals=repository.listApprovalRequests(session,companyId,{status:url.searchParams.get('status')||'pending'});audit(req,requestId,session,{action:'approvals.listed',resourceType:'approval',companyId,metadata:{count:approvals.length}});return json(res,200,{approvals},requestId)}
        if(req.method==='POST'){const body=await readJsonBody(req);const approval=repository.createApprovalRequest(session,companyId,body);audit(req,requestId,session,{action:'approval.created',resourceType:'approval',resourceId:approval.id,companyId,metadata:{kind:approval.kind,title:approval.title}});return json(res,201,{approval},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, POST'});
      }
      const approvalMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/approvals\/([^/]+)$/);
      if(approvalMatch){
        ({principal,session}=await context(req));const companyId=decodeURIComponent(approvalMatch[1]);const approvalId=decodeURIComponent(approvalMatch[2]);
        if(req.method==='PATCH'){const body=await readJsonBody(req);const approval=repository.decideApprovalRequest(session,companyId,approvalId,body);audit(req,requestId,session,{action:`approval.${approval.status}`,resourceType:'approval',resourceId:approval.id,companyId,metadata:{kind:approval.kind,reason:approval.decisionReason}});return json(res,200,{approval},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'PATCH'});
      }
      const companyMatch=url.pathname.match(/^\/api\/companies\/([^/]+)$/);
      if(companyMatch){
        ({principal,session}=await context(req));const companyId=decodeURIComponent(companyMatch[1]);
        if(req.method==='GET'){const company=repository.getCompany(session,companyId);audit(req,requestId,session,{action:'company.read',resourceType:'company',resourceId:companyId,companyId});return json(res,200,{company},requestId)}
        if(req.method==='PATCH'){const body=await readJsonBody(req);const company=repository.updateCompany(session,companyId,body);audit(req,requestId,session,{action:'company.updated',resourceType:'company',resourceId:companyId,companyId,metadata:{fields:Object.keys(body).slice(0,30)}});return json(res,200,{company},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, PATCH'});
      }
      if(url.pathname==='/api/internal/integrations/connectwise/sync'){
        ({principal,session}=await context(req));
        if(!connectWiseSync)return json(res,503,{error:{code:'CONNECTWISE_UNAVAILABLE',message:'ConnectWise synchronization is not available.'}},requestId);
        if(req.method==='GET'){repository.assertPermission(session,'integrations.read');const runs=connectWiseSync.runs(session,url.searchParams.get('limit'));audit(req,requestId,session,{action:'connectwise.sync_runs.listed',resourceType:'integration_sync',metadata:{count:runs.length}});return json(res,200,{configured:connectWiseSync.configured(),runs},requestId)}
        if(req.method==='POST'){repository.assertPermission(session,'integrations.manage');const result=await connectWiseSync.sync(session);audit(req,requestId,session,{action:'connectwise.sync.completed',resourceType:'integration_sync',resourceId:result.run.id,metadata:{companiesSeen:result.run.companiesSeen,companiesCreated:result.run.companiesCreated,ticketsSeen:result.run.ticketsSeen,ticketsUpserted:result.run.ticketsUpserted,ticketsSkipped:result.run.ticketsSkipped,quota:result.quota}});return json(res,200,result,requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, POST'});
      }
      if(url.pathname==='/api/internal/integrations'){
        ({principal,session}=await context(req));const companyId=url.searchParams.get('companyId');
        if(req.method==='GET'){const integrations=repository.listIntegrations(session,companyId);audit(req,requestId,session,{action:'integrations.listed',resourceType:'integration',metadata:{count:integrations.length,companyId}});return json(res,200,{integrations},requestId)}
        if(req.method==='PUT'){const body=await readJsonBody(req);const integration=repository.saveIntegration(session,body);audit(req,requestId,session,{action:'integration.configured',resourceType:'integration',resourceId:integration.id,metadata:{provider:integration.provider,clientVisible:integration.clientVisible}});return json(res,200,{integration},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, PUT'});
      }
      if(url.pathname==='/api/internal/api-keys'){
        ({principal,session}=await context(req));
        if(req.method==='GET'){const apiKeys=repository.listApiKeys(session);audit(req,requestId,session,{action:'api_keys.listed',resourceType:'api_key',metadata:{count:apiKeys.length}});return json(res,200,{apiKeys},requestId)}
        if(req.method==='POST'){const body=await readJsonBody(req);const apiKey=repository.createApiKey(session,body);audit(req,requestId,session,{action:'api_key.created',resourceType:'api_key',resourceId:apiKey.id,metadata:{name:apiKey.name,scopes:apiKey.scopes,expiresAt:apiKey.expiresAt}});return json(res,201,{apiKey},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, POST'});
      }
      const apiKeyMatch=url.pathname.match(/^\/api\/internal\/api-keys\/([^/]+)$/);
      if(apiKeyMatch){
        ({principal,session}=await context(req));const keyId=decodeURIComponent(apiKeyMatch[1]);
        if(req.method==='DELETE'){const apiKey=repository.revokeApiKey(session,keyId);audit(req,requestId,session,{action:'api_key.revoked',resourceType:'api_key',resourceId:keyId});return json(res,200,{apiKey},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'DELETE'});
      }
      if(url.pathname==='/api/internal/audit'){
        if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET'});
        ({principal,session}=await context(req));const companyId=url.searchParams.get('companyId');const events=repository.listAuditEvents(session,{companyId,limit:url.searchParams.get('limit')});audit(req,requestId,session,{action:'audit.listed',resourceType:'audit',metadata:{count:events.length,companyId}});return json(res,200,{events},requestId)
      }
      if(url.pathname==='/api/internal/settings'){
        ({principal,session}=await context(req));
        if(req.method==='GET'){const settings=repository.listPortalSettings(session,url.searchParams.get('companyId'));audit(req,requestId,session,{action:'settings.listed',resourceType:'setting',metadata:{count:settings.length}});return json(res,200,{settings},requestId)}
        if(req.method==='PUT'){const body=await readJsonBody(req);const setting=repository.savePortalSetting(session,body);audit(req,requestId,session,{action:'setting.saved',resourceType:'setting',resourceId:setting.key,companyId:setting.companyId,metadata:{scope:setting.scope}});return json(res,200,{setting},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, PUT'});
      }
      if(url.pathname==='/api/internal/install-profile'){
        ({principal,session}=await context(req));
        if(req.method==='GET'){const installProfile=repository.getInstallProfile(session);audit(req,requestId,session,{action:'install.profile.read',resourceType:'install_profile'});return json(res,200,{installProfile},requestId)}
        if(req.method==='PUT'){const body=await readJsonBody(req);const installProfile=repository.saveInstallProfile(session,body);audit(req,requestId,session,{action:'install.profile.saved',resourceType:'install_profile',resourceId:installProfile.id,metadata:{databaseProvider:installProfile.databaseProvider,deploymentTarget:installProfile.deploymentTarget,publicUrl:installProfile.publicUrl}});return json(res,200,{installProfile},requestId)}
        return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, PUT'});
      }
      if(url.pathname.startsWith('/api/'))return json(res,404,{error:{code:'API_ROUTE_NOT_FOUND',message:'API route not found.'}},requestId);
      if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},requestId,{Allow:'GET, HEAD'});
      return serve(req,res,url.pathname,requestId);
    }catch(error){
      const status=Number(error.status)||500;const code=error.code||'INTERNAL_ERROR';
      try{audit(req,requestId,session,{action:'request.denied',resourceType:'route',outcome:status>=500?'failure':'denied',reasonCode:code,actorEmail:principal?.email,metadata:{path:url.pathname,method:req.method}})}catch(auditError){console.error('Audit write failed',auditError)}
      if(status>=500)console.error(JSON.stringify({requestId,error:error.message,code,path:url.pathname}));
      return json(res,status,{error:{code,message:error.expose||status<500?error.message:'The request could not be completed.',requestId}},requestId)
    }
  };
}

module.exports={createPortalHandler,securityHeaders,publicSession};
