'use strict';
const fs=require('node:fs');
const net=require('node:net');
const path=require('node:path');

/** @param {string | undefined} value @param {boolean} [fallback] @param {string} [name] */
function bool(value,fallback=false,name='value'){
  if(value===undefined||value==='')return fallback;
  if(/^(1|true|yes|on)$/i.test(String(value)))return true;
  if(/^(0|false|no|off)$/i.test(String(value)))return false;
  throw new Error(`${name} must be true or false.`);
}
/** @param {string | number} value @param {{name:string,min:number,max:number}} bounds */
function integer(value,{name,min,max}){
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<min||parsed>max)throw new Error(`${name} must be an integer of at least ${min} and at most ${max}.`);
  return parsed;
}
/** @param {string} value @param {string} name @param {{https?:boolean}} [options] */
function url(value,name,{https=false}={}){
  let parsed;try{parsed=new URL(value)}catch{throw new Error(`${name} must be a valid URL.`)}
  if(https&&parsed.protocol!=='https:')throw new Error(`${name} must use HTTPS in production.`);
  return parsed.toString().replace(/\/$/,'');
}
/** @param {NodeJS.ProcessEnv} [env] @param {string} [baseDir] */
function loadConfig(env=process.env,baseDir=path.join(__dirname,'..')){
  const nodeEnv=env.NODE_ENV||'development';
  if(!['development','test','production'].includes(nodeEnv))throw new Error('NODE_ENV must be development, test, or production.');
  const production=nodeEnv==='production';
  const clientId=env.ENTRA_CLIENT_ID||'';
  const tenantId=env.ENTRA_TENANT_ID||'';
  const audience=env.ENTRA_API_AUDIENCE||`api://${clientId}`;
  const port=integer(env.PORT||4173,{name:'PORT',min:1,max:65535});
  const host=env.HOST||'127.0.0.1';
  if(host!=='localhost'&&!net.isIP(host))throw new Error('HOST must be localhost or an IPv4/IPv6 address.');
  const signatureOnly=bool(env.SIGNATURE_ONLY,false,'SIGNATURE_ONLY');
  const demoMode=bool(env.DEMO_MODE,false,'DEMO_MODE');
  const seedDemoData=bool(env.SEED_DEMO_DATA,false,'SEED_DEMO_DATA');
  const trustProxy=bool(env.TRUST_PROXY,false,'TRUST_PROXY');
  const allowDefaultAdmin=bool(env.SIGNATURE_ALLOW_DEFAULT_ADMIN,false,'SIGNATURE_ALLOW_DEFAULT_ADMIN');
  if(production&&demoMode)throw new Error('DEMO_MODE cannot be enabled in production.');
  if(production&&seedDemoData)throw new Error('SEED_DEMO_DATA cannot be enabled in production.');
  if(production&&allowDefaultAdmin)throw new Error('SIGNATURE_ALLOW_DEFAULT_ADMIN cannot be enabled in production.');
  if(production&&!signatureOnly&&(!clientId||!tenantId))throw new Error('ENTRA_CLIENT_ID and ENTRA_TENANT_ID are required in production unless SIGNATURE_ONLY=true.');
  if(production&&!signatureOnly&&(!env.ENTRA_API_AUDIENCE||!env.ENTRA_API_SCOPE||!env.ENTRA_ALLOWED_CLIENT_ID||!env.ENTRA_REDIRECT_URI))throw new Error('ENTRA_API_AUDIENCE, ENTRA_API_SCOPE, ENTRA_ALLOWED_CLIENT_ID, and ENTRA_REDIRECT_URI are required in production.');
  const redirectUri=url(env.ENTRA_REDIRECT_URI||`http://127.0.0.1:${port}`,'ENTRA_REDIRECT_URI',{https:production&&!signatureOnly});
  const publicUrl=env.PUBLIC_URL?url(env.PUBLIC_URL,'PUBLIC_URL',{https:production}):'';
  const connectWiseClientId=env.CONNECTWISE_CLIENT_ID||'';const connectWiseClientSecret=env.CONNECTWISE_CLIENT_SECRET||'';
  if(Boolean(connectWiseClientId)!==Boolean(connectWiseClientSecret))throw new Error('CONNECTWISE_CLIENT_ID and CONNECTWISE_CLIENT_SECRET must be configured together.');
  const connectWiseBaseUrl=env.CONNECTWISE_BASE_URL||'https://openapi.service.itsupport247.net';
  const officialConnectWiseOrigins=new Set(['https://openapi.service.itsupport247.net','https://openapi.service.euplatform.connectwise.com','https://openapi.service.auplatform.connectwise.com']);
  let connectWiseOrigin;try{connectWiseOrigin=new URL(connectWiseBaseUrl).origin}catch{throw new Error('CONNECTWISE_BASE_URL is invalid.');}
  if(production&&!officialConnectWiseOrigins.has(connectWiseOrigin))throw new Error('CONNECTWISE_BASE_URL must use an official ConnectWise Platform production origin.');
  const retention={auditDays:integer(env.RETENTION_AUDIT_DAYS||2555,{name:'RETENTION_AUDIT_DAYS',min:365,max:36500}),syncDays:integer(env.RETENTION_SYNC_DAYS||365,{name:'RETENTION_SYNC_DAYS',min:30,max:36500}),securityDays:integer(env.RETENTION_SECURITY_DAYS||90,{name:'RETENTION_SECURITY_DAYS',min:30,max:36500})};
  if(production&&(!Number.isInteger(retention.auditDays)||retention.auditDays<365))throw new Error('RETENTION_AUDIT_DAYS must be at least 365 in production.');
  const backupEncryptionKey=env.NORTHSTAR_BACKUP_KEY||'';let backupKeyBytes=0;try{backupKeyBytes=/^[a-f0-9]{64}$/i.test(backupEncryptionKey)?32:Buffer.from(backupEncryptionKey,'base64').length}catch{}
  if(backupEncryptionKey&&backupKeyBytes!==32)throw new Error('NORTHSTAR_BACKUP_KEY must decode to exactly 32 bytes.');
  if(production&&!backupEncryptionKey)throw new Error('NORTHSTAR_BACKUP_KEY is required in production.');
  if(production&&!publicUrl)throw new Error('PUBLIC_URL is required in production.');
  const staticRoot=path.join(baseDir,'dist');
  if(production&&!fs.existsSync(path.join(staticRoot,'index.html')))throw new Error('Production assets are missing. Run npm run build before starting the server.');
  if(production&&(!env.DATABASE_PATH||!path.isAbsolute(env.DATABASE_PATH)))throw new Error('DATABASE_PATH must be an explicit absolute path in production.');
  if(production&&(!env.BACKUP_DIRECTORY||!path.isAbsolute(env.BACKUP_DIRECTORY)))throw new Error('BACKUP_DIRECTORY must be an explicit absolute path in production.');
  const databasePath=path.resolve(baseDir,env.DATABASE_PATH||path.join('data','northstar.db'));const backupDirectory=path.resolve(baseDir,env.BACKUP_DIRECTORY||'backups');const backupRetentionDays=integer(env.BACKUP_RETENTION_DAYS||35,{name:'BACKUP_RETENTION_DAYS',min:7,max:3650});
  if(databasePath.startsWith(staticRoot+path.sep)||backupDirectory===staticRoot||backupDirectory.startsWith(staticRoot+path.sep))throw new Error('Database and backup storage must remain outside the public dist directory.');
  if(databasePath===backupDirectory||databasePath.startsWith(backupDirectory+path.sep))throw new Error('DATABASE_PATH must not be inside BACKUP_DIRECTORY.');
  const sessionHours=integer(env.SIGNATURE_SESSION_HOURS||12,{name:'SIGNATURE_SESSION_HOURS',min:1,max:168});
  const logLevel=env.LOG_LEVEL||(production?'info':'warn');
  if(!['debug','info','warn','error','fatal','silent'].includes(logLevel))throw new Error('LOG_LEVEL must be debug, info, warn, error, fatal, or silent.');
  return{
    nodeEnv,production,demoMode,signatureOnly,port,host,trustProxy,publicUrl,logLevel,
    staticRoot,sourceRoot:baseDir,
    databasePath,
    signature:{sessionHours,allowDefaultAdmin},
    seedDemoData,
    auth:{clientId,tenantId,audience,redirectUri,apiScope:env.ENTRA_API_SCOPE||`${audience}/Portal.Access`,allowedClientId:env.ENTRA_ALLOWED_CLIENT_ID||clientId},
    connectwise:{baseUrl:connectWiseOrigin,clientId:connectWiseClientId,clientSecret:connectWiseClientSecret,scope:env.CONNECTWISE_SCOPE||'platform.companies.read platform.tickets.read',companiesPath:env.CONNECTWISE_COMPANIES_PATH||'/v1/companies',ticketsPath:env.CONNECTWISE_TICKETS_PATH||'/v1/tickets'},
    backup:{directory:backupDirectory,encryptionKey:backupEncryptionKey,retentionDays:backupRetentionDays},retention
  };
}
module.exports={loadConfig,bool};
