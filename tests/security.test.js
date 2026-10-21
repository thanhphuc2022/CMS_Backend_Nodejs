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
const CategoriesModel = require('../src/Model/Categories_Model').default;
const NewsModel = require('../src/Model/News_Models').NewsModel;
const { Content_Banner } = require('../src/Display/Display_Controller/Content_Banner');
const { Content_Banner_Model } = require('../src/Display/Display_Model/Content_Banner_Model');
const { About } = require('../src/Display/Display_Controller/About');
const { About_Model } = require('../src/Display/Display_Model/About_Model');
const contentServices = require('../src/Services/sp');
const cloudinaryAssetServices = require('../src/Services/cloudinaryAssets');
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

test('application default handler import does not create source upload directories and GET / responds', async () => {
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
    const app = require('../src/server').default;
    assert.equal(typeof app, 'function');
    httpServer = app.listen(0);
    if (!httpServer.listening) await new Promise((resolve) => httpServer.once('listening', resolve));
    const address = httpServer.address();
    const result = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(result.status, 200);
    assert.equal(await result.json(), 'Backend CMS');
    for (const [route, formAction] of [
      ['/api/createNews', '/api/createNews'],
      ['/api/createPost', '/api/createPost'],
      ['/api/upload', '/upload']
    ]) {
      const rendered = await fetch(`http://127.0.0.1:${address.port}${route}`);
      assert.equal(rendered.status, 200, route);
      assert.match(rendered.headers.get('content-type'), /text\/html/);
      const html = await rendered.text();
      assert.match(html, /<form/i);
      assert.ok(html.includes(formAction), route);
    }
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

test('read API database failures return one controlled error response', async () => {
  const mongoose = require('mongoose');
  const ContactModel = require('../src/Display/Display_Model/Contact_Model').default;
  const originals = { connect: mongoose.connect, postFind: PostModel.find, newsFind: NewsModel.find, contactFind: ContactModel.find, aboutFind: About_Model.find };
  const serverPath = require.resolve('../src/server');
  let server;
  mongoose.connect = async () => mongoose;
  const fail = () => { throw new Error('private database host and credential details'); };
  PostModel.find = fail;
  NewsModel.find = fail;
  ContactModel.find = fail;
  About_Model.find = fail;
  delete require.cache[serverPath];
  try {
    const app = require('../src/server').default;
    server = app.listen(0);
    await new Promise((resolve) => server.listening ? resolve() : server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/api/loadPost', '/api/loadPostCategories/category', '/api/typesNews/type', '/api/tag/tag', '/api/top5viewstoday', '/api/top5views', '/api/getcontact']) {
      const result = await fetch(base + route, { signal: AbortSignal.timeout(2000) });
      assert.equal(result.status, 500, route);
      assert.deepEqual(await result.json(), { message: 'Internal server error' });
    }
    const forwarded = await fetch(base + '/api/allabout', { signal: AbortSignal.timeout(2000) });
    assert.equal(forwarded.status, 500);
    const errorBody = await forwarded.json();
    assert.equal(typeof errorBody.message, 'string');
    assert.doesNotMatch(JSON.stringify(errorBody), /private|credential|stack/i);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    mongoose.connect = originals.connect;
    PostModel.find = originals.postFind;
    NewsModel.find = originals.newsFind;
    ContactModel.find = originals.contactFind;
    About_Model.find = originals.aboutFind;
    delete require.cache[serverPath];
  }
});

test('isolated Mongoose buffers disconnected reads and rejects after its buffer timeout', async () => {
  const mongoose = require('mongoose');
  const isolated = new mongoose.Mongoose();
  const model = isolated.model('ConnectionLifecycleProbe', new isolated.Schema({ value: String }, { bufferTimeoutMS: 25 }));
  assert.equal(isolated.connection.readyState, 0);
  const reads = await Promise.allSettled([model.findOne({}), model.findOne({})]);
  for (const read of reads) {
    assert.equal(read.status, 'rejected');
    assert.match(read.reason.message, /buffering timed out/);
  }
  await isolated.disconnect();
});

test('post updates categoryId with and without replacing the image', async () => {
  const originals = {
    categoryFind: CategoriesModel.findOne,
    postFind: PostModel.findOne,
    postUpdate: PostModel.findOneAndUpdate,
    upload: contentServices.uploadImageToCloudinary,
    attach: cloudinaryAssetServices.prepareUpdatedImageReferences,
    cleanup: cloudinaryAssetServices.cleanupResourceImages
  };
  const updates = [];
  CategoriesModel.findOne = async () => ({ id: 'new-category' });
  PostModel.findOne = async () => ({ _id: 'post-document', avatar: 'https://example.com/old.png' });
  PostModel.findOneAndUpdate = async (_query, update) => { updates.push(update); return update; };
  contentServices.uploadImageToCloudinary = async () => 'https://example.com/new-image.png';
  cloudinaryAssetServices.prepareUpdatedImageReferences = async () => {};
  cloudinaryAssetServices.cleanupResourceImages = async () => {};
  const request = {
    params: { id: 'post-1' },
    userId: 'user-1',
    body: { title: 'Title', slug: 'title', description: 'Description', content: '<p>Content</p>', category: 'Category' }
  };
  try {
    const withoutImage = response();
    await Post.updatePost(request, withoutImage);
    assert.equal(withoutImage.code, 200);
    assert.equal(updates[0].categoryId, 'new-category');
    assert.equal(Object.hasOwn(updates[0], 'category'), false);

    const withImage = response();
    await Post.updatePost({ ...request, file: { buffer: Buffer.from('image') } }, withImage);
    assert.equal(withImage.code, 200);
    assert.equal(updates[1].categoryId, 'new-category');
    assert.equal(updates[1].avatar, 'https://example.com/new-image.png');
  } finally {
    CategoriesModel.findOne = originals.categoryFind;
    PostModel.findOne = originals.postFind;
    PostModel.findOneAndUpdate = originals.postUpdate;
    contentServices.uploadImageToCloudinary = originals.upload;
    cloudinaryAssetServices.prepareUpdatedImageReferences = originals.attach;
    cloudinaryAssetServices.cleanupResourceImages = originals.cleanup;
  }
});

test('content banner updates linkservices with and without replacing the image', async () => {
  const originals = {
    update: Content_Banner_Model.findOneAndUpdate,
    find: Content_Banner_Model.findOne,
    upload: contentServices.uploadImageToCloudinary
  };
  const updates = [];
  Content_Banner_Model.findOneAndUpdate = async (_query, update) => { updates.push(update); return update; };
  Content_Banner_Model.findOne = async () => ({ _id: 'banner-document', images: 'https://example.com/old.png' });
  contentServices.uploadImageToCloudinary = async () => 'https://example.com/banner.png';
  const request = {
    params: { id: 'banner-1' },
    body: { title: 'Banner', content: '<p>Content</p>', linkservices: '/services' }
  };
  try {
    const withoutImage = response();
    await Content_Banner.updateContentBanner(request, withoutImage);
    assert.equal(withoutImage.code, 200);
    assert.equal(updates[0].linkservices, '/services');

    const withImage = response();
    await Content_Banner.updateContentBanner({ ...request, file: { buffer: Buffer.from('image') } }, withImage);
    assert.equal(withImage.code, 200);
    assert.equal(updates[1].linkservices, '/services');
    assert.equal(updates[1].images, 'https://example.com/banner.png');
  } finally {
    Content_Banner_Model.findOneAndUpdate = originals.update;
    Content_Banner_Model.findOne = originals.find;
    contentServices.uploadImageToCloudinary = originals.upload;
  }
});

test('About and banner image replacement preserve references across failures and concurrent writes', async (t) => {
  for (const [name, model, controller] of [
    ['About', About_Model, About.updateAbout],
    ['Banner', Content_Banner_Model, Content_Banner.updateContentBanner]
  ]) {
    await t.test(name, async (t) => {
      async function scenario(run) {
        const original = { find: model.findOne, update: model.findOneAndUpdate, upload: contentServices.uploadImageToCloudinary, destroy: cloudinary.uploader.destroy, warn: console.warn };
        const oldUrl = 'https://example.com/shared-old.png';
        const h = { state: { _id: 'document-1', images: oldUrl }, events: [], warnings: [], uploads: [], destroyed: [], writeMode: 'ok' };
        const req = { params: { id: 'resource-1' }, body: { title: 'Updated', content: '<p>Safe</p>', linkservices: '/new-service' }, file: { buffer: Buffer.from('mock-image') } };
        model.findOne = async () => { h.events.push('find'); return h.state ? { ...h.state } : null; };
        model.findOneAndUpdate = async (filter, fields, options) => {
          h.events.push('write');
          if (h.writeMode === 'reject') throw new Error('private database failure');
          if (h.writeMode === 'conflict') return null;
          if (Object.hasOwn(filter, 'images')) {
            assert.equal(filter._id, 'document-1');
            assert.deepEqual(options, { new: true });
            if (!h.state || h.state.images !== filter.images) return null;
          }
          h.state = { ...h.state, ...fields };
          if (h.writeMode === 'commit-then-reject') throw new Error('acknowledgement lost');
          return { ...h.state };
        };
        contentServices.uploadImageToCloudinary = async (_file, owner, privateId) => {
          h.events.push('upload');
          assert.equal(owner, undefined);
          assert.match(privateId, /^display-[0-9a-f-]{36}$/);
          const image = { id: `Tinhocnhuy/${privateId}`, url: `https://example.com/${privateId}.png` };
          h.uploads.push(image);
          if (h.uploadGate) await h.uploadGate;
          if (h.uploadError) throw new Error('upload failed');
          return image.url;
        };
        cloudinary.uploader.destroy = async (id) => {
          h.events.push('destroy');
          h.destroyed.push(id);
          assert.notEqual(h.state?.images, h.uploads.find((image) => image.id === id)?.url, 'never delete the image referenced by DB');
          if (h.cleanupError) throw new Error('private Cloudinary error');
          return { result: 'ok' };
        };
        console.warn = (...args) => h.warnings.push(args.join(' '));
        h.invoke = async (request = req) => { const res = response(); await controller(request, res); return res; };
        try { await run(h, req); }
        finally {
          model.findOne = original.find;
          model.findOneAndUpdate = original.update;
          contentServices.uploadImageToCloudinary = original.upload;
          cloudinary.uploader.destroy = original.destroy;
          console.warn = original.warn;
        }
      }

      await t.test('missing resource never uploads', () => scenario(async (h) => {
        h.state = null;
        assert.equal((await h.invoke()).code, 404);
        assert.deepEqual(h.events, ['find']);
      }));
      await t.test('upload failure leaves the old image and DB intact', () => scenario(async (h) => {
        h.uploadError = true;
        assert.equal((await h.invoke()).code, 500);
        assert.equal(h.state.images, 'https://example.com/shared-old.png');
        assert.deepEqual(h.events, ['find', 'upload']);
      }));
      await t.test('success waits for upload and preserves potentially shared old image', () => scenario(async (h) => {
        let finishUpload;
        h.uploadGate = new Promise((resolve) => { finishUpload = resolve; });
        const operation = h.invoke();
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(h.events, ['find', 'upload']);
        assert.equal(h.state.images, 'https://example.com/shared-old.png');
        finishUpload();
        const res = await operation;
        assert.equal(res.code, 200);
        assert.equal(res.body.message, 'Cập nhật thành công');
        assert.equal(h.state.images, h.uploads[0].url);
        assert.equal(h.state.content, '<p>Safe</p>');
        if (name === 'Banner') assert.equal(h.state.linkservices, '/new-service');
        assert.deepEqual(h.events, ['find', 'upload', 'write']);
        assert.match(h.warnings[0], /shared references/);
      }));
      for (const writeMode of ['reject', 'commit-then-reject']) {
        await t.test(`uncertain DB failure (${writeMode}) retains the upload`, () => scenario(async (h) => {
          h.writeMode = writeMode;
          const res = await h.invoke();
          assert.equal(res.code, 500);
          assert.deepEqual(res.body, { message: 'Internal server error' });
          assert.equal(h.state.images, writeMode === 'reject' ? 'https://example.com/shared-old.png' : h.uploads[0].url);
          assert.deepEqual(h.destroyed, []);
          assert.match(h.warnings[0], /outcome unknown/);
        }));
      }
      await t.test('acknowledged conflict cleans up only the private upload', () => scenario(async (h) => {
        h.writeMode = 'conflict';
        assert.equal((await h.invoke()).code, 409);
        assert.equal(h.state.images, 'https://example.com/shared-old.png');
        assert.deepEqual(h.events, ['find', 'upload', 'write', 'destroy']);
        assert.deepEqual(h.destroyed, [h.uploads[0].id]);
      }));
      await t.test('rollback cleanup failure is recorded safely', () => scenario(async (h) => {
        h.writeMode = 'conflict';
        h.cleanupError = true;
        assert.equal((await h.invoke()).code, 409);
        assert.match(h.warnings[0], /cleanup failed/);
        assert.doesNotMatch(h.warnings.join(' '), /private|https:/);
        assert.equal(h.state.images, 'https://example.com/shared-old.png');
      }));
      await t.test('successful update never attempts unsafe old-image deletion even if cleanup would fail', () => scenario(async (h) => {
        h.cleanupError = true;
        assert.equal((await h.invoke()).code, 200);
        assert.equal(h.state.images, h.uploads[0].url);
        assert.deepEqual(h.destroyed, []);
      }));
      await t.test('no replacement image keeps the existing update path', () => scenario(async (h, req) => {
        assert.equal((await h.invoke({ ...req, file: undefined })).code, 200);
        assert.equal(h.state.images, 'https://example.com/shared-old.png');
        assert.equal(h.state.title, 'Updated');
        assert.deepEqual(h.events, ['write']);
      }));
      await t.test('concurrent replacements publish one winner and only delete the loser upload', () => scenario(async (h) => {
        let release;
        h.uploadGate = new Promise((resolve) => { release = resolve; });
        const first = h.invoke();
        const second = h.invoke();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(h.uploads.length, 2);
        assert.notEqual(h.uploads[0].id, h.uploads[1].id);
        assert.equal(h.state.images, 'https://example.com/shared-old.png');
        release();
        const results = await Promise.all([first, second]);
        assert.deepEqual(results.map((res) => res.code).sort(), [200, 409]);
        const loser = h.uploads.find((image) => image.url !== h.state.images);
        assert.deepEqual(h.destroyed, [loser.id]);
      }));
    });
  }
});

test('private display uploads disable overwrite without changing existing upload options', async () => {
  const original = cloudinary.uploader.upload;
  const calls = [];
  cloudinary.uploader.upload = async (_data, options) => {
    calls.push(options);
    return { secure_url: 'https://example.com/upload.png' };
  };
  const file = { buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) };
  try {
    await contentServices.uploadImageToCloudinary(file);
    await contentServices.uploadImageToCloudinary(file, undefined, 'display-test-private-id');
    assert.equal(Object.hasOwn(calls[0], 'public_id'), false);
    assert.equal(Object.hasOwn(calls[0], 'overwrite'), false);
    assert.equal(calls[1].public_id, 'display-test-private-id');
    assert.equal(calls[1].overwrite, false);
    assert.equal(calls[1].folder, 'Tinhocnhuy');
    assert.deepEqual(calls[1].allowed_formats, calls[0].allowed_formats);
  } finally { cloudinary.uploader.upload = original; }
});

test('Post and News creation prepare registry before publishing and preserve shared images', async (t) => {
  const TypesModel = require('../src/Model/Types_News_Models').default;
  const mongoose = require('mongoose');
  for (const [kind, model, categoryModel, controller, message] of [
    ['post', PostModel, CategoriesModel, Post.createPost, 'Đã thêm bài viết'],
    ['news', NewsModel, TypesModel, News.post_CreateNews, 'Thêm thành công']
  ]) {
    await t.test(kind, async (t) => {
      async function scenario(run) {
        const originals = { category: categoryModel.findOne, find: model.findOne, create: model.create, assetCreate: CloudinaryAssetModel.create, assetFind: CloudinaryAssetModel.find, assetUpdate: CloudinaryAssetModel.updateMany, assetDelete: CloudinaryAssetModel.deleteOne, upload: cloudinary.uploader.upload, destroy: cloudinary.uploader.destroy, warn: console.warn, cloudName: CONFIG.cloudinary.cloud_name };
        CONFIG.cloudinary.cloud_name = 'mock-cloud';
        const sharedUrl = 'https://res.cloudinary.com/mock-cloud/image/upload/Tinhocnhuy/shared.png';
        const foreignUrl = 'https://res.cloudinary.com/mock-cloud/image/upload/Tinhocnhuy/foreign.png';
        const shared = { _id: 'shared', publicId: 'Tinhocnhuy/shared', secureUrl: sharedUrl, ownerId: 'writer', resources: [{ kind: 'post', resourceId: 'existing-article' }] };
        const foreign = { _id: 'foreign', publicId: 'Tinhocnhuy/foreign', secureUrl: foreignUrl, ownerId: 'another-user', resources: [{ kind: 'news', resourceId: 'foreign-article' }] };
        const h = { events: [], assets: [shared, foreign], created: null, destroyed: [], warnings: [], mode: 'ok' };
        const req = { userId: 'writer', params: {}, body: { title: 'Create Test', description: 'Description', category: 'Category', types: 'Types', tag: ['tag'], content: `<p>Content</p><img src="${sharedUrl}"><img src="${foreignUrl}">` }, file: { buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) } };
        h.request = req;
        categoryModel.findOne = async () => ({ id: 'category-id' });
        model.findOne = (filter) => {
          if (!filter._id) {
            if (h.created?.id === filter.id) return Promise.resolve({ toObject: () => ({ ...h.created }) });
            return Promise.resolve(h.slugAlreadyExists ? { id: filter.id } : null);
          }
          return { read: async (preference) => {
            h.events.push('reconcile');
            assert.equal(preference, 'primary');
            if (['reconcile-error', 'commit-and-read-error'].includes(h.mode)) throw new Error('private read failure');
            return h.created && String(h.created._id) === String(filter._id) && h.created.avatar === filter.avatar ? h.created : null;
          } };
        };
        cloudinary.uploader.upload = async (_data, options) => {
          h.events.push('upload');
          assert.equal(options.overwrite, false);
          assert.match(options.public_id, /^content-[0-9a-f-]{36}$/);
          if (h.mode === 'upload-error') throw new Error('private upload failure');
          h.thumbnailId = `Tinhocnhuy/${options.public_id}`;
          h.thumbnailUrl = `https://res.cloudinary.com/mock-cloud/image/upload/${h.thumbnailId}.png`;
          return { public_id: h.thumbnailId, secure_url: h.thumbnailUrl };
        };
        CloudinaryAssetModel.create = async (data) => {
          h.events.push('registry-create');
          h.assets.push({ ...data, _id: 'thumbnail', resources: [] });
          if (h.mode === 'register-error') throw new Error('private registry write failure');
          return h.assets.at(-1);
        };
        CloudinaryAssetModel.find = (filter) => ({ select: async () => h.assets.filter((asset) => asset.ownerId === filter.ownerId && filter.secureUrl.$in.includes(asset.secureUrl) && !(h.mode === 'missing-thumbnail' && asset._id === 'thumbnail')) });
        CloudinaryAssetModel.updateMany = async (filter, update) => {
          h.events.push('attach');
          const matches = h.assets.filter((asset) => asset.ownerId === filter.ownerId && filter._id.$in.includes(asset._id));
          for (const asset of matches) {
            if (!asset.resources.some((ref) => ref.kind === kind && ref.resourceId === 'create-test')) asset.resources.push({ ...update.$addToSet.resources });
            if (h.mode === 'attach-error') throw new Error('private partial registry failure');
          }
          return { acknowledged: h.mode !== 'unacknowledged-attach', matchedCount: matches.length - (h.mode === 'partial-match' ? 1 : 0) };
        };
        CloudinaryAssetModel.deleteOne = async (filter) => {
          h.events.push('registry-delete');
          h.assets = h.assets.filter((asset) => !(asset.publicId === filter.publicId && asset.secureUrl === filter.secureUrl && asset.ownerId === filter.ownerId));
        };
        model.create = async (data) => {
          h.events.push('insert');
          for (const asset of h.assets.filter((asset) => asset.ownerId === 'writer')) {
            assert.ok(asset.resources.some((ref) => ref.kind === kind && ref.resourceId === data.id), 'registry must be attached before insert');
          }
          assert.equal(data.username, kind === 'post' ? 'admindemo' : 'writer');
          if (h.insertGate) await h.insertGate;
          if (h.mode === 'db-rejected') throw new mongoose.mongo.MongoServerError({ code: 11000, message: 'duplicate key' });
          if (h.mode === 'db-unknown' || h.mode === 'reconcile-error') throw new Error('write outcome unknown');
          h.created = { ...data };
          if (['commit-then-reject', 'commit-and-read-error'].includes(h.mode)) throw new Error('lost acknowledgement');
          return h.created;
        };
        cloudinary.uploader.destroy = async (publicId) => {
          h.events.push('destroy');
          h.destroyed.push(publicId);
          assert.equal(publicId, h.thumbnailId);
          assert.equal(h.created, null, 'never destroy a published thumbnail');
          if (h.cleanupError) throw new Error('private cleanup failure');
          return { result: 'ok' };
        };
        console.warn = (...args) => h.warnings.push(args.join(' '));
        h.invoke = async () => { const res = response(); await controller(req, res); return res; };
        h.read = async (id) => {
          const res = response();
          await (kind === 'post' ? Post.loadPostId : News.loadNewsId)({ params: { id } }, res);
          return res;
        };
        try {
          await run(h);
          assert.ok(shared.resources.some((ref) => ref.resourceId === 'existing-article'));
          assert.deepEqual(foreign.resources, [{ kind: 'news', resourceId: 'foreign-article' }]);
          assert.doesNotMatch(h.warnings.join(' '), /private|https:|mongodb/);
        } finally {
          categoryModel.findOne = originals.category; model.findOne = originals.find; model.create = originals.create;
          CloudinaryAssetModel.create = originals.assetCreate; CloudinaryAssetModel.find = originals.assetFind;
          CloudinaryAssetModel.updateMany = originals.assetUpdate; CloudinaryAssetModel.deleteOne = originals.assetDelete;
          cloudinary.uploader.upload = originals.upload; cloudinary.uploader.destroy = originals.destroy;
          console.warn = originals.warn; CONFIG.cloudinary.cloud_name = originals.cloudName;
        }
      }
      await t.test('upload failure creates no article or registry', () => scenario(async (h) => {
        h.mode = 'upload-error';
        assert.equal((await h.invoke()).code, 500);
        assert.equal(h.created, null);
        assert.equal(h.assets.length, 2);
        assert.deepEqual(h.events, ['upload']);
      }));
      for (const mode of ['register-error', 'attach-error', 'missing-thumbnail', 'unacknowledged-attach', 'partial-match']) {
        await t.test(`${mode}: no article is published and only the private thumbnail is removed`, () => scenario(async (h) => {
          h.mode = mode;
          assert.equal((await h.invoke()).code, 500);
          assert.equal(h.created, null);
          assert.equal(h.events.includes('insert'), false);
          assert.deepEqual(h.destroyed, [h.thumbnailId]);
          assert.equal(h.assets.length, 2);
        }));
      }
      await t.test('validation failure before insert safely removes the unpublished thumbnail', () => scenario(async (h) => {
        h.request.body.content = '<script>alert(1)</script>';
        assert.equal((await h.invoke()).code, 500);
        assert.equal(h.created, null);
        assert.equal(h.events.includes('registry-create'), false);
        assert.equal(h.events.includes('insert'), false);
        assert.deepEqual(h.destroyed, [h.thumbnailId]);
      }));
      await t.test('cleanup failure retains registry and never deletes shared images', () => scenario(async (h) => {
        h.mode = 'attach-error';
        h.cleanupError = true;
        assert.equal((await h.invoke()).code, 500);
        assert.equal(h.created, null);
        assert.equal(h.assets.length, 3);
        assert.equal(h.events.includes('registry-delete'), false);
        assert.match(h.warnings[0], /cleanup incomplete/);
      }));
      await t.test('success waits for the insert and has complete registry references', () => scenario(async (h) => {
        let finish;
        h.insertGate = new Promise((resolve) => { finish = resolve; });
        let completed = false;
        const pending = h.invoke().then((res) => { completed = true; return res; });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(completed, false);
        assert.equal(h.created, null);
        assert.deepEqual(h.events, ['upload', 'registry-create', 'attach', 'insert']);
        finish();
        const res = await pending;
        assert.equal(res.code, 200);
        assert.deepEqual(res.body, { message, id: 'create-test' });
        assert.equal(h.created.avatar, h.thumbnailUrl);
        assert.equal(h.assets.length, 3);
        assert.deepEqual(h.destroyed, []);
      }));
      await t.test('confirmed duplicate-key failure cleans only the new thumbnail', () => scenario(async (h) => {
        h.mode = 'db-rejected';
        assert.equal((await h.invoke()).code, 500);
        assert.equal(h.created, null);
        assert.deepEqual(h.destroyed, [h.thumbnailId]);
        assert.equal(h.assets.length, 2);
        assert.deepEqual(h.events.slice(-3), ['reconcile', 'destroy', 'registry-delete']);
      }));
      await t.test('lost acknowledgement is reconciled to the original success response', () => scenario(async (h) => {
        h.mode = 'commit-then-reject';
        const res = await h.invoke();
        assert.equal(res.code, 200);
        assert.deepEqual(res.body, { message, id: 'create-test' });
        assert.equal(h.created.avatar, h.thumbnailUrl);
        assert.deepEqual(h.destroyed, []);
      }));
      for (const mode of ['db-unknown', 'reconcile-error']) {
        await t.test(`${mode}: explicit uncertain response preserves thumbnail and registry`, () => scenario(async (h) => {
          h.mode = mode;
          const res = await h.invoke();
          assert.equal(res.code, 503);
          assert.equal(res.body.creationStatus, 'unknown');
          assert.equal(res.body.id, 'create-test');
          assert.equal(h.assets.length, 3);
          assert.deepEqual(h.destroyed, []);
          assert.match(h.warnings[0], /outcome unknown/);
        }));
      }
      await t.test('committed article with failed reconciliation is explicitly uncertain, never deleted', () => scenario(async (h) => {
        h.mode = 'commit-and-read-error';
        const res = await h.invoke();
        assert.equal(res.code, 503);
        assert.equal(res.body.creationStatus, 'unknown');
        assert.equal(h.created.avatar, h.thumbnailUrl);
        assert.equal(h.assets.length, 3);
        assert.deepEqual(h.destroyed, []);
        assert.equal(res.body.id, h.created.id);
        assert.deepEqual(Object.keys(res.body).sort(), ['creationStatus', 'id', 'message']);
        const read = await h.read(res.body.id);
        assert.equal(read.code, 200);
        assert.equal(read.body.id, res.body.id);
      }));
      await t.test('unknown id includes the existing slug suffix and can be read through the current id handler', () => scenario(async (h) => {
        h.slugAlreadyExists = true;
        h.mode = 'commit-and-read-error';
        const res = await h.invoke();
        assert.equal(res.code, 503);
        assert.equal(res.body.id, `create-test-${contentServices.randomStringPost}`);
        assert.equal(res.body.id, h.created.id);
        assert.equal((await h.read(res.body.id)).code, 200);
      }));
      await t.test('one absent read after unknown does not change or retry creation', () => scenario(async (h) => {
        h.mode = 'db-unknown';
        const res = await h.invoke();
        assert.equal(res.code, 503);
        const before = h.events.filter((event) => event === 'insert').length;
        assert.equal((await h.read(res.body.id)).code, 505);
        assert.equal(res.body.creationStatus, 'unknown');
        assert.equal(h.events.filter((event) => event === 'insert').length, before);
        assert.deepEqual(h.destroyed, []);
      }));
    });
  }
});

