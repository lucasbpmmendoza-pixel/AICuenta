const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const axios = require("axios");
const FormData = require("form-data");
const { parseStringPromise } = require("xml2js");
const sql = require("mssql");
const moment = require("moment");
const cron = require("node-cron");

// =============================
// CONFIGURACIÓN
// =============================

// Conexión a Azure SQL
const sqlConfig = {
  user: "mmendoza-server-admin",
  password: "P@to0102",
  server: "mmendoza-server.database.windows.net",
  //database: "ivette-database",
  database: "mmendoza-database",
  options: {
    trustServerCertificate: true,
    encrypt: true, // for Azure
    connectTimeout: 30000, // 30 seconds
    requestTimeout: 30000, // 30 seconds
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  },
};

// Archivo log
const LOG_FILE = path.join(__dirname, "errores.log");

// =============================
// FUNCIONES AUXILIARES
// =============================

// Mover XML procesado a carpeta processed
function moveToProcessed(xmlPath, rfcCliente) {
  const fileName = path.basename(xmlPath);
  const relativePath = path.relative(path.join("/home/local/scripts/xmls/pending", rfcCliente), xmlPath);
  const processedPath = path.join("/home/local/scripts/xmls/processed", rfcCliente, relativePath);

  // Crear directorio destino si no existe
  const processedDir = path.dirname(processedPath);
  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }

  // Mover archivo
  fs.renameSync(xmlPath, processedPath);
  return processedPath;
}

// Guardar errores en log.txt
function logError(msg) {
  const line = `[${moment().format("YYYY-MM-DD HH:mm:ss")}] ${msg}\n`;
  console.error(line);
  fs.appendFileSync(LOG_FILE, line, "utf8");
}

function limpiarXML(xmlString) {
  if (!xmlString) return "";

  // Elimina caracteres no imprimibles al inicio y fin
  xmlString = xmlString.trim();

  // Elimina BOM de UTF-8 si existe
  if (xmlString.charCodeAt(0) === 0xfeff) {
    xmlString = xmlString.slice(1);
  }

  // Opcional: eliminar otros caracteres no válidos de control
  xmlString = xmlString.replace(/^[\u0000-\u001F]+/, "");

  return xmlString;
}

