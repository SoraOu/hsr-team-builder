#!/usr/bin/env node
/* Optional: add a single non-invasive link to the existing index.html;
 * save a .bak copy and do not change any existing calculator logic. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const p=path.join(__dirname,'..','index.html');
if(!fs.existsSync(p)){console.error('index.html not found — merge this overlay into the existing repository first');process.exit(2)}
const original=fs.readFileSync(p,'utf8');
const tag='<a id="hsr-optimizer-link" href="optimizer.html" style="position:fixed;right:16px;bottom:16px;z-index:99999;padding:11px 16px;background:#125c76;color:white;border-radius:9px;text-decoration:none;font:600 13px Segoe UI,sans-serif;box-shadow:0 5px 20px #0004">Try Dynamic Optimizer (experimental)</a>';
if(original.includes('id="hsr-optimizer-link"')){console.log('Link already installed');process.exit(0)}
if(!/<\/body>/i.test(original))throw new Error('Missing closing body tag');
fs.writeFileSync(p+'.optimizer.bak',original);
fs.writeFileSync(p,original.replace(/<\/body>/i,tag+'\n</body>'));
console.log('Added link to existing index.html; original backed up to index.html.optimizer.bak');
