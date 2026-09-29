import crypto from 'crypto';
import { getPool } from '../db';
import { config } from '../config';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(config.SIGNING_ENCRYPTION_KEY, 'utf-8');

if (KEY.length !== 32) {
  throw new Error('SIGNING_ENCRYPTION_KEY must be exactly 32 bytes');
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

export function decrypt(enc: string): string {
  const parts = enc.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedText, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  let out = '{';
  for (let i = 0; i < keys.length; i++) {
    out += JSON.stringify(keys[i]) + ':' + canonicalize(obj[keys[i]]);
    if (i < keys.length - 1) out += ',';
  }
  out += '}';
  return out;
}

export async function getOrGenerateActiveKey(): Promise<{ kid: string, privateKey: string, publicKey: string }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Database-level concurrency protection
    await client.query('SELECT pg_advisory_xact_lock(987654321)');
    
    const { rows } = await client.query(
      'SELECT kid, public_key, encrypted_private_key FROM server_signing_keys WHERE retired_at IS NULL ORDER BY created_at DESC LIMIT 1'
    );
    
    if (rows.length > 0) {
      await client.query('COMMIT');
      return {
        kid: rows[0].kid,
        publicKey: rows[0].public_key,
        privateKey: decrypt(rows[0].encrypted_private_key)
      };
    }
    
    // Generate new key
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    
    const kid = crypto.randomUUID();
    const encryptedPriv = encrypt(privPem);
    
    await client.query(
      'INSERT INTO server_signing_keys (kid, public_key, encrypted_private_key) VALUES ($1, $2, $3)',
      [kid, pubPem, encryptedPriv]
    );
    
    await client.query('COMMIT');
    return { kid, publicKey: pubPem, privateKey: privPem };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function signPayload(payload: any): Promise<{ signature: string, kid: string }> {
  const { kid, privateKey } = await getOrGenerateActiveKey();
  const canonical = canonicalize(payload);
  const priv = crypto.createPrivateKey(privateKey);
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), priv).toString('base64');
  return { signature, kid };
}