// Insertar CFDI en base de datos
async function insertCFDI(
  transaction,
  cfdi,
  rfcCliente,
  movimiento,
  conceptos,
  comprobante
) {
  console.log(
    `📥 [CFDI] Procesando CFDI ${cfdi.uuid} tipo=${cfdi.tipoDeComprobante} rfc_cliente=${rfcCliente} estado=${cfdi.estatus}`
  );

  try {
    const result = await transaction
      .request()
      .input("UUID", sql.VarChar, cfdi.uuid)
      .input("Version", sql.VarChar, cfdi.version || "")
      .input("RFC_Emisor", sql.VarChar, cfdi.rfcEmisor || "")
      .input("RazonSocialEmisor", sql.VarChar, cfdi.razonSocialEmisor || "")
      .input("RFC_Receptor", sql.VarChar, cfdi.rfcReceptor || "")
      .input("RazonSocialReceptor", sql.VarChar, cfdi.nombreReceptor || "")
      .input("Fecha", sql.DateTime, cfdi.fechaEmision || null)
      .input("TipoComprobante", sql.VarChar, cfdi.tipoDeComprobante || "")
      .input("Exportacion", sql.VarChar, cfdi.exportacion || "")
      .input("Serie", sql.VarChar, cfdi.serie || "")
      .input("Folio", sql.VarChar, cfdi.folio || "")
      .input("Status", sql.VarChar, cfdi.estatus || "")
      .input("MetodoPago", sql.VarChar, cfdi.metodoPago || "")
      .input("TipoPago", sql.VarChar, cfdi.formaPago || "")
      .input("Subtotal", sql.Decimal(18, 2), cfdi.subtotal || 0)
      .input("Total", sql.Decimal(18, 2), cfdi.total || 0)
      .input("rfc_cliente", sql.VarChar, rfcCliente)
      .input("movimiento", sql.VarChar, movimiento)
      .input("regimenFiscal", sql.VarChar, cfdi.regimenFiscal || "")
      .input("lugarExpedicion", sql.VarChar, cfdi.lugarExpedicion || "")
      .input("descuento", sql.Decimal(18, 2), cfdi.descuento || 0)
      .input("usoCFDI", sql.VarChar, cfdi.usoCFDI || "")
      .input("moneda", sql.VarChar, cfdi.moneda || "")
      .input("TipoCambio", sql.Decimal(18, 6), cfdi.tipoCambio || 1)
      .input("fechaProcesada", sql.DateTime, new Date())
      .input(
        "regimenFiscalReceptor",
        sql.VarChar,
        cfdi.regimenFiscalReceptor || ""
      )
      // Impuestos
      .input("TotalRetenidoIVA", sql.Decimal(18, 2), cfdi.TotalRetenidoIVA || 0)
      .input(
        "TotalRetenidoIEPS",
        sql.Decimal(18, 2),
        cfdi.TotalRetenidoIEPS || 0
      )
      .input("TotalRetenidoISR", sql.Decimal(18, 2), cfdi.TotalRetenidoISR || 0)
      .input("TotalRetenidos", sql.Decimal(18, 2), cfdi.TotalRetenidos || 0)
      .input(
        "TotalTrasladadoIVA",
        sql.Decimal(18, 2),
        cfdi.TotalTrasladadoIVA || 0
      )
      .input(
        "TotalTrasladadoIEPS",
        sql.Decimal(18, 2),
        cfdi.TotalTrasladadoIEPS || 0
      )
      .input("TotalTrasladado", sql.Decimal(18, 2), cfdi.TotalTrasladado || 0)
      .input(
        "TotalTrasladadoIVADieciseis",
        sql.Decimal(18, 2),
        cfdi.TotalTrasladadoIVADieciseis || 0
      )
      .input(
        "TotalTrasladadoIVAExento",
        sql.Decimal(18, 2),
        cfdi.TotalTrasladadoIVAExento || 0
      )
      .input(
        "TotalTrasladadoIVACero",
        sql.Decimal(18, 2),
        cfdi.TotalTrasladadoIVACero || 0
      )
      .input(
        "TotalTrasladadoIVAOcho",
        sql.Decimal(18, 2),
        cfdi.TotalTrasladadoIVAOcho || 0
      )
      .input("fuente", sql.VarChar, cfdi.fuente || "")
      // Bases IVA
      .input("BaseIVA16", sql.Decimal(18, 2), cfdi.BaseIVA16 || 0)
      .input("BaseIVA0", sql.Decimal(18, 2), cfdi.BaseIVA0 || 0)
      .input("BaseIVA8", sql.Decimal(18, 2), cfdi.BaseIVA8 || 0)
      .input("BaseIVAExento", sql.Decimal(18, 2), cfdi.BaseIVAExento || 0)
      .query(`
        -- Verificar si existe el registro y obtener estatus actual
        DECLARE @ExisteRegistro INT = 0;
        DECLARE @EstatusActual NVARCHAR(50) = '';

        SELECT @ExisteRegistro = 1, @EstatusActual = Status
        FROM facturalo_cfdis
        WHERE UUID = @UUID AND rfc_cliente = @rfc_cliente;

        IF @ExisteRegistro = 0
        BEGIN
          -- Insertar nuevo registro si no existe
          INSERT INTO facturalo_cfdis (
            UUID, Version, RFC_Emisor, RazonSocialEmisor, RFC_Receptor, RazonSocialReceptor, Fecha, TipoComprobante, Exportacion,
            Serie, Folio, Status, MetodoPago, TipoPago, Subtotal, Total, rfc_cliente, movimiento, RegimenFiscal, LugarExpedicion, descuento, usoCFDI,
            moneda, TipoCambio, fechaProcesada, regimenFiscalReceptor,
            TotalRetenidoIVA, TotalRetenidoIEPS, TotalRetenidoISR, TotalRetenidos,
            TotalTrasladadoIVA, TotalTrasladadoIEPS, TotalTrasladado,
            TotalTrasladadoIVADieciseis, TotalTrasladadoIVAExento, TotalTrasladadoIVACero, TotalTrasladadoIVAOcho, fuente,
            BaseIVA16, BaseIVA0, BaseIVA8, BaseIVAExento
          )
          VALUES (
            @UUID, @Version, @RFC_Emisor, @RazonSocialEmisor, @RFC_Receptor, @RazonSocialReceptor, @Fecha, @TipoComprobante, @Exportacion,
            @Serie, @Folio, @Status, @MetodoPago, @TipoPago, @Subtotal, @Total, @rfc_cliente, @movimiento, @regimenFiscal, @lugarExpedicion, @descuento, @usoCFDI,
            @moneda, @TipoCambio, @fechaProcesada, @regimenFiscalReceptor,
            @TotalRetenidoIVA, @TotalRetenidoIEPS, @TotalRetenidoISR, @TotalRetenidos,
            @TotalTrasladadoIVA, @TotalTrasladadoIEPS, @TotalTrasladado,
            @TotalTrasladadoIVADieciseis, @TotalTrasladadoIVAExento, @TotalTrasladadoIVACero, @TotalTrasladadoIVAOcho, @fuente,
            @BaseIVA16, @BaseIVA0, @BaseIVA8, @BaseIVAExento
          );
          SELECT 1 as RecordAction, 'INSERTADO' as ActionDescription;
        END
        ELSE IF @EstatusActual != @Status
        BEGIN
          -- Verificar si se intenta reactivar una factura cancelada (prevenir reactivación)
          IF @EstatusActual = 'Cancelado' AND @Status = 'Vigente'
          BEGIN
            SELECT 3 as RecordAction, 'REACTIVACION_BLOQUEADA' as ActionDescription;
          END
          ELSE
          BEGIN
            -- Actualizar solo el estatus si ha cambiado (permitir solo cancelación, no reactivación)
            UPDATE facturalo_cfdis
            SET Status = @Status, fechaProcesada = @fechaProcesada
            WHERE UUID = @UUID AND rfc_cliente = @rfc_cliente;
            SELECT 2 as RecordAction, 'ESTATUS_ACTUALIZADO' as ActionDescription;
          END
        END
        ELSE
        BEGIN
          SELECT 0 as RecordAction, 'YA_EXISTE' as ActionDescription;
        END
      `);

    const recordAction = result.recordset?.[0]?.RecordAction || 0;
    const actionDescription = result.recordset?.[0]?.ActionDescription || 'DESCONOCIDO';

    if (recordAction === 1) {
      // Registro insertado - procesar conceptos
      if (Array.isArray(conceptos)) {
        await insertConceptos(
          transaction,
          conceptos,
          cfdi.uuid,
          rfcCliente,
          cfdi.fechaEmision,
          movimiento
        );
      } else if (conceptos && conceptos.$) {
        await insertConceptos(
          transaction,
          [conceptos],
          cfdi.uuid,
          rfcCliente,
          cfdi.fechaEmision,
          movimiento
        );
      }
      console.log(`✅ CFDI insertado: ${cfdi.uuid} (${cfdi.estatus})`);
    } else if (recordAction === 2) {
      console.log(`🔄 Estatus actualizado: ${cfdi.uuid} → ${cfdi.estatus}`);
    } else if (recordAction === 3) {
      // Intento de reactivación bloqueado
      throw new Error(`REACTIVACIÓN BLOQUEADA: No se permite cambiar factura cancelada a vigente (${cfdi.uuid})`);
    } else {
      // recordAction === 0, ya existe con el mismo estatus
      throw new Error(`CFDI ya existe con el mismo estatus (${cfdi.estatus})`);
    }

    // Si es comprobante tipo Pago, insertar registro en pagos y sus documentos relacionados
    if (
      (cfdi.tipoDeComprobante || "").toUpperCase() === "P" &&
      comprobante &&
      comprobante["cfdi:Complemento"]
    ) {
      const complemento = comprobante["cfdi:Complemento"] || {};
      // soportar pago20 y pago10
      const pagosNode =
        complemento["pago20:Pagos"]?.["pago20:Pago"] ||
        complemento["pago10:Pagos"]?.["pago10:Pago"] ||
        complemento["Pagos"]?.["Pago"];
      const pagosArray = Array.isArray(pagosNode)
        ? pagosNode
        : pagosNode
        ? [pagosNode]
        : [];

      // Totales
      const totalesNode =
        complemento["pago20:Pagos"]?.["pago20:Totales"] ||
        complemento["pago10:Pagos"]?.["pago10:Totales"] ||
        complemento["Pagos"]?.["Totales"] ||
        null;

      for (const p of pagosArray) {
        // Atributos comunes del pago
        const montoPago =
          parseFloat(
            p.$?.Monto ||
              p.$?.MontoTotal ||
              totalesNode?.$?.MontoTotalPagos ||
              0
          ) || 0;
        const fechaPagoRaw =
          p.$?.FechaPago || p.$?.Fecha || cfdi.fechaEmision || null;
        const fechaPago = fechaPagoRaw ? new Date(fechaPagoRaw) : null;
        const monedaPago = p.$?.MonedaP || p.$?.Moneda || cfdi.moneda || null;
        const formaPago =
          p.$?.FormaDePagoP || p.$?.FormaPago || cfdi.formaPago || null;

        const tipoCambioPago = parseFloat(p.$?.TipoCambioP || p.$?.TipoCambio || 1) || null;
        const noOperacion = p.$?.NumOperacion || p.$?.NoOperacion || null;

        // Extraer información de cuentas bancarias si existe
        const cuentaOrdenante = p.$?.CtaOrdenante || null;
        const emisorCuentaOrdenante = p.$?.RfcEmisorCtaOrd || null;
        const bancoOrdenante = (p.$?.NomBancoOrdExt || "").substring(0, 50) || null;
        const cuentaBeneficiaria = p.$?.CtaBeneficiario || null;
        const emisorCuentaBeneficiaria = p.$?.RfcEmisorCtaBen || null;

        // Totales específicos para este conjunto de pagos
        const totalTrasladosBase =
          parseFloat(
            totalesNode?.$?.TotalTrasladosBaseIVA16 ||
              totalesNode?.$?.TotalTrasladosBase ||
              0
          ) || 0;
        const totalTrasladosImpuesto =
          parseFloat(
            totalesNode?.$?.TotalTrasladosImpuestoIVA16 ||
              totalesNode?.$?.TotalTrasladosImpuesto ||
              0
          ) || 0;

        const pagoPayload = {
          uuid: cfdi.uuid,
          monto_total_pagos: montoPago,
          total_trasladados_base: totalTrasladosBase,
          total_trasladados_impuesto: totalTrasladosImpuesto,
          rfc_cliente: rfcCliente,
          fecha_pago: fechaPago,
          moneda: monedaPago,
          forma_pago: formaPago,
          tipoCambio: tipoCambioPago,
          no_operacion: noOperacion,
          emisorCuentaOrdenante: emisorCuentaOrdenante,
          bancoOrdenante: bancoOrdenante,
          cuentaOrdenante: cuentaOrdenante,
          emisorCuentaBeneficiaria: emisorCuentaBeneficiaria,
          cuentaBeneficiaria: cuentaBeneficiaria
        };

        // console.log(`[CFDI:${cfdi.uuid}] insertPago payload: ${JSON.stringify(pagoPayload)}`);

        const pagoId = await insertPago(transaction, pagoPayload);

        // Documentos relacionados dentro del pago
        const doctos =
          p["pago20:DoctoRelacionado"] ||
          p["pago10:DoctoRelacionado"] ||
          p["DoctoRelacionado"];
        const doctosArray = Array.isArray(doctos)
          ? doctos
          : doctos
          ? [doctos]
          : [];

        for (const d of doctosArray) {
          // Atributos comunes del documento relacionado
          const attrs = d.$ || {};
          const uuidDoc = attrs.IdDocumento || attrs.Id || attrs.UUID || null;
          const monedaDoc = attrs.MonedaDR || attrs.Moneda || null;
          const saldoAnterior =
            parseFloat(attrs.ImpSaldoAnt || attrs.SaldoAnterior || 0) || 0;
          const saldoPagado =
            parseFloat(attrs.ImpPagado || attrs.SaldoPagado || 0) || 0;
          const saldoInsoluto =
            parseFloat(attrs.ImpSaldoInsoluto || attrs.SaldoInsoluto || 0) || 0;

          const equivalencia = parseInt(attrs.EquivalenciaDR) || 0;
          const numParcialidad = parseInt(attrs.NumParcialidad) || 0;
          const objetoImp = attrs.ObjetoImpDR || attrs.ObjImpDR || null;

          let base = 0,
            impuesto = 0,
            tipoFactor = null,
            tasaOCuota = 0,
            importe = 0;

          try {
            const impuestosDR =
              d["pago20:ImpuestosDR"] ||
              d["pago10:ImpuestosDR"] ||
              d["ImpuestosDR"];
            const trasladosDR =
              impuestosDR?.["pago20:TrasladosDR"] ||
              impuestosDR?.["pago10:TrasladosDR"] ||
              impuestosDR?.["TrasladosDR"];
            const traslado = Array.isArray(
              trasladosDR?.["pago20:TrasladoDR"] ||
                trasladosDR?.["pago10:TrasladoDR"] ||
                trasladosDR?.["TrasladoDR"]
            )
              ? (trasladosDR["pago20:TrasladoDR"] ||
                  trasladosDR["pago10:TrasladoDR"] ||
                  trasladosDR["TrasladoDR"])[0]
              : trasladosDR?.["pago20:TrasladoDR"] ||
                trasladosDR?.["pago10:TrasladoDR"] ||
                trasladosDR?.["TrasladoDR"];
            const tattrs = traslado?.$ || {};

            base = parseFloat(tattrs.BaseDR || tattrs.Base || 0) || base;
            impuesto =
              parseFloat(tattrs.ImpuestoDR || tattrs.Impuesto || 0) || impuesto;
            tipoFactor = tattrs.TipoFactorDR || tattrs.TipoFactor || tipoFactor;
            tasaOCuota =
              parseFloat(tattrs.TasaOCuotaDR || tattrs.TasaOCuota || 0) ||
              tasaOCuota;
            importe =
              parseFloat(tattrs.ImporteDR || tattrs.Importe || 0) || importe;
          } catch (e) {}

          const docPayload = {
            uuid_doc_relacionado: uuidDoc,
            moneda_pago: monedaDoc,
            saldo_anterior: saldoAnterior,
            saldo_pagado: saldoPagado,
            saldo_insoluto: saldoInsoluto,
            base: base,
            impuesto: impuesto,
            tipo_factor: tipoFactor,
            tasa_o_cuota: tasaOCuota,
            importe: importe,
            equivalencia,
            num_parcialidad: numParcialidad,
            objeto_imp: objetoImp
          };
          // console.log(`[CFDI:${cfdi.uuid}] insertPagoDocRelacionado payload: ${JSON.stringify(docPayload)}`);
          await insertPagoDocRelacionado(transaction, pagoId, docPayload);
        }
      }
    }
  } catch (err) {
    throw new Error(`Error insertando CFDI ${cfdi.uuid}: ${err.message}`);
  }
}

