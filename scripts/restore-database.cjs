'use strict';
const path=require('node:path');
const {loadConfig}=require('../server/config.cjs');
const {openDatabase}=require('../server/database.cjs');
const {restoreEncryptedBackup,recordOperationalEvent}=require('../server/operations.cjs');

async function main(){const backupPath=process.argv[2];if(!backupPath)throw new Error('Usage: npm run backup:restore -- <backup-file> --confirm');const config=loadConfig();const resolved=path.resolve(backupPath);const result=await restoreEncryptedBackup({backupPath:resolved,databasePath:config.databasePath,encryptionKey:config.backup.encryptionKey,confirm:process.argv.includes('--confirm')});const db=openDatabase(config.databasePath);try{recordOperationalEvent(db,'restore','succeeded',{file:path.basename(resolved),sha256:result.sha256,previousDatabase:result.previousPath?path.basename(result.previousPath):null})}finally{db.close()}const{databasePath:ignoredDatabase,previousPath:ignoredPrevious,...safeResult}=result;console.log(JSON.stringify({event:'restore_succeeded',file:path.basename(resolved),previousDatabase:result.previousPath?path.basename(result.previousPath):null,...safeResult}));}
main().catch(error=>{console.error(JSON.stringify({event:'restore_failed',message:error.message}));process.exitCode=1});
