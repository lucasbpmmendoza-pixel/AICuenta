import { X509Certificate } from "node:crypto";

// RFC persona moral (12) o fisica (13): 3-4 letras + 6 digitos + 3 alfanumericos.
const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

/**
 * Extrae el RFC del certificado .cer de la e.firma (X.509 DER o PEM).
 *
 * En los certificados del SAT el RFC vive en el subject, en el campo
 * x500UniqueIdentifier (OID 2.5.4.45) con el formato "RFC / CURP". Recorremos
 * los tokens del subject y devolvemos el primero que cumpla el patron de RFC
 * (el CURP tiene 18 caracteres y no matchea). El .key (llave privada) NO
 * contiene el RFC, por eso solo sirve el .cer.
 *
 * Devuelve el RFC en mayusculas, o null si no se pudo determinar.
 */
export function extractRfcFromCer(der: Buffer | Uint8Array): string | null {
  try {
    const cert = new X509Certificate(Buffer.from(der));
    const subject = cert.subject ?? ""; // "key=value" por linea

    for (const line of subject.split(/\r?\n/)) {
      const value = line.includes("=") ? line.slice(line.indexOf("=") + 1) : line;
      for (const token of value.split(/[\s/,;]+/)) {
        const candidate = token.trim().toUpperCase();
        if (RFC_RE.test(candidate)) return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}
