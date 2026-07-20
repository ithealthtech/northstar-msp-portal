'use strict';
const {loadConfig}=require('../server/config.cjs');
const {openDatabase}=require('../server/database.cjs');
const {seedDemoData}=require('../server/seed.cjs');

const config=loadConfig(process.env);
const db=openDatabase(config.databasePath);
try{
  const companies=db.prepare('SELECT COUNT(*) AS total FROM companies').get().total;
  const users=db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if(companies||users)throw new Error('Interactive demo bootstrap requires an empty portal database. Clear the database first or use a separate DATABASE_PATH.');
  db.prepare(`DELETE FROM portal_settings WHERE setting_id='msp:global:system.demo-data-cleared'`).run();
  if(!seedDemoData(db))throw new Error('Interactive demo data could not be initialized.');
  console.log(`Interactive demo initialized at ${config.databasePath}.`);
}finally{db.close()}
