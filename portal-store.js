const PORTAL_STORE_KEY='northstar-portal-store';
const DEMO_STORE=Boolean(window.NorthstarAuth?.demoBackend);
const defaultClientModules={support:true,remote:true,billing:true,documents:true,passwords:true,restrictions:true};
const demoClients={
  'Acme & Co.':{id:'client-acme',name:'Acme & Co.',initials:'AC',plan:'Managed Complete',status:'healthy',modules:{...defaultClientModules},overrides:{}},
  'Brightline Legal':{id:'client-brightline',name:'Brightline Legal',initials:'BL',plan:'Managed Complete Legal',status:'warning',modules:{...defaultClientModules},overrides:{}},
  'Harbor Construction':{id:'client-harbor',name:'Harbor Construction',initials:'HC',plan:'Managed Infrastructure',status:'healthy',modules:{...defaultClientModules,passwords:false},overrides:{}},
  'Atlas Partners':{id:'client-atlas',name:'Atlas Partners',initials:'AP',plan:'Security Managed',status:'critical',modules:{...defaultClientModules},overrides:{}}
};
const demoRecords={'Acme & Co.':{
  tickets:[['NS-2841','VPN connection drops intermittently','Taylor Morgan - 18 min ago','In progress','progress','High']],
  documents:[['Q3 2026 Technology Business Review','PDF - 4.2 MB','Jul 8','Reports']],
  assets:[['Workstations',42,41,'1 needs attention','pending']],
  invoices:[['INV-2026-0711','Jul 1, 2026','$4,820.00','Due Jul 15','due']],
  renewals:[['Managed Complete agreement','Oct 1, 2026','$62,760 ARR','Review scheduled','pending']],
  people:[['TG','Taylor Morgan','taylor@acme.co','Company administrator','IT Leadership','(617) 555-0142']]
}};
const portalStoreDefaults={
  version:1,
  msp:{id:'msp-itdr',legalName:DEMO_STORE?'Example MSP, LLC':'',brand:DEMO_STORE?'Example MSP':'',productName:'Northstar Client Portal',supportEmail:'',supportPhone:'',domain:'',sourceOfTruth:true},
  permissions:{
    msp:{scope:'all-clients',canConfigureIntegrations:true,canPublishPortalDefaults:true,canManageBilling:true,canManageUsers:true,canViewAudit:true},
    admin:{scope:'assigned-company',canConfigureIntegrations:false,canPublishPortalDefaults:false,canManageBilling:true,canManageUsers:true,canViewAudit:false},
    user:{scope:'assigned-user',canConfigureIntegrations:false,canPublishPortalDefaults:false,canManageBilling:false,canManageUsers:false,canViewAudit:false}
  },
  modules:{
    support:{enabled:true,owner:'user',approvalRequired:false},remote:{enabled:true,owner:'user',approvalRequired:true},services:{enabled:true,owner:'msp',approvalRequired:false},security:{enabled:true,owner:'msp',approvalRequired:false},billing:{enabled:true,owner:'admin',approvalRequired:false},documents:{enabled:true,owner:'admin',approvalRequired:false},passwords:{enabled:true,owner:'admin',approvalRequired:true},restrictions:{enabled:true,owner:'admin',approvalRequired:true},integrations:{enabled:true,owner:'msp',approvalRequired:true},audit:{enabled:true,owner:'msp',approvalRequired:false}
  },
  clients:DEMO_STORE?demoClients:{},records:DEMO_STORE?demoRecords:{},approvals:[],audit:[]
};
function clonePortalStore(value){return JSON.parse(JSON.stringify(value))}
function normalizePortalStore(store){store.msp={...portalStoreDefaults.msp,...(store.msp||{})};store.permissions={...portalStoreDefaults.permissions,...(store.permissions||{})};store.modules={...portalStoreDefaults.modules,...(store.modules||{})};store.clients={...clonePortalStore(portalStoreDefaults.clients),...(store.clients||{})};store.records={...clonePortalStore(portalStoreDefaults.records),...(store.records||{})};store.approvals=store.approvals||[];store.audit=store.audit||[];return store}
function loadPortalStore(){if(!DEMO_STORE)return normalizePortalStore(clonePortalStore(portalStoreDefaults));try{return normalizePortalStore({...clonePortalStore(portalStoreDefaults),...JSON.parse(localStorage.getItem(PORTAL_STORE_KEY)||'{}')})}catch{return clonePortalStore(portalStoreDefaults)}}
function savePortalStore(){if(DEMO_STORE)localStorage.setItem(PORTAL_STORE_KEY,JSON.stringify(portalStore))}
function storeClient(name){return portalStore.clients[name]||null}
function upsertStoreClient(record){if(!record?.name)return null;portalStore.clients[record.name]={...(portalStore.clients[record.name]||{}),id:record.id||portalStore.clients[record.name]?.id||`client-${record.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,name:record.name,initials:record.initials||record.name.slice(0,2).toUpperCase(),plan:record.plan||'Managed Complete',status:record.status||portalStore.clients[record.name]?.status||'healthy',modules:{...defaultClientModules,...(portalStore.clients[record.name]?.modules||{}),...(record.modules||{})},overrides:{...(portalStore.clients[record.name]?.overrides||{}),...(record.overrides||{})}};savePortalStore();return portalStore.clients[record.name]}
function renameStoreClient(oldName,newRecord){if(!oldName||!newRecord?.name)return upsertStoreClient(newRecord);const existing=portalStore.clients[oldName]||{};if(oldName!==newRecord.name)delete portalStore.clients[oldName];portalStore.clients[newRecord.name]={...existing,...newRecord,name:newRecord.name,initials:newRecord.initials||existing.initials||newRecord.name.slice(0,2).toUpperCase(),modules:{...defaultClientModules,...(existing.modules||{}),...(newRecord.modules||{})},overrides:{...(existing.overrides||{}),...(newRecord.overrides||{})}};savePortalStore();return portalStore.clients[newRecord.name]}
function recordStoreAudit(type,scope,details='',actor='Portal user'){portalStore.audit.unshift({id:`audit-${Date.now()}`,type,scope,details,actor,createdAt:new Date().toISOString()});portalStore.audit=portalStore.audit.slice(0,100);savePortalStore()}
function requestApproval(kind,scope,details='',actor='Portal user'){const item={id:`approval-${Date.now()}`,kind,scope,details,actor,status:'pending',createdAt:new Date().toISOString()};portalStore.approvals.unshift(item);recordStoreAudit('approval-requested',scope,`${kind}: ${details}`,actor);return item}
function storeRecords(name){portalStore.records[name]=portalStore.records[name]||{tickets:[],documents:[],assets:[],invoices:[],renewals:[],people:[]};return portalStore.records[name]}
function addStoreRecord(name,collection,item){const records=storeRecords(name);records[collection]=records[collection]||[];records[collection].unshift(item);savePortalStore();return item}
function setStoreRecords(name,updates){const records=storeRecords(name);for(const [key,value] of Object.entries(updates||{}))records[key]=Array.isArray(value)?value:records[key]||[];savePortalStore();return records}
const portalStore=loadPortalStore();
window.portalStore=portalStore;
window.portalStoreApi={savePortalStore,storeClient,upsertStoreClient,renameStoreClient,recordStoreAudit,requestApproval,storeRecords,addStoreRecord,setStoreRecords};
window.NorthstarDataPolicy={demoBackend:DEMO_STORE,loadOperational(key,fallback){if(!DEMO_STORE)return clonePortalStore(fallback);try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return clonePortalStore(fallback)}},saveOperational(key,value){if(DEMO_STORE)localStorage.setItem(key,JSON.stringify(value))}};
