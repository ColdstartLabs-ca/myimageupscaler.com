#!/usr/bin/env node
/**
 * GA4 key-event checker/creator for myimageupscaler.com SEO funnel events.
 *
 * Default mode lists configured key events and reports missing expected funnel events.
 * Pass --create to create missing key events. Creation requires GA4 Editor or equivalent
 * permission on the property for the service account.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROPERTY_ID = '519826120';
const READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const EDIT_SCOPE = 'https://www.googleapis.com/auth/analytics.edit';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

const EXPECTED_KEY_EVENTS = [
  'image_uploaded',
  'image_upscale_started',
  'upscale_completed',
  'signup_started',
  'signup_completed',
  'checkout_opened',
  'checkout_started',
  'checkout_completed',
  'purchase_confirmed',
];

const EXPECTED_EMITTED_GA4_KEY_EVENTS = [
  'select_content',
  'generate_lead',
  'sign_up',
  'begin_checkout',
  'add_payment_info',
  'purchase',
];

const KEY_FILE_PATHS = [
  process.env.GCP_KEY_FILE,
  path.join(
    process.env.HOME || '',
    'projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json'
  ),
  './cloud/keys/coldstart-labs-service-account-key.json',
].filter(Boolean);

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    create: args.includes('--create'),
    propertyId:
      args.find(arg => arg.startsWith('--property-id='))?.split('=').slice(1).join('=') ||
      PROPERTY_ID,
    key: args.find(arg => arg.startsWith('--key='))?.split('=').slice(1).join('=') || null,
  };
}

function findKeyFile(explicitKeyPath) {
  const candidates = [explicitKeyPath, ...KEY_FILE_PATHS].filter(Boolean);
  const keyFile = candidates.find(candidate => fs.existsSync(candidate));
  if (!keyFile) {
    throw new Error(`No service account key found. Checked: ${candidates.join(', ')}`);
  }
  return keyFile;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function createAccessToken(keyFile, scope) {
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (!key.client_email || !key.private_key) {
    throw new Error(`Invalid service account key file: ${keyFile}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const encodedClaims = base64UrlEncode(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(key.private_key);
  const assertion = `${signingInput}.${base64UrlEncode(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Token request failed (${response.status}): ${bodyText}`);

  return {
    accessToken: JSON.parse(bodyText).access_token,
    clientEmail: key.client_email,
  };
}

async function adminRequest({ method = 'GET', url, accessToken, body = null }) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const bodyText = await response.text();
  const parsed = bodyText ? JSON.parse(bodyText) : {};
  return { ok: response.ok, status: response.status, bodyText, parsed };
}

async function listKeyEvents({ accessToken, propertyId }) {
  const keyEvents = [];
  let pageToken = '';

  do {
    const url = new URL(`${ADMIN_BASE}/properties/${propertyId}/keyEvents`);
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await adminRequest({ url, accessToken });
    if (!response.ok) {
      throw new Error(`List key events failed (${response.status}): ${response.bodyText}`);
    }

    keyEvents.push(...(response.parsed.keyEvents || []));
    pageToken = response.parsed.nextPageToken || '';
  } while (pageToken);

  return keyEvents;
}

async function createKeyEvent({ accessToken, propertyId, eventName }) {
  return adminRequest({
    method: 'POST',
    url: `${ADMIN_BASE}/properties/${propertyId}/keyEvents`,
    accessToken,
    body: { eventName },
  });
}

async function main() {
  const args = parseArgs();
  const keyFile = findKeyFile(args.key);
  const scope = args.create ? EDIT_SCOPE : READONLY_SCOPE;
  const { accessToken, clientEmail } = await createAccessToken(keyFile, scope);

  const before = await listKeyEvents({ accessToken, propertyId: args.propertyId });
  const beforeNames = before.map(event => event.eventName).sort();
  const allExpected = Array.from(
    new Set([...EXPECTED_KEY_EVENTS, ...EXPECTED_EMITTED_GA4_KEY_EVENTS])
  );
  const missingBefore = allExpected.filter(eventName => !beforeNames.includes(eventName));
  const createResults = [];

  if (args.create && missingBefore.length > 0) {
    for (const eventName of missingBefore) {
      const result = await createKeyEvent({
        accessToken,
        propertyId: args.propertyId,
        eventName,
      });
      createResults.push({
        eventName,
        ok: result.ok,
        status: result.status,
        error: result.ok ? null : result.parsed.error?.message || result.bodyText,
      });
    }
  }

  const after = args.create
    ? await listKeyEvents({ accessToken, propertyId: args.propertyId }).catch(() => before)
    : before;
  const afterNames = after.map(event => event.eventName).sort();

  console.log(
    JSON.stringify(
      {
        propertyId: args.propertyId,
        serviceAccount: clientEmail,
        mode: args.create ? 'create' : 'check',
        expectedInternalKeyEvents: EXPECTED_KEY_EVENTS,
        expectedEmittedGa4KeyEvents: EXPECTED_EMITTED_GA4_KEY_EVENTS,
        configuredExpectedInternal: EXPECTED_KEY_EVENTS.filter(eventName =>
          afterNames.includes(eventName)
        ),
        missingExpectedInternal: EXPECTED_KEY_EVENTS.filter(eventName => !afterNames.includes(eventName)),
        configuredExpectedEmittedGa4: EXPECTED_EMITTED_GA4_KEY_EVENTS.filter(eventName =>
          afterNames.includes(eventName)
        ),
        missingExpectedEmittedGa4: EXPECTED_EMITTED_GA4_KEY_EVENTS.filter(
          eventName => !afterNames.includes(eventName)
        ),
        configuredExpected: allExpected.filter(eventName => afterNames.includes(eventName)),
        missingExpected: allExpected.filter(eventName => !afterNames.includes(eventName)),
        allKeyEventNames: afterNames,
        createResults,
      },
      null,
      2
    )
  );

  if (args.create && createResults.some(result => !result.ok)) {
    process.exitCode = 2;
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
