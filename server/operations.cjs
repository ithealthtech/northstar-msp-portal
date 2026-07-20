'use strict';
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync,backup}=require('node:sqlite');

const MAGIC='NORTHSTAR-BACKUP-V1\n';

function iso(value=new Date()){return value.toISOString()}
function cutoff(days,now=new Date()){return new Date(now.getTime()-(days*86400000)).toISOString()}
function positiveInteger(value,name,{minimum=1}={}){const parsed=Number(value);if(!Number.isInteger(parsed)||parsed<minimum)throw new Error(`${name} must be an integer of at least ${minimum}.`);return parsed}
function backupKey(value){const source=String(value||'').trim();let key;if(/^[a-f0-9]{64}$/i.test(source))key=Buffer.from(source,'hex');else key=Buffer.from(source,'base64');if(key.length!==32)throw new Error('NORTHSTAR_BACKUP_KEY must be a 32-byte key encoded as base64 or 64 hexadecimal characters.');return key}
function runningPath(databasePath){return `${databasePath}.running.json`}
function processExists(pid){if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true}catch(error){return error.code==='EPERM'}}

function acquireDatabaseLease(databasePath){
  if(databasePath===':memory:')return()=>{};
  const leasePath=runningPath(databasePath);fs.mkdirSync(path.dirname(leasePath),{recursive:true});
  if(fs.existsSync(leasePath)){
    let existing=null;try{existing=JSON.parse(fs.readFileSync(leasePath,'utf8'))}catch{}
    if(existing&&processExists(Number(existing.pid)))throw new Error(`Database is already leased by process ${existing.pid}.`);
    fs.rmSync(leasePath,{force:true});
  }
  fs.writeFileSync(leasePath,JSON.stringify({pid:process.pid,startedAt:iso(),database:path.basename(databasePath)})+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
  let released=false;return()=>{if(released)return;released=true;try{const current=JSON.parse(fs.readFileSync(leasePath,'utf8'));if(Number(current.pid)===process.pid)fs.rmSync(leasePath,{force:true})}catch{}}
}

function assertDatabaseOffline(databasePath){
  const leasePath=runningPath(databasePath);if(!fs.existsSync(leasePath))return;
  let lease=null;try{lease=JSON.parse(fs.readFileSync(leasePath,'utf8'))}catch{}
  if(lease&&processExists(Number(lease.pid)))throw new Error(`Restore refused because process ${lease.pid} is using the database.`);
  fs.rmSync(leasePath,{force:true});
}

function verifySqliteFile(filePath){
  const db=new DatabaseSync(filePath,{readOnly:true});
  try{
    const integrity=db.prepare('PRAGMA integrity_check').get();
    if(!integrity||integrity.integrity_check!=='ok')throw new Error(`SQLite integrity check failed: ${integrity?.integrity_check||'unknown result'}`);
    const migrations=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
    if(!migrations)throw new Error('Backup does not contain the Northstar migration ledger.');
    return{integrity:'ok',migrations:Number(db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total)};
  }finally{db.close()}
}

function encryptPayload(plain,key,metadata){
  const iv=crypto.randomBytes(12);const aad=Buffer.from(JSON.stringify(metadata));const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
  return Buffer.concat([Buffer.from(MAGIC),Buffer.from(JSON.stringify({...metadata,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')})+'\n'),ciphertext]);
}
function decryptPayload(contents,key){
  const newline=contents.indexOf(10,MAGIC.length);if(!contents.subarray(0,MAGIC.length).equals(Buffer.from(MAGIC))||newline<0)throw new Error('Unsupported or corrupt Northstar backup format.');
  let header;try{header=JSON.parse(contents.subarray(MAGIC.length,newline).toString('utf8'))}catch{throw new Error('Backup metadata is corrupt.');}
  const {iv,tag,...metadata}=header;const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64'));decipher.setAAD(Buffer.from(JSON.stringify(metadata)));decipher.setAuthTag(Buffer.from(tag,'base64'));
  let plain;try{plain=Buffer.concat([decipher.update(contents.subarray(newline+1)),decipher.final()])}catch{throw new Error('Backup authentication failed. Check the encryption key and backup integrity.');}
  const digest=crypto.createHash('sha256').update(plain).digest('hex');if(digest!==metadata.sha256)throw new Error('Backup checksum validation failed.');return{plain,metadata};
}

async function createEncryptedBackup({databasePath,outputPath,encryptionKey,now=new Date()}){
  if(!databasePath||databasePath===':memory:')throw new Error('A file-backed DATABASE_PATH is required for backup.');
  const source=path.resolve(databasePath),destination=path.resolve(outputPath);if(source===destination)throw new Error('Backup output must differ from DATABASE_PATH.');if(fs.existsSync(destination))throw new Error(`Backup already exists: ${destination}`);
  await fsp.mkdir(path.dirname(destination),{recursive:true});const temporaryDatabase=path.join(path.dirname(destination),`.${path.basename(destination)}.${crypto.randomUUID()}.sqlite`);const temporaryOutput=`${destination}.${crypto.randomUUID()}.tmp`;const db=new DatabaseSync(source,{readOnly:true});
  try{
    await backup(db,temporaryDatabase);const verified=verifySqliteFile(temporaryDatabase);const plain=await fsp.readFile(temporaryDatabase);const metadata={algorithm:'AES-256-GCM',createdAt:iso(now),database:path.basename(source),bytes:plain.length,sha256:crypto.createHash('sha256').update(plain).digest('hex'),migrations:verified.migrations};
    await fsp.writeFile(temporaryOutput,encryptPayload(plain,backupKey(encryptionKey),metadata),{mode:0o600,flag:'wx'});await fsp.rename(temporaryOutput,destination);return{path:destination,...metadata};
  }finally{db.close();await fsp.rm(temporaryDatabase,{force:true});await fsp.rm(temporaryOutput,{force:true})}
}

async function verifyEncryptedBackup({backupPath,encryptionKey,tempDirectory=path.dirname(path.resolve(backupPath))}){
  const contents=await fsp.readFile(backupPath);const decoded=decryptPayload(contents,backupKey(encryptionKey));const temporary=path.join(tempDirectory,`.northstar-verify-${crypto.randomUUID()}.sqlite`);
  try{await fsp.writeFile(temporary,decoded.plain,{mode:0o600,flag:'wx'});return{...decoded.metadata,...verifySqliteFile(temporary)}}finally{await fsp.rm(temporary,{force:true})}
}

async function restoreEncryptedBackup({backupPath,databasePath,encryptionKey,confirm=false,now=new Date()}){
  if(!confirm)throw new Error('Restore requires explicit confirmation. Re-run with --confirm after stopping the portal service.');if(!databasePath||databasePath===':memory:')throw new Error('A file-backed DATABASE_PATH is required for restore.');
  const target=path.resolve(databasePath);assertDatabaseOffline(target);const contents=await fsp.readFile(backupPath);const decoded=decryptPayload(contents,backupKey(encryptionKey));await fsp.mkdir(path.dirname(target),{recursive:true});const temporary=`${target}.${crypto.randomUUID()}.restore`;const previous=fs.existsSync(target)?`${target}.pre-restore-${iso(now).replace(/[:.]/g,'-')}`:null;
  try{await fsp.writeFile(temporary,decoded.plain,{mode:0o600,flag:'wx'});const verified=verifySqliteFile(temporary);if(previous)await fsp.rename(target,previous);await fsp.rename(temporary,target);for(const sidecar of [`${target}-wal`,`${target}-shm`])await fsp.rm(sidecar,{force:true});return{databasePath:target,previousPath:previous,...decoded.metadata,...verified}}catch(error){if(previous&&fs.existsSync(previous)&&!fs.existsSync(target))await fsp.rename(previous,target);throw error}finally{await fsp.rm(temporary,{force:true})}
}

async function pruneEncryptedBackups({directory,retentionDays=35,now=new Date(),exclude=[]}){
  const days=positiveInteger(retentionDays,'BACKUP_RETENTION_DAYS',{minimum:7});const root=path.resolve(directory);if(!fs.existsSync(root))return{retentionDays:days,deleted:[]};const excluded=new Set(exclude.map(item=>path.resolve(item)));const threshold=now.getTime()-(days*86400000);const deleted=[];
  for(const entry of await fsp.readdir(root,{withFileTypes:true})){
    if(!entry.isFile()||!/^northstar-.*\.nsbak$/.test(entry.name))continue;const candidate=path.join(root,entry.name);if(excluded.has(candidate))continue;const stat=await fsp.stat(candidate);if(stat.mtimeMs>=threshold)continue;const handle=await fsp.open(candidate,'r');let prefix;try{prefix=Buffer.alloc(Buffer.byteLength(MAGIC));await handle.read(prefix,0,prefix.length,0)}finally{await handle.close()}if(!prefix.equals(Buffer.from(MAGIC)))continue;await fsp.rm(candidate);deleted.push(entry.name);
  }
  return{retentionDays:days,deleted};
}

function runRetention(db,policy={},now=new Date()){
  const auditDays=positiveInteger(policy.auditDays??2555,'RETENTION_AUDIT_DAYS',{minimum:365});const syncDays=positiveInteger(policy.syncDays??365,'RETENTION_SYNC_DAYS',{minimum:30});const securityDays=positiveInteger(policy.securityDays??90,'RETENTION_SECURITY_DAYS',{minimum:30});
  const transaction=()=>{
    const deleted={signatureSessions:Number(db.prepare('DELETE FROM signature_sessions WHERE expires_at < ?').run(iso(now)).changes),apiKeys:Number(db.prepare("DELETE FROM api_keys WHERE (revoked_at IS NOT NULL OR expires_at < ?) AND created_at < ?").run(iso(now),cutoff(securityDays,now)).changes),syncRuns:Number(db.prepare("DELETE FROM integration_sync_runs WHERE status <> 'running' AND started_at < ?").run(cutoff(syncDays,now)).changes),auditEvents:Number(db.prepare('DELETE FROM audit_events WHERE created_at < ?').run(cutoff(auditDays,now)).changes)};
    db.prepare("INSERT INTO operational_events(id,event_type,status,details_json,created_at) VALUES (?,?,?,?,?)").run(crypto.randomUUID(),'retention','succeeded',JSON.stringify({policy:{auditDays,syncDays,securityDays},deleted}),iso(now));return deleted;
  };
  db.exec('BEGIN IMMEDIATE;');try{const deleted=transaction();db.exec('COMMIT;');db.exec('PRAGMA optimize;');return{policy:{auditDays,syncDays,securityDays},deleted,completedAt:iso(now)}}catch(error){db.exec('ROLLBACK;');throw error}
}

function recordOperationalEvent(db,eventType,status,details={},now=new Date()){
  db.prepare('INSERT INTO operational_events(id,event_type,status,details_json,created_at) VALUES (?,?,?,?,?)').run(crypto.randomUUID(),eventType,status,JSON.stringify(details),iso(now));
}

module.exports={MAGIC,backupKey,acquireDatabaseLease,assertDatabaseOffline,createEncryptedBackup,verifyEncryptedBackup,restoreEncryptedBackup,pruneEncryptedBackups,runRetention,recordOperationalEvent,verifySqliteFile};