// Insertar conceptos
async function insertConceptos(
  transaction,
  conceptos,
  uuid,
  rfcCliente,
  fecha,
  movimiento
) {
  //console.log(`🧾 Insertando ${conceptos.length} conceptos para CFDI ${uuid}`);
  for (const c of conceptos) {
    try {
      await transaction
        .request()
        .input("ClaveProductoServicio", sql.VarChar, c.$?.ClaveProdServ || "")
        .input("Cantidad", sql.Decimal(18, 2), c.$?.Cantidad || 0)
        .input("ClaveUnidad", sql.VarChar, c.$?.ClaveUnidad || "")
        .input("Descripcion", sql.VarChar, c.$?.Descripcion || "")
        .input("ValorUnitario", sql.Decimal(18, 2), c.$?.ValorUnitario || 0)
        .input("Importe", sql.Decimal(18, 2), c.$?.Importe || 0)
        .input("UUID", sql.VarChar, uuid)
        .input("descuento", sql.Decimal(18, 2), c.$?.Descuento || 0)
        .input("rfc_cliente", sql.VarChar, rfcCliente)
        .input("fecha", sql.DateTime, fecha)
        .input("movimiento", sql.VarChar, movimiento)
        .input("unidad", sql.VarChar, c.$?.Unidad || "").query(`
          INSERT INTO facturalo_conceptos
          (ClaveProductoServicio, Cantidad, ClaveUnidad, Descripcion, ValorUnitario, Importe, UUID, descuento, rfc_cliente, fecha, movimiento, unidad)
          VALUES
          (@ClaveProductoServicio, @Cantidad, @ClaveUnidad, @Descripcion, @ValorUnitario, @Importe, @UUID, @descuento, @rfc_cliente, @fecha, @movimiento, @unidad)
        `);
    } catch (err) {
      throw new Error(`Error insertando concepto de ${uuid}: ${err.message}`);
    }
  }
}

