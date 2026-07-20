'use strict';
const path=require('node:path');
const {loadConfig}=require('../server/config.cjs');
const {openDatabase}=require('../server/database.cjs');
const {verifyEncryptedBackup,recordOperationalEvent}=require('../server/operations.cjs');

async function main(){const backupPath=process.argv[2];if(!backupPath)throw new Error('Usage: npm run backup:verify -- <backup-file>');const config=loadConfig();const resolved=path.resolve(backupPath);const result=await verifyEncryptedBackup({backupPath:resolved,encryptionKey:config.backup.encryptionKey});const db=openDatabase(config.databasePath);try{recordOperationalEvent(db,'restore_verification','succeeded',{file:path.basename(resolved),sha256:result.sha256})}finally{db.close()}console.log(JSON.stringify({event:'backup_verified',file:path.basename(resolved),...result}));}
main().catch(error=>{console.error(JSON.stringify({event:'backup_verification_failed',message:error.message}));process.exitCode=1});
