export default function DashboardFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-6 py-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400 dark:text-zinc-500">
        <span>© {new Date().getFullYear()} AIcuenta. Todos los derechos reservados.</span>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-slate-600 dark:hover:text-zinc-300 transition-colors">Aviso de privacidad</a>
          <a href="#" className="hover:text-slate-600 dark:hover:text-zinc-300 transition-colors">Terminos de uso</a>
        </div>
      </div>
    </footer>
  )
}
