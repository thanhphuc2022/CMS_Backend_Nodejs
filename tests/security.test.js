const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET_ACCESS = 'test-access-secret-for-security-tests';
process.env.JWT_SECRET_REFRESH = 'test-refresh-secret-for-security-tests';

const AccountModel = require('../src/Model/Account_Model').default;
const { middleware, generateAccessToken } = require('../src/middleware/jwt');
const { authorize } = require('../src/middleware/authorize');
const { validateImageContent } = require('../src/middleware/file');
const { sanitizeRichHtml } = require('../src/Security/html');
const { Post } = require('../src/Controller/Post');
const { News } = require('../src/Controller/News');
const postRouter = require('../src/Router/post_Router').default;
const newsRouter = require('../src/Router/news_Router').default;
const authRouter = require('../src/Router/Authentication_Router').default;
const { createHmac } = require('node:crypto');
const { CONFIG } = require('../src/config/config');
const { SecurityChallengeModel } = require('../src/Model/SecurityChallenge_Model');
const { consumeOtpChallenge } = require('../src/Security/otp');
const TagModel = require('../src/Model/Tag_Models').default;
const { Tag } = require('../src/Controller/Tag');
const { Account } = require('../src/Controller/Account');
const { cleanupResourceImages } = require('../src/Services/cloudinaryAssets');
const { CloudinaryAssetModel } = require('../src/Model/CloudinaryAsset_Model');
const { RateLimitModel } = require('../src/Model/RateLimit_Model');
const PostModel = require('../src/Model/Post_Model').PostModel;
const NewsModel = require('../src/Model/News_Models').NewsModel;
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');
const accountRouter = require('../src/Router/Account_Router').default;

function response() {
  return {
    code: 200,
    body: undefined,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('role false remains authenticated for content routes', async () => {
  const original = AccountModel.findOne;
  AccountModel.findOne = () => ({ select: () => ({ lean: async () => ({ _id: 'fake-id' }) }) });
  try {
    const req = { headers: { authorization: `Bearer ${generateAccessToken('reader')}` } };
    const res = response();
    let continued = false;
    await middleware(req, res, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.userId, 'reader');
  } finally { AccountModel.findOne = original; }
});

test('access middleware rejects malformed and deleted-account tokens', async () => {
  const original = AccountModel.findOne;
  AccountModel.findOne = () => ({ select: () => ({ lean: async () => null }) });
  try {
    let res = response();
    await middleware({ headers: { authorization: 'Basic abc' } }, res, () => assert.fail('must stop'));
    assert.equal(res.code, 401);

    res = response();
    await middleware({ headers: { authorization: `Bearer ${generateAccessToken('deleted')}` } }, res, () => assert.fail('must stop'));
    assert.equal(res.code, 401);
  } finally { AccountModel.findOne = original; }
});

test('authorize only calls next for a literal Admin role', async () => {
  const original = AccountModel.findOne;
  try {
    for (const role of [false, undefined]) {
      AccountModel.findOne = async () => role === undefined ? null : ({ role });
      const res = response();
      let continued = false;
      await authorize({ userId: 'editor' }, res, () => { continued = true; });
      assert.equal(res.code, 403);
      assert.equal(continued, false);
    }
    AccountModel.findOne = async () => ({ role: true });
    let continued = false;
    await authorize({ userId: 'admin' }, response(), () => { continued = true; });
    assert.equal(continued, true);
  } finally { AccountModel.findOne = original; }
});

test('tag deletion rejects Mongo operator objects before querying', async () => {
  const original = TagModel.findOneAndDelete;
  let queried = false;
  TagModel.findOneAndDelete = () => { queried = true; throw new Error('must not query'); };
  try {
    const res = response();
    await Tag.deleteTag({ body: { tag: { $ne: null } } }, res);
    assert.equal(res.code, 400);
    assert.equal(queried, false);
  } finally { TagModel.findOneAndDelete = original; }
});

test('image upload rejects content without a supported raster signature', () => {
  const res = response();
  let continued = false;
  validateImageContent({ file: { buffer: Buffer.from('not an image') } }, res, () => { continued = true; });
  assert.equal(res.code, 400);
  assert.equal(continued, false);
});

test('local upload returns a valid image from memory without writing a file', async () => {
  const express = require('express');
  const { upload } = require('../src/uploadfile');
  const localApp = express();
  localApp.post('/api/upload', upload.post_Uploadfile);
  const localServer = localApp.listen(0);
  try {
    await new Promise((resolve) => localServer.listening ? resolve() : localServer.once('listening', resolve));
    const address = localServer.address();
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const form = new FormData();
    form.append('file', new Blob([image], { type: 'image/png' }), 'upload.png');
    const result = await fetch(`http://127.0.0.1:${address.port}/api/upload`, { method: 'POST', body: form });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), image);
  } finally {
    await new Promise((resolve, reject) => localServer.close((error) => error ? reject(error) : resolve()));
  }
});

