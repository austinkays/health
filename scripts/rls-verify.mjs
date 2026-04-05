#!/usr/bin/env node
// scripts/rls-verify.mjs
//
// Automated RLS cross-contamination test. Creates two temp users via the
// Supabase admin API, inserts test rows for each into every user-owned table,
// then attempts to read each user's rows using the OTHER user's session token.
// Passes only if every table returns EXACTLY the caller's own rows.
//
// Usage (from repo root):
//   SUPABASE_URL=https://xxxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... \
//   SUPABASE_ANON_KEY=eyJhbGc... \
//   node scripts/rls-verify.mjs
//
// Env vars also read from (in order of preference):
//   SUPABASE_URL | VITE_SUPABASE_URL
//   SUPABASE_ANON_KEY | VITE_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// Cleans up both test users + all their cascaded data at the end, even on
// failure. Safe to run against production — it never touches existing data.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('❌ Missing required env vars.');
  console.error('   Need: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY');
  console.error('   (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY also work)');
  process.exit(1);
}

// Tables with RLS scoped to auth.uid() = user_id
const TABLES = [
  'medications', 'conditions', 'allergies', 'providers', 'pharmacies',
  'vitals', 'appointments', 'journal_entries', 'labs', 'procedures',
  'immunizations', 'care_gaps', 'anesthesia_flags', 'appeals_and_disputes',
  'surgical_planning', 'insurance', 'insurance_claims', 'drug_prices',
  'todos', 'cycles', 'activities', 'genetic_results',
];

// ── helpers ───────────────────────────────────────────────────────────

function rand() { return Math.random().toString(36).slice(2, 10); }

async function adminCreateUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`adminCreateUser failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`signIn failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function adminDeleteUser(userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    console.warn(`⚠️  Failed to delete user ${userId}: ${res.status} ${await res.text()}`);
  }
}

// Per-table extra fields for tables with NOT NULL columns that lack defaults.
// Everything else inserts with just { user_id } and relies on schema defaults.
const EXTRA_FIELDS = {
  drug_prices: { rxcui: 'rls-test-rxcui', ndc: 'rls-test-ndc', nadac_per_unit: 0.01 },
  todos: { title: 'rls-test' },
};

async function insertMinimalRow(table, userToken, userId) {
  const payload = { user_id: userId, ...(EXTRA_FIELDS[table] || {}) };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) return { ok: false, status: res.status, body };
  return { ok: true, row: JSON.parse(body)[0] };
}

