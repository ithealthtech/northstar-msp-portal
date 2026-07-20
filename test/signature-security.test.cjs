'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createApplication}=require('../server.cjs');

let application,server,baseUrl;

test.before(async()=>{
  const config={
    production:true,demoMode:false,signatureOnly:true,port:0,host:'127.0.0.1',trustProxy:false,
    staticRoot:require('node:path').join(__dirname,'..','dist'),sourceRoot:require('node:path').join(__dirname,'..'),
    databasePath:':memory:',seedDemoData:false,signature:{sessionHours:12,allowDefaultAdmin:false},
    auth:{clientId:'',tenantId:'',audience:'',redirectUri:'https://portal.example',apiScope:'',allowedClientId:''}
  };
  application=createApplication({config});
  server=http.createServer(application.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

test.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  application.db.close();
});

async function request(path,{method='GET',body,origin}={}){
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(origin)headers.Origin=origin;
  const response=await fetch(baseUrl+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json();
  return{response,payload};
}

test('fresh databases never contain a default signature administrator',async()=>{
  const result=await request('/api/signature/setup-status');
  assert.equal(result.response.status,200);
  assert.equal(result.payload.adminReady,false);
  assert.equal(application.db.prepare('SELECT COUNT(*) AS count FROM signature_users').get().count,0);
});

test('signature setup requires a strong password and creates secure sessions',async()=>{
  const weak=await request('/api/signature/setup',{method:'POST',origin:baseUrl,body:{domain:'https://portal.example',companyName:'Example MSP',adminEmail:'owner@msp.example',adminPassword:'short-pass'}});
  assert.equal(weak.response.status,400);
  assert.equal(weak.payload.error.code,'PASSWORD_WEAK');

  const setup=await request('/api/signature/setup',{method:'POST',origin:baseUrl,body:{domain:'https://portal.example',companyName:'Example MSP',adminEmail:'owner@msp.example',adminPassword:'Longer-Test-Password-42!'}});
  assert.equal(setup.response.status,200);

  const login=await request('/api/signature/login',{method:'POST',origin:baseUrl,body:{email:'owner@msp.example',password:'Longer-Test-Password-42!'}});
  assert.equal(login.response.status,200);
  const cookie=login.response.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly/i);
  assert.match(cookie,/SameSite=Lax/i);
  assert.match(cookie,/Secure/i);
});

test('cross-site signature requests are rejected',async()=>{
  const result=await request('/api/signature/login',{method:'POST',origin:'https://attacker.example',body:{email:'owner@msp.example',password:'Longer-Test-Password-42!'}});
  assert.equal(result.response.status,403);
  assert.equal(result.payload.error.code,'ORIGIN_NOT_ALLOWED');
});

test('signature login attempts are throttled',async()=>{
  for(let attempt=0;attempt<10;attempt++){
    const result=await request('/api/signature/login',{method:'POST',origin:baseUrl,body:{email:'blocked@msp.example',password:'incorrect-password'}});
    assert.equal(result.response.status,401);
  }
  const blocked=await request('/api/signature/login',{method:'POST',origin:baseUrl,body:{email:'blocked@msp.example',password:'incorrect-password'}});
  assert.equal(blocked.response.status,429);
  assert.equal(blocked.payload.error.code,'LOGIN_RATE_LIMITED');
});