test('rich HTML sanitizer preserves TinyMCE formatting and removes executable markup', () => {
  const clean = sanitizeRichHtml('<p><strong>hello</strong><script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)"></p>');
  assert.match(clean, /<p><strong>hello<\/strong>/);
  assert.doesNotMatch(clean, /<script|onerror/i);
  assert.match(clean, /<img src="https:\/\/example.com\/a.png"/);

  const encodedProtocol = sanitizeRichHtml('<a href="java&#0000001script:alert(1)">link</a>');
  assert.doesNotMatch(encodedProtocol, /href=/i);
});

test('regular users may post and use content uploads with authentication and no Admin gate', () => {
  const stack = (router) => router.stack || router._router.stack;
  for (const [router, path] of [
    [postRouter, '/createPost'],
    [postRouter, '/uploadimagesPost'],
    [newsRouter, '/createNews'],
    [newsRouter, '/uploadimagesNews']
  ]) {
    const route = stack(router).find((layer) => layer.route && layer.route.path === path && layer.route.methods.post).route;
    assert.equal(route.stack.some((layer) => layer.handle.name === 'authorize'), false);
    assert.equal(route.stack.some((layer) => layer.handle.name === 'authenticateToken'), true);
  }
  const adminRoute = stack(authRouter).find((layer) => layer.route && layer.route.path === '/updateauth/:username').route;
  assert.equal(adminRoute.stack.some((layer) => layer.handle.name === 'authenticateToken'), true);
  assert.equal(adminRoute.stack.some((layer) => layer.handle.name === 'authorize'), true);
});

test('application import does not create source upload directories and GET / responds', async () => {
  const mongoose = require('mongoose');
  const originalConnect = mongoose.connect;
  const originalMkdirSync = fs.mkdirSync;
  const originalPort = CONFIG.Server.port;
  const serverPath = require.resolve('../src/server');
  const accountRouterPath = require.resolve('../src/Router/Account_Router');
  const uploadPath = require.resolve('../src/uploadfile');
  let httpServer;
  mongoose.connect = async () => mongoose;
  fs.mkdirSync = () => { throw new Error('filesystem writes are not allowed during import'); };
  CONFIG.Server.port = 0;
  delete require.cache[serverPath];
  delete require.cache[accountRouterPath];
  delete require.cache[uploadPath];
  try {
    ({ httpServer } = require('../src/server'));
    if (!httpServer.listening) await new Promise((resolve) => httpServer.once('listening', resolve));
    const address = httpServer.address();
    const result = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(result.status, 200);
    assert.equal(await result.json(), 'Backend CMS');
  } finally {
    if (httpServer?.listening) await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    mongoose.connect = originalConnect;
    fs.mkdirSync = originalMkdirSync;
    CONFIG.Server.port = originalPort;
    delete require.cache[serverPath];
  }
});