// =============================
// PROCESO PRINCIPAL: leer XML de un directorio e insertar en BD
// =============================

const XML_DIR = "/home/local/scripts/xmls/pending"; // Directorio compartido con XMLs

// Procesar XMLs para RFCs específicos
async function procesarXMLsRFCsEspecificos(rfcsPermitidos) {
  console.log(`🎯 Iniciando carga de CFDIs para RFCs específicos: ${rfcsPermitidos.join(', ')}`);

  // Validar que el array de RFCs no esté vacío
  if (!rfcsPermitidos || rfcsPermitidos.length === 0) {
    console.log("⚠️ No se especificaron RFCs para procesar.");
    return;
  }

  // Obtener subdirectorios (cada uno es un RFC de cliente)
  const dirents = fs.readdirSync(XML_DIR, { withFileTypes: true });
  const allFolders = dirents.filter((d) => d.isDirectory()).map((d) => d.name);

  // Filtrar solo los RFCs que están en la lista permitida
  const rfcFolders = allFolders.filter(folder => rfcsPermitidos.includes(folder.trim()));

  if (rfcFolders.length === 0) {
    console.log(`❌ No se encontraron carpetas para los RFCs especificados en: ${XML_DIR}`);
    console.log(`📁 Carpetas disponibles: ${allFolders.join(', ')}`);
    return;
  }

  console.log(`✅ Procesando ${rfcFolders.length} de ${allFolders.length} carpetas encontradas:`);
  rfcFolders.forEach(folder => console.log(`   📂 ${folder}`));

  const pool = await sql.connect(sqlConfig);
  let procesados = 0;

  for (const rfcFolder of rfcFolders) {
    console.log(`\n🔄 Procesando RFC: ${rfcFolder}`);
    const resultado = await procesarRFC(pool, rfcFolder);
    procesados += resultado;
  }

  try {
    const terminadoPath = path.join(__dirname, "terminado_rfcs_especificos.txt");
    const texto = `Terminado RFCs específicos [${rfcsPermitidos.join(', ')}], (${procesados} archivos): ${moment().format(
      "YYYY-MM-DD HH:mm:ss"
    )}\n`;
    fs.writeFileSync(terminadoPath, texto, "utf8");
  } catch (e) {
    logError(`No se pudo crear terminado_rfcs_especificos.txt: ${e.message}`);
  }

  // Cerrar pool
  try {
    await pool.close();
  } catch {}

  console.log(`\n🎉 Proceso de RFCs específicos finalizado. Total procesados: ${procesados}`);
}

// Función auxiliar para procesar un RFC específico
async function procesarRFC(pool, rfcFolder) {
  const folderPath = path.join(XML_DIR, rfcFolder);
  let procesadosRFC = 0;

  // Buscar XMLs en subdirectorios (recibidos, emitidos y cancelados)
  const allFiles = [];
  const subDirs = ['recibidos', 'emitidos', 'cancelados'];

  for (const subDir of subDirs) {
    const subDirPath = path.join(folderPath, subDir);
    if (fs.existsSync(subDirPath)) {
      const files = fs.readdirSync(subDirPath)
        .filter(f => f.toLowerCase().endsWith('.xml'))
        .map(f => ({ filePath: path.join(subDirPath, f), directory: subDir }));
      for (const f of files) allFiles.push(f);
    }
  }

  // También buscar XMLs directamente en la carpeta del RFC (por compatibilidad)
  const directFiles = fs.readdirSync(folderPath)
    .filter(f => f.toLowerCase().endsWith('.xml'))
    .map(f => ({ filePath: path.join(folderPath, f), directory: 'vigente' }));
  directFiles.forEach(f => allFiles.push(f));

  if (allFiles.length === 0) {
    console.log(`   ℹ️ Carpeta '${rfcFolder}' no contiene archivos .xml, se omite.`);
    return 0;
  }

  console.log(`   📊 Encontrados ${allFiles.length} archivos XML para procesar`);

  // RFC del cliente tomado del nombre de la carpeta
  const rfcCliente = rfcFolder.trim();

  for (const fileInfo of allFiles) {
    const filePath = fileInfo.filePath;
    const directory = fileInfo.directory;

    const resultado = await procesarArchivoXML(pool, filePath, directory, rfcCliente);
    if (resultado) procesadosRFC++;
  }

  console.log(`   ✅ RFC ${rfcFolder}: ${procesadosRFC} archivos procesados`);
  return procesadosRFC;
}

