(function(){
  const config=window.NORTHSTAR_AUTH||{};
  const configured=Boolean(config.clientId&&config.tenantId&&!config.clientId.startsWith('YOUR_'));
  const localHost=['localhost','127.0.0.1','::1'].includes(location.hostname);
  const previewMode=location.protocol==='file:'||(!configured&&Boolean(config.demoMode)&&localHost);
  const demoBackend=!configured&&Boolean(config.demoMode)&&localHost&&location.protocol!=='file:';
  const apiEnabled=configured||demoBackend;
  let client=null;
  let demoRole=sessionStorage.getItem('northstar-role')||'user';

  async function getClient(){
    if(!configured)return null;
    if(location.protocol==='file:')throw new Error('Microsoft sign-in requires the secure local portal server.');
    if(!window.msal?.PublicClientApplication)throw new Error('Microsoft sign-in could not be loaded. Check the portal connection.');
    if(!client){
      client=new window.msal.PublicClientApplication({auth:{clientId:config.clientId,authority:`https://login.microsoftonline.com/${config.tenantId}`,redirectUri:config.redirectUri},cache:{cacheLocation:'sessionStorage'}});
      await client.initialize();
    }
    return client;
  }

  async function accessToken(account){
    const instance=await getClient();
    if(!instance||!account)return null;
    return(await instance.acquireTokenSilent({account,scopes:[config.apiScope]})).accessToken;
  }

  async function apiFetch(path,options={}){
    if(demoBackend){
      const response=await fetch(path,{...options,headers:{Accept:'application/json',...(options.headers||{}),Authorization:`Demo ${demoRole}`}});
      if(!response.ok){let message='The portal request could not be completed.';try{const payload=await response.json();message=payload?.error?.message||message}catch{}const error=new Error(message);error.status=response.status;throw error}
      return response.status===204?null:response.json();
    }
    const instance=await getClient();
    const account=instance?.getActiveAccount();
    if(!account)throw new Error('A Microsoft portal session is required.');
    const token=await accessToken(account);
    const response=await fetch(path,{...options,headers:{Accept:'application/json',...(options.headers||{}),Authorization:`Bearer ${token}`}});
    if(!response.ok){
      let message='The portal request could not be completed.';
      try{const payload=await response.json();message=payload?.error?.message||message}catch{}
      const error=new Error(message);error.status=response.status;throw error;
    }
    return response.status===204?null:response.json();
  }

  async function validate(account){
    const instance=await getClient();
    instance.setActiveAccount(account);
    const session=await apiFetch('/api/session');
    if(!['user','admin','msp'].includes(session.role))throw new Error('The server returned an invalid portal role.');
    if(session.role!=='msp'&&!session.tenant)throw new Error('An active client company assignment is required.');
    return{...session,source:'entra'};
  }

  async function initializeAuth(){
    const instance=await getClient();
    if(!instance)return null;
    const result=await instance.handleRedirectPromise();
    const account=result?.account||instance.getActiveAccount()||instance.getAllAccounts()[0];
    return account?validate(account):null;
  }

  async function signInWithMicrosoft(){
    const instance=await getClient();
    if(!instance)throw new Error('Microsoft Entra has not been configured yet.');
    const result=await instance.loginPopup({scopes:['openid','profile','email',config.apiScope],prompt:'select_account'});
    return validate(result.account);
  }

  async function demoSession(role){
    if(!demoBackend)throw new Error('The database-backed demo is available only from the local portal server.');
    if(!['user','admin','msp'].includes(role))throw new Error('Invalid demo portal role.');
    demoRole=role;sessionStorage.setItem('northstar-role',role);
    const session=await apiFetch('/api/session');
    return{...session,source:'demo'};
  }

  async function setupStatus(){
    const response=await fetch('/api/setup/status',{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('The portal setup status could not be read.');
    return response.json();
  }
  async function initializeFirstRun(input){
    if(!demoBackend)throw new Error('Configure Microsoft Entra before initializing this deployment.');
    const response=await fetch('/api/setup/initialize',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(input)});
    if(!response.ok){let message='Initial setup could not be completed.';try{message=(await response.json())?.error?.message||message}catch{}throw new Error(message)}
    return response.json();
  }

  async function signOut(){
    sessionStorage.removeItem('northstar-role');
    demoRole='user';
    const instance=await getClient();
    if(instance?.getActiveAccount())await instance.logoutPopup({account:instance.getActiveAccount()});
  }

  window.NorthstarAuth={configured,previewMode,demoBackend,apiEnabled,initializeAuth,signInWithMicrosoft,demoSession,setupStatus,initializeFirstRun,signOut,apiFetch};
})();
