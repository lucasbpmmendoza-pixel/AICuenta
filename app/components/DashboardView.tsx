import type { JWTPayload } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

interface Props {
  session: JWTPayload;
}

export default function DashboardView({ session }: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
          AIcuenta
        </p>
        <h1 className="mt-4 text-2xl font-black text-slate-950">Dashboard</h1>

        <div className="mt-6 space-y-2 rounded-2xl bg-slate-50 p-4">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-slate-500">Nombre</span>
            <span className="text-slate-900">{session.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-slate-500">Correo</span>
            <span className="text-slate-900">{session.email}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-slate-500">ID</span>
            <span className="truncate pl-4 text-right font-mono text-xs text-slate-400">
              {session.sub}
            </span>
          </div>
        </div>

        <LogoutButton />
      </div>
    </div>
  );
}
