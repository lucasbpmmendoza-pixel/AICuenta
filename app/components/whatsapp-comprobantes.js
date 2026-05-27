const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config();
const { google } = require('googleapis');
const { parse, format } = require('date-fns');
const { es } = require('date-fns/locale');
const axios = require('axios');  // <--- arriba
const sql = require('mssql');


const dbConfig = {
  user: 'mmendoza-server-admin',
  password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net',        // ejemplo → "tcp:mi-sql.database.windows.net"
  database: 'mmendoza-database',
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};


// Instancia de OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let sock;

async function guardarEnAzureSQL(datos) {
  try {
    let pool = await sql.connect(dbConfig);

    await pool.request()
      .input('remitente_nombre', sql.NVarChar, datos.remitente_nombre || null)
      .input('remitente_telefono', sql.NVarChar, datos.remitente_telefono || null)
      .input('banco', sql.NVarChar, datos.banco || null)
      .input('fecha', sql.NVarChar, datos.fecha || null)
      .input('monto', sql.Decimal(18,2), datos.monto || null)
      .input('folio', sql.NVarChar, datos.folio || null)
      .input('concepto', sql.NVarChar, datos.concepto || null)
      .input('referencia', sql.NVarChar, datos.referencia || null)
      .input('clave_rastreo', sql.NVarChar, datos.clave_rastreo || null)
      .input('beneficiario', sql.NVarChar, datos.beneficiario || null)
      .input('cuenta_destino', sql.NVarChar, datos.cuenta_destino || null)
      .input('Fuente', sql.NVarChar, 'Rentas' || null)
      .query(`
        INSERT INTO dbo.Comprobantes (
          remitente_nombre, remitente_telefono, banco, fecha, monto, folio,
          concepto, referencia, clave_rastreo, beneficiario, cuenta_destino, Fuente
        ) VALUES (
          @remitente_nombre, @remitente_telefono, @banco, @fecha, @monto, @folio,
          @concepto, @referencia, @clave_rastreo, @beneficiario, @cuenta_destino, @Fuente
        )
      `);

    console.log("✅ Guardado en Azure SQL");
  } catch(err) {
    console.error("❌ Error guardando en Azure SQL:", err.message);
  }
}


// Función para validar si una imagen es un comprobante de pago
async function esComprobante(rutaImagen) {
  const base64Image = fs.readFileSync(rutaImagen, { encoding: 'base64' });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `¿La imagen que te muestro corresponde a un comprobante de pago, transferencia bancaria o recibo de transacción? Responde solo con "Sí" o "No".`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 10,
  });

  const respuesta = response.choices[0].message.content.trim().toLowerCase();
  return respuesta.startsWith('sí');
}



