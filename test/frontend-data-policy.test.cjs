const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','portal-store.js'),'utf8');

function executeStore(demoBackend,seed=''){
  const values=new Map(seed?[['northstar-portal-store',seed]]:[]);
  let writes=0;
  const localStorage={
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>{writes+=1;values.set(key,value)}
  };
  const window={NorthstarAuth:{demoBackend}};
  vm.runInNewContext(source,{window,localStorage,JSON,Boolean,Date});
  return{window,values,get writes(){return writes}};
}

test('production store ignores browser-resident operational records and never persists them',()=>{
  const poisoned=JSON.stringify({clients:{'Injected Client':{name:'Injected Client'}},records:{'Injected Client':{tickets:[['FAKE']]}}});
  const runtime=executeStore(false,poisoned);
  assert.deepEqual(Object.keys(runtime.window.portalStore.clients),[]);
  assert.deepEqual(Object.keys(runtime.window.portalStore.records),[]);
  runtime.window.portalStoreApi.upsertStoreClient({name:'Transient Client'});
  runtime.window.NorthstarDataPolicy.saveOperational('northstar-ui-state',{secret:'value'});
  assert.equal(runtime.writes,0);
});

test('demo mode retains isolated local sample-state behavior',()=>{
  const runtime=executeStore(true);
  assert.ok(runtime.window.portalStore.clients['Acme & Co.']);
  runtime.window.portalStoreApi.upsertStoreClient({name:'Demo Client'});
  assert.equal(runtime.writes,1);
  assert.match(runtime.values.get('northstar-portal-store'),/Demo Client/);
});

test('production source gates hardcoded portfolio and operational state behind demo mode',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(app,/const clientRecords=demoBackend\?sampleClientRecords:\{\}/);
  assert.match(app,/const clientPortfolio=demoBackend\?/);
  assert.match(app,/dataPolicy\.loadOperational\('northstar-demo-state'/);
  assert.match(app,/Object\.assign\(c,collections\)/);
  assert.match(app,/portalApi\.listCompanies\(\)/);
  assert.match(app,/portalApi\.listIntegrations\(\)/);
  assert.match(app,/management:managementLive/);
  assert.match(app,/clients:clientsLive/);
  assert.match(app,/revenue:revenueLive/);
  assert.match(app,/integrations:integrationsLive/);
  assert.match(app,/Historical trend<\/span><strong>Not yet collected/);
});
