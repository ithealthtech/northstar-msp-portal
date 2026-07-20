'use strict';
const {randomUUID,randomBytes,createHash}=require('node:crypto');

class PortalError extends Error{
  constructor(status,code,message){super(message);this.status=status;this.code=code;this.expose=true}
}

const permissionSets={
  user:['portal.read','company.read','tickets.read','tickets.create','documents.read','remote.request'],
  admin:['portal.read','company.read','company.manage','people.read','people.manage','tickets.read','tickets.create','billing.read','policies.manage','documents.read','remote.request'],
  msp_operator:['portal.read','portfolio.read','company.read','tickets.read','tickets.create','audit.read'],
  msp_admin:['portal.read','portfolio.read','company.read','company.manage','people.read','people.manage','tickets.read','tickets.create','integrations.read','integrations.manage','audit.read','policies.manage'],
  msp_owner:['portal.read','portfolio.read','company.read','company.manage','people.read','people.manage','tickets.read','tickets.create','integrations.read','integrations.manage','audit.read','policies.manage','platform.manage']
};

function safeJson(value,fallback={}){try{return JSON.parse(value)}catch{return fallback}}
function initials(name){return String(name||'').split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join('').toUpperCase()||'CO'}
function companyDto(row){const settings=safeJson(row.settings_json);return{id:row.id,externalKey:row.external_key,slug:row.slug,name:row.name,legalName:row.legal_name,status:row.status,planName:row.plan_name,primaryDomain:row.primary_domain,timezone:row.timezone,initials:initials(row.name),profile:settings.profile||{},configuration:settings.configuration||{}}}
function normalizeEmail(value){return String(value||'').trim().toLowerCase()}
function normalizeMembershipRole(value){
  const role=String(value||'client_user').toLowerCase().replace(/[^a-z]+/g,'_').replace(/^_|_$/g,'');
  if(['client_owner','owner'].includes(role))return'client_owner';
  if(['client_admin','company_administrator','billing_administrator','administrator','admin'].includes(role))return'client_admin';
  return'client_user';
}
function personDto(row){return{id:row.id,membershipId:row.membership_id,name:row.display_name,email:row.email,status:row.status,membershipStatus:row.membership_status,role:row.role,phone:row.phone||'',department:row.department||'',title:row.job_title||'',location:row.location||'',timezone:row.timezone||'',manager:row.manager_name||'',preferredContact:row.preferred_contact||'',profile:safeJson(row.profile_json),lastLoginAt:row.last_login_at,createdAt:row.created_at,updatedAt:row.updated_at}}
function canonicalDatabaseProvider(value){
  const normalized=String(value||'sqlite').toLowerCase().replace(/[^a-z0-9]+/g,'');
  if(['postgres','postgresql','pg'].includes(normalized))return'postgres';
  if(['sqlserver','mssql','microsoftsqlserver'].includes(normalized))return'sqlserver';
  return'sqlite';
}
function canonicalDeploymentTarget(value){
  const normalized=String(value||'node').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(normalized.includes('iis')||normalized.includes('reverse-proxy'))return'iis-reverse-proxy';
  if(normalized.includes('windows'))return'windows-service';
  if(normalized.includes('docker')||normalized.includes('container'))return'docker';
  return'node';
}
function redactMetadata(value){
  if(!value||typeof value!=='object')return{};
  const output={};
  for(const [key,item] of Object.entries(value).slice(0,30)){
    if(/token|password|secret|authorization|cookie|credential/i.test(key)){output[key]='[REDACTED]';continue}
    if(item&&typeof item==='object')output[key]=redactMetadata(item);
    else output[key]=String(item).slice(0,500);
  }
  return output;
}

class PortalRepository{
  constructor(db){this.db=db}

  getOperationalHealth(){
    const rows=this.db.prepare("SELECT event_type,MAX(created_at) AS last_succeeded_at FROM operational_events WHERE status='succeeded' GROUP BY event_type").all();
    return Object.fromEntries(rows.map(row=>[row.event_type,row.last_succeeded_at]));
  }

  getSetupStatus(){
    const count=this.db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    return{initialized:Number(count)>0};
  }

