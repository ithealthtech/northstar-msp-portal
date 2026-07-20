'use strict';

class ConnectWiseError extends Error{
  constructor(status,code,message,{retryAt=null,details=null}={}){super(message);this.status=status;this.code=code;this.retryAt=retryAt;this.details=details;this.expose=true}
}

function safeBaseUrl(value){
  let url;try{url=new URL(String(value||''))}catch{throw new ConnectWiseError(500,'CONNECTWISE_URL_INVALID','ConnectWise base URL is invalid.')}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new ConnectWiseError(500,'CONNECTWISE_URL_INVALID','ConnectWise base URL must be an HTTPS origin.');
  return url.origin;
}
function retryAt(response){
  const reset=Number(response.headers.get('reset'));if(Number.isFinite(reset)&&reset>0)return new Date(reset*1000).toISOString();
  const after=Number(response.headers.get('retry-after'));if(Number.isFinite(after)&&after>=0)return new Date(Date.now()+after*1000).toISOString();
  return null;
}
async function responseBody(response){const text=await response.text();if(!text)return null;try{return JSON.parse(text)}catch{return{text:text.slice(0,1000)}}}
function collection(body){if(Array.isArray(body))return body;for(const key of ['items','data','value','results','records'])if(Array.isArray(body?.[key]))return body[key];return[]}
function nextLink(body){return body?.next||body?.nextLink||body?.pagination?.next||body?.links?.next||null}

class ConnectWiseClient{
  constructor({baseUrl,clientId,clientSecret,scope,fetchImpl=globalThis.fetch,clock=()=>Date.now(),maxPages=20}){
    if(typeof fetchImpl!=='function')throw new ConnectWiseError(500,'CONNECTWISE_FETCH_UNAVAILABLE','A fetch implementation is required.');
    this.baseUrl=safeBaseUrl(baseUrl);this.clientId=String(clientId||'');this.clientSecret=String(clientSecret||'');this.scope=String(scope||'').trim();this.fetch=fetchImpl;this.clock=clock;this.maxPages=maxPages;this.token=null;this.tokenExpiresAt=0;this.quota={limit:null,remaining:null,resetAt:null};
  }
  configured(){return Boolean(this.clientId&&this.clientSecret&&this.scope)}
  async accessToken(){
    if(this.token&&this.clock()<this.tokenExpiresAt-30000)return this.token;
    if(!this.configured())throw new ConnectWiseError(503,'CONNECTWISE_NOT_CONFIGURED','ConnectWise credentials and scopes are not configured.');
    const response=await this.fetch(`${this.baseUrl}/v1/token`,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:this.clientId,client_secret:this.clientSecret,scope:this.scope})});
    const body=await responseBody(response);
    if(response.status===423&&this.token&&this.clock()<this.tokenExpiresAt)return this.token;
    if(!response.ok)throw new ConnectWiseError(response.status,'CONNECTWISE_TOKEN_FAILED','ConnectWise token request failed.',{retryAt:retryAt(response),details:{vendorStatus:response.status}});
    const token=body?.access_token||body?.Access_Token;const expiresIn=Math.max(60,Number(body?.expires_in||body?.expiresIn)||300);
    if(!token)throw new ConnectWiseError(502,'CONNECTWISE_TOKEN_INVALID','ConnectWise returned a token response without an access token.');
    this.token=String(token);this.tokenExpiresAt=this.clock()+expiresIn*1000;return this.token;
  }
  updateQuota(response){
    const number=(name)=>{const value=Number(response.headers.get(name));return Number.isFinite(value)?value:null};
    const reset=number('reset');this.quota={limit:number('limit'),remaining:number('remaining'),resetAt:reset?new Date(reset*1000).toISOString():null};
  }
  resolvePath(path){const url=new URL(String(path||''),`${this.baseUrl}/`);if(url.origin!==this.baseUrl)throw new ConnectWiseError(500,'CONNECTWISE_CROSS_ORIGIN_BLOCKED','ConnectWise pagination attempted to leave the configured API origin.');return url.toString()}
  async request(path,{retryAuth=true}={}){
    const token=await this.accessToken();const response=await this.fetch(this.resolvePath(path),{headers:{Accept:'application/json',Authorization:`Bearer ${token}`}});this.updateQuota(response);const body=await responseBody(response);
    if(response.status===401&&retryAuth){this.token=null;this.tokenExpiresAt=0;return this.request(path,{retryAuth:false})}
    if(response.status===429)throw new ConnectWiseError(429,'CONNECTWISE_RATE_LIMITED','ConnectWise request quota is exhausted.',{retryAt:retryAt(response),details:{quota:this.quota}});
    if(!response.ok)throw new ConnectWiseError(response.status,'CONNECTWISE_REQUEST_FAILED','ConnectWise API request failed.',{retryAt:retryAt(response),details:{vendorStatus:response.status}});
    return body;
  }
  async list(path){
    const items=[];let next=this.resolvePath(path);const visited=new Set();
    for(let page=0;next&&page<this.maxPages;page++){
      if(visited.has(next))throw new ConnectWiseError(502,'CONNECTWISE_PAGINATION_LOOP','ConnectWise returned a repeated pagination link.');visited.add(next);
      const body=await this.request(next);items.push(...collection(body));const candidate=nextLink(body);next=candidate?this.resolvePath(candidate):null;
    }
    if(next)throw new ConnectWiseError(502,'CONNECTWISE_PAGE_LIMIT','ConnectWise pagination exceeded the configured safety limit.');
    return items;
  }
}

module.exports={ConnectWiseClient,ConnectWiseError,safeBaseUrl,collection};
