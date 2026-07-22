'use strict';
const http=require('node:http');
const {loadConfig}=require('./server/config.cjs');
const {openDatabase}=require('./server/database.cjs');
const {seedDemoData}=require('./server/seed.cjs');
const {PortalRepository}=require('./server/repository.cjs');
const {createEntraAuthenticator}=require('./server/auth.cjs');
const {createPortalHandler}=require('./server/app.cjs');
const {ConnectWiseClient}=require('./server/connectwise-client.cjs');
const {ConnectWiseSyncService}=require('./server/connectwise-sync.cjs');
const {acquireDatabaseLease}=require('./server/operations.cjs');
const {createLogger,errorFields}=require('./server/logger.cjs');

function createApplication(options={}){
  const config=options.config||loadConfig(options.env);
  const logger=options.logger||createLogger({level:config.logLevel||(config.production?'info':'silent')});
  const db=options.db||openDatabase(config.databasePath);
  if(config.seedDemoData)seedDemoData(db);
  const repository=options.repository||new PortalRepository(db);
  const authenticate=options.authenticate||createEntraAuthenticator({...config.auth,demoMode:config.demoMode});
  const connectWiseConfig=config.connectwise||{baseUrl:'https://openapi.service.itsupport247.net',clientId:'',clientSecret:'',scope:'platform.companies.read platform.tickets.read',companiesPath:'/v1/companies',ticketsPath:'/v1/tickets'};
  const connectWiseClient=options.connectWiseClient||new ConnectWiseClient(connectWiseConfig);
  const connectWiseSync=options.connectWiseSync||new ConnectWiseSyncService({client:connectWiseClient,repository,companiesPath:connectWiseConfig.companiesPath,ticketsPath:connectWiseConfig.ticketsPath});
  const handler=createPortalHandler({config,repository,authenticate,connectWiseSync,logger});
  return{config,db,repository,connectWiseClient,connectWiseSync,handler,logger};
}

function startServer(options={}){
  const config=options.config||loadConfig(options.env);const logger=options.logger||createLogger({level:config.logLevel||(config.production?'info':'silent')});const releaseLease=options.skipDatabaseLease?()=>{}:acquireDatabaseLease(config.databasePath);let application;
  try{application=createApplication({...options,config})}catch(error){releaseLease();throw error}
  const server=http.createServer(application.handler);
  let closing=false,cleaned=false,resolveClosed=()=>{};
  /** @type {Promise<void>} */
  const closed=new Promise(resolve=>{resolveClosed=resolve});
  function cleanup(){if(cleaned)return;cleaned=true;application.db.close();releaseLease();resolveClosed()}
  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    server.once('error',error=>{logger.error('server_error',{...errorFields(error),host:config.host,port:config.port});if(!server.listening){cleanup();reject(error)}else void shutdown('server_error',1)});
    server.listen(application.config.port,application.config.host,()=>{logger.info('server_started',{host:application.config.host,port:application.config.port,nodeEnv:config.nodeEnv||'development'});resolve(undefined)});
  });
  async function shutdown(reason='shutdown',exitCode=0){
    if(closing){if(exitCode>Number(process.exitCode||0))process.exitCode=exitCode;return closed}
    closing=true;process.exitCode=exitCode;logger.info('server_stopping',{reason,exitCode});
    if(!server.listening){cleanup();return closed}
    server.close(()=>cleanup());
    server.closeIdleConnections?.();
    setTimeout(()=>server.closeAllConnections?.(),5000).unref();
    await closed;logger.info('server_stopped',{reason,exitCode});return closed;
  }
  if(options.installSignalHandlers!==false){process.once('SIGINT',()=>void shutdown('SIGINT',0));process.once('SIGTERM',()=>void shutdown('SIGTERM',0))}
  return{...application,server,releaseLease,ready,closed,shutdown};
}

function runMain(){
  const logLevel=/** @type {'debug'|'info'|'warn'|'error'|'fatal'|'silent'} */(process.env.LOG_LEVEL||(process.env.NODE_ENV==='production'?'info':'warn'));
  let runtime,logger=createLogger({level:logLevel});
  try{runtime=startServer({logger,installSignalHandlers:false})}catch(error){logger.fatal('startup_failed',errorFields(error));process.exitCode=1;return null}
  let fatal=false;
  const terminate=(reason,error,exitCode)=>{if(fatal&&exitCode)return;fatal=fatal||Boolean(exitCode);if(error)logger.fatal('process_failure',{reason,...errorFields(error)});void runtime.shutdown(reason,exitCode)};
  process.once('SIGINT',()=>terminate('SIGINT',null,0));
  process.once('SIGTERM',()=>terminate('SIGTERM',null,0));
  process.once('uncaughtException',error=>terminate('uncaughtException',error,1));
  process.once('unhandledRejection',reason=>terminate('unhandledRejection',reason instanceof Error?reason:new Error(String(reason)),1));
  runtime.ready.catch(error=>terminate('listen_error',error,1));
  return runtime;
}

if(require.main===module)runMain();
module.exports={createApplication,startServer,runMain};