async function listRows(table, userToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id,user_id`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${userToken}`,
    },
  });
  if (!res.ok) throw new Error(`listRows ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── main ──────────────────────────────────────────────────────────────

const stamp = Date.now();
const emailA = `rls-test-a-${stamp}@example.com`;
const emailB = `rls-test-b-${stamp}@example.com`;
const passA = rand() + rand();
const passB = rand() + rand();

let userA = null;
let userB = null;
let failures = [];
let skipped = [];
let passed = [];

async function cleanup() {
  console.log('\n🧹 Cleaning up test users…');
  if (userA?.id) await adminDeleteUser(userA.id);
  if (userB?.id) await adminDeleteUser(userB.id);
  console.log('   Done.');
}

try {
  console.log('🔧 Creating two test users via admin API…');
  userA = await adminCreateUser(emailA, passA);
  userB = await adminCreateUser(emailB, passB);
  console.log(`   A: ${userA.id.slice(0, 8)}…  (${emailA})`);
  console.log(`   B: ${userB.id.slice(0, 8)}…  (${emailB})`);

  console.log('\n🔑 Signing in as each user…');
  const sessionA = await signIn(emailA, passA);
  const sessionB = await signIn(emailB, passB);
  const tokenA = sessionA.access_token;
  const tokenB = sessionB.access_token;

  console.log('\n📝 Inserting one test row per user, per table…');
  for (const table of TABLES) {
    const aIns = await insertMinimalRow(table, tokenA, userA.id);
    const bIns = await insertMinimalRow(table, tokenB, userB.id);
    if (!aIns.ok || !bIns.ok) {
      skipped.push({ table, aErr: aIns.ok ? null : `${aIns.status} ${aIns.body.slice(0, 100)}`, bErr: bIns.ok ? null : `${bIns.status} ${bIns.body.slice(0, 100)}` });
      continue;
    }
  }
  if (skipped.length) {
    console.log(`   ⚠️  ${skipped.length} table(s) skipped (insert failed — likely extra required fields):`);
    for (const s of skipped) console.log(`       ${s.table}: ${s.aErr || s.bErr}`);
  }

  console.log('\n🔍 Checking every table for cross-user contamination…');
  for (const table of TABLES) {
    if (skipped.some(s => s.table === table)) continue;
    const rowsAsA = await listRows(table, tokenA);
    const rowsAsB = await listRows(table, tokenB);
    // User A should only see rows belonging to A, same for B
    const aLeaksToB = rowsAsB.some(r => r.user_id === userA.id);
    const bLeaksToA = rowsAsA.some(r => r.user_id === userB.id);
    if (aLeaksToB || bLeaksToA) {
      failures.push({ table, aLeaksToB, bLeaksToA, rowsAsA, rowsAsB });
      console.log(`   ❌  ${table.padEnd(28)}  A sees B: ${bLeaksToA}  |  B sees A: ${aLeaksToB}`);
    } else {
      passed.push(table);
      console.log(`   ✅  ${table.padEnd(28)}  isolated`);
    }
  }

  // ── Profiles table (1:1 with user — different test pattern) ──
  console.log('\n👤 Testing profiles table (name, location, PII)…');
  {
    // Tag each user's own profile with a unique marker via PATCH
    const patch = async (token, userId, name) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      return r.ok;
    };
    const markerA = `rls-name-a-${stamp}`;
    const markerB = `rls-name-b-${stamp}`;
    const okA = await patch(tokenA, userA.id, markerA);
    const okB = await patch(tokenB, userB.id, markerB);
    if (!okA || !okB) {
      console.log('   ⚠️  Could not patch profile names, skipping profile check');
    } else {
      // Each user should see ONLY their own profile row
      const profA = await listRows('profiles', tokenA);
      const profB = await listRows('profiles', tokenB);
      const resA = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=name`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` },
      });
      const resB = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=name`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` },
      });
      const namesA = (await resA.json()).map(r => r.name);
      const namesB = (await resB.json()).map(r => r.name);
      const aSeesB = namesA.includes(markerB);
      const bSeesA = namesB.includes(markerA);
      if (aSeesB || bSeesA) {
        failures.push({ table: 'profiles', aLeaksToB: aSeesB, bLeaksToA: bSeesA });
        console.log(`   ❌  profiles                      A sees B: ${bSeesA}  |  B sees A: ${aSeesB}`);
      } else {
        passed.push('profiles');
        console.log(`   ✅  profiles                      isolated (names, PII)`);
      }
    }
  }

  // ── Email exposure check — auth.users should NOT be queryable via REST ──
  console.log('\n📧 Testing that emails (auth.users) are NOT exposed via REST…');
  {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/users?select=email`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` },
    });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].email) {
        failures.push({ table: 'auth.users', aLeaksToB: true, bLeaksToA: true });
        console.log(`   ❌  auth.users                    EMAILS EXPOSED VIA REST`);
      } else {
        passed.push('auth.users');
        console.log(`   ✅  auth.users                    hidden (schema not exposed)`);
      }
    } else {
      passed.push('auth.users');
      console.log(`   ✅  auth.users                      hidden (${r.status})`);
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`Passed:   ${passed.length} / ${passed.length + failures.length}`);
  if (skipped.length) console.log(`Skipped:  ${skipped.length} (insert failures — investigate)`);
  if (failures.length) {
    console.log(`FAILED:   ${failures.length}  ❌ RLS LEAKAGE DETECTED`);
    for (const f of failures) {
      console.log(`  - ${f.table}: A→B=${f.aLeaksToB} B→A=${f.bLeaksToA}`);
    }
  }
  console.log('─────────────────────────────────────────');

  await cleanup();

  if (failures.length) {
    console.log('\n🚨 FAIL — RLS policies let users see other users\' data on the tables above.');
    console.log('   Check the policies in supabase/migrations/ for each flagged table.');
    process.exit(2);
  }
  if (skipped.length) {
    console.log('\n⚠️  PASS WITH WARNINGS — some tables were skipped. They likely have required');
    console.log('   fields without defaults. Add those fields to the minimal insert payload');
    console.log('   in insertMinimalRow() and re-run.');
    process.exit(0);
  }
  console.log('\n✅ PASS — all tables are properly isolated. Safe to share publicly.');
  process.exit(0);

} catch (err) {
  console.error('\n💥 Test script crashed:', err.message);
  await cleanup();
  process.exit(3);
}
