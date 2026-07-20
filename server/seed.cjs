'use strict';
const {randomUUID}=require('node:crypto');

const companySeeds=[
  ['cmp_acme','acme','acme','Acme & Co.','Acme & Company, LLC','Managed Complete','acme.example',94,92,2,42,48,482000,99.4],
  ['cmp_atlas','atlas','atlas-partners','Atlas Partners','Atlas Partners, LLP','Managed Complete','atlaspartners.example',72,68,11,86,101,1240000,94.8],
  ['cmp_brightline','brightline','brightline-legal','Brightline Legal','Brightline Legal, PC','Managed Complete','brightline.example',82,84,8,64,78,986000,97.2],
  ['cmp_harbor','harbor','harbor-construction','Harbor Construction','Harbor Construction Group, Inc.','Managed Infrastructure','harborbuild.example',91,89,5,112,164,1465000,100],
  ['cmp_greenfield','greenfield','greenfield-foods','Greenfield Foods','Greenfield Foods, Inc.','Managed Complete','greenfieldfoods.example',87,90,4,73,92,1045000,98.6],
  ['cmp_simi','simi-dental','simi-valley-dental','Simi Valley Dental Group','Simi Valley Dental Group, PLLC','Managed Complete','simivalleydental.example',96,95,1,31,39,398000,100],
  ['cmp_westcoast','westcoast','west-coast-manufacturing','West Coast Manufacturing','West Coast Manufacturing, Inc.','Managed Infrastructure','wcmfg.example',84,86,6,145,208,1710000,97.9],
  ['cmp_northstarpm','northstar-pm','northstar-property-management','Northstar Property Management','Northstar Property Management, LLC','Managed Complete','northstarpm.example',90,91,3,58,76,842000,99.1],
  ['cmp_cascade','cascade','cascade-accounting','Cascade Accounting','Cascade Accounting Group, LLP','Managed Complete','cascadeacct.example',93,94,2,38,44,536000,99.6],
  ['cmp_pioneer','pioneer','pioneer-logistics','Pioneer Logistics','Pioneer Logistics, Inc.','Managed Infrastructure','pioneerlogistics.example',79,81,9,127,184,1384000,96.8],
  ['cmp_summit','summit','summit-architecture','Summit Architecture','Summit Architecture Studio, PC','Managed Complete','summitarch.example',95,93,1,27,35,376000,100],
  ['cmp_oakridge','oakridge','oakridge-medical','Oakridge Medical','Oakridge Medical Associates, PC','Security Advanced','oakridgemed.example',88,96,4,94,117,1128000,98.2],
  ['cmp_bluewater','bluewater','bluewater-hospitality','Bluewater Hospitality','Bluewater Hospitality Group, LLC','Managed Complete','bluewater.example',86,88,5,108,143,1296000,97.6],
  ['cmp_redwood','redwood','redwood-engineering','Redwood Engineering','Redwood Engineering, Inc.','Managed Infrastructure','redwoodeng.example',92,90,2,49,72,714000,99.3],
  ['cmp_sterling','sterling','sterling-financial','Sterling Financial','Sterling Financial Advisors, LLC','Security Advanced','sterlingfa.example',97,98,1,34,41,592000,100],
  ['cmp_lakeside','lakeside','lakeside-pediatrics','Lakeside Pediatrics','Lakeside Pediatrics, PLLC','Managed Complete','lakesidepeds.example',89,94,3,55,67,804000,98.9],
  ['cmp_ironwood','ironwood','ironwood-distribution','Ironwood Distribution','Ironwood Distribution Corp.','Managed Infrastructure','ironwooddist.example',81,83,7,119,176,1345000,96.5],
  ['cmp_meridian','meridian','meridian-consulting','Meridian Consulting','Meridian Consulting Group, LLC','Managed Complete','meridianconsult.example',94,92,2,46,53,648000,99.5],
  ['cmp_riverview','riverview','riverview-schools','Riverview Schools','Riverview Charter Schools','Managed Complete','riverviewschools.example',85,91,6,216,287,1985000,97.8],
  ['cmp_evergreen','evergreen','evergreen-insurance','Evergreen Insurance','Evergreen Insurance Agency, Inc.','Security Advanced','evergreenins.example',96,97,1,62,73,936000,100],
  ['cmp_coastal','coastal','coastal-veterinary','Coastal Veterinary','Coastal Veterinary Partners, PLLC','Managed Complete','coastalvet.example',91,93,3,44,57,672000,99.2],
  ['cmp_foundry','foundry','foundry-creative','Foundry Creative','Foundry Creative Studio, LLC','Managed Complete','foundrycreative.example',93,89,2,29,36,421000,99.7],
  ['cmp_willow','willow','willow-senior-living','Willow Senior Living','Willow Senior Living Communities, LLC','Managed Complete','willowsenior.example',87,92,5,132,169,1512000,98.1],
  ['cmp_apex','apex','apex-auto-group','Apex Auto Group','Apex Automotive Group, Inc.','Managed Infrastructure','apexauto.example',83,85,8,154,226,1786000,96.9]
];
const featureKeys=['overview','support','remote','knowledge','services','security','messages','documents','metrics','billing','company','passwords','restrictions','team'];