test('mandatory attachment checks are opt-in and leave old callers unchanged', async () => {
  const originals = { find: CloudinaryAssetModel.find, update: CloudinaryAssetModel.updateMany, cloudName: CONFIG.cloudinary.cloud_name };
  const thumbnail = 'https://res.cloudinary.com/mock-cloud/image/upload/Tinhocnhuy/test.png';
  const selections = [];
  CONFIG.cloudinary.cloud_name = 'mock-cloud';
  CloudinaryAssetModel.find = () => ({ select: async (fields) => { selections.push(fields); return []; } });
  try {
    await cloudinaryAssetServices.attachUploadedImages('writer', 'post', 'id', '', thumbnail);
    await assert.rejects(cloudinaryAssetServices.attachUploadedImages('writer', 'post', 'id', '', thumbnail, true), /Thumbnail registry entry not found/);
    assert.deepEqual(selections, ['_id', '_id secureUrl']);
    CloudinaryAssetModel.find = () => ({ select: async () => [{ _id: 'asset', secureUrl: thumbnail }] });
    CloudinaryAssetModel.updateMany = async () => ({ acknowledged: false, matchedCount: 0 });
    await cloudinaryAssetServices.attachUploadedImages('writer', 'news', 'id', '', thumbnail);
    await assert.rejects(cloudinaryAssetServices.attachUploadedImages('writer', 'news', 'id', '', thumbnail, true), /attachment not confirmed/);
  } finally {
    CloudinaryAssetModel.find = originals.find;
    CloudinaryAssetModel.updateMany = originals.update;
    CONFIG.cloudinary.cloud_name = originals.cloudName;
  }
});