// Función auxiliar para procesar un archivo XML individual
async function procesarArchivoXML(pool, filePath, directory, rfcCliente) {
  try {
    let xmlContent = fs.readFileSync(filePath, "utf8");
    xmlContent = limpiarXML(xmlContent);
    const xmlJson = await parseStringPromise(xmlContent, {
      explicitArray: false,
    });

    const comprobante = xmlJson["cfdi:Comprobante"] || {};
    const emisor = comprobante["cfdi:Emisor"] || {};
    const receptor = comprobante["cfdi:Receptor"] || {};
    const conceptosNode =
      comprobante["cfdi:Conceptos"]?.["cfdi:Concepto"] || [];
    const conceptos = Array.isArray(conceptosNode)
      ? conceptosNode
      : conceptosNode
      ? [conceptosNode]
      : [];
    const impuestos = comprobante["cfdi:Impuestos"] || {};
    const retenciones = impuestos["cfdi:Retenciones"]?.["cfdi:Retencion"];
    const traslados = impuestos["cfdi:Traslados"]?.["cfdi:Traslado"];

    // UUID desde TimbreFiscalDigital
    const timbre =
      comprobante["cfdi:Complemento"]?.["tfd:TimbreFiscalDigital"] || {};
    const uuid = (
      timbre.$?.UUID ||
      timbre.$?.Uuid ||
      timbre.$?.uuid ||
      ""
    ).trim();
    if (!uuid) {
      throw new Error("XML sin UUID (TimbreFiscalDigital)");
    }

    // Cálculo de impuestos (mismo código que la función original)
    let TotalRetenidoIVA = 0,
      TotalRetenidoIEPS = 0,
      TotalRetenidoISR = 0,
      TotalRetenidos = 0;
    let TotalTrasladadoIVA = 0,
      TotalTrasladadoIEPS = 0,
      TotalTrasladado = 0;
    let TotalTrasladadoIVADieciseis = 0,
      TotalTrasladadoIVAExento = 0,
      TotalTrasladadoIVACero = 0,
      TotalTrasladadoIVAOcho = 0;

    let BaseIVA16 = 0, BaseIVA0 = 0, BaseIVA8 = 0, BaseIVAExento = 0;

    if (retenciones) {
      const retArray = Array.isArray(retenciones)
        ? retenciones
        : [retenciones];
      for (const ret of retArray) {
        const impuesto = parseInt(ret.$?.Impuesto);
        const importe = parseFloat(ret.$?.Importe || 0) || 0;
        if (impuesto === 2) TotalRetenidoIVA += importe;
        if (impuesto === 3) TotalRetenidoIEPS += importe;
        if (impuesto === 1) TotalRetenidoISR += importe;
        TotalRetenidos += importe;
      }
    }

    if (traslados) {
      const trasArray = Array.isArray(traslados) ? traslados : [traslados];
      for (const tras of trasArray) {
        const impuesto = parseInt(tras.$?.Impuesto);
        const tasa = parseFloat(tras.$?.TasaOCuota || 0);
        const importe = parseFloat(tras.$?.Importe || 0) || 0;
        const base = parseFloat(tras.$?.Base || 0) || 0;
        if (impuesto === 2) {
          TotalTrasladadoIVA += importe;
          if (tasa === 0.16){
            TotalTrasladadoIVADieciseis += importe;
            BaseIVA16 += base;
          }
          if (tasa === 0){
            TotalTrasladadoIVACero += importe;
            BaseIVA0 += base;
          }
          if (tasa === 0.08){
            TotalTrasladadoIVAOcho += importe;
            BaseIVA8 += base;
          }
          if ((tras.$?.TipoFactor) === "Exento"){
            TotalTrasladadoIVAExento += importe;
            BaseIVAExento += base;
          }
        }
        if (impuesto === 3) TotalTrasladadoIEPS += importe;
        TotalTrasladado += importe;
      }
    }

    // Fecha (YYYY-MM-DD)
    let fechaEmision = comprobante.$?.Fecha || comprobante.$?.fecha || "";
    if (fechaEmision && fechaEmision.includes("T"))
      fechaEmision = fechaEmision.split("T")[0];
    else if (fechaEmision && fechaEmision.length >= 10)
      fechaEmision = fechaEmision.substring(0, 10);

    const cfdiData = {
      uuid,
      version: comprobante.$?.Version || comprobante.$?.version || "",
      rfcEmisor: emisor.$?.Rfc || emisor.$?.RFC || "",
      razonSocialEmisor: emisor.$?.Nombre || "",
      rfcReceptor: receptor.$?.Rfc || receptor.$?.RFC || "",
      nombreReceptor: receptor.$?.Nombre || "",
      fechaEmision,
      tipoDeComprobante:
        comprobante.$?.TipoDeComprobante || comprobante.$?.Tipo || "",
      serie: comprobante.$?.Serie || "",
      folio: comprobante.$?.Folio || "",
      estatus: directory === 'cancelados' ? 'Cancelado' : 'Vigente',
      metodoPago: comprobante.$?.MetodoPago || "",
      formaPago: comprobante.$?.FormaPago || "",
      regimenFiscal: emisor.$?.RegimenFiscal || "",
      lugarExpedicion: comprobante.$?.LugarExpedicion || "",
      subtotal: comprobante.$?.SubTotal || 0,
      descuento: comprobante.$?.Descuento || 0,
      total: comprobante.$?.Total || 0,
      TotalRetenidoIVA,
      TotalRetenidoIEPS,
      TotalRetenidoISR,
      TotalRetenidos,
      TotalTrasladadoIVA,
      TotalTrasladadoIEPS,
      TotalTrasladado,
      TotalTrasladadoIVADieciseis,
      TotalTrasladadoIVAExento,
      TotalTrasladadoIVACero,
      TotalTrasladadoIVAOcho,
      usoCFDI: receptor.$?.UsoCFDI || "",
      moneda: comprobante.$?.Moneda || "",
      tipoCambio: comprobante.$?.TipoCambio || comprobante.$?.TipoCambio || "",
      regimenFiscalReceptor: receptor.$?.RegimenFiscalReceptor || "",
      fuente: "scraper",
      BaseIVA16,
      BaseIVA0,
      BaseIVA8,
      BaseIVAExento
    };

    // Determinar movimiento (mismo código que la función original)
    let movimiento;
    if (
      cfdiData.rfcReceptor === rfcCliente &&
      cfdiData.tipoDeComprobante === "I"
    ) {
      movimiento = "Egreso";
    } else if (
      cfdiData.rfcEmisor === rfcCliente &&
      cfdiData.tipoDeComprobante === "N"
    ) {
      movimiento = "Egreso";
    } else if (
      cfdiData.rfcReceptor === rfcCliente &&
      cfdiData.tipoDeComprobante === "N"
    ) {
      movimiento = "Ingreso";
    } else if (
      cfdiData.rfcEmisor === rfcCliente &&
      cfdiData.tipoDeComprobante != "N"
    ) {
      movimiento = "Ingreso";
    } else if (
      cfdiData.rfcReceptor === rfcCliente &&
      cfdiData.tipoDeComprobante === "P"
    ) {
      movimiento = "Egreso";
    } else if (
      cfdiData.rfcReceptor === rfcCliente &&
      cfdiData.tipoDeComprobante === "E"
    ) {
      movimiento = "Egreso";
    } else if (cfdiData.tipoDeComprobante === "I") {
      movimiento = "Ingreso";
    } else {
      movimiento = "Ingreso"; // fallback
    }

    // Transacción por CFDI
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      await insertCFDI(
        transaction,
        cfdiData,
        rfcCliente,
        movimiento,
        conceptos,
        comprobante
      );
      await transaction.commit();

      // Mover XML a carpeta processed
      try {
        const processedPath = moveToProcessed(filePath, rfcCliente);
        console.log(`     📦 XML movido a: ${processedPath}`);
      } catch (moveErr) {
        logError(`Error moviendo XML ${filePath}: ${moveErr.message}`);
      }
      return true; // Procesado exitosamente
    } catch (err) {
      await transaction.rollback();

      // Manejar diferentes tipos de errores (mismo código que la función original)
      if (String(err.message || "").includes("CFDI ya existe con el mismo estatus")) {
        console.log(`     📋 CFDI ${uuid} ya existe con el mismo estatus - moviendo a processed`);
        try {
          const processedPath = moveToProcessed(filePath, rfcCliente);
          console.log(`     📦 XML duplicado movido a: ${processedPath}`);
        } catch (moveErr) {
          logError(`Error moviendo XML duplicado ${filePath}: ${moveErr.message}`);
        }
      } else if (String(err.message || "").includes("REACTIVACIÓN BLOQUEADA")) {
        console.log(`     🚫 ${err.message} - moviendo XML a processed sin procesar`);
        try {
          const processedPath = moveToProcessed(filePath, rfcCliente);
          console.log(`     📦 XML de reactivación bloqueada movido a: ${processedPath}`);
        } catch (moveErr) {
          logError(`Error moviendo XML de reactivación ${filePath}: ${moveErr.message}`);
        }
        logError(`REACTIVACIÓN BLOQUEADA: ${path.basename(filePath)} (UUID ${uuid}) - Intento de cambiar factura cancelada a vigente`);
      } else {
        logError(
          `Error insertando CFDI de archivo ${path.basename(filePath)} (UUID ${uuid}): ${err.message}`
        );
      }
      return false; // No procesado exitosamente
    }
  } catch (err) {
    logError(
      `Error procesando archivo ${path.basename(filePath)}: ${err.message}`
    );
    return false;
  }
}

