'use strict';
const {loadConfig}=require('../server/config.cjs');
const {openDatabase}=require('../server/database.cjs');
const {runRetention}=require('../server/operations.cjs');

function main(){const config=loadConfig();const db=openDatabase(config.databasePath);try{console.log(JSON.stringify({event:'retention_succeeded',...runRetention(db,config.retention)}))}finally{db.close()}}
try{main()}catch(error){console.error(JSON.stringify({event:'retention_failed',message:error.message}));process.exitCode=1}