function seedDemoData(db){
  const cleared=db.prepare(`SELECT 1 FROM portal_settings WHERE setting_id='msp:global:system.demo-data-cleared'`).get();
  if(cleared)return false;
  if(db.prepare('SELECT COUNT(*) AS total FROM companies').get().total>0)return false;
  const insertCompany=db.prepare(`INSERT INTO companies
    (id,external_key,slug,name,legal_name,plan_name,primary_domain) VALUES (?,?,?,?,?,?,?)`);
  const insertSnapshot=db.prepare(`INSERT INTO company_snapshots
    (company_id,health_score,security_score,open_tickets,managed_users,managed_devices,monthly_recurring_revenue_cents,sla_attainment,snapshot_json)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertFeature=db.prepare('INSERT INTO feature_entitlements(company_id,feature_key,enabled) VALUES (?,?,1)');
  db.exec('BEGIN IMMEDIATE;');
  try{
    for(const c of companySeeds){
      insertCompany.run(...c.slice(0,7));
      insertSnapshot.run(c[0],...c.slice(7),JSON.stringify({source:'seed',lifecycle:'managed'}));
      for(const key of featureKeys)insertFeature.run(c[0],key);
    }
    const insertUser=db.prepare(`INSERT INTO users
      (id,entra_tenant_id,entra_object_id,email,display_name,status,platform_role,platform_scope) VALUES (?,?,?,?,?,'active',?,?)`);
    insertUser.run('usr_msp_owner','demo-tenant','demo-msp-oid','morgan@northstar.example','Morgan Reed','msp_owner','all');
    insertUser.run('usr_msp_admin','demo-tenant','demo-msp-admin-oid','maya@northstar.example','Maya Johnson','msp_admin','assigned');
    insertUser.run('usr_acme_admin','demo-tenant','demo-admin-oid','taylor@acme.example','Taylor Morgan','none','assigned');
    insertUser.run('usr_acme_user','demo-tenant','demo-user-oid','jordan@acme.example','Jordan Taylor','none','assigned');
    const membership=db.prepare(`INSERT INTO memberships(id,user_id,company_id,role,status,is_default) VALUES (?,?,?,?,'active',1)`);
    membership.run('mem_acme_admin','usr_acme_admin','cmp_acme','client_admin');
    membership.run('mem_acme_user','usr_acme_user','cmp_acme','client_user');
    const scope=db.prepare('INSERT INTO msp_company_scopes(user_id,company_id) VALUES (?,?)');
    for(const id of ['cmp_acme','cmp_atlas','cmp_brightline','cmp_harbor','cmp_greenfield','cmp_simi','cmp_westcoast','cmp_northstarpm'])scope.run('usr_msp_admin',id);
    const integration=db.prepare(`INSERT INTO integration_connections
      (id,company_id,provider,display_name,status,sync_state,client_visible,secret_reference,last_sync_at)
      VALUES (?,?,?,?, 'connected','healthy',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
    for(const item of [
      ['int_connectwise',null,'connectwise','ConnectWise PSA',0,'vault://integrations/connectwise'],
      ['int_screenconnect',null,'screenconnect','ScreenConnect',1,'vault://integrations/screenconnect'],
      ['int_hudu',null,'hudu','Hudu',1,'vault://integrations/hudu'],
      ['int_bitdefender',null,'bitdefender','Bitdefender GravityZone',1,'vault://integrations/bitdefender'],
      ['int_microsoft',null,'microsoft365','Microsoft 365',1,'vault://integrations/microsoft365']
    ])integration.run(...item);
    db.exec('COMMIT;');
    return true;
  }catch(error){db.exec('ROLLBACK;');throw error}
}

function createId(prefix){return `${prefix}_${randomUUID()}`}
module.exports={seedDemoData,createId,companySeeds,featureKeys};
