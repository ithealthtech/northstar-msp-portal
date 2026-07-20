'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {openDatabase}=require('../server/database.cjs');
const {loadConfig}=require('../server/config.cjs');
const {MAGIC,acquireDatabaseLease,createEncryptedBackup,verifyEncryptedBackup,restoreEncryptedBackup,pruneEncryptedBackups,runRetention}=require('../server/operations.cjs');

function temporary(){return fs.mkdtempSync(path.join(os.tmpdir(),'northstar-operations-'))}

test('production rejects an audit retention period shorter than one year',()=>{
  assert.throws(()=>loadConfig({NODE_ENV:'production',SIGNATURE_ONLY:'true',RETENTION_AUDIT_DAYS:'30'}),/at least 365/);
  assert.throws(()=>loadConfig({NODE_ENV:'production',SIGNATURE_ONLY:'true'}),/NORTHSTAR_BACKUP_KEY is required/);
  assert.throws(()=>loadConfig({BACKUP_RETENTION_DAYS:'1'}),/at least 7/);
  assert.throws(()=>loadConfig({BACKUP_DIRECTORY:'dist/backups'}),/outside the public dist/);
});

test('encrypted SQLite backups verify, reject the wrong key, and restore only while offline',async()=>{
  const directory=temporary();const source=path.join(directory,'source.db');const restored=path.join(directory,'restored.db');const backupPath=path.join(directory,'source.nsbak');const key=crypto.randomBytes(32).toString('base64');
  try{
    const db=openDatabase(source);db.prepare("INSERT INTO companies(id,external_key,slug,name,legal_name) VALUES ('company-1','company-1','example','Example Co','Example Co')").run();db.close();
    const created=await createEncryptedBackup({databasePath:source,outputPath:backupPath,encryptionKey:key,now:new Date('2026-07-20T00:00:00Z')});
    assert.equal(created.algorithm,'AES-256-GCM');assert.ok(created.bytes>0);assert.equal(fs.readFileSync(backupPath,'utf8').includes('Example Co'),false);
    const verified=await verifyEncryptedBackup({backupPath,encryptionKey:key});assert.equal(verified.integrity,'ok');assert.ok(verified.migrations>=8);
    await assert.rejects(()=>verifyEncryptedBackup({backupPath,encryptionKey:crypto.randomBytes(32).toString('base64')}),/authentication failed/);
    const release=acquireDatabaseLease(restored);await assert.rejects(()=>restoreEncryptedBackup({backupPath,databasePath:restored,encryptionKey:key,confirm:true}),/using the database/);release();
    const result=await restoreEncryptedBackup({backupPath,databasePath:restored,encryptionKey:key,confirm:true});assert.equal(result.integrity,'ok');const restoredDb=openDatabase(restored);assert.equal(restoredDb.prepare('SELECT name FROM companies WHERE id=?').get('company-1').name,'Example Co');restoredDb.close();
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
});

test('retention removes expired security state and aged operational history while preserving current records',()=>{
  const directory=temporary();const databasePath=path.join(directory,'retention.db');const db=openDatabase(databasePath);const now=new Date('2026-07-20T00:00:00Z');
  try{
    db.prepare("INSERT INTO signature_users(id,email,password_hash,display_name) VALUES ('sig-1','admin@example.test','hash','Admin')").run();
    db.prepare("INSERT INTO signature_sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES ('old-session','sig-1','token-old','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')").run();
    db.prepare("INSERT INTO api_keys(id,name,secret_hash,expires_at,revoked_at,created_at) VALUES ('old-key','Old','hash','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2025-01-01T00:00:00Z')").run();
    db.prepare("INSERT INTO integration_sync_runs(id,provider,status,started_at,completed_at) VALUES ('old-sync','connectwise','succeeded','2025-01-01T00:00:00Z','2025-01-01T00:01:00Z')").run();
    db.prepare("INSERT INTO audit_events(request_id,action,resource_type,outcome,created_at) VALUES ('old-audit','test','test','success','2018-01-01T00:00:00Z'),('fresh-audit','test','test','success','2026-07-01T00:00:00Z')").run();
    const result=runRetention(db,{auditDays:2555,syncDays:365,securityDays:90},now);assert.deepEqual(result.deleted,{signatureSessions:1,apiKeys:1,syncRuns:1,auditEvents:1});assert.equal(db.prepare('SELECT COUNT(*) AS total FROM audit_events').get().total,1);assert.equal(db.prepare("SELECT COUNT(*) AS total FROM operational_events WHERE event_type='retention' AND status='succeeded'").get().total,1);
  }finally{db.close();fs.rmSync(directory,{recursive:true,force:true})}
});

test('backup pruning deletes only aged Northstar backup artifacts',async()=>{
  const directory=temporary();const oldBackup=path.join(directory,'northstar-old.nsbak');const unrelated=path.join(directory,'northstar-unrelated.nsbak');const recent=path.join(directory,'northstar-recent.nsbak');
  try{fs.writeFileSync(oldBackup,MAGIC);fs.writeFileSync(unrelated,'not a Northstar backup');fs.writeFileSync(recent,MAGIC);const old=new Date('2026-01-01T00:00:00Z');fs.utimesSync(oldBackup,old,old);fs.utimesSync(unrelated,old,old);const result=await pruneEncryptedBackups({directory,retentionDays:35,now:new Date('2026-07-20T00:00:00Z')});assert.deepEqual(result.deleted,['northstar-old.nsbak']);assert.equal(fs.existsSync(unrelated),true);assert.equal(fs.existsSync(recent),true)}finally{fs.rmSync(directory,{recursive:true,force:true})}
});