test('OTP is bound to purpose, expires and can only be consumed once', async () => {
  const originalFind = SecurityChallengeModel.findOne;
  const originalConsume = SecurityChallengeModel.findOneAndUpdate;
  const originalAttempt = SecurityChallengeModel.updateOne;
  const challengeId = 'fake-challenge-id';
  const purpose = 'registration';
  const otp = '123456';
  const otpDigest = createHmac('sha256', CONFIG.jwt.refresh).update(`${challengeId}:${purpose}:${otp}`).digest('hex');
  const record = { challengeId, purpose, otpDigest, attempts: 0, expiresAt: new Date(Date.now() + 60_000), consumedAt: undefined };
  SecurityChallengeModel.findOne = (query) => ({ exec: async () => {
    if (query.purpose !== record.purpose || record.consumedAt || record.expiresAt <= query.expiresAt.$gt || record.attempts >= 5) return null;
    return record;
  } });
  SecurityChallengeModel.findOneAndUpdate = (query, update) => ({ exec: async () => {
    if (query.purpose !== record.purpose || record.consumedAt || record.expiresAt <= query.expiresAt.$gt || query.otpDigest !== record.otpDigest) return null;
    record.consumedAt = update.$set.consumedAt;
    return record;
  } });
  SecurityChallengeModel.updateOne = (query, update) => ({ exec: async () => {
    if (!record.consumedAt && record.attempts < 5 && query.challengeId === record.challengeId) {
      record.attempts += update.$inc.attempts;
    }
  } });
  try {
    assert.equal((await consumeOtpChallenge(challengeId, 'password-reset', otp)).status, 'invalid');
    assert.equal((await consumeOtpChallenge(challengeId, purpose, otp)).status, 'ok');
    assert.equal((await consumeOtpChallenge(challengeId, purpose, otp)).status, 'invalid');
    record.consumedAt = undefined;
    record.attempts = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await consumeOtpChallenge(challengeId, purpose, '000000')).status, 'invalid');
    }
    assert.equal(record.attempts, 5);
    assert.equal((await consumeOtpChallenge(challengeId, purpose, otp)).status, 'invalid');
    record.attempts = 0;
    record.expiresAt = new Date(Date.now() - 1);
    assert.equal((await consumeOtpChallenge(challengeId, purpose, otp)).status, 'invalid');
  } finally {
    SecurityChallengeModel.findOne = originalFind;
    SecurityChallengeModel.findOneAndUpdate = originalConsume;
    SecurityChallengeModel.updateOne = originalAttempt;
  }
});

test('Cloudinary cleanup preserves an image referenced by another post', async () => {
  const originals = {
    assetsFind: CloudinaryAssetModel.find,
    assetsUpdate: CloudinaryAssetModel.updateOne,
    postFind: PostModel.find,
    newsFind: NewsModel.find,
    destroy: cloudinary.uploader.destroy,
    cloudName: CONFIG.cloudinary.cloud_name
  };
  let destroyed = false;
  let unlinked = false;
  CONFIG.cloudinary.cloud_name = 'test';
  const asset = {
    _id: 'asset-1',
    publicId: 'Tinhocnhuy/image-1',
    secureUrl: 'https://res.cloudinary.com/test/image/upload/Tinhocnhuy/image-1.png',
    cloudName: 'test',
    folder: 'Tinhocnhuy',
    resourceType: 'image'
  };
  CloudinaryAssetModel.find = () => ({ exec: async () => [asset] });
  CloudinaryAssetModel.updateOne = async (_query, update) => { unlinked ||= Boolean(update.$pull); };
  PostModel.find = () => ({ select() { return this; }, lean: async () => [{ id: 'other-post' }] });
  NewsModel.find = () => ({ select() { return this; }, lean: async () => [] });
  cloudinary.uploader.destroy = async () => { destroyed = true; };
  try {
    await cleanupResourceImages('post', 'deleted-post');
    assert.equal(destroyed, false);
    assert.equal(unlinked, true);
  } finally {
    CloudinaryAssetModel.find = originals.assetsFind;
    CloudinaryAssetModel.updateOne = originals.assetsUpdate;
    PostModel.find = originals.postFind;
    NewsModel.find = originals.newsFind;
    cloudinary.uploader.destroy = originals.destroy;
    CONFIG.cloudinary.cloud_name = originals.cloudName;
  }
});

