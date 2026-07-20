'use strict';
const {randomBytes,scryptSync}=require('node:crypto');
const {loadConfig}=require('../server/config.cjs');
const {openDatabase}=require('../server/database.cjs');

function hashPassword(password,salt=randomBytes(16).toString('hex')){
  return `${salt}:${scryptSync(String(password),salt,64).toString('hex')}`;
}

const email=String(process.env.SIGNATURE_ADMIN_EMAIL||'').trim().toLowerCase();
const password=process.env.SIGNATURE_ADMIN_PASSWORD||'';
if(!email)throw new Error('SIGNATURE_ADMIN_EMAIL is required.');
if(password.length<12)throw new Error('SIGNATURE_ADMIN_PASSWORD is required and must be at least 12 characters.');

const db=openDatabase(loadConfig().databasePath);
try{
  const user=db.prepare('SELECT id,email FROM signature_users WHERE lower(email)=lower(?)').get(email);
  if(!user)throw new Error(`No signature user found for ${email}.`);
  db.prepare(`UPDATE signature_users SET password_hash=?,role='admin',status='active',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(hashPassword(password),user.id);
  console.log(`Signature administrator reset for ${user.email}.`);
}finally{
  db.close();
}
