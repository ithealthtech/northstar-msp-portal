'use strict';
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const outDir=path.join(root,'release','northstar-msp-portal');
function copyFile(source,target){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target)}
function copyDir(source,target){for(const entry of fs.readdirSync(source,{withFileTypes:true})){const from=path.join(source,entry.name);const to=path.join(target,entry.name);if(entry.isDirectory())copyDir(from,to);else copyFile(from,to)}}
fs.rmSync(outDir,{recursive:true,force:true});
fs.mkdirSync(outDir,{recursive:true});
for(const file of ['server.cjs','package.json','package-lock.json','.env.example','README.md','DEPLOYMENT.md'])copyFile(path.join(root,file),path.join(outDir,file));
copyDir(path.join(root,'server'),path.join(outDir,'server'));
copyDir(path.join(root,'scripts'),path.join(outDir,'scripts'));
copyDir(path.join(root,'docs'),path.join(outDir,'docs'));
copyDir(path.join(root,'dist'),path.join(outDir,'dist'));
fs.writeFileSync(path.join(outDir,'install-windows.ps1'),`param([string]$InstallPath = "$env:ProgramFiles\\\\Northstar MSP Portal")
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Copy-Item -Recurse -Force "$PSScriptRoot\\\\*" $InstallPath
Write-Host "Northstar MSP Portal copied to $InstallPath"
Write-Host "Next: copy .env.example to .env.local, configure Microsoft Entra, then run: npm install --omit=dev; npm run db:init; npm start"
`);
fs.writeFileSync(path.join(outDir,'start-production.cmd'),`@echo off
set NODE_ENV=production
npm start
`);
console.log(`Install package staged at ${outDir}`);
