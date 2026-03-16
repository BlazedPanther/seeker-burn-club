#!/usr/bin/env npx tsx
/// <reference types="node" />

import 'dotenv/config';
import postgres from 'postgres';
import { Connection } from '@solana/web3.js';

type BurnRow = {
  tx_signature: string;
  burn_amount: string;
  fee_amount: string;
  verified_at: Date;
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const treasuryAta = process.env.TREASURY_SKR_ATA;

  if (!databaseUrl || !rpcUrl || !treasuryAta) {
    throw new Error('Missing one of DATABASE_URL, SOLANA_RPC_URL, TREASURY_SKR_ATA');
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const conn = new Connection(rpcUrl, 'confirmed');

  try {
    const rows = await sql<BurnRow[]>`
      SELECT tx_signature, burn_amount::text, fee_amount::text, verified_at
      FROM burns
      WHERE status = 'VERIFIED'
      ORDER BY verified_at DESC
      LIMIT 10
    `;

    console.log(`Auditing ${rows.length} recent verified burns`);

    let ratioPass = 0;
    let treasuryTransferFound = 0;

    for (const row of rows) {
      const burn = Number(row.burn_amount);
      const feeDb = Number(row.fee_amount);
      const expectedFee = burn * 0.01;
      const ratioOk = Math.abs(feeDb - expectedFee) <= 0.00001;
      if (ratioOk) ratioPass += 1;

      const tx = await conn.getParsedTransaction(row.tx_signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });

      let transferToTreasuryFound = false;
      let onchainFeeAmount: number | null = null;

      const instructions = tx?.transaction?.message?.instructions ?? [];
      for (const ix of instructions) {
        const parsed = (ix as { parsed?: { type?: string; info?: Record<string, unknown> } }).parsed;
        if (!parsed) continue;

        const type = parsed.type;
        if (type !== 'transfer' && type !== 'transferChecked') continue;

        const info = parsed.info ?? {};
        const destination = String(info.destination ?? '');
        if (destination !== treasuryAta) continue;

        transferToTreasuryFound = true;

        const tokenAmount = info.tokenAmount as { uiAmountString?: string } | undefined;
        if (tokenAmount?.uiAmountString) {
          onchainFeeAmount = Number(tokenAmount.uiAmountString);
        } else if (typeof info.amount === 'string') {
          onchainFeeAmount = Number(info.amount);
        }
      }

      if (transferToTreasuryFound) treasuryTransferFound += 1;

      console.log(JSON.stringify({
        signature: row.tx_signature,
        burn,
        feeDb,
        expectedFee: Number(expectedFee.toFixed(6)),
        ratioPct: Number(((feeDb / burn) * 100).toFixed(4)),
        ratioOk,
        transferToTreasuryFound,
        onchainFeeAmount,
      }));
    }

    console.log('--- Summary ---');
    console.log(`1% ratio checks passed: ${ratioPass}/${rows.length}`);
    console.log(`Treasury transfer found on-chain: ${treasuryTransferFound}/${rows.length}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