async function procesarXMLs() {
  console.log("Iniciando carga de CFDIs desde archivos XML locales...");

  // Obtener subdirectorios (cada uno es un RFC de cliente)
  const dirents = fs.readdirSync(XML_DIR, { withFileTypes: true });
  const rfcFolders = dirents.filter((d) => d.isDirectory()).map((d) => d.name);

  if (rfcFolders.length === 0) {
    console.log(
      "ℹ️ No se encontraron subcarpetas dentro de 'xmls'. Cada subcarpeta debe ser un RFC y contener archivos .xml."
    );
    return;
  }

  const pool = await sql.connect(sqlConfig);
  let procesados = 0;

  for (const rfcFolder of rfcFolders) {
    const folderPath = path.join(XML_DIR, rfcFolder);

    // Buscar XMLs en subdirectorios (recibidos, emitidos y cancelados)
    const allFiles = [];
    const subDirs = ['recibidos', 'emitidos', 'cancelados'];

    for (const subDir of subDirs) {
      const subDirPath = path.join(folderPath, subDir);
      if (fs.existsSync(subDirPath)) {
        const files = fs.readdirSync(subDirPath)
          .filter(f => f.toLowerCase().endsWith('.xml'))
          .map(f => ({ filePath: path.join(subDirPath, f), directory: subDir }));
        for (const f of files) allFiles.push(f);
      }
    }

    // También buscar XMLs directamente en la carpeta del RFC (por compatibilidad)
    const directFiles = fs.readdirSync(folderPath)
      .filter(f => f.toLowerCase().endsWith('.xml'))
      .map(f => ({ filePath: path.join(folderPath, f), directory: 'vigente' })); // default vigente
    directFiles.forEach(f => allFiles.push(f));

    if (allFiles.length === 0) {
      console.log(
        `ℹ️ Carpeta '${rfcFolder}' no contiene archivos .xml, se omite.`
      );
      continue;
    }

    // RFC del cliente tomado del nombre de la carpeta
    const rfcCliente = rfcFolder.trim();

    for (const fileInfo of allFiles) {
      const filePath = fileInfo.filePath;
      const directory = fileInfo.directory;

      try {
        let xmlContent = fs.readFileSync(filePath, "utf8");
        xmlContent = limpiarXML(xmlContent);
        const xmlJson = await parseStringPromise(xmlContent, {
          explicitArray: false,
        });

        const comprobante = xmlJson["cfdi:Comprobante"] || {};
        const emisor = comprobante["cfdi:Emisor"] || {};
        const receptor = comprobante["cfdi:Receptor"] || {};
        const conceptosNode =
          comprobante["cfdi:Conceptos"]?.["cfdi:Concepto"] || [];
        const conceptos = Array.isArray(conceptosNode)
          ? conceptosNode
          : conceptosNode
          ? [conceptosNode]
          : [];
        const impuestos = comprobante["cfdi:Impuestos"] || {};
        const retenciones = impuestos["cfdi:Retenciones"]?.["cfdi:Retencion"];
        const traslados = impuestos["cfdi:Traslados"]?.["cfdi:Traslado"];

        // UUID desde TimbreFiscalDigital
        const timbre =
          comprobante["cfdi:Complemento"]?.["tfd:TimbreFiscalDigital"] || {};
        const uuid = (
          timbre.$?.UUID ||
          timbre.$?.Uuid ||
          timbre.$?.uuid ||
          ""
        ).trim();
        if (!uuid) {
          throw new Error("XML sin UUID (TimbreFiscalDigital)");
        }

        // Cálculo de impuestos
        let TotalRetenidoIVA = 0,
          TotalRetenidoIEPS = 0,
          TotalRetenidoISR = 0,
          TotalRetenidos = 0;
        let TotalTrasladadoIVA = 0,
          TotalTrasladadoIEPS = 0,
          TotalTrasladado = 0;
        let TotalTrasladadoIVADieciseis = 0,
          TotalTrasladadoIVAExento = 0,
          TotalTrasladadoIVACero = 0,
          TotalTrasladadoIVAOcho = 0;

        let BaseIVA16 = 0, BaseIVA0 = 0, BaseIVA8 = 0, BaseIVAExento = 0;

        if (retenciones) {
          const retArray = Array.isArray(retenciones)
            ? retenciones
            : [retenciones];
          for (const ret of retArray) {
            const impuesto = parseInt(ret.$?.Impuesto);
            const importe = parseFloat(ret.$?.Importe || 0) || 0;
            if (impuesto === 2) TotalRetenidoIVA += importe;
            if (impuesto === 3) TotalRetenidoIEPS += importe;
            if (impuesto === 1) TotalRetenidoISR += importe;
            TotalRetenidos += importe;
          }
        }

        if (traslados) {
          const trasArray = Array.isArray(traslados) ? traslados : [traslados];
          for (const tras of trasArray) {
            const impuesto = parseInt(tras.$?.Impuesto);
            const tasa = parseFloat(tras.$?.TasaOCuota || 0);
            const importe = parseFloat(tras.$?.Importe || 0) || 0;
            const base = parseFloat(tras.$?.Base || 0) || 0;
            if (impuesto === 2) {
              TotalTrasladadoIVA += importe;
              if (tasa === 0.16){
                TotalTrasladadoIVADieciseis += importe;
                BaseIVA16 += base;
              }
              if (tasa === 0){
                TotalTrasladadoIVACero += importe;
                BaseIVA0 += base;
              }
              if (tasa === 0.08){
                TotalTrasladadoIVAOcho += importe;
                BaseIVA8 += base;
              }
              if ((tras.$?.TipoFactor) === "Exento"){
                TotalTrasladadoIVAExento += importe;
                BaseIVAExento += base;
              }
            }
            if (impuesto === 3) TotalTrasladadoIEPS += importe;
            TotalTrasladado += importe;
          }
        }

        // Fecha (YYYY-MM-DD)
        let fechaEmision = comprobante.$?.Fecha || comprobante.$?.fecha || "";
        if (fechaEmision && fechaEmision.includes("T"))
          fechaEmision = fechaEmision.split("T")[0];
        else if (fechaEmision && fechaEmision.length >= 10)
          fechaEmision = fechaEmision.substring(0, 10);

        const cfdiData = {
          uuid,
          version: comprobante.$?.Version || comprobante.$?.version || "",
          rfcEmisor: emisor.$?.Rfc || emisor.$?.RFC || "",
          razonSocialEmisor: emisor.$?.Nombre || "",
          rfcReceptor: receptor.$?.Rfc || receptor.$?.RFC || "",
          nombreReceptor: receptor.$?.Nombre || "",
          fechaEmision,
          tipoDeComprobante:
            comprobante.$?.TipoDeComprobante || comprobante.$?.Tipo || "",
          serie: comprobante.$?.Serie || "",
          folio: comprobante.$?.Folio || "",
          estatus: directory === 'cancelados' ? 'Cancelado' : 'Vigente', // determinado por directorio
          metodoPago: comprobante.$?.MetodoPago || "",
          formaPago: comprobante.$?.FormaPago || "",
          regimenFiscal: emisor.$?.RegimenFiscal || "",
          lugarExpedicion: comprobante.$?.LugarExpedicion || "",
          subtotal: comprobante.$?.SubTotal || 0,
          descuento: comprobante.$?.Descuento || 0,
          total: comprobante.$?.Total || 0,
          TotalRetenidoIVA,
          TotalRetenidoIEPS,
          TotalRetenidoISR,
          TotalRetenidos,
          TotalTrasladadoIVA,
          TotalTrasladadoIEPS,
          TotalTrasladado,
          TotalTrasladadoIVADieciseis,
          TotalTrasladadoIVAExento,
          TotalTrasladadoIVACero,
          TotalTrasladadoIVAOcho,
          usoCFDI: receptor.$?.UsoCFDI || "",
          moneda: comprobante.$?.Moneda || "",
          tipoCambio: comprobante.$?.TipoCambio || comprobante.$?.TipoCambio || "",
          regimenFiscalReceptor: receptor.$?.RegimenFiscalReceptor || "",
          fuente: "scraper",
          BaseIVA16,
          BaseIVA0,
          BaseIVA8,
          BaseIVAExento
        };

        // Movimiento
        let movimiento;
        if (
          cfdiData.rfcReceptor === rfcCliente &&
          cfdiData.tipoDeComprobante === "I"
        ) {
          movimiento = "Egreso";
        } else if (
          cfdiData.rfcEmisor === rfcCliente &&
          cfdiData.tipoDeComprobante === "N"
        ) {
          movimiento = "Egreso";
        } else if (
          cfdiData.rfcReceptor === rfcCliente &&
          cfdiData.tipoDeComprobante === "N"
        ) {
          movimiento = "Ingreso";
        } else if (
          cfdiData.rfcEmisor === rfcCliente &&
          cfdiData.tipoDeComprobante != "N"
        ) {
          movimiento = "Ingreso";
        } else if (
          cfdiData.rfcReceptor === rfcCliente &&
          cfdiData.tipoDeComprobante === "P"
        ) {
          movimiento = "Egreso";
        } else if (
          cfdiData.rfcReceptor === rfcCliente &&
          cfdiData.tipoDeComprobante === "E"
        ) {
          movimiento = "Egreso";
        } else if (cfdiData.tipoDeComprobante === "I") {
          movimiento = "Ingreso";
        } else {
          movimiento = "Ingreso"; // fallback
        }

        // Transacción por CFDI
        const transaction = pool.transaction();
        await transaction.begin();
        try {
          await insertCFDI(
            transaction,
            cfdiData,
            rfcCliente,
            movimiento,
            conceptos,
            comprobante
          );
          await transaction.commit();
          procesados += 1;

          // Mover XML a carpeta processed
          try {
            const processedPath = moveToProcessed(filePath, rfcCliente);
            console.log(`📦 XML movido a: ${processedPath}`);
          } catch (moveErr) {
            logError(`Error moviendo XML ${filePath}: ${moveErr.message}`);
          }
        } catch (err) {
          await transaction.rollback();

          // Manejar diferentes tipos de errores
          if (String(err.message || "").includes("CFDI ya existe con el mismo estatus")) {
            console.log(`📋 CFDI ${uuid} ya existe con el mismo estatus - moviendo a processed`);
            try {
              const processedPath = moveToProcessed(filePath, rfcCliente);
              console.log(`📦 XML duplicado movido a: ${processedPath}`);
            } catch (moveErr) {
              logError(`Error moviendo XML duplicado ${filePath}: ${moveErr.message}`);
            }
          } else if (String(err.message || "").includes("REACTIVACIÓN BLOQUEADA")) {
            console.log(`🚫 ${err.message} - moviendo XML a processed sin procesar`);
            try {
              const processedPath = moveToProcessed(filePath, rfcCliente);
              console.log(`📦 XML de reactivación bloqueada movido a: ${processedPath}`);
            } catch (moveErr) {
              logError(`Error moviendo XML de reactivación ${filePath}: ${moveErr.message}`);
            }
            logError(`REACTIVACIÓN BLOQUEADA: ${path.basename(filePath)} (UUID ${uuid}) - Intento de cambiar factura cancelada a vigente`);
          } else {
            logError(
              `Error insertando CFDI de archivo ${path.basename(filePath)} (UUID ${uuid}): ${err.message}`
            );
          }
        }
      } catch (err) {
        logError(
          `Error procesando archivo ${path.basename(filePath)}: ${err.message}`
        );
      }
    }
  }

  try {
    const terminadoPath = path.join(__dirname, "terminado.txt");
    const texto = `Terminado, (${procesados} archivos): ${moment().format(
      "YYYY-MM-DD HH:mm:ss"
    )}\n`;
    fs.writeFileSync(terminadoPath, texto, "utf8");
  } catch (e) {
    logError(`No se pudo crear terminado.txt: ${e.message}`);
  }

  // Cerrar pool
  try {
    await pool.close();
  } catch {}

  console.log(`✅ Proceso finalizado. Insertados: ${procesados}`);
}

