// Componentes de tabla de la vista de Facturas, extraídos para poder reutilizarlos
// idénticos en la herramienta demo "Crea tus cuadros" (con datos derivados de los
// XML que sube el usuario). Son la MISMA presentación que usa la app.
import type { ReactNode } from 'react'
import type { IngresoCFDI, EgresoCFDI, NominaCFDI, RetencionCFDI, PagoRow, NotaCreditoRow, flujoRow } from '@/lib/facturas-query'
import { rfcDisplay } from '@/lib/rfc-aliases'

const MXN = (v: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)

const fmt = (d: Date | string | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const uuid4 = (u: string) => `${u.slice(0,8)}…`

const badge = (s: string) =>
  s === 'Vigente'
    ? 'inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-300'
    : 'inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400'

const TH = ({ children }: { children: ReactNode }) => (
  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/60 border-b border-slate-200 dark:border-zinc-700 first:pl-5 last:pr-5">
    {children}
  </th>
)
const TD = ({ children, right }: { children: ReactNode; right?: boolean }) => (
  <td className={`px-4 py-2.5 text-sm text-slate-700 dark:text-zinc-200 border-b border-slate-100 dark:border-zinc-800 first:pl-5 last:pr-5 ${right ? 'text-right tabular-nums' : ''}`}>
    {children}
  </td>
)

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-zinc-500">
        Sin registros para este período
      </td>
    </tr>
  )
}

const PREVIEW_LIMIT = 10
function LimitNote({ count, cols }: { count: number; cols: number }) {
  if (count <= PREVIEW_LIMIT) return null
  return (
    <tfoot>
      <tr>
        <td colSpan={cols} className="px-5 py-3 text-center text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-900/30">
          Vista previa limitada a {PREVIEW_LIMIT} registros
        </td>
      </tr>
    </tfoot>
  )
}

export function TablaIngresos({ rows }: { rows: IngresoCFDI[] }) {
  return (
    <table className="w-full min-w-[840px]">
      <thead>
        <tr>
          <TH>UUID</TH><TH>Fecha</TH><TH>RFC Receptor</TH><TH>Razón Social</TH>
          <TH>Folio</TH><TH>Status</TH><TH>Moneda</TH><TH>Total</TH><TH>Total MXN</TH><TH>IVA Trasl.</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={10} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
          <tr key={`${r.UUID}_${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
            <TD><span className="font-mono text-xs text-slate-400 dark:text-zinc-500">{uuid4(r.UUID)}</span></TD>
            <TD>{fmt(r.Fecha)}</TD>
            <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_Receptor)}</span></TD>
            <TD><span className="max-w-[200px] truncate block">{r.RazonSocialReceptor || rfcDisplay(r.RFC_Receptor)}</span></TD>
            <TD>{r.Serie}{r.Folio ? `-${r.Folio}` : ''}</TD>
            <TD><span className={badge(r.Status)}>{r.Status}</span></TD>
            <TD><span className="font-mono text-xs">{r.Moneda}</span></TD>
            <TD right>{MXN(Number(r.Total) || 0)}</TD>
            <TD right><span className="font-semibold">{MXN(Number(r.Total_MXN) || 0)}</span></TD>
            <TD right>{MXN(Number(r.TotalTrasladado) || 0)}</TD>
          </tr>
        ))}
      </tbody>
      <LimitNote count={rows.length} cols={10} />
    </table>
  )
}

export function TablaEgresos({ rows }: { rows: EgresoCFDI[] }) {
  return (
    <table className="w-full min-w-[660px]">
      <thead>
        <tr>
          <TH>RFC Emisor</TH><TH>Razón Social</TH><TH>Facturas</TH>
          <TH>Vigentes</TH><TH>Canceladas</TH><TH>Total MXN</TH><TH>IVA Acred.</TH><TH>IVA Ret.</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={8} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
          <tr key={`${r.RFC_Emisor}_${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
            <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_Emisor)}</span></TD>
            <TD><span className="max-w-[220px] truncate block">{r.RazonSocialEmisor}</span></TD>
            <TD right>{r.NumFacturas}</TD>
            <TD right><span className="text-green-700 dark:text-green-300">{r.Vigentes}</span></TD>
            <TD right><span className="text-red-600 dark:text-red-400">{r.Canceladas}</span></TD>
            <TD right><span className="font-semibold">{MXN(Number(r.Total_MXN) || 0)}</span></TD>
            <TD right>{MXN(Number(r.IVA_MXN) || 0)}</TD>
            <TD right>{MXN(Number(r.IVA_Retenido_MXN) || 0)}</TD>
          </tr>
        ))}
      </tbody>
      <LimitNote count={rows.length} cols={8} />
    </table>
  )
}

