import express from 'express';
import bodyParser from 'body-parser';
import { verifyMessage, toUtf8Bytes, keccak256 } from 'ethers';
import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = process.env.DB_PATH || 'zvan.db';
const SERVER_SECRET = process.env.SERVER_SECRET || 'CHANGE_THIS_SECRET';
const ZVAN_HOST_CLI = process.env.ZVAN_HOST_CLI || path.resolve('../zvan-host/target/debug/zvan-host');

const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS mappings (
  host_token TEXT PRIMARY KEY,
  address TEXT,
  nonce TEXT,
  created_at INTEGER,
  receipt_path TEXT
)`);

const app = express();
app.use(bodyParser.json({ limit: "2mb" }));

function makeHostToken(address, nonce) {
  // HMAC-SHA256(server_secret, address || '|' || nonce)
  return crypto.createHmac('sha256', SERVER_SECRET).update(`${address}|${nonce}`).digest('hex');
}

app.post('/submit', async (req, res) => {
  try {
    const { address, signature, message, patientData, nonce } = req.body;
    if (!address || !signature || !message || !patientData || !nonce) {
      return res.status(400).json({ error: 'missing fields' });
    }

    // verify signature
    const recovered = verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(400).json({ error: 'invalid signature' });
    }

    // create host token
    const host_token = makeHostToken(address, nonce);

    // persist patient JSON to temp file
    const tmpPatientPath = path.resolve(`./tmp_patient_${Date.now()}.json`);
    fs.writeFileSync(tmpPatientPath, JSON.stringify(patientData));

    // receipt destination
    const receiptPath = path.resolve(`./receipts/receipt_${Date.now()}.bin`);
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });

    // call zvan-host CLI
    const cli = spawn(ZVAN_HOST_CLI, [tmpPatientPath, host_token, receiptPath], { stdio: 'inherit' });

    cli.on('close', (code) => {
      // cleanup tmp patient file
      try { fs.unlinkSync(tmpPatientPath); } catch(e) {}

      if (code !== 0) {
        return res.status(500).json({ error: 'zvan-host failed', code });
      }

      // store mapping
      const stmt = db.prepare('INSERT OR REPLACE INTO mappings (host_token, address, nonce, created_at, receipt_path) VALUES (?, ?, ?, ?, ?)');
      stmt.run(host_token, address, nonce, Date.now(), receiptPath);

      return res.json({ ok: true, host_token, receipt_path: receiptPath });
    });

    cli.on('error', (err) => {
      try { fs.unlinkSync(tmpPatientPath); } catch(e) {}
      return res.status(500).json({ error: err.message });
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/receipt/:host_token', (req, res) => {
  const host_token = req.params.host_token;
  const row = db.prepare('SELECT * FROM mappings WHERE host_token = ?').get(host_token);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.resolve(row.receipt_path));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
