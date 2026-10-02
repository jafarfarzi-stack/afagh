#!/usr/bin/env node
/**
 * Seed script for payment gateways and POS terminals
 * Run with: npm run db:seed:pos
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and } from 'drizzle-orm';
import { universities, payment_gateways, pos_terminals } from '@/db/schema';
import { sql } from 'drizzle-orm';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const GATEWAYS = [
  {
    code: 'ZARINPAL',
    title: 'زرین‌پال (ZarinPal)',
    config: { merchantId: '', callbackUrl: '/api/payment/callback/zarinpal', sandbox: true },
    isSandbox: 1,
  },
  {
    code: 'MELLAT',
    title: 'بانک ملت (Mellat Bank)',
    config: { terminalId: '', merchantId: '', callbackUrl: '/api/payment/callback/mellat', username: '', password: '' },
    isSandbox: 1,
  },
  {
    code: 'SAMAN',
    title: 'بانک سامان (Saman Bank)',
    config: { terminalId: '', merchantId: '', callbackUrl: '/api/payment/callback/saman', pin: '' },
    isSandbox: 1,
  },
  {
    code: 'PARSIAN',
    title: 'بانک پارسیان (Parsian Bank)',
    config: { terminalId: '', merchantId: '', callbackUrl: '/api/payment/callback/parsian', pin: '' },
    isSandbox: 1,
  },
  {
    code: 'PASARGAD',
    title: 'بانک پاسارگاد (Pasargad Bank)',
    config: { terminalId: '', merchantId: '', callbackUrl: '/api/payment/callback/pasargad', pin: '' },
    isSandbox: 1,
  },
  {
    code: 'SADAD',
    title: 'صاد (SADAD)',
    config: { terminalId: '', merchantId: '', callbackUrl: '/api/payment/callback/sadad', pin: '' },
    isSandbox: 1,
  },
];

async function seed() {
  console.log('🌱 Seeding payment gateways and POS terminals...');

  const unis = await db.select().from(universities).where(eq(universities.isActive, 1));
  if (!unis.length) {
    console.log('❌ No active universities found');
    await pool.end();
    return;
  }

  for (const uni of unis) {
    console.log(`  University: ${uni.title} (${uni.id})`);

    // Seed gateways
    for (const gw of GATEWAYS) {
      const existing = await db.select().from(payment_gateways)
        .where(and(eq(payment_gateways.universityId, uni.id), eq(payment_gateways.code, gw.code)))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(payment_gateways).values({
          universityId: uni.id,
          code: gw.code,
          title: gw.title,
          config: gw.config,
          isActive: 0, // inactive by default until configured
          isSandbox: gw.isSandbox,
          sortOrder: 0,
        });
        console.log(`    ✅ Added gateway: ${gw.title}`);
      } else {
        console.log(`    ⏭️  Gateway exists: ${gw.title}`);
      }
    }

    // Seed default POS terminals (one per gateway)
    const mellatGw = await db.select().from(payment_gateways)
      .where(and(eq(payment_gateways.universityId, uni.id), eq(payment_gateways.code, 'MELLAT')))
      .limit(1);
    
    if (mellatGw.length > 0) {
      const existingPos = await db.select().from(pos_terminals)
        .where(and(eq(pos_terminals.universityId, uni.id), eq(pos_terminals.code, 'POS-MAIN')))
        .limit(1);
      
      if (existingPos.length === 0) {
        await db.insert(pos_terminals).values({
          universityId: uni.id,
          code: 'POS-MAIN',
          title: 'ترمینال اصلی صندوق مرکزی',
          location: 'ساختمان مدیریت، طبقه همکف، اتاق صندوق',
          gatewayId: mellatGw[0].id,
          terminalId: 'TID' + Math.floor(Math.random() * 1000000).toString().padStart(8, '0'),
          merchantId: 'MID' + Math.floor(Math.random() * 1000000).toString().padStart(8, '0'),
          config: { ipAddress: '192.168.1.100', port: 8080, pinPadSerial: '', baudRate: 9600 },
          isActive: 0,
          sortOrder: 1,
        });
        console.log(`    ✅ Added POS terminal: ترمینال اصلی صندوق مرکزی`);
      }
    }

    // Add a second terminal for student affairs
    const parsianGw = await db.select().from(payment_gateways)
      .where(and(eq(payment_gateways.universityId, uni.id), eq(payment_gateways.code, 'PARSIAN')))
      .limit(1);
    
    if (parsianGw.length > 0) {
      const existingPos2 = await db.select().from(pos_terminals)
        .where(and(eq(pos_terminals.universityId, uni.id), eq(pos_terminals.code, 'POS-AFFAIRS')))
        .limit(1);
      
      if (existingPos2.length === 0) {
        await db.insert(pos_terminals).values({
          universityId: uni.id,
          code: 'POS-AFFAIRS',
          title: 'ترمینال امور دانشجویی',
          location: 'ساختمان امور دانشجویی، طبقه ۱، اتاق ثبت‌نام',
          gatewayId: parsianGw[0].id,
          terminalId: 'TID' + Math.floor(Math.random() * 1000000).toString().padStart(8, '0'),
          merchantId: 'MID' + Math.floor(Math.random() * 1000000).toString().padStart(8, '0'),
          config: { ipAddress: '192.168.1.101', port: 8080, pinPadSerial: '', baudRate: 9600 },
          isActive: 0,
          sortOrder: 2,
        });
        console.log(`    ✅ Added POS terminal: ترمینال امور دانشجویی`);
      }
    }
  }

  console.log('✅ Seeding complete');
  await pool.end();
}

seed().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});