// =============================
// FUNCIONES NUEVAS: Pagos
// =============================

async function insertPago(transaction, pago) {
  const req = transaction
    .request()
    .input("UUID", sql.VarChar, pago.uuid)
    .input("monto_total_pagos", sql.Decimal(18, 2), pago.monto_total_pagos || 0)
    .input(
      "total_trasladados_base",
      sql.Decimal(18, 2),
      pago.total_trasladados_base || 0
    )
    .input(
      "total_trasladados_impuesto",
      sql.Decimal(18, 2),
      pago.total_trasladados_impuesto || 0
    )
    .input("rfc_cliente", sql.VarChar, pago.rfc_cliente)
    .input("fecha_pago", sql.DateTime, pago.fecha_pago || null)
    .input("moneda", sql.VarChar, pago.moneda || null)
    .input("forma_pago", sql.VarChar, pago.forma_pago || null)
    .input("tipoCambio", sql.Decimal(18,6), pago.tipoCambio || null)
    .input("no_operacion", sql.VarChar, pago.no_operacion || null)
    .input("emisorCuentaOrdenante", sql.VarChar, pago.emisorCuentaOrdenante || null)
    .input("bancoOrdenante", sql.VarChar, pago.bancoOrdenante || null)
    .input("cuentaOrdenante", sql.VarChar, pago.cuentaOrdenante || null)
    .input("emisorCuentaBeneficiaria", sql.VarChar, pago.emisorCuentaBeneficiaria || null)
    .input("cuentaBeneficiaria", sql.VarChar, pago.cuentaBeneficiaria || null);

   const res = await req.query(`
    INSERT INTO facturalo_pagos (
      UUID, monto_total_pagos, total_trasladados_base, total_trasladados_impuesto, rfc_cliente,
      fecha_pago, moneda, forma_pago, tipoCambio, no_operacion, emisorCuentaOrdenante,
      bancoOrdenante, cuentaOrdenante, emisorCuentaBeneficiaria, cuentaBeneficiaria
    )
    OUTPUT INSERTED.Id
    VALUES (
      @UUID, @monto_total_pagos, @total_trasladados_base, @total_trasladados_impuesto, @rfc_cliente,
      @fecha_pago, @moneda, @forma_pago, @tipoCambio, @no_operacion, @emisorCuentaOrdenante,
      @bancoOrdenante, @cuentaOrdenante, @emisorCuentaBeneficiaria, @cuentaBeneficiaria
    )
  `);
  return res.recordset?.[0]?.Id;
}

