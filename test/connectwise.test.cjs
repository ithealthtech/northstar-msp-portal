'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ConnectWiseClient}=require('../server/connectwise-client.cjs');
const {ConnectWiseSyncService,normalizeCompany,normalizeTicket}=require('../server/connectwise-sync.cjs');
const {openDatabase}=require('../server/database.cjs');
const {seedDemoData}=require('../server/seed.cjs');
const {PortalRepository}=require('../server/repository.cjs');
const {loadConfig}=require('../server/config.cjs');

function jsonResponse(body,{status=200,headers={}}={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}})}

test('ConnectWise configuration requires credential pairs and official production origins',()=>{
  assert.throws(()=>loadConfig({CONNECTWISE_CLIENT_ID:'only-id'},process.cwd()),/configured together/);
  assert.throws(()=>loadConfig({NODE_ENV:'production',SIGNATURE_ONLY:'true',CONNECTWISE_BASE_URL:'https://proxy.example'},process.cwd()),/official ConnectWise/);
  const config=loadConfig({},process.cwd());assert.equal(config.connectwise.scope,'platform.companies.read platform.tickets.read');
});

test('ConnectWise client uses JSON client credentials, caches tokens, and records quota headers',async()=>{
  const calls=[];const fetchImpl=async(url,init={})=>{calls.push({url,init});if(url.endsWith('/v1/token'))return jsonResponse({access_token:'token-one',expires_in:600});return jsonResponse({items:[{id:1,name:'Acme'}]},{headers:{Limit:'500',Remaining:'499',Reset:'1800000000'}})};
  const client=new ConnectWiseClient({baseUrl:'https://openapi.service.itsupport247.net',clientId:'client-id',clientSecret:'client-secret',scope:'platform.companies.read platform.tickets.read',fetchImpl});
  await client.list('/v1/companies');await client.list('/v1/companies');
  assert.equal(calls.filter(call=>call.url.endsWith('/v1/token')).length,1);
  assert.deepEqual(JSON.parse(calls[0].init.body),{grant_type:'client_credentials',client_id:'client-id',client_secret:'client-secret',scope:'platform.companies.read platform.tickets.read'});
  assert.equal(calls[1].init.headers.Authorization,'Bearer token-one');assert.equal(client.quota.limit,500);assert.equal(client.quota.remaining,499);
});

test('ConnectWise client reuses a still-valid token when token endpoint returns 423',async()=>{
  const client=new ConnectWiseClient({baseUrl:'https://openapi.service.itsupport247.net',clientId:'id',clientSecret:'secret',scope:'platform.companies.read',fetchImpl:async()=>jsonResponse({error:'locked'},{status:423})});
  client.token='cached-token';client.tokenExpiresAt=Date.now()+10000;
  assert.equal(await client.accessToken(),'cached-token');
});

test('ConnectWise client surfaces 429 reset information and blocks cross-origin pagination',async()=>{
  let mode='rate';const fetchImpl=async(url)=>url.endsWith('/v1/token')?jsonResponse({access_token:'token',expires_in:600}):mode==='rate'?jsonResponse({error:'quota'},{status:429,headers:{Reset:'1800000000'}}):jsonResponse({items:[],next:'https://evil.example/steal'});
  const client=new ConnectWiseClient({baseUrl:'https://openapi.service.itsupport247.net',clientId:'id',clientSecret:'secret',scope:'platform.companies.read',fetchImpl});
  await assert.rejects(()=>client.list('/v1/companies'),error=>error.code==='CONNECTWISE_RATE_LIMITED'&&error.retryAt==='2027-01-15T08:00:00.000Z');
  mode='cross-origin';await assert.rejects(()=>client.list('/v1/companies'),error=>error.code==='CONNECTWISE_CROSS_ORIGIN_BLOCKED');
});

test('ConnectWise normalizers retain only portal-safe company and ticket fields',()=>{
  const company=normalizeCompany({id:91,name:'Example Client',website:'https://client.example/path',address:{line1:'1 Main St',city:'Boston',state:'MA'},privateNotes:'do not copy'});
  const ticket=normalizeTicket({id:501,summary:'Printer offline',company:{id:91},status:{name:'Closed'},priority:{name:'High'},board:{name:'Service Desk'},internalNotes:'secret'});
  assert.equal(company.primaryDomain,'client.example');assert.equal(Object.hasOwn(company,'privateNotes'),false);
  assert.equal(ticket.companyExternalId,'91');assert.equal(ticket.status,'resolved');assert.equal(ticket.priority,'high');assert.equal(Object.hasOwn(ticket,'internalNotes'),false);
});

test('ConnectWise synchronization durably maps companies and idempotently upserts tickets',async()=>{
  const db=openDatabase(':memory:');seedDemoData(db);const repository=new PortalRepository(db);
  const owner=repository.resolveSession({id:'demo-msp-oid',tenantId:'demo-tenant',name:'Morgan Reed',email:'morgan@northstar.example',role:'msp',appRole:'MSPPortal.Owner'});
  const client={configured:()=>true,quota:{limit:500,remaining:498,resetAt:null},async list(path){return path.includes('companies')?[{id:910,name:'Live Sync Client',website:'https://live-sync.example',address:{city:'Tampa',state:'FL'}}]:[{id:7001,summary:'Live ticket',company:{id:910},status:{name:'New'},priority:{name:'High'},board:{name:'Support'}}]}};
  const service=new ConnectWiseSyncService({client,repository});const first=await service.sync(owner);const second=await service.sync(owner);
  assert.equal(first.run.companiesCreated,1);assert.equal(first.run.ticketsUpserted,1);assert.equal(second.run.companiesCreated,0);
  const company=db.prepare(`SELECT * FROM companies WHERE external_key='connectwise:910'`).get();assert.ok(company);assert.equal(company.status,'onboarding');
  const records=db.prepare(`SELECT * FROM portal_records WHERE company_id=? AND source_system='connectwise'`).all(company.id);assert.equal(records.length,1);assert.equal(records[0].title,'Live ticket');assert.equal(records[0].priority,'high');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM integration_sync_runs WHERE provider='connectwise' AND status='succeeded'`).get().count,2);db.close();
});