export function TablaNomina({ rows }: { rows: NominaCFDI[] }) {
  return (
    <table className="w-full min-w-[860px]">
      <thead>
        <tr>
          <TH>UUID</TH><TH>Tipo</TH><TH>Fecha</TH><TH>RFC Emisor</TH><TH>Razón Social Emisor</TH>
          <TH>RFC Receptor</TH><TH>Status</TH><TH>Total MXN</TH><TH>ISR Retenido</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={9} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
          <tr key={`${r.UUID}_${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
            <TD><span className="font-mono text-xs text-slate-400 dark:text-zinc-500">{uuid4(r.UUID)}</span></TD>
            <TD>
              <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                {r.TipoNomina}
              </span>
            </TD>
            <TD>{fmt(r.Fecha)}</TD>
            <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_Emisor)}</span></TD>
            <TD><span className="max-w-[180px] truncate block">{r.RazonSocialEmisor || rfcDisplay(r.RFC_Emisor)}</span></TD>
            <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_Receptor)}</span></TD>
            <TD><span className={badge(r.Status)}>{r.Status}</span></TD>
            <TD right><span className="font-semibold">{MXN(Number(r.Total_MXN) || 0)}</span></TD>
            <TD right><span className="font-semibold text-emerald-700 dark:text-emerald-300">{MXN(Number(r.TotalRetenidoISR) || Number(r.Descuento) || 0)}</span></TD>
          </tr>
        ))}
      </tbody>
      <LimitNote count={rows.length} cols={9} />
    </table>
  )
}

export function TablaRetenciones({ rows }: { rows: RetencionCFDI[] }) {
  return (
    <table className="w-full min-w-[900px]">
      <thead>
        <tr>
          <TH>UUID</TH><TH>Dir.</TH><TH>Tipo</TH><TH>Fecha</TH><TH>RFC Emisor</TH>
          <TH>Razón Social</TH><TH>Status</TH><TH>Total MXN</TH><TH>ISR Ret. MXN</TH><TH>IVA Ret. MXN</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={10} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
          <tr key={`${r.UUID}_${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
            <TD><span className="font-mono text-xs text-slate-400 dark:text-zinc-500">{uuid4(r.UUID)}</span></TD>
            <TD>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${r.Direccion === 'Emitida' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                {r.Direccion}
              </span>
            </TD>
            <TD><span className="font-mono text-xs">{r.TipoComprobante}</span></TD>
            <TD>{fmt(r.Fecha)}</TD>
            <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_Emisor)}</span></TD>
            <TD><span className="max-w-[180px] truncate block">{r.RazonSocialEmisor || rfcDisplay(r.RFC_Emisor)}</span></TD>
            <TD><span className={badge(r.Status)}>{r.Status}</span></TD>
            <TD right><span className="font-semibold">{MXN(Number(r.Total_MXN) || 0)}</span></TD>
            <TD right>{MXN(Number(r.ISR_MXN) || 0)}</TD>
            <TD right>{MXN(Number(r.IVA_Ret_MXN) || 0)}</TD>
          </tr>
        ))}
      </tbody>
      <LimitNote count={rows.length} cols={10} />
    </table>
  )
}

