const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
process.env.JWT_SECRET_ACCESS = 'registration-test-access';
process.env.JWT_SECRET_REFRESH = 'registration-test-refresh';
const mongoose = require('mongoose');
const A = require('../src/Model/Account_Model').default;
const { SecurityChallengeModel: C } = require('../src/Model/SecurityChallenge_Model');
const { CONFIG } = require('../src/config/config');
const { registerAccount } = require('../src/Security/registerAccount');
const { Account } = require('../src/Controller/Account');

function challenge(id = new mongoose.Types.ObjectId()) {
  const challengeId = String(id);
  return { _id: id, challengeId, purpose: 'registration', username: 'registration_test',
    fullname: 'Test', email: 'registration@example.invalid', passwordHash: 'test-hash',
    attempts: 0, expiresAt: new Date(Date.now() + 60000),
    otpDigest: createHmac('sha256', CONFIG.jwt.refresh).update(`${challengeId}:registration:123456`).digest('hex') };
}

test('registration transaction orchestration (mock, not MongoDB atomicity)', async t => {
  const originals = [A.db.startSession, A.findOne, A.create, C.findOne, C.findOneAndUpdate, C.updateOne];
  try {
    for (const mode of ['success', 'reject', 'reject-written', 'unknown-written', 'unknown-absent', 'duplicate', 'invalid', 'malformed', 'wrong', 'expired', 'purpose', 'used', 'retry-callback']) {
      await t.test(mode, async () => {
        let row = challenge(), accounts = [], creates = 0, increments = 0, ended = false;
        if (mode === 'expired') row.expiresAt = new Date(0);
        if (mode === 'purpose') row.purpose = 'password-reset';
        if (mode === 'used') row.consumedAt = new Date();
        if (mode === 'malformed') delete row.passwordHash;
        const session = {
          async withTransaction(fn, options) {
            assert.equal(options.writeConcern.w, 'majority');
            const before = { ...row };
            try {
              await fn();
              if (mode === 'retry-callback') { row = { ...before }; accounts = []; await fn(); }
            } catch (e) { row = before; accounts = []; throw e; }
            if (mode.startsWith('unknown')) {
              if (mode === 'unknown-absent') { row = before; accounts = []; }
              const e = new Error('commit acknowledgement unavailable');
              e.hasErrorLabel = label => label === 'UnknownTransactionCommitResult';
              throw e;
            }
          }, async endSession() { ended = true; }
        };
        A.db.startSession = async () => session;
        function query(value, needsSession) {
          let attached = false;
          const q = { session(s) { assert.equal(s, session); attached = true; return q; },
            select() { return q; }, read() { return q; }, readConcern() { return q; },
            async exec() { if (needsSession) assert.ok(attached); return typeof value === 'function' ? value() : value; },
            lean() { return q.exec(); } };
          return q;
        }
        C.findOne = q => q.consumedAt?.$exists === true
          ? query(row.consumedAt && row.accountId === q.accountId ? row : null, false)
          : query(mode === 'invalid' || row.purpose !== q.purpose || row.consumedAt || row.expiresAt <= q.expiresAt.$gt ? null : { ...row }, true);
        C.findOneAndUpdate = (q, u, o) => {
          assert.equal(o.session, session);
          return query(() => { Object.assign(row, u.$set); return { ...row }; }, false);
        };
        C.updateOne = () => query(() => { increments++; row.attempts++; return { acknowledged: true }; }, true);
        A.findOne = q => query(q.$or ? null : accounts.find(a => String(a._id) === q._id && a.password === q.password) || null, Boolean(q.$or));
        A.create = async (docs, options) => {
          assert.equal(options.session, session); creates++;
          assert.equal(docs[0]._id, String(row._id));
          if (mode === 'reject') throw new Error('write rejected');
          if (mode === 'duplicate') throw Object.assign(new Error('duplicate'), { code: 11000 });
          accounts.push(docs[0]);
          if (mode === 'reject-written') throw new Error('failure after insert within transaction');
          return docs;
        };
        const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
        await Account.post_Register({ body: { challengeId: row.challengeId, otp: mode === 'wrong' ? '000000' : '123456' } }, res);
        const ok = ['success', 'unknown-written', 'retry-callback'].includes(mode);
        assert.equal(res.code, ok ? 200 : mode === 'duplicate' ? 409 : ['reject', 'reject-written', 'unknown-absent'].includes(mode) ? 500 : 400);
        assert.equal(accounts.length, ok ? 1 : 0);
        assert.equal(Boolean(row.consumedAt), ok || mode === 'used' || mode === 'malformed');
        assert.equal(increments, mode === 'wrong' ? 1 : 0);
        assert.equal(creates, mode === 'retry-callback' ? 2 : ['success', 'reject', 'reject-written', 'unknown-written', 'unknown-absent', 'duplicate'].includes(mode) ? 1 : 0);
        assert.ok(ended);
        if (mode === 'reject' || mode === 'reject-written') {
          A.create = async (docs, options) => { assert.equal(options.session, session); accounts.push(docs[0]); return docs; };
          assert.equal(await registerAccount(row.challengeId, '123456'), 'ok');
          assert.equal(accounts.length, 1);
          assert.equal(accounts[0]._id, String(row._id));
          assert.ok(row.consumedAt);
        }
      });
    }
  } finally {
    [A.db.startSession, A.findOne, A.create, C.findOne, C.findOneAndUpdate, C.updateOne] = originals;
  }
});

