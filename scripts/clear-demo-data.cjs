'use strict';
const {loadConfig}=require('../server/config.cjs');
const {openDatabase}=require('../server/database.cjs');

const config=loadConfig(process.env);
const db=openDatabase(config.databasePath);
const tables=db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'`).all().map(row=>row.name);
db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
try{
  for(const table of tables)db.exec(`DELETE FROM "${table.replace(/"/g,'')}";`);
  db.prepare(`INSERT INTO portal_settings(setting_id,setting_key,setting_value_json,scope,company_id,updated_by_user_id) VALUES ('msp:global:system.demo-data-cleared','system.demo-data-cleared','true','msp',NULL,NULL)`).run();
  db.exec('COMMIT; PRAGMA foreign_keys = ON;');
  console.log(`Cleared demo data from ${config.databasePath}.`);
}catch(error){try{db.exec('ROLLBACK; PRAGMA foreign_keys = ON;')}catch{}throw error}finally{db.close()}
