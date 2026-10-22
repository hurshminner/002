import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

try {
  const [action, path] = process.argv.slice(2);
  const { PLANET_URL, PLANET_ADMIN_TOKEN, PLANET_BACKUP_KEY } = process.env;
  if (!['export', 'restore'].includes(action) || !path) throw new Error('Usage: npm run backup -- export|restore <file.planet>');
  if (!PLANET_URL || !PLANET_ADMIN_TOKEN || !/^[a-f0-9]{64}$/.test(PLANET_BACKUP_KEY ?? '')) {
    throw new Error('Set PLANET_URL, PLANET_ADMIN_TOKEN and PLANET_BACKUP_KEY (64 hex characters) securely.');
  }
  const url = new URL(PLANET_URL);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('HTTPS is required.');
  const key = Buffer.from(PLANET_BACKUP_KEY, 'hex');
  const request = async (endpoint, body) => {
    const r = await fetch(new URL(`/api/admin/${endpoint}`, url), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${PLANET_ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`Backup operation rejected (HTTP ${r.status}). For restore, both players must be offline.`);
    return r.text();
  };
  if (action === 'export') {
    const data = await request('backup');
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ format: 'planet-aes256gcm-v1', iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }), { mode: 0o600, flag: 'wx' });
    console.log('Encrypted backup created. Keep the encryption key separately.');
  } else {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (data.format !== 'planet-aes256gcm-v1') throw new Error('Unsupported backup format');
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'base64'));
    cipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    const plaintext = Buffer.concat([cipher.update(Buffer.from(data.ciphertext, 'base64')), cipher.final()]);
    await request('restore', plaintext.toString('utf8'));
    console.log('Backup restored. Previous state was snapshotted before restore.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