async function insertPagoDocRelacionado(transaction, pagoId, doc) {
  await transaction
    .request()
    .input("pago_id", sql.Int, pagoId)
    .input(
      "uuid_doc_relacionado",
      sql.VarChar,
      doc.uuid_doc_relacionado || null
    )
    .input("moneda_pago", sql.VarChar, doc.moneda_pago || null)
    .input("saldo_anterior", sql.Decimal(18, 2), doc.saldo_anterior || 0)
    .input("saldo_pagado", sql.Decimal(18, 2), doc.saldo_pagado || 0)
    .input("saldo_insoluto", sql.Decimal(18, 2), doc.saldo_insoluto || 0)
    .input("base", sql.Decimal(18, 2), doc.base || 0)
    .input("impuesto", sql.Decimal(18, 2), doc.impuesto || 0)
    .input("tipo_factor", sql.VarChar, doc.tipo_factor || null)
    .input("tasa_o_cuota", sql.Decimal(18, 6), doc.tasa_o_cuota || 0)
    .input("equivalencia", sql.Int, doc.equivalencia || 0)
    .input("num_parcialidad", sql.Int, doc.num_parcialidad || 0)
    .input("objetoImpuesto", sql.Int, doc.objeto_imp || null)
    .input("importe", sql.Decimal(18, 2), doc.importe || 0)

    .query(`
      INSERT INTO facturalo_pago_doc_relacionado
      (pago_id, uuid_doc_relacionado, moneda_pago, saldo_anterior, saldo_pagado, saldo_insoluto, base, impuesto, tipo_factor, tasa_o_cuota, importe, equivalencia, numParcialidad, objetoImpuesto)
      VALUES
      (@pago_id, @uuid_doc_relacionado, @moneda_pago, @saldo_anterior, @saldo_pagado, @saldo_insoluto, @base, @impuesto, @tipo_factor, @tasa_o_cuota, @importe, @equivalencia, @num_parcialidad, @objetoImpuesto)
    `);
}

// =============================
// CRON: Ejecutar todos los días a la 1:00 AMe
// =============================
// cron.schedule("0 1 * * *", () => {
//   procesarXMLs();
//   console.log("⏰ Tarea programada ejecutada:", moment().format("YYYY-MM-DD HH:mm:ss"));
// });


// Ejemplo 1: Procesar todos los RFCs (comportamiento original)
procesarXMLs();

// Ejemplo 2: Procesar solo RFCs específicos
// const rfcsEspecificos = [
//     // 'BOBO9208158H3',
//     // 'AELB5401024Q7',
//     // 'CAM170515GT5',
//     // 'MERM880329JF7'
//     //'AARL6404133R8'
//     //'PAFA820205GRA',
//     //'ROSV9005197E3'
//     //'AOCH620220N76'
//     // 'PSU240701S52',
//     // 'LTN170908L27'
//     //'ECS961105MD6'
//     // 'AELZ620120TZ7'
//     'AAR170413DU1'
// ];

// Ejecutar procesamiento para RFCs específicos
// procesarXMLsRFCsEspecificos(rfcsEspecificos);