  initializeFirstRunOwner(input,principal){
    if(this.getSetupStatus().initialized)throw new PortalError(409,'SETUP_COMPLETE','Initial setup has already been completed.');
    const name=String(input.ownerName||'').trim().replace(/\s+/g,' ').slice(0,200);
    const email=normalizeEmail(input.ownerEmail);
    const companyName=String(input.companyName||'').trim().replace(/\s+/g,' ').slice(0,200);
    if(name.length<2)throw new PortalError(400,'OWNER_NAME_REQUIRED','Enter the MSP owner name.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new PortalError(400,'OWNER_EMAIL_INVALID','Enter a valid MSP owner email address.');
    if(companyName.length<2)throw new PortalError(400,'MSP_NAME_REQUIRED','Enter your MSP company name.');
    const id=`usr_${randomUUID()}`;const now=new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE;');
    try{
      if(this.getSetupStatus().initialized)throw new PortalError(409,'SETUP_COMPLETE','Initial setup has already been completed.');
      this.db.prepare(`INSERT INTO users (id,entra_tenant_id,entra_object_id,email,display_name,status,platform_role,platform_scope) VALUES (?,?,?,?,?,'active','msp_owner','all')`).run(id,principal.tenantId,principal.id,email,name);
      const product=String(input.productName||'').trim().slice(0,120)||'MSP Client Portal';
      this.db.prepare(`INSERT INTO portal_settings (setting_key,setting_value_json,scope,updated_by_user_id,updated_at) VALUES (?,?,?,?,?)`).run('msp:global:organization',JSON.stringify({companyName,product,phone:String(input.supportPhone||'').trim().slice(0,80),setupCompletedAt:now}), 'msp',id,now);
      this.db.exec('COMMIT;');
      return{id,name,email,companyName,product};
    }catch(error){this.db.exec('ROLLBACK;');throw error}
  }

  findProvisionedUser(principal){
    return this.db.prepare(`SELECT * FROM users WHERE entra_tenant_id=? AND entra_object_id=?`).get(principal.tenantId,principal.id);
  }

  resolveSession(principal){
    const user=this.findProvisionedUser(principal);
    if(!user)throw new PortalError(403,'USER_NOT_PROVISIONED','This identity has not been provisioned for the portal.');
    if(user.status!=='active')throw new PortalError(403,'USER_DISABLED','This portal identity is not active.');
    const now=new Date().toISOString();
    this.db.prepare(`UPDATE users SET entra_tenant_id=COALESCE(entra_tenant_id,?),entra_object_id=COALESCE(entra_object_id,?),email=?,display_name=?,last_login_at=?,updated_at=? WHERE id=?`).run(principal.tenantId,principal.id,principal.email||user.email,principal.name||user.display_name,now,now,user.id);
    const baseUser={id:user.id,entraObjectId:principal.id,name:principal.name||user.display_name,email:principal.email||user.email,status:user.status};
    if(principal.role==='msp')return this.resolveMspSession(baseUser,user,principal);
    return this.resolveClientSession(baseUser,user,principal);
  }

  resolveMspSession(baseUser,user,principal){
    if(user.platform_role==='none')throw new PortalError(403,'PLATFORM_MEMBERSHIP_REQUIRED','An active MSP platform assignment is required.');
    let platformRole=user.platform_role;
    if(platformRole==='msp_owner'&&principal.appRole!=='MSPPortal.Owner')platformRole='msp_admin';
    const allCompanies=user.platform_scope==='all'||platformRole==='msp_owner';
    const companies=allCompanies
      ?this.db.prepare(`SELECT * FROM companies WHERE status IN ('active','onboarding') ORDER BY name`).all()
      :this.db.prepare(`SELECT c.* FROM companies c JOIN msp_company_scopes s ON s.company_id=c.id WHERE s.user_id=? AND c.status IN ('active','onboarding') ORDER BY c.name`).all(user.id);
    const companyList=companies.map(companyDto);
    return{user:baseUser,role:'msp',platformRole,companyId:null,company:null,tenant:null,availableCompanies:companyList,permissions:permissionSets[platformRole]||[],entitlements:[],scope:{kind:allCompanies?'portfolio':'assigned',label:allCompanies?'All managed clients':'Assigned clients',clientCount:companyList.length},authorizedCompanyIds:companyList.map(company=>company.id)};
  }

  resolveClientSession(baseUser,user,principal){
    const memberships=this.db.prepare(`SELECT m.id AS membership_id,m.role AS membership_role,m.is_default,c.* FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=? AND m.status='active' AND c.status IN ('active','onboarding') ORDER BY m.is_default DESC,c.name`).all(user.id);
    if(!memberships.length)throw new PortalError(403,'TENANT_MEMBERSHIP_REQUIRED','An active client company membership is required.');
    let selected;
    if(principal.companyId)selected=memberships.find(row=>[row.id,row.external_key,row.slug].includes(String(principal.companyId)));
    else selected=memberships.find(row=>row.is_default===1)||(memberships.length===1?memberships[0]:null);
    if(!selected)throw new PortalError(principal.companyId?403:409,principal.companyId?'TENANT_MEMBERSHIP_REQUIRED':'TENANT_SELECTION_REQUIRED',principal.companyId?'The requested company is not assigned to this identity.':'A company selection is required.');
    const privileged=['client_admin','client_owner'].includes(selected.membership_role)&&principal.role==='admin';
    const role=privileged?'admin':'user';
    const company=companyDto(selected);
    const entitlements=this.db.prepare(`SELECT feature_key FROM feature_entitlements WHERE company_id=? AND enabled=1 ORDER BY feature_key`).all(company.id).map(row=>row.feature_key);
    return{user:baseUser,role,membershipRole:selected.membership_role,companyId:company.id,company,tenant:company,availableCompanies:memberships.map(companyDto),permissions:permissionSets[role],entitlements,scope:{kind:'company',label:company.name,clientCount:1},authorizedCompanyIds:[company.id]};
  }

  assertPermission(session,permission){if(!session.permissions.includes(permission))throw new PortalError(403,'PERMISSION_DENIED','Your portal role does not permit this operation.')}
  assertCompanyAccess(session,companyId){if(!session.authorizedCompanyIds.includes(companyId))throw new PortalError(404,'RESOURCE_NOT_FOUND','The requested resource was not found.')}

  getMyProfile(session){
    this.assertPermission(session,'portal.read');
    const row=this.db.prepare('SELECT * FROM users WHERE id=?').get(session.user.id);
    if(!row)throw new PortalError(404,'RESOURCE_NOT_FOUND','The user profile was not found.');
    const profile=safeJson(row.profile_json);
    return{id:row.id,name:profile.displayName||row.display_name,email:profile.contactEmail||row.email,identityEmail:row.email,phone:row.phone||'',mobile:profile.mobile||'',department:row.department||'',title:row.job_title||'',location:row.location||'',timezone:row.timezone||'',manager:row.manager_name||'',preferredContact:row.preferred_contact||'',digest:profile.digest||'',status:row.status,lastLoginAt:row.last_login_at,updatedAt:row.updated_at};
  }

  updateMyProfile(session,patch){
    this.assertPermission(session,'portal.read');
    const existing=this.db.prepare('SELECT * FROM users WHERE id=?').get(session.user.id);
    if(!existing)throw new PortalError(404,'RESOURCE_NOT_FOUND','The user profile was not found.');
    const text=(value,fallback,max=200)=>value===undefined?fallback:String(value).trim().slice(0,max);
    const profile={...safeJson(existing.profile_json),displayName:text(patch.name,safeJson(existing.profile_json).displayName||existing.display_name),contactEmail:text(patch.email,safeJson(existing.profile_json).contactEmail||existing.email),mobile:text(patch.mobile,safeJson(existing.profile_json).mobile||''),digest:text(patch.digest,safeJson(existing.profile_json).digest||'')};
    if(profile.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contactEmail))throw new PortalError(400,'PROFILE_EMAIL_INVALID','A valid profile email address is required.');
    if(!profile.displayName)throw new PortalError(400,'PROFILE_NAME_REQUIRED','A profile name is required.');
    const now=new Date().toISOString();
    this.db.prepare(`UPDATE users SET phone=?,department=?,job_title=?,location=?,timezone=?,manager_name=?,preferred_contact=?,profile_json=?,updated_at=? WHERE id=?`).run(text(patch.phone,existing.phone),text(patch.department,existing.department),text(patch.title,existing.job_title),text(patch.location,existing.location),text(patch.timezone,existing.timezone),text(patch.manager,existing.manager_name),text(patch.preferredContact,existing.preferred_contact),JSON.stringify(profile),now,existing.id);
    return this.getMyProfile(session);
  }

  listCompanies(session){
    this.assertPermission(session,session.role==='msp'?'portfolio.read':'company.read');
    const ids=session.authorizedCompanyIds;if(!ids.length)return[];
    const placeholders=ids.map(()=>'?').join(',');
    const rows=this.db.prepare(`SELECT c.*,s.health_score,s.security_score,s.open_tickets,s.managed_users,s.managed_devices,s.monthly_recurring_revenue_cents,s.sla_attainment,s.captured_at FROM companies c LEFT JOIN company_snapshots s ON s.company_id=c.id WHERE c.id IN (${placeholders}) ORDER BY c.name`).all(...ids);
    return rows.map(row=>({...companyDto(row),summary:{healthScore:row.health_score,securityScore:row.security_score,openTickets:row.open_tickets,managedUsers:row.managed_users,managedDevices:row.managed_devices,monthlyRecurringRevenueCents:row.monthly_recurring_revenue_cents,slaAttainment:row.sla_attainment,capturedAt:row.captured_at}}));
  }