export function TablaPagos({ rows, loading }: { rows: PagoRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400 dark:text-zinc-500 gap-2">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
        Cargando…
      </div>
    )
  }
  return (
    <table className="w-full">
      <thead>
        <tr>
          <TH>F. Emisión</TH><TH>F. Pago</TH>
          <TH>RFC Emisor</TH><TH>RFC Receptor</TH>
          <TH>Forma Pago</TH><TH>Moneda</TH><TH>Total Pago</TH>
          <TH>Parcialidad</TH>
          <TH>Saldo Anterior</TH><TH>Importe Pagado</TH><TH>Saldo Insoluto</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={11} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => {
          const tc = Number(r.tipoCambio) || 1
          return (
            <tr key={`${r.uuid_pago}-${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
              <TD>{fmt(r.fechaEmision)}</TD>
              <TD>{fmt(r.fechaPago)}</TD>
              <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_emisor)}</span></TD>
              <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_receptor)}</span></TD>
              <TD>{r.forma_pago}</TD>
              <TD><span className="font-mono text-xs">{r.moneda_pago}</span></TD>
              <TD right><span className="font-semibold">{MXN(Number(r.total_pago) * tc)}</span></TD>
              <TD right>{r.numParcialidad || '—'}</TD>
              <TD right>{MXN(Number(r.saldo_anterior) * tc)}</TD>
              <TD right>{MXN(Number(r.saldo_pagado) * tc)}</TD>
              <TD right>{MXN(Number(r.saldo_insoluto) * tc)}</TD>
            </tr>
          )
        })}
      </tbody>
      <LimitNote count={rows.length} cols={11} />
    </table>
  )
}

export function Tablaflujo({ rows, loading }: { rows: flujoRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400 dark:text-zinc-500 gap-2">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
        Cargando…
      </div>
    )
  }
  return (
    <table className="w-full table-fixed">
      <colgroup><col className="w-36" /><col className="w-28" /><col className="w-28" /><col className="w-36" /><col /><col className="w-28" /><col className="w-32" /></colgroup>
      <thead>
        <tr>
          <TH>Fuente</TH><TH>F. Emisión</TH><TH>F. Pago</TH>
          <TH>RFC Emisor</TH><TH>Razón Social Emisor</TH>
          <TH>Forma Pago</TH><TH>Total</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0
          ? <EmptyRow cols={7} />
          : rows.slice(0, PREVIEW_LIMIT).map((r, i) => {
            const tc = Number(r.tipoCambio) || 1
              const isPago = r.fuente === 'Complemento P'
              return (
                <tr key={`${r.uuid}-${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
                  <TD>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${isPago ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'}`}>
                      {r.fuente}
                    </span>
                  </TD>
                  <TD>{fmt(r.fechaEmision)}</TD>
                  <TD>{r.fechaPago ? fmt(r.fechaPago) : '—'}</TD>
                  <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_emisor)}</span></TD>
                  <TD><span className="truncate block">{r.RazonSocialEmisor || rfcDisplay(r.RFC_emisor)}</span></TD>
                  <TD>{r.formaPago || '—'}</TD>
                  <TD right><span className="font-semibold">{MXN(Number(r.total) * tc)}</span></TD>
                </tr>
              )
            })
        }
      </tbody>
      <LimitNote count={rows.length} cols={7} />
    </table>
  )
}

export function TablaNotasCredito({ rows, loading }: { rows: NotaCreditoRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400 dark:text-zinc-500 gap-2">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
        Cargando…
      </div>
    )
  }
  return (
    <table className="w-full">
      <thead>
        <tr>
          <TH>Fecha</TH>
          <TH>RFC Emisor</TH><TH>RFC Receptor</TH>
          <TH>Subtotal</TH><TH>IVA 16%</TH><TH>Total Trasl.</TH>
          <TH>Ret. ISR</TH><TH>Ret. IVA</TH><TH>Total</TH>
          <TH>Moneda</TH><TH>Forma Pago</TH><TH>Método Pago</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={12} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => {
          const tc = Number(r.tipoCambio) || 1
          return (
            <tr key={`${r.uuid}-${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
              <TD>{fmt(r.fecha)}</TD>
              <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_emisor)}</span></TD>
              <TD><span className="font-mono text-xs">{rfcDisplay(r.RFC_receptor)}</span></TD>
              <TD right>{MXN(Number(r.subtotal) * tc)}</TD>
              <TD right>{MXN(Number(r.iva16) * tc)}</TD>
              <TD right>{MXN(Number(r.totaltrasladados) * tc)}</TD>
              <TD right>{MXN(Number(r.retISR) * tc)}</TD>
              <TD right>{MXN(Number(r.retIVA) * tc)}</TD>
              <TD right><span className="font-semibold">{MXN(Number(r.total) * tc)}</span></TD>
              <TD><span className="font-mono text-xs">{r.Moneda}</span></TD>
              <TD>{r.TipoPago}</TD>
              <TD>{r.MetodoPago}</TD>
            </tr>
          )
        })}
      </tbody>
      <LimitNote count={rows.length} cols={12} />
    </table>
  )
}
