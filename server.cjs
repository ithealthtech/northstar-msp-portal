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

function createApplication(options={}){
  const config=options.config||loadConfig(options.env);
  const db=options.db||openDatabase(config.databasePath);
  if(config.seedDemoData)seedDemoData(db);
  const repository=options.repository||new PortalRepository(db);
  const authenticate=options.authenticate||createEntraAuthenticator({...config.auth,demoMode:config.demoMode});
  const connectWiseConfig=config.connectwise||{baseUrl:'https://openapi.service.itsupport247.net',clientId:'',clientSecret:'',scope:'platform.companies.read platform.tickets.read',companiesPath:'/v1/companies',ticketsPath:'/v1/tickets'};
  const connectWiseClient=options.connectWiseClient||new ConnectWiseClient(connectWiseConfig);
  const connectWiseSync=options.connectWiseSync||new ConnectWiseSyncService({client:connectWiseClient,repository,companiesPath:connectWiseConfig.companiesPath,ticketsPath:connectWiseConfig.ticketsPath});
  const handler=createPortalHandler({config,repository,authenticate,connectWiseSync});
  return{config,db,repository,connectWiseClient,connectWiseSync,handler};
}

function startServer(options={}){
  const application=createApplication(options);
  const server=http.createServer(application.handler);
  server.listen(application.config.port,application.config.host,()=>console.log(`Northstar MSP Portal: http://${application.config.host}:${application.config.port}`));
  function shutdown(signal){console.log(`${signal} received; closing portal server.`);server.close(()=>{application.db.close();process.exit(0)})}
  process.once('SIGINT',()=>shutdown('SIGINT'));
  process.once('SIGTERM',()=>shutdown('SIGTERM'));
  return{...application,server};
}

if(require.main===module)startServer();
module.exports={createApplication,startServer};