test('Post/News update and delete APIs defer all physical cleanup', async (t) => {
  const express = require('express');
  const TypesModel = require('../src/Model/Types_News_Models').default;
  for (const [kind, model, categoryModel, router, updatePath, deletePath] of [
    ['post', PostModel, CategoriesModel, postRouter, '/updatePost/', '/deletePost/'],
    ['news', NewsModel, TypesModel, newsRouter, '/updateNews/', '/deleteNews/']
  ]) {
    await t.test(kind, async (t) => {
      async function scenario(run) {
        const originals = { find: model.findOne, update: model.findOneAndUpdate, remove: model.deleteOne, category: categoryModel.findOne, account: AccountModel.findOne, rate: RateLimitModel.findOneAndUpdate, assetFind: CloudinaryAssetModel.find, assetCreate: CloudinaryAssetModel.create, assetUpdate: CloudinaryAssetModel.updateMany, assetDelete: CloudinaryAssetModel.deleteOne, upload: cloudinary.uploader.upload, destroy: cloudinary.uploader.destroy, cleanup: cloudinaryAssetServices.cleanupResourceImages, warn: console.warn, cloudName: CONFIG.cloudinary.cloud_name };
        CONFIG.cloudinary.cloud_name = 'mock-cloud';
        const url = (name) => `https://res.cloudinary.com/mock-cloud/image/upload/Tinhocnhuy/${name}.png`;
        const h = { mode: 'ok', record: { _id: 'document-1', id: 'resource-1', avatar: url('old'), content: '<p>Original</p>' }, events: [], assets: [
          { _id: 'old', secureUrl: url('old'), ownerId: 'writer', resources: [{ kind, resourceId: 'resource-1' }] },
          { _id: 'shared', secureUrl: url('shared'), ownerId: 'writer', resources: [{ kind: 'post', resourceId: 'other-article' }] }
        ] };
        model.findOne = async () => {
          h.events.push('find');
          if (h.mode === 'lookup-error') throw new Error('private DB details');
          return h.record ? { ...h.record } : null;
        };
        categoryModel.findOne = async () => ({ id: 'new-category' });
        AccountModel.findOne = () => ({ select: () => ({ lean: async () => ({ _id: 'account', role: false }) }) });
        RateLimitModel.findOneAndUpdate = () => ({ lean: async () => ({ count: 1 }) });
        CloudinaryAssetModel.find = (filter) => ({ select: async () => h.assets.filter((asset) => asset.ownerId === filter.ownerId && filter.secureUrl.$in.includes(asset.secureUrl)) });
        CloudinaryAssetModel.create = async (data) => { h.events.push('register'); h.assets.push({ ...data, _id: 'new', resources: [] }); };
        CloudinaryAssetModel.updateMany = async (filter, update) => {
          h.events.push('attach');
          if (h.mode === 'registry-error') throw new Error('private registry failure');
          const assets = h.assets.filter((asset) => filter._id.$in.includes(asset._id) && asset.ownerId === filter.ownerId);
          for (const asset of assets) if (!asset.resources.some((ref) => ref.kind === kind && ref.resourceId === 'resource-1')) asset.resources.push(update.$addToSet.resources);
          return { acknowledged: h.mode !== 'unacknowledged-registry', matchedCount: assets.length };
        };
        model.findOneAndUpdate = async (filter, fields, options) => {
          h.events.push('write');
          assert.deepEqual(filter, { _id: 'document-1', avatar: url('old') });
          assert.deepEqual(options, { new: true });
          if (h.mode === 'update-error') throw new Error('private DB failure');
          if (h.mode === 'conflict') return null;
          h.record = { ...h.record, ...fields };
          if (h.mode === 'update-commit-error') throw new Error('lost write acknowledgement');
          return { ...h.record };
        };
        model.deleteOne = async (filter) => {
          h.events.push('delete');
          assert.deepEqual(filter, { _id: 'document-1' });
          if (h.mode === 'delete-error') throw new Error('private DB failure');
          if (h.mode === 'unacknowledged-delete') return { acknowledged: false };
          h.record = null;
          if (h.mode === 'delete-commit-error') throw new Error('lost delete acknowledgement');
          return { acknowledged: true, deletedCount: h.mode === 'delete-zero' ? 0 : 1 };
        };
        cloudinary.uploader.upload = async () => {
          h.events.push('upload');
          if (h.mode === 'upload-error') throw new Error('private upload failure');
          return { public_id: 'Tinhocnhuy/new', secure_url: url('new') };
        };
        cloudinary.uploader.destroy = async () => { h.events.push('destroy'); throw new Error('must never destroy'); };
        cloudinaryAssetServices.cleanupResourceImages = async () => { h.events.push('unsafe-cleanup'); throw new Error('must never invoke racy cleanup'); };
        CloudinaryAssetModel.deleteOne = async () => { h.events.push('registry-delete'); throw new Error('must preserve registry'); };
        console.warn = () => {};
        const app = express();
        app.use(express.json());
        app.use('/api', router);
        const server = app.listen(0);
        await new Promise((resolve) => server.listening ? resolve() : server.once('listening', resolve));
        h.invoke = async (action = 'update', replace = false) => {
          const fields = { title: 'Updated', slug: 'same-request-slug', description: 'Updated description', content: `<p>Updated</p><img src="${url('shared')}">`, category: 'Category', types: 'Types', tag: 'tag' };
          let body;
          const headers = { authorization: `Bearer ${generateAccessToken('writer')}` };
          if (action === 'update' && replace) {
            body = new FormData();
            for (const [key, value] of Object.entries(fields)) body.append(key, value);
            body.append('file', new Blob([Buffer.from([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'thumbnail.png');
          } else {
            headers['content-type'] = 'application/json';
            body = JSON.stringify(action === 'update' ? fields : {});
          }
          const res = await fetch(`http://127.0.0.1:${server.address().port}/api${action === 'update' ? updatePath : deletePath}resource-1`, { method: 'POST', headers, body, signal: AbortSignal.timeout(3000) });
          return { status: res.status, body: await res.json() };
        };
        try {
          await run(h, url);
          for (const forbidden of ['destroy', 'unsafe-cleanup', 'registry-delete']) assert.equal(h.events.includes(forbidden), false, forbidden);
          assert.ok(h.assets[0].resources.some((ref) => ref.resourceId === 'resource-1'));
          assert.ok(h.assets[1].resources.some((ref) => ref.resourceId === 'other-article'));
        } finally {
          await new Promise((resolve) => server.close(resolve));
          model.findOne = originals.find; model.findOneAndUpdate = originals.update; model.deleteOne = originals.remove;
          categoryModel.findOne = originals.category; AccountModel.findOne = originals.account; RateLimitModel.findOneAndUpdate = originals.rate;
          CloudinaryAssetModel.find = originals.assetFind; CloudinaryAssetModel.create = originals.assetCreate; CloudinaryAssetModel.updateMany = originals.assetUpdate; CloudinaryAssetModel.deleteOne = originals.assetDelete;
          cloudinary.uploader.upload = originals.upload; cloudinary.uploader.destroy = originals.destroy; cloudinaryAssetServices.cleanupResourceImages = originals.cleanup;
          console.warn = originals.warn; CONFIG.cloudinary.cloud_name = originals.cloudName;
        }
      }
      for (const replace of [false, true]) {
        await t.test(`regular user update succeeds, replace thumbnail=${replace}`, () => scenario(async (h, url) => {
          const result = await h.invoke('update', replace);
          assert.equal(result.status, 200);
          assert.deepEqual(result.body, { message: 'Cập nhật thành công', id: 'resource-1' });
          assert.equal(h.record.avatar, url(replace ? 'new' : 'old'));
          assert.equal(h.record.title, 'Updated');
          assert.equal(h.record.slug, 'same-request-slug');
          assert.equal(h.record[kind === 'post' ? 'categoryId' : 'typesid'], 'new-category');
          if (kind === 'news') assert.equal(h.record.tag, 'tag');
          assert.ok(h.events.indexOf('attach') < h.events.indexOf('write'));
          assert.ok(h.assets.find((asset) => asset._id === 'shared').resources.some((ref) => ref.kind === kind && ref.resourceId === 'resource-1'));
        }));
      }
      for (const action of ['update', 'delete']) {
        await t.test(`${action} missing resource has no side effects`, () => scenario(async (h) => {
          h.record = null;
          assert.equal((await h.invoke(action, true)).status, 404);
          assert.deepEqual(h.events, ['find']);
        }));
      }
      for (const mode of ['lookup-error', 'upload-error', 'registry-error', 'unacknowledged-registry']) {
        await t.test(`${mode} stops update before DB write`, () => scenario(async (h, url) => {
          h.mode = mode;
          const result = await h.invoke('update', true);
          assert.equal(result.status, 500);
          assert.deepEqual(result.body, { message: 'Internal server error' });
          assert.equal(h.record.avatar, url('old'));
          assert.equal(h.events.includes('write'), false);
        }));
      }
      for (const mode of ['update-error', 'update-commit-error']) {
        await t.test(`${mode} retains all images and reports uncertainty`, () => scenario(async (h, url) => {
          h.mode = mode;
          const result = await h.invoke('update', true);
          assert.equal(result.status, 503);
          assert.equal(result.body.updateStatus, 'unknown');
          assert.equal(h.record.avatar, url(mode === 'update-error' ? 'old' : 'new'));
          assert.equal(h.assets.length, 3);
        }));
      }
      await t.test('conditional update conflict keeps new thumbnail metadata', () => scenario(async (h, url) => {
        h.mode = 'conflict';
        assert.equal((await h.invoke('update', true)).status, 409);
        assert.equal(h.record.avatar, url('old'));
        assert.equal(h.assets.length, 3);
      }));
      await t.test('delete succeeds without deleting any shared image or metadata', () => scenario(async (h) => {
        const result = await h.invoke('delete');
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { message: 'Đã xóa bài viết', id: 'resource-1' });
        assert.equal(h.record, null);
        assert.deepEqual(h.events, ['find', 'delete']);
      }));
      for (const mode of ['delete-error', 'delete-commit-error', 'unacknowledged-delete']) {
        await t.test(`${mode} keeps images and metadata`, () => scenario(async (h) => {
          h.mode = mode;
          const result = await h.invoke('delete');
          assert.equal(result.status, 503);
          assert.equal(result.body.deleteStatus, 'unknown');
          assert.equal(Boolean(h.record), mode !== 'delete-commit-error');
          assert.equal(h.assets.length, 2);
        }));
      }
      await t.test('concurrent disappearance does not report successful deletion', () => scenario(async (h) => {
        h.mode = 'delete-zero';
        assert.equal((await h.invoke('delete')).status, 404);
      }));
    });
  }
});

test('about and content banner creation wait for the database and return controlled write errors', async () => {
  const originals = {
    bannerFind: Content_Banner_Model.findOne,
    bannerCreate: Content_Banner_Model.create,
    aboutFind: About_Model.findOne,
    aboutCreate: About_Model.create,
    upload: contentServices.uploadImageToCloudinary
  };
  Content_Banner_Model.findOne = async () => null;
  About_Model.findOne = async () => null;
  contentServices.uploadImageToCloudinary = async () => 'https://example.com/image.png';
  const imageRequest = { file: { buffer: Buffer.from('image') } };

  async function assertCreateWaits(controller, model, request) {
    let resolveCreate;
    model.create = () => new Promise((resolve) => { resolveCreate = resolve; });
    const res = response();
    const operation = controller(request, res);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof resolveCreate, 'function');
    assert.equal(res.body, undefined);
    resolveCreate({});
    await operation;
    assert.equal(res.code, 200);
    assert.equal(res.body.message, 'Thêm thành công');
  }

  async function assertCreateFailure(controller, model, request) {
    model.create = async () => { throw new Error('database write failed'); };
    const res = response();
    await controller(request, res);
    assert.equal(res.code, 500);
    assert.deepEqual(res.body, { message: 'Internal server error' });
  }

  try {
    const bannerRequest = { ...imageRequest, body: { title: 'Banner', content: '<p>Content</p>', linkservices: '/services' } };
    const aboutRequest = { ...imageRequest, body: { title: 'About', content: '<p>Content</p>' } };
    await assertCreateWaits(Content_Banner.createContentBanner, Content_Banner_Model, bannerRequest);
    await assertCreateWaits(About.createAbout, About_Model, aboutRequest);
    await assertCreateFailure(Content_Banner.createContentBanner, Content_Banner_Model, bannerRequest);
    await assertCreateFailure(About.createAbout, About_Model, aboutRequest);
  } finally {
    Content_Banner_Model.findOne = originals.bannerFind;
    Content_Banner_Model.create = originals.bannerCreate;
    About_Model.findOne = originals.aboutFind;
    About_Model.create = originals.aboutCreate;
    contentServices.uploadImageToCloudinary = originals.upload;
  }
});
