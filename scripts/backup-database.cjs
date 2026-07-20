'use strict';
const path=require('node:path');
const {loadConfig}=require('../server/config.cjs');
const {openDatabase}=require('../server/database.cjs');
const {createEncryptedBackup,pruneEncryptedBackups,recordOperationalEvent}=require('../server/operations.cjs');

async function main(){const config=loadConfig();const supplied=process.argv[2];const stamp=new Date().toISOString().replace(/[:.]/g,'-');const output=path.resolve(supplied||path.join(config.backup.directory,`northstar-${stamp}.nsbak`));const result=await createEncryptedBackup({databasePath:config.databasePath,outputPath:output,encryptionKey:config.backup.encryptionKey});const retention=await pruneEncryptedBackups({directory:path.dirname(output),retentionDays:config.backup.retentionDays,exclude:[output]});const db=openDatabase(config.databasePath);try{recordOperationalEvent(db,'backup','succeeded',{file:path.basename(output),bytes:result.bytes,sha256:result.sha256,pruned:retention.deleted})}finally{db.close()}const{path:ignored,...safeResult}=result;console.log(JSON.stringify({event:'backup_succeeded',file:path.basename(output),...safeResult,retention}));}
main().catch(error=>{console.error(JSON.stringify({event:'backup_failed',message:error.message}));process.exitCode=1});
