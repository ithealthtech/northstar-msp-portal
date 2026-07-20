(function(){
  async function request(path,options={}){
    if(!window.NorthstarAuth?.apiEnabled)return null;
    return window.NorthstarAuth.apiFetch(path,options);
  }
  async function listRecords(companyId,type=null){
    if(!companyId)return null;
    const qs=type?`?type=${encodeURIComponent(type)}`:'';
    return request(`/api/companies/${encodeURIComponent(companyId)}/records${qs}`);
  }
  async function profile(){return request('/api/profile')}
  async function listCompanies(){return request('/api/companies')}
  async function updateProfile(patch){return request('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)})}
  async function company(companyId){if(!companyId)return null;return request(`/api/companies/${encodeURIComponent(companyId)}`)}
  async function createCompany(company){return request('/api/companies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(company)})}
  async function updateCompany(companyId,patch){if(!companyId)return null;return request(`/api/companies/${encodeURIComponent(companyId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)})}
  async function createRecord(companyId,record){
    if(!companyId)return null;
    return request(`/api/companies/${encodeURIComponent(companyId)}/records`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
  }
  async function updateRecord(companyId,recordId,patch){
    if(!companyId||!recordId)return null;
    return request(`/api/companies/${encodeURIComponent(companyId)}/records/${encodeURIComponent(recordId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
  }
  async function listApprovals(companyId,status='pending'){
    if(!companyId)return null;
    return request(`/api/companies/${encodeURIComponent(companyId)}/approvals?status=${encodeURIComponent(status)}`);
  }
  async function createApproval(companyId,approval){
    if(!companyId)return null;
    return request(`/api/companies/${encodeURIComponent(companyId)}/approvals`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(approval)});
  }
  async function decideApproval(companyId,approvalId,decision){
    if(!companyId||!approvalId)return null;
    return request(`/api/companies/${encodeURIComponent(companyId)}/approvals/${encodeURIComponent(approvalId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(decision)});
  }
  async function listPeople(companyId){
    if(!companyId)return null;
    return request(`/api/companies/${encodeURIComponent(companyId)}/people`);
  }
  async function invitePerson(companyId,person){
    if(!companyId)return null;
    return request(`/api/companies/${encodeURIComponent(companyId)}/people`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(person)});
  }
  async function updatePerson(companyId,userId,patch){
    if(!companyId||!userId)return null;
    return request(`/api/companies/${encodeURIComponent(companyId)}/people/${encodeURIComponent(userId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
  }
  async function listAudit(companyId=null,limit=100){
    const query=new URLSearchParams();
    if(companyId)query.set('companyId',companyId);
    query.set('limit',String(limit));
    return request(`/api/internal/audit?${query}`);
  }
  async function listSettings(companyId=null){
    const qs=companyId?`?companyId=${encodeURIComponent(companyId)}`:'';
    return request(`/api/internal/settings${qs}`);
  }
  async function saveSetting(setting){
    return request('/api/internal/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(setting)});
  }
  async function installProfile(){
    return request('/api/internal/install-profile');
  }
  async function saveInstallProfile(profile){
    return request('/api/internal/install-profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile)});
  }
  async function listIntegrations(companyId=null){const qs=companyId?`?companyId=${encodeURIComponent(companyId)}`:'';return request(`/api/internal/integrations${qs}`)}
  async function saveIntegration(integration){return request('/api/internal/integrations',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(integration)})}
  async function listApiKeys(){return request('/api/internal/api-keys')}
  async function createApiKey(apiKey){return request('/api/internal/api-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(apiKey)})}
  async function revokeApiKey(keyId){return request(`/api/internal/api-keys/${encodeURIComponent(keyId)}`,{method:'DELETE'})}
  window.NorthstarApi={request,profile,updateProfile,listCompanies,company,createCompany,updateCompany,listRecords,createRecord,updateRecord,listApprovals,createApproval,decideApproval,listPeople,invitePerson,updatePerson,listAudit,listSettings,saveSetting,installProfile,saveInstallProfile,listIntegrations,saveIntegration,listApiKeys,createApiKey,revokeApiKey};
})();
