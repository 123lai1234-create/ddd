const { execSync } = require('child_process');
const json = JSON.stringify({url: 'https://donttalk.vercel.app/music'});
const result = execSync(`mavis browser tool navigate '${json}'`, {encoding: 'utf8'});
console.log(result);
