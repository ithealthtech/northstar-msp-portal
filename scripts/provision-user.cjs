'use strict';
const {randomUUID}=require('node:crypto');
const {loadConfig}=require('../server/config.cjs');
const {openDatabase}=require('../server/database.cjs');

const config=loadConfig();
const oid=process.env.PORTAL_USER_OID;
const email=process.env.PORTAL_USER_EMAIL;
const name=process.env.PORTAL_USER_NAME;
const role=process.env.PORTAL_USER_ROLE;
const companyKey=process.env.PORTAL_COMPANY_ID||null;
const validRoles=['msp_owner','msp_admin','msp_operator','client_owner','client_admin','client_user'];
if(!config.auth.tenantId||!oid||!email||!name||!validRoles.includes(role))throw new Error('Set ENTRA_TENANT_ID, PORTAL_USER_OID, PORTAL_USER_EMAIL, PORTAL_USER_NAME, and a valid PORTAL_USER_ROLE.');
if(role.startsWith('client_')&&!companyKey)throw new Error('PORTAL_COMPANY_ID is required for a client role.');
const db=openDatabase(config.databasePath);
try{
  if(db.prepare('SELECT 1 FROM users WHERE entra_tenant_id=? AND entra_object_id=?').get(config.auth.tenantId,oid))throw new Error('That Entra identity is already provisioned.');
  let company=null;
  if(companyKey){company=db.prepare('SELECT * FROM companies WHERE id=? OR external_key=? OR slug=?').get(companyKey,companyKey,companyKey);if(!company)throw new Error('PORTAL_COMPANY_ID does not match a provisioned company.')}
  const userId=`usr_${randomUUID()}`;
  const isMsp=role.startsWith('msp_');
  db.exec('BEGIN IMMEDIATE;');
  db.prepare(`INSERT INTO users(id,entra_tenant_id,entra_object_id,email,display_name,status,platform_role,platform_scope) VALUES (?,?,?,?,?,'active',?,?)`).run(userId,config.auth.tenantId,oid,email,name,isMsp?role:'none',isMsp?(process.env.PORTAL_PLATFORM_SCOPE||'assigned'):'assigned');
  if(company)db.prepare(`INSERT INTO memberships(id,user_id,company_id,role,status,is_default) VALUES (?,?,?,?,'active',1)`).run(`mem_${randomUUID()}`,userId,company.id,role);
  db.exec('COMMIT;');
  console.log(`Provisioned ${name} as ${role}${company?` for ${company.name}`:''}.`);
}catch(error){try{db.exec('ROLLBACK;')}catch{}throw error}finally{db.close()}
