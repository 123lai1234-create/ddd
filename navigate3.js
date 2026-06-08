const { spawn } = require('child_process');
const json = JSON.stringify({url: 'https://donttalk.vercel.app/music'});
const mavisPath = 'C:\\Users\\User\\.mavis\\bin\\mavis.cmd';
const proc = spawn(mavisPath, ['browser', 'tool', 'navigate', json], {stdio: 'inherit', shell: false, windowsHide: true});
proc.on('close', (code) => process.exit(code));
proc.on('error', (err) => {
    console.error('Error:', err);
    process.exit(1);
});