// Explicit opt-in only. This suite never uses CONFIG.mongo.url or a default URI.
test('registration atomicity on dedicated MongoDB replica set', { skip: !process.env.MONGODB_TEST_URI }, async t => {
  const uri = process.env.MONGODB_TEST_URI;
  // Fixed, disposable test database; refuse every other database before connecting.
  if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/cms_registration_test(?:\?|$)/.test(uri)) {
    throw new Error('MONGODB_TEST_URI must explicitly select cms_registration_test');
  }
  try {
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  } catch {
    throw new Error('Dedicated MongoDB test connection failed; no fallback attempted');
  }
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    assert.ok(hello.setName || hello.msg === 'isdbgrid', 'transactions require replica set/sharded MongoDB');
    await A.createCollection(); await C.createCollection();
    const info = await mongoose.connection.db.listCollections({ name: A.collection.name }).next();
    assert.ok(!info.options?.collation || info.options.collation.locale === 'simple', 'review existing collation before choosing indexes');
    console.log('Test Account index names:', (await A.collection.indexes()).map(i => i.name));
    for (const field of ['username', 'email']) {
      const duplicates = await A.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 1 }]);
      assert.equal(duplicates.length, 0, `test DB contains duplicate ${field}; no index created`);
      await A.collection.createIndex({ [field]: 1 }, { unique: true, name: `registration_test_unique_${field}` });
    }
    await C.collection.createIndex({ challengeId: 1 }, { unique: true });
    const insertedIds = [];
    async function seed(overrides = {}) { const c = { ...challenge(), ...overrides }; insertedIds.push(c._id); await C.create(c); return c; }
    try {
      await t.test('same challenge concurrent; exactly one account', async () => {
        const c = await seed();
        assert.deepEqual((await Promise.all([registerAccount(c.challengeId, '123456'), registerAccount(c.challengeId, '123456')])).sort(), ['invalid', 'ok']);
        assert.equal(await A.countDocuments({ _id: c._id }), 1);
        assert.ok((await C.findById(c._id)).consumedAt);
      });
      for (const field of ['username', 'email']) {
        await t.test(`two challenges duplicate ${field}`, async () => {
          const suffix = String(new mongoose.Types.ObjectId());
          const a = await seed({ username: `a${suffix}`, email: `a${suffix}@example.invalid` });
          const b = await seed({ username: `b${suffix}`, email: `b${suffix}@example.invalid`, [field]: a[field] });
          assert.deepEqual((await Promise.all([registerAccount(a.challengeId, '123456'), registerAccount(b.challengeId, '123456')])).sort(), ['conflict', 'ok']);
          assert.equal(await A.countDocuments({ [field]: a[field] }), 1);
        });
      }
      for (const afterWrite of [false, true]) await t.test(`real transaction rollback/retry; inserted=${afterWrite}`, async () => {
        const c = await seed({ username: `rollback_test_${afterWrite}`, email: `rollback_${afterWrite}@example.invalid` });
        const create = A.create;
        A.create = async function (...args) {
          if (afterWrite) await create.apply(this, args);
          throw new Error('injected transaction write rejection');
        };
        try { await assert.rejects(registerAccount(c.challengeId, '123456')); } finally { A.create = create; }
        assert.equal(await A.countDocuments({ _id: c._id }), 0);
        assert.equal((await C.findById(c._id)).consumedAt, undefined);
        assert.equal(await registerAccount(c.challengeId, '123456'), 'ok');
      });
      await t.test('lost acknowledgement after real commit reconciles exact identity', async () => {
        const c = await seed({ username: 'commit_test', email: 'commit@example.invalid' });
        const start = A.db.startSession;
        A.db.startSession = async function (...args) {
          const s = await start.apply(this, args), transaction = s.withTransaction.bind(s);
          s.withTransaction = async (...a) => {
            await transaction(...a);
            throw Object.assign(new Error('injected lost acknowledgement'), { hasErrorLabel: l => l === 'UnknownTransactionCommitResult' });
          }; return s;
        };
        try { assert.equal(await registerAccount(c.challengeId, '123456'), 'ok'); } finally { A.db.startSession = start; }
        assert.equal(await A.countDocuments({ _id: c._id }), 1);
        assert.equal(await registerAccount(c.challengeId, '123456'), 'invalid');
      });
    } finally {
      await A.deleteMany({ _id: { $in: insertedIds } });
      await C.deleteMany({ _id: { $in: insertedIds } });
    }
  } finally { await mongoose.disconnect(); }
});
