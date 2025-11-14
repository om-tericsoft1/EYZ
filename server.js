const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');
const os = require('os');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const port = 3000;
const host = '0.0.0.0'; // Listen on all network interfaces

const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, '192.168.1.20+2-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '192.168.1.20+2.pem')),
};

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  
  return addresses;
}

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, host, (err) => {
    if (err) throw err;
    
    const localIPs = getLocalIPs();
    
    console.log('\n🚀 Server is running!');
    console.log('\n📱 Access from your devices:');
    console.log(`   Localhost:    https://localhost:${port}`);
    
    localIPs.forEach(ip => {
      console.log(`   Local Network: https://${ip}:${port}`);
    });
    
    console.log('\n⚙️  Backend API:');
    localIPs.forEach(ip => {
      console.log(`   https://${ip}:8000`);
    });
    
    console.log('\n⚠️  Note: You may need to accept the self-signed certificate on each device\n');
  });
});