async function extraerDatosComprobante(rutaImagen) {
  const base64Image = fs.readFileSync(rutaImagen, { encoding: 'base64' });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analiza esta imagen de un comprobante de pago, puede ser una captura de pantalla o una hoja escrita a mano y responde SOLO un JSON válido (sin backticks, sin texto extra) con estos campos:
- banco(puede venir como logo o imagen en el mismo comprobante o en la parte de informacion/aclaracion)
- fecha
- monto
- folio
- beneficiario
- cuenta_destino(solo extrae los ultimos 4 numeros, tambien puede llamarse cuenta beneficiaria)
- referencia: número o texto usado como referencia de pago (no es concepto ni clave de rastreo)
- concepto: descripción o motivo del pago (texto libre)
- clave_rastreo: clave alfanumérica única de rastreo interbancario

Si algún dato no se encuentra, usa null. No expliques nada, solo responde el JSON.`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 500,
  });

  const texto = response.choices[0].message.content;
  return texto;
}


async function guardarEnGoogleSheets(datos) {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'comprobantes-guardados-5c9cc01a27a7.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const spreadsheetId = '1lrezPTrnw3mRoeIBGzDh4tWfL-xWILI9GUDXDP29Duo'; // <-- pega aquí el ID de tu Google Sheet
  const range = 'A2'; // comenzamos desde A1 hacia abajo

  const values = [
    [
      new Date().toISOString().slice(0, 10),
      datos.remitente_nombre || '',           // Nombre remitente
      datos.remitente_telefono || '',
      datos.banco || '',
      datos.fecha || '',
      datos.monto || '',
      datos.folio || '',
      datos.beneficiario || '',
      datos.concepto || '',
      datos.referencia || '',
      datos.clave_rastreo || '',
      datos.link_cep || '',
      datos.cuenta_destino || ''
    ]
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values,
    },
  });

  console.log('✅ Datos guardados en Google Sheets.');
}

function formatearFecha(fechaOriginal) {
  let fechaFormateada = null;

  try {
    // 1️⃣ Detectar formato "13 de agosto de 2025, 10:11:18 h"
    let match = fechaOriginal.match(/(\d{1,2})\s+de\s+([a-zA-Z]+)\s+de\s+(\d{4})/i);
    if (match) {
      const dia = match[1];
      const mes = match[2];
      const anio = match[3];
      const parsed = parse(`${dia} ${mes} ${anio}`, 'd MMMM yyyy', new Date(), { locale: es });
      fechaFormateada = format(parsed, 'dd-MM-yyyy');
      return fechaFormateada;
    }

    // 2️⃣ Detectar formato "14/ago/2025"
    match = fechaOriginal.match(/(\d{1,2})\/([a-zA-Z]+)\/(\d{4})/);
    if (match) {
      const parsed = parse(fechaOriginal, 'dd/MMM/yyyy', new Date(), { locale: es });
      fechaFormateada = format(parsed, 'dd-MM-yyyy');
      return fechaFormateada;
    }

    // 3️⃣ Detectar formato "08 agosto 2025"
    match = fechaOriginal.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
    if (match) {
      const parsed = parse(fechaOriginal, 'dd MMMM yyyy', new Date(), { locale: es });
      fechaFormateada = format(parsed, 'dd-MM-yyyy');
      return fechaFormateada;
    }

    // 4️⃣ Detectar formato estándar dd-MM-yyyy o dd/MM/yyyy
    match = fechaOriginal.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (match) {
      // Si viene con hora "11/08/2025 a las 12:15:23 hrs", extraemos solo la parte de fecha
      let soloFecha = match[0];
      const parsed = parse(soloFecha, 'dd/MM/yyyy', new Date());
      fechaFormateada = format(parsed, 'dd-MM-yyyy');
      return fechaFormateada;
    }

  } catch (err) {
    console.error('❌ Error formateando fecha:', err.message);
  }

  return fechaFormateada || fechaOriginal; // fallback
}



function normalizarBanco(bancoOriginal) {
  if (!bancoOriginal) return '';

  // Convertir a mayúsculas
  let banco = bancoOriginal.toUpperCase();

  // Eliminar números, caracteres especiales y sufijos como "SA", "S.A.", etc.
  banco = banco.replace(/[\d*.,]/g, '');      // elimina números, asteriscos, puntos y comas
  banco = banco.replace(/\b(SA|S\.A\.|MEXICO|BANK|BANCO)\b/gi, ''); // opcional limpiar palabras comunes redundantes
  banco = banco.replace(/\s+/g, ' ');         // quitar espacios extra
  banco = banco.trim();                        // recortar al inicio y fin

  return banco;
}

function limpiarMonto(montoOriginal) {
  if (!montoOriginal) return '';

  // Convertimos a string por si viene como número
  let montoStr = montoOriginal.toString();

  // Quitamos comas, espacios y cualquier letra
  montoStr = montoStr.replace(/[^\d.]/g, '');

  // Si tiene decimal .00, lo ignoramos
  if (montoStr.includes('.')) {
    const partes = montoStr.split('.');
    if (partes[1] === '00') {
      montoStr = partes[0]; // solo la parte entera
    } else {
      montoStr = partes.join(''); // si no es .00, unir todo como entero
    }
  }

  return montoStr;
}

async function formatearFecha(fechaOriginal) {
  let fechaFormateada = null;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `Convierte la siguiente fecha al formato "dd-mm-yyyy".
La fecha puede venir en cualquier formato o con texto adicional.
Debes responder ÚNICAMENTE con la fecha en ese formato y nada más.
No uses palabras extra, no uses JSON, solo la fecha.

Fecha: ${fechaOriginal}`,
        },
      ],
      max_tokens: 50,
    });

    fechaFormateada = response.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ Error formateando fecha:", err.message);
  }

  console.log('fecha forma',fechaFormateada);
  return fechaFormateada;

}



function obtenerCuentaOBancoPorUltimos4(ultimos4) {
  const referencias = [
    {
      banco: "BANORTE",
      cuenta: "1179934178",
      clabe: "072164011799341784"
    },
    {
      banco: "BANORTE",
      cuenta: "1256423247",
      clabe: "072164012564232470"
    }
  ];

  for (const ref of referencias) {
    if (ref.cuenta.endsWith(ultimos4)) {
      return ref.cuenta;
    }

    if (ref.clabe.endsWith(ultimos4)) {
      return ref.clabe;
    }
  }

  return null;
}

function extraerImagenMensaje(messageContent) {
  if (!messageContent) {
    return null;
  }

  if (messageContent.imageMessage) {
    return messageContent.imageMessage;
  }

  if (messageContent.ephemeralMessage) {
    return extraerImagenMensaje(messageContent.ephemeralMessage.message);
  }

  if (messageContent.viewOnceMessageV2) {
    return extraerImagenMensaje(messageContent.viewOnceMessageV2.message);
  }

  if (messageContent.viewOnceMessageV2Extension) {
    return extraerImagenMensaje(messageContent.viewOnceMessageV2Extension.message);
  }

  if (messageContent.viewOnceMessage) {
    return extraerImagenMensaje(messageContent.viewOnceMessage.message);
  }

  return null;
}

async function descargarImagen(imageMessage, filePath) {
  const stream = await downloadContentFromMessage(imageMessage, 'image');
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  fs.writeFileSync(filePath, Buffer.concat(chunks));
}

function obtenerDatosRemitente(message) {
  const remitenteJid = message.key.participant || message.key.remoteJid || '';

  return {
    remitente_nombre: message.pushName || 'desconocido',
    remitente_telefono: remitenteJid.split('@')[0] || 'desconocido'
  };
}

function normalizarJidDestino(destino) {
  if (destino.includes('@')) {
    return destino;
  }

  return `${destino}@s.whatsapp.net`;
}

async function responderMensaje(remoteJid, text, quotedMessage) {
  await sock.sendMessage(remoteJid, { text }, { quoted: quotedMessage });
}

async function procesarMensajeEntrante(message) {
  const remoteJid = message.key.remoteJid;

  if (!remoteJid || message.key.fromMe || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) {
    return;
  }

  const imageMessage = extraerImagenMensaje(message.message);

  if (!imageMessage) {
    return;
  }

  console.log('🖼 Imagen recibida');

  const extension = (imageMessage.mimetype || 'image/jpeg').split('/')[1].split(';')[0];
  const fileName = `comprobante_${Date.now()}.${extension}`;
  const filePath = path.join(__dirname, fileName);

  await descargarImagen(imageMessage, filePath);

  try {
    const esValido = await esComprobante(filePath);
    console.log(esValido);

    if (esValido) {
      console.log('✅ Imagen confirmada como comprobante de pago.');
      const datos = await extraerDatosComprobante(filePath);
      console.log('📄 Datos extraídos:', datos);

      let json;

      try {
        json = JSON.parse(datos);

        let numero_rastreo = null;

        if (json.clave_rastreo && /[a-zA-Z]/.test(json.clave_rastreo) && json.clave_rastreo.length === 24) {
          numero_rastreo = json.clave_rastreo;
        } else if (json.referencia && /^\d+$/.test(json.referencia)) {
          numero_rastreo = json.referencia;
        } else {
          console.warn('⚠️ No se encontró clave de rastreo válida ni referencia numérica.');
        }

        if (numero_rastreo) {
          const cuentaOBeneficiaria = obtenerCuentaOBancoPorUltimos4(json.cuenta_destino);
          const fechaFormateadafinal = await formatearFecha(json.fecha);

          if (!cuentaOBeneficiaria) {
            console.error('⚠️ No se encontró coincidencia para los últimos 4:', json.cuenta_destino);
          }

          console.log('cuenta formateada', cuentaOBeneficiaria);
          console.log('cuenta sin formatear', json.cuenta_destino);
          console.log(formatearFecha(json.fecha));
          console.log('fecha formateada final', fechaFormateadafinal);

          if (normalizarBanco(json.banco) != 'BANORTE') {
            try {
              const response = await axios.post('http://192.168.0.60:4000/consulta-cep', {
                fecha: fechaFormateadafinal,
                numero_rastreo: numero_rastreo,
                emisor_texto: normalizarBanco(json.banco) || '',
                receptor_texto: 'BANORTE',
                cuenta_beneficiaria: cuentaOBeneficiaria,
                monto: limpiarMonto(json.monto)
              });

              if (response.data.ok) {
                console.log('✅ CEP generado y guardado:', response.data.file_path);

                let rutaAbsoluta = response.data.file_path;
                let basePublic = '/var/www/servidor.mmendoza/';
                let rutaRelativa = rutaAbsoluta.replace(basePublic, '');

                json.link_cep = `${rutaRelativa}`;
              } else {
                console.error('🚨 Error al generar CEP:', response.data.error);
              }
            } catch (err) {
              console.error('❌ No se pudo llamar al microservicio:', err.message);
            }
          }
        }
      } catch (e) {
        console.error('❌ No se pudo parsear JSON de OpenAI:', e.message);
        return;
      }

      Object.assign(json, obtenerDatosRemitente(message));

      console.log('Para Sheets:', {
        remitente_nombre: json.remitente_nombre,
        remitente_telefono: json.remitente_telefono
      });

      try {
        await guardarEnGoogleSheets(json);
        await guardarEnAzureSQL(json);
        console.log('Comprobante guardado');
        await responderMensaje(remoteJid, '✅Muchas gracias por tu pago. El comprobante ha sido registrado exitosamente en nuestro sistema.', message);

        const numeroNotificar = normalizarJidDestino('5216565908992');
        await sock.sendMessage(
          numeroNotificar,
          {
            text:
              `📢 *Nuevo comprobante registrado*\n\n` +
              `👤 Remitente: ${json.remitente_nombre || 'Desconocido'}\n` +
              `📱 Teléfono: ${json.remitente_telefono || 'No disponible'}\n\n` +
              `🏦 Banco: ${json.banco || ''}\n` +
              `📅 Fecha: ${json.fecha || ''}\n` +
              `💵 Monto: ${json.monto || ''}\n` +
              `🧾 Folio: ${json.folio || ''}\n` +
              `📌 Concepto: ${json.concepto || ''}\n` +
              `🔍 Referencia: ${json.referencia || ''}\n` +
              `📦 Clave de rastreo: ${json.clave_rastreo || ''}\n` +
              `📦 Comprobante CEP: ${json.link_cep || ''}\n` +
              `Beneficiario: ${json.beneficiario || ''}`
          }
        );
      } catch (error) {
        console.error('❌ Error al guardar en Google Sheets:', error.message);
      }
    } else {
      console.log('❌ La imagen no parece ser un comprobante. Eliminando...');
    }
  } catch (error) {
    console.error('❌ Error al validar imagen con OpenAI:', error.message);
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'baileys_auth'));
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    browser: ['Comprobantes Bot', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('🟢 Escanea este código QR con tu WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('✅ Cliente de WhatsApp conectado y listo.');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.data?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log('⚠️ Conexión cerrada.', statusCode || 'Sin código');

      if (shouldReconnect) {
        iniciarWhatsApp().catch((error) => {
          console.error('❌ Error reconectando WhatsApp:', error.message);
        });
      } else {
        console.error('❌ Sesión cerrada. Elimina la carpeta baileys_auth y vuelve a vincular el dispositivo.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') {
      return;
    }

    for (const message of messages) {
      try {
        await procesarMensajeEntrante(message);
      } catch (error) {
        console.error('❌ Error procesando mensaje entrante:', error.message);
      }
    }
  });
}

iniciarWhatsApp().catch((error) => {
  console.error('❌ Error iniciando WhatsApp:', error.message);
});