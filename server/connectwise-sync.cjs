'use strict';
const {ConnectWiseError}=require('./connectwise-client.cjs');

function text(value,max=500){return String(value??'').trim().slice(0,max)}
function externalId(value){return text(value?.id??value?.identifier??value?.externalId??value,200)}
function normalizeCompany(item){
  const address=item?.address||item?.primaryAddress||{};const location=[address.city,address.state||address.region,address.postalCode].filter(Boolean).join(', ');
  const website=text(item?.website||item?.websiteUrl||item?.url);let primaryDomain='';try{primaryDomain=new URL(website).hostname}catch{}
  return{externalId:externalId(item),name:text(item?.name||item?.companyName||item?.displayName,250),legalName:text(item?.legalName||item?.name||item?.companyName,250),address:text(address.line1||address.addressLine1||item?.addressLine1),location:text(location||item?.locationName),phone:text(item?.phone||item?.phoneNumber,100),website,primaryDomain,industry:text(item?.industry?.name||item?.industry),timezone:text(item?.timezone||item?.timeZone,100)};
}
function ticketStatus(item){const label=text(item?.status?.name||item?.status||item?.statusName,100);return{label,status:/closed|resolved|complete|cancel/i.test(label)?'resolved':'active'}}
function ticketPriority(item){const value=text(item?.priority?.name||item?.priority||item?.priorityName,100).toLowerCase();if(/critical|urgent|p1/.test(value))return'critical';if(/high|p2/.test(value))return'high';if(/low|p4/.test(value))return'low';return'normal'}
function normalizeTicket(item){const status=ticketStatus(item);return{externalId:externalId(item),companyExternalId:externalId(item?.company||item?.companyId||item?.companyIdentifier),title:text(item?.summary||item?.title||item?.name,500),status:status.status,statusLabel:status.label||status.status,priority:ticketPriority(item),board:text(item?.board?.name||item?.board||item?.serviceBoard?.name,200),updatedAt:item?.lastUpdated||item?.updatedAt||item?.dateEntered||null}}

class ConnectWiseSyncService{
  constructor({client,repository,companiesPath='/v1/companies',ticketsPath='/v1/tickets'}){this.client=client;this.repository=repository;this.companiesPath=companiesPath;this.ticketsPath=ticketsPath;this.running=false}
  configured(){return this.client.configured()}
  async sync(session){
    if(this.running)throw new ConnectWiseError(409,'CONNECTWISE_SYNC_RUNNING','A ConnectWise synchronization is already running.');
    const run=this.repository.beginIntegrationSync(session,'connectwise');this.running=true;
    try{
      const companies=(await this.client.list(this.companiesPath)).map(normalizeCompany).filter(item=>item.externalId&&item.name);
      const tickets=(await this.client.list(this.ticketsPath)).map(normalizeTicket).filter(item=>item.externalId);
      return{run:this.repository.applyConnectWiseSync(session,run.id,{companies,tickets}),quota:this.client.quota};
    }catch(error){this.repository.failIntegrationSync(session,run.id,error);throw error}finally{this.running=false}
  }
  runs(session,limit){return this.repository.listIntegrationSyncRuns(session,'connectwise',limit)}
}

module.exports={ConnectWiseSyncService,normalizeCompany,normalizeTicket};