test('POST /api/register sends OTP through mocked Gmail SMTP and reports delivery failures', async () => {
  const originals = {
    rateLimit: RateLimitModel.findOneAndUpdate,
    accountFind: AccountModel.findOne,
    challengeCreate: SecurityChallengeModel.create,
    challengeDelete: SecurityChallengeModel.deleteOne,
    createTransport: nodemailer.createTransport,
    emailAddress: process.env.EMAIL_ADDRESS,
    emailPassword: process.env.EMAIL_PASSWORD,
    emailApi: process.env.EMAIL_API,
    consoleError: console.error
  };
  let providerShouldFail = false;
  let createdChallenge = false;
  let deletedChallenge = false;
  let sendCalled = false;
  RateLimitModel.findOneAndUpdate = () => ({ lean: async () => ({ count: 1 }) });
  AccountModel.findOne = () => ({ select: () => ({ lean: async () => null }) });
  SecurityChallengeModel.create = async () => { createdChallenge = true; };
  SecurityChallengeModel.deleteOne = async () => { deletedChallenge = true; };
  nodemailer.createTransport = (options) => {
    assert.equal(options.service, 'Gmail');
    assert.equal(options.auth.user, 'mock-gmail@example.com');
    assert.equal(options.auth.pass, 'mock-app-password');
    return {
      sendMail: async (message) => {
        sendCalled = true;
        assert.equal(message.from, 'mock-gmail@example.com');
        assert.equal(message.to, 'new-user@example.com');
        assert.match(message.html, /<html/i);
        if (providerShouldFail) throw new Error('mock SMTP failure');
        return { messageId: 'mock-message-id' };
      }
    };
  };
  process.env.EMAIL_ADDRESS = 'mock-gmail@example.com';
  process.env.EMAIL_PASSWORD = 'mock-app-password';
  delete process.env.EMAIL_API;

  async function invokeRegister() {
    const route = (accountRouter.stack || accountRouter._router.stack)
      .find((layer) => layer.route?.path === '/register' && layer.route.methods.post).route;
    const req = {
      body: { username: 'new_user', fullname: 'New User', email: 'new-user@example.com', password: 'secure-password', repassword: 'secure-password' },
      socket: { remoteAddress: '127.0.0.1' },
      get: () => undefined
    };
    const res = response();
    let index = 0;
    const next = (error) => {
      if (error) throw error;
      const handler = route.stack[index++].handle;
      return handler(req, res, next);
    };
    await next();
    return res;
  }

  try {
    const success = await invokeRegister();
    assert.equal(success.code, 200);
    assert.equal(typeof success.body.challengeId, 'string');
    assert.equal(createdChallenge, true);
    assert.equal(sendCalled, true);

    providerShouldFail = true;
    sendCalled = false;
    const failure = await invokeRegister();
    assert.equal(failure.code, 503);
    assert.equal(failure.body.challengeId, undefined);
    assert.equal(sendCalled, true);
    assert.equal(deletedChallenge, true);

    providerShouldFail = false;
    sendCalled = false;
    delete process.env.EMAIL_PASSWORD;
    const missingCredentials = await invokeRegister();
    assert.equal(missingCredentials.code, 503);
    assert.equal(sendCalled, false);
  } finally {
    RateLimitModel.findOneAndUpdate = originals.rateLimit;
    AccountModel.findOne = originals.accountFind;
    SecurityChallengeModel.create = originals.challengeCreate;
    SecurityChallengeModel.deleteOne = originals.challengeDelete;
    nodemailer.createTransport = originals.createTransport;
    if (originals.emailAddress === undefined) delete process.env.EMAIL_ADDRESS;
    else process.env.EMAIL_ADDRESS = originals.emailAddress;
    if (originals.emailPassword === undefined) delete process.env.EMAIL_PASSWORD;
    else process.env.EMAIL_PASSWORD = originals.emailPassword;
    if (originals.emailApi === undefined) delete process.env.EMAIL_API;
    else process.env.EMAIL_API = originals.emailApi;
    console.error = originals.consoleError;
  }
});
