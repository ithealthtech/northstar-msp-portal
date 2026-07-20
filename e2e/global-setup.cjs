'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {startServer}=require('../server.cjs');

module.exports=async function globalSetup(){
  const databasePath=path.join(os.tmpdir(),`northstar-e2e-${process.pid}.db`);
  Object.assign(process.env,{NODE_ENV:'development',DEMO_MODE:'true',SEED_DEMO_DATA:'true',HOST:'127.0.0.1',PORT:'4191',DATABASE_PATH:databasePath});
  const application=startServer();
  if(!application.server.listening)await new Promise((resolve,reject)=>{
    application.server.once('listening',resolve);
    application.server.once('error',reject);
  });

  return async()=>{
    application.server.closeAllConnections?.();
    if(application.server.listening)await new Promise((resolve)=>application.server.close(resolve));
    application.db.close();
    application.releaseLease();
    for(const suffix of ['', '-wal','-shm','.running.json'])fs.rmSync(databasePath+suffix,{force:true});
  };
};
