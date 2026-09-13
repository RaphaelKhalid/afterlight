import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const allowedPublic=new Set(['DISCORD_APPLICATION_ID','DISCORD_PUBLIC_KEY']);
const secretValues=fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(x=>x.includes('=')&&!x.trim().startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}).filter(([k,v])=>!allowedPublic.has(k)&&v.length>6);
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
let checked=0;const hits=[];
for(const path of paths){if(/\.(png|webp|jpg|jpeg|gif|ico|woff2?|zip)$/i.test(path)||!fs.existsSync(path))continue;const content=fs.readFileSync(path,'utf8');checked++;for(const [name,value]of secretValues)if(content.includes(value))hits.push({path,secretName:name});if(/(?:sk-proj-|sk-or-v1-)[A-Za-z0-9_-]{20}/.test(content))hits.push({path,secretName:'key-pattern'});}
console.log(JSON.stringify({checkedFiles:checked,secretFindings:hits}));if(hits.length)process.exitCode=1;
