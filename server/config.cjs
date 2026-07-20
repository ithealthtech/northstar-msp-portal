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
  return{
    production,demoMode,signatureOnly,port,host:env.HOST||'127.0.0.1',trustProxy:bool(env.TRUST_PROXY,false),
    staticRoot:path.join(baseDir,'dist'),sourceRoot:baseDir,
    databasePath:env.DATABASE_PATH||path.join(baseDir,'data','northstar.db'),
    signature:{sessionHours:Number(env.SIGNATURE_SESSION_HOURS||12),allowDefaultAdmin:bool(env.SIGNATURE_ALLOW_DEFAULT_ADMIN,false)},
    seedDemoData:bool(env.SEED_DEMO_DATA,false),
    auth:{clientId,tenantId,audience,redirectUri:env.ENTRA_REDIRECT_URI||`http://127.0.0.1:${port}`,apiScope:env.ENTRA_API_SCOPE||`${audience}/Portal.Access`,allowedClientId:env.ENTRA_ALLOWED_CLIENT_ID||clientId}
  };
}
module.exports={loadConfig,bool};
