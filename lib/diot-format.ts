/**
 * Formato DIOT (declaracion informativa de operaciones con terceros).
 *
 * Este modulo es la UNICA fuente de verdad del layout del TXT: lo usan tanto
 * el endpoint /api/export/diot (servidor) como el modal de edicion (cliente),
 * para que el archivo que se descarga desde el cuadro editado sea byte a byte
 * el mismo que generaria el servidor.
 *
 * El "cuadro" (lo que el contador ve como Excel) tiene 7 columnas con decimales.
 * El TXT es el mismo renglon pero con los importes redondeados a entero y
 * colocados en posiciones fijas separadas por "|".
 */

/** Un renglon del cuadro tal como se edita en pantalla (importes con decimales). */
export interface DiotCuadroRow {
  rfc: string;
  base8: number;
  iva8: number;
  base16: number;
  iva16: number;
  base0: number;
  baseExento: number;
}

/** El mismo renglon ya normalizado para el TXT (enteros + tipo de tercero). */
export interface DiotLineInput {
  rfc: string;
  tipoTercero: string;
  base8: number;
  iva8: number;
  base16: number;
  iva16: number;
  base0: number;
  baseExento: number;
}

/** Encabezados del cuadro, en el mismo orden que el Excel del contador. */
export const DIOT_COLUMNAS = [
  { key: "rfc", label: "RFC Proveedor" },
  { key: "base8", label: "Base IVA 8" },
  { key: "iva8", label: "IVA 8" },
  { key: "base16", label: "Base IVA 16" },
  { key: "iva16", label: "IVA 16" },
  { key: "base0", label: "Base IVA 0" },
  { key: "baseExento", label: "Base IVA Exento" },
] as const;

export type DiotCampoImporte = "base8" | "iva8" | "base16" | "iva16" | "base0" | "baseExento";

export function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function toSatInt(v: number): number {
  return Math.max(0, Math.round(n(v)));
}

export function tipoTerceroByRfc(rfc: string): string {
  if (rfc === "XEXX010101000") return "05";
  if (rfc === "XAXX010101000") return "15";
  return "04";
}

export function clampIva(base: number, iva: number, tasa: number): number {
  const maxCalc = Math.round(base * tasa);
  if (maxCalc < iva) return Math.max(0, iva - 1);
  return iva;
}

/** Convierte un renglon del cuadro (decimales) al renglon del TXT (enteros). */
export function toDiotLineInput(row: DiotCuadroRow): DiotLineInput {
  const rfc = (row.rfc ?? "").trim().toUpperCase();
  const base8 = toSatInt(row.base8);
  const base16 = toSatInt(row.base16);
  return {
    rfc,
    tipoTercero: tipoTerceroByRfc(rfc),
    base8,
    iva8: clampIva(base8, toSatInt(row.iva8), 0.08),
    base16,
    iva16: clampIva(base16, toSatInt(row.iva16), 0.16),
    base0: toSatInt(row.base0),
    baseExento: toSatInt(row.baseExento),
  };
}

/** Un renglon en ceros no se escribe en el TXT. */
export function generaLinea(line: DiotLineInput): boolean {
  return (
    line.rfc.length > 0 &&
    (line.iva8 > 0 ||
      line.iva16 > 0 ||
      line.baseExento > 0 ||
      line.base0 > 0 ||
      line.base8 > 0 ||
      line.base16 > 0)
  );
}

export function buildDiotLine(line: DiotLineInput): string {
  return `${line.tipoTercero}|85|${line.rfc}|||||${line.base8 > 0 ? line.base8 : ""}||||${line.base16 > 0 ? line.base16 : ""}||||||${line.iva8 > 0 ? line.iva8 : ""}||||${line.iva16 > 0 ? line.iva16 : ""}||||||||||||||||||||||||||||${line.baseExento > 0 ? line.baseExento : ""}|${line.base0 > 0 ? line.base0 : ""}|||01`;
}

/** Cuadro completo -> contenido del archivo .txt. */
export function buildDiotTxt(rows: DiotCuadroRow[]): string {
  const lines = rows.map(toDiotLineInput).filter(generaLinea).map(buildDiotLine);
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}
