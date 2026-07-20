'use strict';
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const {createApplication}=require('../server.cjs');

function listen(server){
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

async function request(baseUrl,pathname,{method='GET',body=null,as='msp'}={}){
  const headers={Authorization:`Demo ${as}`};
  const init={method,headers};
  if(body){headers['Content-Type']='application/json';init.body=JSON.stringify(body)}
  const response=await fetch(baseUrl+pathname,init);
  const text=await response.text();
  let parsed=null;
  try{parsed=text?JSON.parse(text):null}catch{}
  return{response,text,body:parsed};
}

function assert(condition,message){
  if(!condition)throw new Error(message);
}

async function main(){
  const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'signature-designer-smoke-'));
  const databasePath=path.join(tempDir,'signature-designer-smoke.db');
  const application=createApplication({config:{production:false,demoMode:true,port:0,host:'127.0.0.1',trustProxy:false,staticRoot:path.join(__dirname,'..','dist'),sourceRoot:path.join(__dirname,'..'),databasePath,seedDemoData:true,auth:{clientId:'',tenantId:'',audience:'',redirectUri:'http://127.0.0.1',apiScope:'',allowedClientId:''}}});
  const server=http.createServer(application.handler);
  let baseUrl=null;
  try{
    baseUrl=await listen(server);
    const health=await request(baseUrl,'/api/health');
    assert(health.response.status===200,'/api/health did not return 200');
    assert(health.body?.database==='ready','database health did not report ready');
    const session=await request(baseUrl,'/api/session');
    assert(session.response.status===200,'database-backed demo session did not return 200');
    assert(session.body?.platformRole==='msp_owner','database-backed demo session did not resolve the MSP owner');
    const shell=await request(baseUrl,'/');
    assert(shell.response.status===200,'portal shell did not return 200');
    assert(/Email Signature|signature|portal/i.test(shell.text),'portal shell did not look like the email signature designer');
    const apiScript=await request(baseUrl,'/portal-api.js');
    assert(apiScript.response.status===200,'portal-api.js was not served');
    const savedProfile=await request(baseUrl,'/api/internal/install-profile',{method:'PUT',body:{profileName:'Smoke Test Install',databaseProvider:'sqlite',deploymentTarget:'node-smoke',publicUrl:baseUrl,options:{backupSchedule:'smoke'}}});
    assert(savedProfile.response.status===200,'install profile save did not return 200');
    assert(savedProfile.body?.installProfile?.profileName==='Smoke Test Install','install profile response did not reflect saved profile');
    console.log(`Smoke test passed: ${baseUrl}`);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    application.db.close();
    fs.rmSync(tempDir,{recursive:true,force:true});
  }
}

main().catch(error=>{console.error(`Smoke test failed: ${error.message}`);process.exitCode=1});
