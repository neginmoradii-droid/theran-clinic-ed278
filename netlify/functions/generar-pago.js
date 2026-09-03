import crypto from 'node:crypto';

const SECRET_KEY    = '+FBv/qS9vwsDZPgZu/CWFUOaS9XGrRbW';
const MERCHANT_CODE = '370476756';
const TERMINAL      = '001';
const AMOUNT        = '1500';
const CURRENCY      = '978';
const REDSYS_URL    = 'https://sis.redsys.es/sis/realizarPago';

function base64UrlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function encrypt3DES(message, key) {
  const msgBuf = Buffer.from(message, 'utf8');
  const l = Math.ceil(msgBuf.length / 8) * 8;
  const padded = Buffer.alloc(l, 0);
  msgBuf.copy(padded);
  const iv = Buffer.alloc(8, 0);
  const cipher = crypto.createCipheriv('des-ede3-cbc', key, iv);
  cipher.setAutoPadding(false);
  const enc = Buffer.concat([cipher.update(padded), cipher.final()]);
  return enc.slice(0, l);
}

function redsysSignature(paramsB64, order) {
  const key      = base64UrlDecode(SECRET_KEY);
  const keyOrder = encrypt3DES(order, key);
  const hmac     = crypto.createHmac('sha256', keyOrder);
  hmac.update(paramsB64);
  return base64UrlEncode(hmac.digest());
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { nombre, email, telefono } = body;
  if (!nombre || !email || !telefono) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Faltan datos.' }) };
  }

  // Orden: 12 dígitos numéricos únicos
  const ts    = Date.now().toString();
  const order = ts.slice(-12).padStart(12, '0');

  const urlBase = 'https://theranclinic.com';
  const merchantData = `Nombre: ${nombre} | Email: ${email} | Tel: ${telefono}`;

  const merchantParams = {
    DS_MERCHANT_AMOUNT:             AMOUNT,
    DS_MERCHANT_ORDER:              order,
    DS_MERCHANT_MERCHANTCODE:       MERCHANT_CODE,
    DS_MERCHANT_CURRENCY:           CURRENCY,
    DS_MERCHANT_TRANSACTIONTYPE:    '0',
    DS_MERCHANT_TERMINAL:           TERMINAL,
    DS_MERCHANT_URLOK:              `${urlBase}/reserva-confirmada/`,
    DS_MERCHANT_URLKO:              `${urlBase}/reserva-error/`,
    DS_MERCHANT_MERCHANTNAME:       'THERAN Clinic',
    DS_MERCHANT_PRODUCTDESCRIPTION: 'Depósito reserva cita - 15€',
    DS_MERCHANT_TITULAR:            nombre,
    DS_MERCHANT_MERCHANTDATA:       merchantData,
  };

  const paramsJson = JSON.stringify(merchantParams);
  const paramsB64  = Buffer.from(paramsJson).toString('base64');
  const signature  = redsysSignature(paramsB64, order);

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      url:        REDSYS_URL,
      params_b64: paramsB64,
      signature:  signature,
    }),
  };
};
