#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const distCli = path.join(__dirname, '../dist/src/cli.js');
const tsCli = path.join(__dirname, '../src/cli.ts');

if (fs.existsSync(distCli)) {
  require(distCli);
} else {
  require('ts-node/register');
  require(tsCli);
}
