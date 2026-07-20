'use strict';
const fs=require('node:fs');const path=require('node:path');
for(const file of ['app.js','auth.js','auth-config.js','portal-api.js','portal-store.js','enterprise.css','signature.html','signature.css','signature.js','admin.html','admin.css','admin.js','setup.html','setup.css','setup.js'])fs.copyFileSync(path.join(__dirname,file),path.join(__dirname,'dist',file));
fs.cpSync(path.join(__dirname,'public'),path.join(__dirname,'dist'),{recursive:true});
