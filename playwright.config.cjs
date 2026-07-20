'use strict';
const {defineConfig}=require('@playwright/test');

module.exports=defineConfig({
  testDir:'./e2e',
  timeout:30000,
  expect:{timeout:7000},
  fullyParallel:false,
  workers:1,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?'github':'line',
  globalSetup:require.resolve('./e2e/global-setup.cjs'),
  use:{
    baseURL:'http://127.0.0.1:4191',
    channel:'chrome',
    headless:true,
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off'
  }
});
