'use strict';
const {URL}=require('node:url');

function authError(status,code,message){const error=new Error(message);error.status=status;error.code=code;error.expose=true;return error}
function createEntraAuthenticator(config){
  let josePromise,jwks;
  return async function authenticate(req){
    const header=req.headers.authorization||'';
    if(config.demoMode&&header.startsWith('Demo ')){
      const remote=String(req.socket?.remoteAddress||'');
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))throw authError(403,'AUTH_DEMO_LOCAL_ONLY','Demo identities are limited to the local machine.');
      const identities={
        msp:{id:'demo-msp-oid',tenantId:'demo-tenant',name:'Morgan Reed',email:'morgan@northstar.example',role:'msp',appRole:'MSPPortal.Owner',companyId:null,roles:['MSPPortal.Owner'],scopes:['Portal.Access']},
        admin:{id:'demo-admin-oid',tenantId:'demo-tenant',name:'Taylor Morgan',email:'taylor@acme.example',role:'admin',appRole:'ClientPortal.Admin',companyId:'acme',roles:['ClientPortal.Admin'],scopes:['Portal.Access']},
        user:{id:'demo-user-oid',tenantId:'demo-tenant',name:'Jordan Taylor',email:'jordan@acme.example',role:'user',appRole:'ClientPortal.User',companyId:'acme',roles:['ClientPortal.User'],scopes:['Portal.Access']}
      };
      const identity=identities[String(header.slice(5)).trim().toLowerCase()];
      if(!identity)throw authError(401,'AUTH_DEMO_ROLE_INVALID','The requested demo identity is invalid.');
      return{...identity,subject:identity.id};
    }
    if(!header.startsWith('Bearer '))throw authError(401,'AUTH_TOKEN_REQUIRED','A Microsoft access token is required.');
    if(!config.tenantId||!config.clientId)throw authError(503,'AUTH_NOT_CONFIGURED','Microsoft Entra validation is not configured.');
    josePromise||=import('jose');
    const{createRemoteJWKSet,jwtVerify}=await josePromise;
    jwks||=createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`));
    let payload;
    try{
      ({payload}=await jwtVerify(header.slice(7),jwks,{issuer:`https://login.microsoftonline.com/${config.tenantId}/v2.0`,audience:config.audience,requiredClaims:['exp','iat','sub','tid','oid','azp'],clockTolerance:5}));
    }catch{throw authError(401,'AUTH_TOKEN_INVALID','The Microsoft access token is invalid or expired.')}
    if(String(payload.tid)!==config.tenantId)throw authError(401,'AUTH_TENANT_INVALID','The token tenant is not allowed.');
    if(config.allowedClientId&&String(payload.azp)!==config.allowedClientId)throw authError(401,'AUTH_CLIENT_INVALID','The token client is not allowed.');
    const scopeName=String(config.apiScope||'').split('/').pop();
    const scopes=String(payload.scp||'').split(/\s+/).filter(Boolean);
    if(scopeName&&!scopes.includes(scopeName))throw authError(403,'AUTH_SCOPE_REQUIRED','The portal API scope is required.');
    const roles=Array.isArray(payload.roles)?payload.roles.map(String):[];
    const orderedRoles=['MSPPortal.Owner','MSPPortal.Admin','ClientPortal.Owner','ClientPortal.Admin','ClientPortal.User'];
    const appRole=orderedRoles.find(role=>roles.includes(role));
    if(!appRole)throw authError(403,'AUTH_ROLE_REQUIRED','A recognized portal application role is required.');
    const role=appRole.startsWith('MSPPortal.')?'msp':['ClientPortal.Admin','ClientPortal.Owner'].includes(appRole)?'admin':'user';
    const companyId=payload.company_id||payload.companyId||payload.extension_CompanyId||null;
    return{id:String(payload.oid),subject:String(payload.sub),tenantId:String(payload.tid),name:String(payload.name||payload.preferred_username||'Portal user'),email:String(payload.preferred_username||payload.email||''),role,appRole,companyId:companyId?String(companyId):null,roles,scopes};
  };
}

module.exports={createEntraAuthenticator,authError};