  createCompany(session,input){
    if(session.role!=='msp'||!session.permissions.includes('company.manage'))throw new PortalError(403,'PERMISSION_DENIED','Only MSP administrators can onboard a client company.');
    const name=String(input.name||'').trim().replace(/\s+/g,' ');
    if(name.length<2)throw new PortalError(400,'COMPANY_NAME_REQUIRED','A company name is required.');
    const text=(value,max=250)=>String(value||'').trim().slice(0,max);
    const users=Math.max(1,Math.min(1000000,Math.round(Number(input.users)||1)));
    const monthlyRecurringRevenueCents=Math.max(0,Math.min(100000000000,Math.round((Number(input.mrr)||0)*100)));
    const baseSlug=(text(input.slug||name,100).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'client').slice(0,80);
    let slug=baseSlug;let suffix=2;
    while(this.db.prepare('SELECT 1 FROM companies WHERE slug=?').get(slug))slug=`${baseSlug.slice(0,75)}-${suffix++}`;
    const id=`cmp_${randomUUID()}`;const now=new Date().toISOString();
    const profile={address:text(input.address||input.city,500),primaryLocation:text(input.city,250),phone:text(input.phone,100),website:text(input.website,500),industry:text(input.industry,250),employees:users,billingEmail:text(input.billingEmail,250),onboarding:{createdAt:now,createdBy:session.user.id,status:'pending'}};
    const settings={profile,configuration:{onboarding:true,serviceBaseline:'pending'}};
    const features=['overview','support','remote','knowledge','services','security','messages','documents','metrics','billing','company','passwords','restrictions','team'];
    this.db.exec('BEGIN IMMEDIATE;');
    try{
      this.db.prepare(`INSERT INTO companies(id,external_key,slug,name,legal_name,status,plan_name,primary_domain,timezone,settings_json,created_at,updated_at) VALUES (?,?,?,?,?,'onboarding',?,?,?,?,?,?)`).run(id,`portal-${slug}`,slug,name,text(input.legalName||name,250)||name,text(input.planName||'Managed Complete',250)||'Managed Complete',text(input.primaryDomain,255)||null,text(input.timezone||'America/New_York',100)||'America/New_York',JSON.stringify(settings),now,now);
      this.db.prepare(`INSERT INTO company_snapshots(company_id,health_score,security_score,open_tickets,managed_users,managed_devices,monthly_recurring_revenue_cents,sla_attainment,snapshot_json,captured_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,90,90,0,users,0,monthlyRecurringRevenueCents,100,JSON.stringify({source:'portal-onboarding',lifecycle:'onboarding'}),now);
      const entitlement=this.db.prepare('INSERT INTO feature_entitlements(company_id,feature_key,enabled) VALUES (?,?,1)');for(const key of features)entitlement.run(id,key);
      if(session.platformRole!=='msp_owner')this.db.prepare('INSERT INTO msp_company_scopes(user_id,company_id) VALUES (?,?)').run(session.user.id,id);
      const adminName=text(input.adminName,200);const adminEmail=normalizeEmail(input.adminEmail);
      if(adminName&&adminEmail){
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail))throw new PortalError(400,'PERSON_EMAIL_INVALID','A valid initial administrator email is required.');
        let user=this.db.prepare('SELECT * FROM users WHERE lower(email)=?').get(adminEmail);if(user&&this.db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND company_id=?').get(user.id,id))throw new PortalError(409,'PERSON_ALREADY_ASSIGNED','The initial administrator already has access to this company.');
        const userId=user?.id||`usr_${randomUUID()}`;
        if(user)this.db.prepare(`UPDATE users SET display_name=?,updated_at=? WHERE id=?`).run(adminName,now,userId);
        else this.db.prepare(`INSERT INTO users(id,email,display_name,status,platform_role,platform_scope,profile_json,created_at,updated_at) VALUES (?,?,?,'invited','none','assigned','{}',?,?)`).run(userId,adminEmail,adminName,now,now);
        this.db.prepare(`INSERT INTO memberships(id,user_id,company_id,role,status,is_default,created_at,updated_at) VALUES (?,?,?,'client_admin','invited',0,?,?)`).run(`mem_${randomUUID()}`,userId,id,now,now);
      }
      this.db.exec('COMMIT;');
    }catch(error){this.db.exec('ROLLBACK;');throw error}
    return this.getCompany({...session,authorizedCompanyIds:[...session.authorizedCompanyIds,id]},id);
  }

  getCompany(session,companyId){this.assertPermission(session,'company.read');this.assertCompanyAccess(session,companyId);const row=this.db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);if(!row)throw new PortalError(404,'RESOURCE_NOT_FOUND','The requested resource was not found.');return companyDto(row)}

  updateCompany(session,companyId,patch){
    this.assertPermission(session,'company.manage');this.assertCompanyAccess(session,companyId);
    const existing=this.db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
    if(!existing)throw new PortalError(404,'RESOURCE_NOT_FOUND','The requested resource was not found.');
    const text=(value,fallback,max=250)=>value===undefined?fallback:String(value).trim().slice(0,max);
    const name=text(patch.name,existing.name);
    if(name.length<2)throw new PortalError(400,'COMPANY_NAME_REQUIRED','A company name is required.');
    const settings=safeJson(existing.settings_json);const currentProfile=settings.profile||{};
    const profile={...currentProfile};
    for(const key of ['address','phone','website','industry','primaryLocation','billingEmail','supportInstructions','executiveContact','billingContact'])if(patch[key]!==undefined)profile[key]=text(patch[key],currentProfile[key]||'',500);
    if(patch.employees!==undefined){const employees=Number(patch.employees);if(!Number.isInteger(employees)||employees<1||employees>1000000)throw new PortalError(400,'EMPLOYEE_COUNT_INVALID','Employee count must be a positive whole number.');profile.employees=employees}
    const legalName=text(patch.legalName,existing.legal_name);
    const primaryDomain=text(patch.primaryDomain,existing.primary_domain,255)||null;
    const timezone=text(patch.timezone,existing.timezone,100)||'America/New_York';
    let status=existing.status;let planName=existing.plan_name;
    if(session.role==='msp'){
      if(patch.status!==undefined){status=String(patch.status).toLowerCase();if(!['active','onboarding','suspended','archived'].includes(status))throw new PortalError(400,'COMPANY_STATUS_INVALID','Company status is invalid.')}
      planName=text(patch.planName,existing.plan_name);
    }else if(patch.status!==undefined||patch.planName!==undefined)throw new PortalError(403,'PERMISSION_DENIED','Only MSP administrators can change company lifecycle or service-plan fields.');
    const now=new Date().toISOString();
    this.db.prepare(`UPDATE companies SET name=?,legal_name=?,status=?,plan_name=?,primary_domain=?,timezone=?,settings_json=?,updated_at=? WHERE id=?`).run(name,legalName,status,planName,primaryDomain,timezone,JSON.stringify({...settings,profile}),now,companyId);
    return this.getCompany(session,companyId);
  }

  getCompanySummary(session,companyId){
    this.assertPermission(session,'company.read');this.assertCompanyAccess(session,companyId);
    const row=this.db.prepare(`SELECT c.*,s.health_score,s.security_score,s.open_tickets,s.managed_users,s.managed_devices,s.monthly_recurring_revenue_cents,s.sla_attainment,s.snapshot_json,s.captured_at FROM companies c LEFT JOIN company_snapshots s ON s.company_id=c.id WHERE c.id=?`).get(companyId);
    if(!row)throw new PortalError(404,'RESOURCE_NOT_FOUND','The requested resource was not found.');
    return{company:companyDto(row),healthScore:row.health_score,securityScore:row.security_score,openTickets:row.open_tickets,managedUsers:row.managed_users,managedDevices:row.managed_devices,monthlyRecurringRevenueCents:row.monthly_recurring_revenue_cents,slaAttainment:row.sla_attainment,details:safeJson(row.snapshot_json),capturedAt:row.captured_at};
  }

  listPeople(session,companyId){
    this.assertPermission(session,'people.read');this.assertCompanyAccess(session,companyId);
    return this.db.prepare(`SELECT u.*,m.id AS membership_id,m.role,m.status AS membership_status,m.created_at AS membership_created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY u.display_name`).all(companyId).map(row=>personDto({...row,created_at:row.membership_created_at}));
  }

  invitePerson(session,companyId,input){
    this.assertPermission(session,'people.manage');this.assertCompanyAccess(session,companyId);
    const name=String(input.name||'').trim();const email=normalizeEmail(input.email);
    if(name.length<2)throw new PortalError(400,'PERSON_NAME_REQUIRED','A full name is required.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new PortalError(400,'PERSON_EMAIL_INVALID','A valid email address is required.');
    const role=normalizeMembershipRole(input.role);const now=new Date().toISOString();
    let user=this.db.prepare('SELECT * FROM users WHERE lower(email)=?').get(email);
    if(user&&this.db.prepare('SELECT id FROM memberships WHERE user_id=? AND company_id=?').get(user.id,companyId))throw new PortalError(409,'PERSON_ALREADY_ASSIGNED','This person already has access to the company.');
    const userId=user?.id||`usr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const profile={inviteSource:'portal',requestedRole:String(input.role||'Member'),notes:String(input.notes||'').slice(0,1000)};
    this.db.exec('BEGIN IMMEDIATE;');
    try{
      if(user)this.db.prepare(`UPDATE users SET display_name=?,phone=?,department=?,job_title=?,location=?,timezone=?,manager_name=?,preferred_contact=?,profile_json=?,updated_at=? WHERE id=?`).run(name,input.phone||null,input.department||null,input.title||null,input.location||null,input.timezone||null,input.manager||null,input.preferredContact||null,JSON.stringify({...safeJson(user.profile_json),...profile}),now,userId);
      else this.db.prepare(`INSERT INTO users(id,email,display_name,status,platform_role,platform_scope,phone,department,job_title,location,timezone,manager_name,preferred_contact,profile_json,created_at,updated_at) VALUES (?,?,?,'invited','none','assigned',?,?,?,?,?,?,?,?,?,?)`).run(userId,email,name,input.phone||null,input.department||null,input.title||null,input.location||null,input.timezone||null,input.manager||null,input.preferredContact||null,JSON.stringify(profile),now,now);
      const membershipId=`mem_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      this.db.prepare(`INSERT INTO memberships(id,user_id,company_id,role,status,is_default,created_at,updated_at) VALUES (?,?,?,?, 'invited',0,?,?)`).run(membershipId,userId,companyId,role,now,now);
      this.db.exec('COMMIT;');
    }catch(error){this.db.exec('ROLLBACK;');throw error}
    return personDto(this.db.prepare(`SELECT u.*,m.id AS membership_id,m.role,m.status AS membership_status,m.created_at AS membership_created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND u.id=?`).get(companyId,userId));
  }

  updatePerson(session,companyId,userId,patch){
    this.assertPermission(session,'people.manage');this.assertCompanyAccess(session,companyId);
    const existing=this.db.prepare(`SELECT u.*,m.id AS membership_id,m.role,m.status AS membership_status FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND u.id=?`).get(companyId,userId);
    if(!existing)throw new PortalError(404,'RESOURCE_NOT_FOUND','The person was not found.');
    const role=patch.role===undefined?existing.role:normalizeMembershipRole(patch.role);
    const membershipStatus=patch.membershipStatus===undefined?existing.membership_status:String(patch.membershipStatus).toLowerCase();
    if(!['invited','active','suspended','revoked'].includes(membershipStatus))throw new PortalError(400,'MEMBERSHIP_STATUS_INVALID','Membership status is invalid.');
    if(['suspended','revoked'].includes(membershipStatus)&&['client_admin','client_owner'].includes(existing.role)){
      const remaining=this.db.prepare(`SELECT COUNT(*) AS total FROM memberships WHERE company_id=? AND user_id<>? AND status='active' AND role IN ('client_admin','client_owner')`).get(companyId,userId).total;
      if(remaining===0)throw new PortalError(409,'LAST_ADMIN_REQUIRED','Assign another active company administrator before removing this access.');
    }
    const now=new Date().toISOString();const email=patch.email===undefined?existing.email:normalizeEmail(patch.email);const name=patch.name===undefined?existing.display_name:String(patch.name).trim();
    if(!name)throw new PortalError(400,'PERSON_NAME_REQUIRED','A full name is required.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new PortalError(400,'PERSON_EMAIL_INVALID','A valid email address is required.');
    const userStatus=membershipStatus==='revoked'?'disabled':existing.status==='invited'&&membershipStatus==='active'?'active':existing.status;
    this.db.exec('BEGIN IMMEDIATE;');
    try{
      this.db.prepare(`UPDATE users SET display_name=?,email=?,status=?,phone=?,department=?,job_title=?,location=?,timezone=?,manager_name=?,preferred_contact=?,updated_at=? WHERE id=?`).run(name,email,userStatus,patch.phone===undefined?existing.phone:patch.phone,patch.department===undefined?existing.department:patch.department,patch.title===undefined?existing.job_title:patch.title,patch.location===undefined?existing.location:patch.location,patch.timezone===undefined?existing.timezone:patch.timezone,patch.manager===undefined?existing.manager_name:patch.manager,patch.preferredContact===undefined?existing.preferred_contact:patch.preferredContact,now,userId);
      this.db.prepare(`UPDATE memberships SET role=?,status=?,updated_at=? WHERE id=? AND company_id=?`).run(role,membershipStatus,now,existing.membership_id,companyId);
      this.db.exec('COMMIT;');
    }catch(error){this.db.exec('ROLLBACK;');throw error}
    return personDto(this.db.prepare(`SELECT u.*,m.id AS membership_id,m.role,m.status AS membership_status,m.created_at AS membership_created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND u.id=?`).get(companyId,userId));
  }

  listIntegrations(session,companyId=null){
    this.assertPermission(session,'integrations.read');
    if(companyId)this.assertCompanyAccess(session,companyId);
    const rows=companyId
      ?this.db.prepare('SELECT * FROM integration_connections WHERE company_id IS NULL OR company_id=? ORDER BY display_name').all(companyId)
      :this.db.prepare('SELECT * FROM integration_connections WHERE company_id IS NULL ORDER BY display_name').all();
    return rows.map(row=>({id:row.id,companyId:row.company_id,provider:row.provider,name:row.display_name,status:row.status,syncState:row.sync_state,clientVisible:Boolean(row.client_visible),configuration:safeJson(row.configuration_json),lastSyncAt:row.last_sync_at}));
  }

  saveIntegration(session,input){
    this.assertPermission(session,'integrations.manage');
    const provider=String(input.provider||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
    const name=String(input.name||input.system||'').trim().slice(0,150);
    if(!provider||!name)throw new PortalError(400,'INTEGRATION_REQUIRED','Select a valid integration before saving its configuration.');
    const visible=String(input.scope||'').toLowerCase().includes('publish')||String(input.scope||'').toLowerCase().includes('selected');
    const interval=String(input.syncInterval||input.sync||'manual').slice(0,100);
    const now=new Date().toISOString();const existing=this.db.prepare('SELECT * FROM integration_connections WHERE company_id IS NULL AND provider=?').get(provider);
    const configuration={...safeJson(existing?.configuration_json),syncInterval:interval,visibilityScope:input.scope||'MSP internal only',updatedBy:session.user.id,updatedAt:now};
    if(existing)this.db.prepare(`UPDATE integration_connections SET display_name=?,status='connected',sync_state='healthy',client_visible=?,configuration_json=?,updated_at=?,last_sync_at=? WHERE id=?`).run(name,visible?1:0,JSON.stringify(configuration),now,now,existing.id);
    else this.db.prepare(`INSERT INTO integration_connections(id,company_id,provider,display_name,status,sync_state,client_visible,configuration_json,last_sync_at,created_at,updated_at) VALUES (?,NULL,? ,?,'connected','healthy',?,?,?, ?,?)`).run(`int_${randomUUID()}`,provider,name,visible?1:0,JSON.stringify(configuration),now,now,now);
    return this.listIntegrations(session).find(item=>item.provider===provider);
  }

  listApiKeys(session){
    this.assertPermission(session,'platform.manage');
    return this.db.prepare(`SELECT id,name,scopes_json,expires_at,revoked_at,created_by_user_id,created_at,last_used_at FROM api_keys ORDER BY created_at DESC`).all().map(row=>({id:row.id,name:row.name,scopes:safeJson(row.scopes_json,[]),expiresAt:row.expires_at,revokedAt:row.revoked_at,createdAt:row.created_at,lastUsedAt:row.last_used_at}));
  }

  createApiKey(session,input){
    this.assertPermission(session,'platform.manage');
    const name=String(input.name||'').trim().slice(0,120);if(!name)throw new PortalError(400,'API_KEY_NAME_REQUIRED','An API key name is required.');
    const scopes=Array.isArray(input.scopes)?input.scopes:[input.scope||'clients:read'];const safeScopes=[...new Set(scopes.map(value=>String(value).trim()).filter(Boolean).slice(0,20))];
    const expiryDays=Math.max(1,Math.min(365,Number(input.expiryDays)||90));const secret=`nsp_${randomBytes(32).toString('base64url')}`;const id=`key_${randomUUID()}`;const expiresAt=new Date(Date.now()+expiryDays*86400000).toISOString();
    this.db.prepare(`INSERT INTO api_keys(id,name,secret_hash,scopes_json,expires_at,created_by_user_id) VALUES (?,?,?,?,?,?)`).run(id,name,createHash('sha256').update(secret).digest('hex'),JSON.stringify(safeScopes),expiresAt,session.user.id);
    return{id,name,scopes:safeScopes,expiresAt,secret};
  }

  revokeApiKey(session,keyId){
    this.assertPermission(session,'platform.manage');const result=this.db.prepare(`UPDATE api_keys SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revoked_at IS NULL`).run(keyId);if(!result.changes)throw new PortalError(404,'RESOURCE_NOT_FOUND','The API key was not found or is already revoked.');return{id:keyId,revoked:true};
  }

  listAuditEvents(session,{companyId=null,limit=50}={}){
    this.assertPermission(session,'audit.read');
    if(companyId)this.assertCompanyAccess(session,companyId);
    const safeLimit=Math.max(1,Math.min(Number(limit)||50,100));
    let rows;
    if(companyId)rows=this.db.prepare('SELECT * FROM audit_events WHERE company_id=? ORDER BY id DESC LIMIT ?').all(companyId,safeLimit);
    else if(session.scope.kind==='portfolio')rows=this.db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT ?').all(safeLimit);
    else{
      const ids=session.authorizedCompanyIds;if(!ids.length)return[];const placeholders=ids.map(()=>'?').join(',');
      rows=this.db.prepare(`SELECT * FROM audit_events WHERE company_id IN (${placeholders}) ORDER BY id DESC LIMIT ?`).all(...ids,safeLimit);
    }
    return rows.map(row=>({id:row.id,requestId:row.request_id,companyId:row.company_id,actorEmail:row.actor_email,actorRole:row.actor_role,action:row.action,resourceType:row.resource_type,resourceId:row.resource_id,outcome:row.outcome,reasonCode:row.reason_code,metadata:safeJson(row.metadata_json),createdAt:row.created_at}));
  }

  listPortalRecords(session,companyId,{type=null,limit=100}={}){
    this.assertPermission(session,'company.read');this.assertCompanyAccess(session,companyId);
    const safeLimit=Math.max(1,Math.min(Number(limit)||100,250));
    const rows=type
      ?this.db.prepare(`SELECT * FROM portal_records WHERE company_id=? AND record_type=? AND (visible_to_client=1 OR ? IN ('msp','admin')) ORDER BY updated_at DESC LIMIT ?`).all(companyId,type,session.role,safeLimit)
      :this.db.prepare(`SELECT * FROM portal_records WHERE company_id=? AND (visible_to_client=1 OR ? IN ('msp','admin')) ORDER BY updated_at DESC LIMIT ?`).all(companyId,session.role,safeLimit);
    return rows.map(row=>({id:row.id,companyId:row.company_id,type:row.record_type,title:row.title,status:row.status,priority:row.priority,sourceSystem:row.source_system,sourceId:row.source_id,payload:safeJson(row.payload_json),visibleToClient:Boolean(row.visible_to_client),createdAt:row.created_at,updatedAt:row.updated_at}));
  }

  upsertPortalRecord(session,companyId,record){
    this.assertCompanyAccess(session,companyId);
    if(record.type==='ticket')this.assertPermission(session,'tickets.create');
    else if(record.type==='document')this.assertPermission(session,'company.manage');
    else if(['asset','invoice','renewal','metric'].includes(record.type))this.assertPermission(session,'company.manage');
    else this.assertPermission(session,'company.manage');
    const id=record.id||`${record.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now=new Date().toISOString();
    this.db.prepare(`INSERT INTO portal_records(id,company_id,record_type,title,status,priority,source_system,source_id,payload_json,visible_to_client,created_by_user_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status,priority=excluded.priority,source_system=excluded.source_system,source_id=excluded.source_id,payload_json=excluded.payload_json,visible_to_client=excluded.visible_to_client,updated_at=excluded.updated_at`).run(id,companyId,record.type,record.title||'Portal record',record.status||'active',record.priority||'normal',record.sourceSystem||'portal',record.sourceId||null,JSON.stringify(record.payload||{}),record.visibleToClient===false?0:1,session.user.id,now,now);
    return{id,companyId,...record,createdAt:now,updatedAt:now};
  }

  updatePortalRecord(session,companyId,recordId,patch){
    this.assertCompanyAccess(session,companyId);
    const row=this.db.prepare('SELECT * FROM portal_records WHERE id=? AND company_id=?').get(recordId,companyId);
    if(!row)throw new PortalError(404,'RESOURCE_NOT_FOUND','Portal record not found.');
    if(row.record_type==='ticket')this.assertPermission(session,'tickets.create');
    else this.assertPermission(session,'company.manage');
    const payload={...safeJson(row.payload_json),...(patch.payload||{})};
    const title=patch.title||row.title;
    const status=patch.status||row.status;
    const priority=patch.priority||row.priority;
    const sourceSystem=patch.sourceSystem||row.source_system;
    const sourceId=patch.sourceId===undefined?row.source_id:patch.sourceId;
    const visibleToClient=patch.visibleToClient===undefined?row.visible_to_client:patch.visibleToClient===false?0:1;
    this.db.prepare(`UPDATE portal_records SET title=?,status=?,priority=?,source_system=?,source_id=?,payload_json=?,visible_to_client=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND company_id=?`).run(title,status,priority,sourceSystem,sourceId,JSON.stringify(payload),visibleToClient,recordId,companyId);
    const updated=this.db.prepare('SELECT * FROM portal_records WHERE id=? AND company_id=?').get(recordId,companyId);
    return{id:updated.id,companyId:updated.company_id,type:updated.record_type,title:updated.title,status:updated.status,priority:updated.priority,sourceSystem:updated.source_system,sourceId:updated.source_id,payload:safeJson(updated.payload_json),visibleToClient:Boolean(updated.visible_to_client),createdAt:updated.created_at,updatedAt:updated.updated_at};
  }

  listApprovalRequests(session,companyId,{status='pending'}={}){
    this.assertPermission(session,session.role==='user'?'company.read':'company.manage');this.assertCompanyAccess(session,companyId);
    const ownOnly=session.role==='user';
    const rows=status==='all'
      ?ownOnly?this.db.prepare('SELECT * FROM approval_requests WHERE company_id=? AND requested_by_user_id=? ORDER BY created_at DESC LIMIT 100').all(companyId,session.user.id):this.db.prepare('SELECT * FROM approval_requests WHERE company_id=? ORDER BY created_at DESC LIMIT 100').all(companyId)
      :ownOnly?this.db.prepare('SELECT * FROM approval_requests WHERE company_id=? AND requested_by_user_id=? AND status=? ORDER BY created_at DESC LIMIT 100').all(companyId,session.user.id,status):this.db.prepare('SELECT * FROM approval_requests WHERE company_id=? AND status=? ORDER BY created_at DESC LIMIT 100').all(companyId,status);
    return rows.map(row=>({id:row.id,companyId:row.company_id,requestedByUserId:row.requested_by_user_id,kind:row.kind,title:row.title,status:row.status,payload:safeJson(row.payload_json),decisionByUserId:row.decision_by_user_id,decisionReason:row.decision_reason||'',createdAt:row.created_at,updatedAt:row.updated_at,decisionAt:row.decision_at}));
  }

  createApprovalRequest(session,companyId,request){
    this.assertPermission(session,'company.read');this.assertCompanyAccess(session,companyId);
    const id=request.id||`approval-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.db.prepare(`INSERT INTO approval_requests(id,company_id,requested_by_user_id,kind,title,payload_json) VALUES (?,?,?,?,?,?)`).run(id,companyId,session.user.id,request.kind||'general',request.title||'Approval request',JSON.stringify(request.payload||{}));
    return{id,companyId,kind:request.kind||'general',title:request.title||'Approval request',status:'pending',payload:request.payload||{}};
  }

  decideApprovalRequest(session,companyId,approvalId,{decision,reason=''}){
    this.assertCompanyAccess(session,companyId);
    const existing=this.db.prepare('SELECT * FROM approval_requests WHERE id=? AND company_id=?').get(approvalId,companyId);
    if(!existing)throw new PortalError(404,'RESOURCE_NOT_FOUND','The approval request was not found.');
    decision=String(decision||'').toLowerCase();
    if(!['approved','denied','cancelled'].includes(decision))throw new PortalError(400,'APPROVAL_DECISION_INVALID','Decision must be approved, denied, or cancelled.');
    const requesterCancellation=decision==='cancelled'&&existing.requested_by_user_id===session.user.id;
    if(requesterCancellation)this.assertPermission(session,'company.read');else this.assertPermission(session,'company.manage');
    if(existing.status!=='pending')throw new PortalError(409,'APPROVAL_ALREADY_DECIDED','This approval request has already been decided.');
    reason=String(reason||'').trim().slice(0,2000);
    if(['approved','denied'].includes(decision)&&reason.length<3)throw new PortalError(400,'APPROVAL_REASON_REQUIRED','A decision reason is required.');
    const now=new Date().toISOString();const payload={...safeJson(existing.payload_json),decision:{status:decision,reason,actorUserId:session.user.id,at:now}};
    this.db.prepare(`UPDATE approval_requests SET status=?,decision_by_user_id=?,decision_at=?,decision_reason=?,payload_json=?,updated_at=? WHERE id=? AND company_id=?`).run(decision,session.user.id,now,reason,JSON.stringify(payload),now,approvalId,companyId);
    const row=this.db.prepare('SELECT * FROM approval_requests WHERE id=? AND company_id=?').get(approvalId,companyId);
    return{id:row.id,companyId:row.company_id,requestedByUserId:row.requested_by_user_id,kind:row.kind,title:row.title,status:row.status,payload:safeJson(row.payload_json),decisionByUserId:row.decision_by_user_id,decisionReason:row.decision_reason||'',createdAt:row.created_at,updatedAt:row.updated_at,decisionAt:row.decision_at};
  }

  listPortalSettings(session,companyId=null){
    this.assertPermission(session,'portal.read');
    if(companyId)this.assertCompanyAccess(session,companyId);
    const rows=companyId?this.db.prepare('SELECT * FROM portal_settings WHERE company_id IS NULL OR company_id=? ORDER BY setting_key').all(companyId):this.db.prepare('SELECT * FROM portal_settings WHERE company_id IS NULL ORDER BY setting_key').all();
    return rows.map(row=>({key:row.setting_key,value:safeJson(row.setting_value_json),scope:row.scope,companyId:row.company_id,updatedAt:row.updated_at}));
  }

  savePortalSetting(session,{key,value,scope='msp',companyId=null}){
    scope=String(scope||'msp').toLowerCase();key=String(key||'').trim();
    if(!key||key.length>200)throw new PortalError(400,'SETTING_KEY_INVALID','A valid setting key is required.');
    if(!['msp','company'].includes(scope))throw new PortalError(400,'SETTING_SCOPE_INVALID','Only MSP and company settings are supported.');
    this.assertPermission(session,scope==='msp'?'platform.manage':'company.manage');
    if(scope==='company'&&!companyId)throw new PortalError(400,'COMPANY_ID_REQUIRED','Company settings require a company identifier.');
    if(companyId)this.assertCompanyAccess(session,companyId);
    const settingId=`${scope}:${companyId||'global'}:${key}`;
    this.db.prepare(`INSERT INTO portal_settings(setting_id,setting_key,setting_value_json,scope,company_id,updated_by_user_id,updated_at) VALUES (?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(setting_id) DO UPDATE SET setting_value_json=excluded.setting_value_json,updated_by_user_id=excluded.updated_by_user_id,updated_at=excluded.updated_at`).run(settingId,key,JSON.stringify(value),scope,companyId,session.user.id);
    return{id:settingId,key,value,scope,companyId};
  }

  getInstallProfile(session){
    this.assertPermission(session,'platform.manage');
    const row=this.db.prepare(`SELECT * FROM install_profiles ORDER BY created_at DESC LIMIT 1`).get();
    if(!row)return{profileName:'Default local install',databaseProvider:'sqlite',deploymentTarget:'node',publicUrl:null,options:{}};
    return{id:row.id,profileName:row.profile_name,databaseProvider:row.database_provider,deploymentTarget:row.deployment_target,publicUrl:row.public_url,options:safeJson(row.options_json),createdAt:row.created_at,updatedAt:row.updated_at};
  }

  saveInstallProfile(session,profile){
    this.assertPermission(session,'platform.manage');
    const id=profile.id||'install-default';
    const profileName=profile.profileName||'Default production install';
    const databaseProvider=canonicalDatabaseProvider(profile.databaseProvider);
    const deploymentTarget=canonicalDeploymentTarget(profile.deploymentTarget);
    const publicUrl=profile.publicUrl||null;
    const options=profile.options||{};
    this.db.prepare(`INSERT INTO install_profiles(id,profile_name,database_provider,deployment_target,public_url,options_json,updated_at)
      VALUES (?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(id) DO UPDATE SET profile_name=excluded.profile_name,database_provider=excluded.database_provider,deployment_target=excluded.deployment_target,public_url=excluded.public_url,options_json=excluded.options_json,updated_at=excluded.updated_at`).run(id,profileName,databaseProvider,deploymentTarget,publicUrl,JSON.stringify(options));
    return{id,profileName,databaseProvider,deploymentTarget,publicUrl,options};
  }

  beginIntegrationSync(session,provider='connectwise'){
    this.assertPermission(session,'integrations.manage');
    const id=`sync_${randomUUID()}`;const now=new Date().toISOString();
    this.db.prepare(`INSERT INTO integration_sync_runs(id,provider,status,requested_by_user_id,started_at) VALUES (?,?,'running',?,?)`).run(id,provider,session.user.id,now);
    this.db.prepare(`UPDATE integration_connections SET sync_state='syncing',updated_at=? WHERE company_id IS NULL AND provider=?`).run(now,provider);
    return{id,provider,status:'running',startedAt:now};
  }

  failIntegrationSync(session,runId,error){
    this.assertPermission(session,'integrations.manage');
    const status=error?.code==='CONNECTWISE_RATE_LIMITED'?'rate_limited':'failed';const now=new Date().toISOString();
    this.db.prepare(`UPDATE integration_sync_runs SET status=?,error_code=?,retry_at=?,completed_at=? WHERE id=? AND status='running'`).run(status,String(error?.code||'CONNECTWISE_SYNC_FAILED').slice(0,100),error?.retryAt||null,now,runId);
    this.db.prepare(`UPDATE integration_connections SET status='degraded',sync_state=?,updated_at=? WHERE company_id IS NULL AND provider='connectwise'`).run(status==='rate_limited'?'warning':'failed',now);
    return{id:runId,status,errorCode:error?.code||'CONNECTWISE_SYNC_FAILED',retryAt:error?.retryAt||null,completedAt:now};
  }

  applyConnectWiseSync(session,runId,{companies=[],tickets=[]}){
    this.assertPermission(session,'integrations.manage');const now=new Date().toISOString();let companiesCreated=0,ticketsUpserted=0,ticketsSkipped=0;
    const slugFor=(name)=>{const base=(String(name||'connectwise-client').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'connectwise-client').slice(0,70);let slug=base,suffix=2;while(this.db.prepare('SELECT 1 FROM companies WHERE slug=?').get(slug))slug=`${base.slice(0,65)}-${suffix++}`;return slug};
    this.db.exec('BEGIN IMMEDIATE;');
    try{
      for(const source of companies){
        const externalId=String(source.externalId||'').trim();const name=String(source.name||'').trim().slice(0,250);if(!externalId||!name)continue;
        let mapping=this.db.prepare(`SELECT * FROM integration_resource_mappings WHERE provider='connectwise' AND resource_type='company' AND external_id=?`).get(externalId);
        let company=mapping?this.db.prepare('SELECT * FROM companies WHERE id=?').get(mapping.company_id):this.db.prepare('SELECT * FROM companies WHERE external_key=?').get(`connectwise:${externalId}`);
        if(!company){
          const id=`cmp_${randomUUID()}`;const profile={address:source.address||'',primaryLocation:source.location||'',phone:source.phone||'',website:source.website||'',industry:source.industry||'',employees:0,connectwise:{externalId,lastSeenAt:now}};
          this.db.prepare(`INSERT INTO companies(id,external_key,slug,name,legal_name,status,plan_name,primary_domain,timezone,settings_json,created_at,updated_at) VALUES (?,?,?,?,?,'onboarding','Unassigned',?,? ,?,?,?)`).run(id,`connectwise:${externalId}`,slugFor(name),name,source.legalName||name,source.primaryDomain||null,source.timezone||'America/New_York',JSON.stringify({profile,configuration:{sourceSystem:'connectwise',clientPortalPublished:false}}),now,now);
          this.db.prepare(`INSERT INTO company_snapshots(company_id,snapshot_json,captured_at) VALUES (?,?,?)`).run(id,JSON.stringify({source:'connectwise',externalId}),now);
          if(session.platformRole!=='msp_owner')this.db.prepare(`INSERT OR IGNORE INTO msp_company_scopes(user_id,company_id) VALUES (?,?)`).run(session.user.id,id);
          company=this.db.prepare('SELECT * FROM companies WHERE id=?').get(id);companiesCreated++;
        }else{
          const settings=safeJson(company.settings_json);const profile={...(settings.profile||{}),address:source.address||settings.profile?.address||'',primaryLocation:source.location||settings.profile?.primaryLocation||'',phone:source.phone||settings.profile?.phone||'',website:source.website||settings.profile?.website||'',industry:source.industry||settings.profile?.industry||'',connectwise:{...(settings.profile?.connectwise||{}),externalId,lastSeenAt:now}};
          this.db.prepare(`UPDATE companies SET name=?,legal_name=?,primary_domain=COALESCE(?,primary_domain),settings_json=?,updated_at=? WHERE id=?`).run(name,source.legalName||name,source.primaryDomain||null,JSON.stringify({...settings,profile}),now,company.id);
        }
        this.db.prepare(`INSERT INTO integration_resource_mappings(provider,resource_type,external_id,company_id,last_seen_at) VALUES ('connectwise','company',?,?,?) ON CONFLICT(provider,resource_type,external_id) DO UPDATE SET company_id=excluded.company_id,last_seen_at=excluded.last_seen_at`).run(externalId,company.id,now);
      }
      for(const source of tickets){
        const externalId=String(source.externalId||'').trim();const externalCompanyId=String(source.companyExternalId||'').trim();if(!externalId||!externalCompanyId){ticketsSkipped++;continue}
        const mapping=this.db.prepare(`SELECT company_id FROM integration_resource_mappings WHERE provider='connectwise' AND resource_type='company' AND external_id=?`).get(externalCompanyId);if(!mapping?.company_id){ticketsSkipped++;continue}
        const id=`cw_${createHash('sha256').update(externalId).digest('hex').slice(0,24)}`;const payload={ticketId:externalId,statusLabel:source.statusLabel||source.status||'Open',board:source.board||'',updatedBy:'ConnectWise synchronization',vendorUpdatedAt:source.updatedAt||null};
        this.db.prepare(`INSERT INTO portal_records(id,company_id,record_type,title,status,priority,source_system,source_id,payload_json,visible_to_client,created_at,updated_at) VALUES (?,?,'ticket',?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,title=excluded.title,status=excluded.status,priority=excluded.priority,payload_json=excluded.payload_json,updated_at=excluded.updated_at`).run(id,mapping.company_id,source.title||`ConnectWise ticket ${externalId}`,source.status||'active',source.priority||'normal','connectwise',externalId,JSON.stringify(payload),now,now);
        this.db.prepare(`INSERT INTO integration_resource_mappings(provider,resource_type,external_id,company_id,local_record_id,last_seen_at) VALUES ('connectwise','ticket',?,?,?,?) ON CONFLICT(provider,resource_type,external_id) DO UPDATE SET company_id=excluded.company_id,local_record_id=excluded.local_record_id,last_seen_at=excluded.last_seen_at`).run(externalId,mapping.company_id,id,now);ticketsUpserted++;
      }
      const mapped=this.db.prepare(`SELECT DISTINCT company_id FROM integration_resource_mappings WHERE provider='connectwise' AND resource_type='ticket' AND company_id IS NOT NULL`).all();
      for(const {company_id} of mapped){const open=Number(this.db.prepare(`SELECT COUNT(*) AS count FROM portal_records WHERE company_id=? AND source_system='connectwise' AND record_type='ticket' AND status NOT IN ('resolved','closed','cancelled')`).get(company_id).count);this.db.prepare(`UPDATE company_snapshots SET open_tickets=?,snapshot_json=json_set(snapshot_json,'$.connectwiseLastSync',?),captured_at=? WHERE company_id=?`).run(open,now,now,company_id)}
      this.db.prepare(`INSERT INTO integration_connections(id,company_id,provider,display_name,status,sync_state,client_visible,configuration_json,last_sync_at,created_at,updated_at) VALUES ('int_connectwise',NULL,'connectwise','ConnectWise PSA','connected','healthy',0,'{}',?,?,?) ON CONFLICT(id) DO UPDATE SET status='connected',sync_state='healthy',last_sync_at=excluded.last_sync_at,updated_at=excluded.updated_at`).run(now,now,now);
      this.db.prepare(`UPDATE integration_sync_runs SET status='succeeded',companies_seen=?,companies_created=?,tickets_seen=?,tickets_upserted=?,tickets_skipped=?,completed_at=? WHERE id=? AND status='running'`).run(companies.length,companiesCreated,tickets.length,ticketsUpserted,ticketsSkipped,now,runId);
      this.db.exec('COMMIT;');return{id:runId,status:'succeeded',companiesSeen:companies.length,companiesCreated,ticketsSeen:tickets.length,ticketsUpserted,ticketsSkipped,completedAt:now};
    }catch(error){this.db.exec('ROLLBACK;');throw error}
  }

  listIntegrationSyncRuns(session,provider='connectwise',limit=20){
    this.assertPermission(session,'integrations.read');const safeLimit=Math.max(1,Math.min(Number(limit)||20,100));
    return this.db.prepare(`SELECT * FROM integration_sync_runs WHERE provider=? ORDER BY started_at DESC LIMIT ?`).all(provider,safeLimit).map(row=>({id:row.id,provider:row.provider,status:row.status,companiesSeen:row.companies_seen,companiesCreated:row.companies_created,ticketsSeen:row.tickets_seen,ticketsUpserted:row.tickets_upserted,ticketsSkipped:row.tickets_skipped,errorCode:row.error_code,retryAt:row.retry_at,startedAt:row.started_at,completedAt:row.completed_at}));
  }

  recordAudit(event){
    const metadata=redactMetadata(event.metadata);
    this.db.prepare(`INSERT INTO audit_events(request_id,company_id,actor_user_id,actor_email,actor_role,action,resource_type,resource_id,outcome,reason_code,ip_address,user_agent,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(event.requestId,event.companyId||null,event.actorUserId||null,event.actorEmail||null,event.actorRole||null,event.action,event.resourceType||'request',event.resourceId||null,event.outcome,event.reasonCode||null,event.ipAddress||null,String(event.userAgent||'').slice(0,500),JSON.stringify(metadata));
  }
}

module.exports={PortalRepository,PortalError,permissionSets,companyDto};
