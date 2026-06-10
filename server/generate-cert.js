/**
 * 生成自签名SSL证书
 * 使用方法: node generate-cert.js
 */

const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

console.log('🔐 生成自签名 SSL 证书...');

const attrs = [{ name: 'commonName', value: 'localhost' }];

selfsigned.generate(attrs, {
  algorithm: 'sha256',
  keySize: 2048,
  days: 365,
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: '192.168.1.12' }
      ]
    }
  ]
}, function(err, result) {
  if (err) {
    console.error('❌ 生成证书失败:', err);
    return;
  }
  
  const certPath = path.join(__dirname, 'cert.pem');
  const keyPath = path.join(__dirname, 'key.pem');
  
  fs.writeFileSync(certPath, result.cert);
  fs.writeFileSync(keyPath, result.private);
  
  console.log('✅ 证书生成成功！');
  console.log(`📄 证书文件: ${certPath}`);
  console.log(`🔑 私钥文件: ${keyPath}`);
  console.log('💡 现在可以启动 WSS 服务器了');
});
