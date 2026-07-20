'use strict';
const path=require('node:path');

function bool(value,fallback=false){if(value===undefined||value==='')return fallback;return /^(1|true|yes|on)$/i.test(String(value))}
function loadConfig(env=process.env,baseDir=path.join(__dirname,'..')){
  const production=env.NODE_ENV==='production';
  const clientId=env.ENTRA_CLIENT_ID||'';
  const tenantId=env.ENTRA_TENANT_ID||'';
  const audience=env.ENTRA_API_AUDIENCE||`api://${clientId}`;
  const port=Number(env.PORT||4173);
  const signatureOnly=bool(env.SIGNATURE_ONLY,false);
  const demoMode=bool(env.DEMO_MODE,false);
  if(production&&demoMode)throw new Error('DEMO_MODE cannot be enabled in production.');
  if(production&&!signatureOnly&&(!clientId||!tenantId))throw new Error('ENTRA_CLIENT_ID and ENTRA_TENANT_ID are required in production unless SIGNATURE_ONLY=true.');
  const connectWiseClientId=env.CONNECTWISE_CLIENT_ID||'';const connectWiseClientSecret=env.CONNECTWISE_CLIENT_SECRET||'';
  if(Boolean(connectWiseClientId)!==Boolean(connectWiseClientSecret))throw new Error('CONNECTWISE_CLIENT_ID and CONNECTWISE_CLIENT_SECRET must be configured together.');
  const connectWiseBaseUrl=env.CONNECTWISE_BASE_URL||'https://openapi.service.itsupport247.net';
  const officialConnectWiseOrigins=new Set(['https://openapi.service.itsupport247.net','https://openapi.service.euplatform.connectwise.com','https://openapi.service.auplatform.connectwise.com']);
  let connectWiseOrigin;try{connectWiseOrigin=new URL(connectWiseBaseUrl).origin}catch{throw new Error('CONNECTWISE_BASE_URL is invalid.');}
  if(production&&!officialConnectWiseOrigins.has(connectWiseOrigin))throw new Error('CONNECTWISE_BASE_URL must use an official ConnectWise Platform production origin.');
  const retention={auditDays:Number(env.RETENTION_AUDIT_DAYS||2555),syncDays:Number(env.RETENTION_SYNC_DAYS||365),securityDays:Number(env.RETENTION_SECURITY_DAYS||90)};
  if(production&&(!Number.isInteger(retention.auditDays)||retention.auditDays<365))throw new Error('RETENTION_AUDIT_DAYS must be at least 365 in production.');
  const backupEncryptionKey=env.NORTHSTAR_BACKUP_KEY||'';let backupKeyBytes=0;try{backupKeyBytes=/^[a-f0-9]{64}$/i.test(backupEncryptionKey)?32:Buffer.from(backupEncryptionKey,'base64').length}catch{}
  if(backupEncryptionKey&&backupKeyBytes!==32)throw new Error('NORTHSTAR_BACKUP_KEY must decode to exactly 32 bytes.');
  if(production&&!backupEncryptionKey)throw new Error('NORTHSTAR_BACKUP_KEY is required in production.');
  const staticRoot=path.join(baseDir,'dist');const databasePath=path.resolve(baseDir,env.DATABASE_PATH||path.join('data','northstar.db'));const backupDirectory=path.resolve(baseDir,env.BACKUP_DIRECTORY||'backups');const backupRetentionDays=Number(env.BACKUP_RETENTION_DAYS||35);
  if(!Number.isInteger(backupRetentionDays)||backupRetentionDays<7)throw new Error('BACKUP_RETENTION_DAYS must be an integer of at least 7.');
  if(!Number.isInteger(retention.syncDays)||retention.syncDays<30)throw new Error('RETENTION_SYNC_DAYS must be an integer of at least 30.');
  if(!Number.isInteger(retention.securityDays)||retention.securityDays<30)throw new Error('RETENTION_SECURITY_DAYS must be an integer of at least 30.');
  if(databasePath.startsWith(staticRoot+path.sep)||backupDirectory===staticRoot||backupDirectory.startsWith(staticRoot+path.sep))throw new Error('Database and backup storage must remain outside the public dist directory.');
  return{
    production,demoMode,signatureOnly,port,host:env.HOST||'127.0.0.1',trustProxy:bool(env.TRUST_PROXY,false),
    staticRoot,sourceRoot:baseDir,
    databasePath,
    signature:{sessionHours:Number(env.SIGNATURE_SESSION_HOURS||12),allowDefaultAdmin:bool(env.SIGNATURE_ALLOW_DEFAULT_ADMIN,false)},
    seedDemoData:bool(env.SEED_DEMO_DATA,false),
    auth:{clientId,tenantId,audience,redirectUri:env.ENTRA_REDIRECT_URI||`http://127.0.0.1:${port}`,apiScope:env.ENTRA_API_SCOPE||`${audience}/Portal.Access`,allowedClientId:env.ENTRA_ALLOWED_CLIENT_ID||clientId},
    connectwise:{baseUrl:connectWiseOrigin,clientId:connectWiseClientId,clientSecret:connectWiseClientSecret,scope:env.CONNECTWISE_SCOPE||'platform.companies.read platform.tickets.read',companiesPath:env.CONNECTWISE_COMPANIES_PATH||'/v1/companies',ticketsPath:env.CONNECTWISE_TICKETS_PATH||'/v1/tickets'},
    backup:{directory:backupDirectory,encryptionKey:backupEncryptionKey,retentionDays:backupRetentionDays},retention
  };
}
module.exports={loadConfig,bool};
