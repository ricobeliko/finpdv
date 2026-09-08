import React, { useState, useEffect } from 'react';
import { useFinPdvStore } from '../../core/finpdv/finpdvStore';
import { getAuditLogsDb, createSupportSessionDb } from '../../core/database/finpdvDb';
import { getDb } from '../../core/database/db';
import { AuditLogEntry, SupportSession } from '../../core/finpdv/types';
import { 
  Wrench, 
  Database, 
  ShieldCheck, 
  HardDrive, 
  Clock, 
  UserCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Terminal as TerminalIcon,
  RefreshCw,
  Key
} from 'lucide-react';

export const MaintenancePage: React.FC = () => {
  const { installationInfo, businessProfile, currentTerminal } = useFinPdvStore();
  const [integrityStatus, setIntegrityStatus] = useState<string | null>(null);
  const [runningCheck, setRunningCheck] = useState(false);
  const [dbStats, setDbStats] = useState<{
    products: number;
    sales: number;
    cashSessions: number;
    auditLogs: number;
  } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [supportSession, setSupportSession] = useState<SupportSession | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  const loadData = async () => {
    try {
      const db = await getDb();
      const pCount = await db.select<any[]>('SELECT count(*) as c FROM products');
      const sCount = await db.select<any[]>('SELECT count(*) as c FROM sales');
      const cCount = await db.select<any[]>('SELECT count(*) as c FROM cash_sessions');
      const aCount = await db.select<any[]>('SELECT count(*) as c FROM audit_logs');

      setDbStats({
        products: pCount[0]?.c || 0,
        sales: sCount[0]?.c || 0,
        cashSessions: cCount[0]?.c || 0,
        auditLogs: aCount[0]?.c || 0,
      });

      const logs = await getAuditLogsDb(20);
      setAuditLogs(logs);
    } catch (err) {
      console.error('Erro ao carregar dados de manutenção:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleIntegrityCheck = async () => {
    try {
      setRunningCheck(true);
      setIntegrityStatus(null);
      const db = await getDb();
      const res = await db.select<any[]>('PRAGMA integrity_check;');
      if (res && res.length > 0 && res[0]?.integrity_check === 'ok') {
        setIntegrityStatus('OK (Banco Íntegro - 0 Corrupções Detectadas)');
      } else {
        setIntegrityStatus(JSON.stringify(res));
      }
    } catch (err: any) {
      setIntegrityStatus('Erro: ' + err.message);
    } finally {
      setRunningCheck(false);
    }
  };

  const handleCreateSupportSession = async () => {
    if (!installationInfo) return;
    try {
      setCreatingSession(true);
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 horas
      const challenge = 'FP-SUP-' + Math.random().toString(36).substring(2, 10).toUpperCase();

      const session: SupportSession = {
        id: 'sup_' + Date.now().toString(36),
        installationId: installationInfo.installationId,
        challenge,
        expiresAt,
        permissions: ['maintenance.view', 'maintenance.execute', 'diagnostics.view'],
        createdAt: new Date().toISOString()
      };

      await createSupportSessionDb(session);
      setSupportSession(session);
      await loadData();
    } catch (err) {
      console.error('Erro ao criar sessão de suporte:', err);
    } finally {
      setCreatingSession(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-900/40 text-indigo-400 rounded-xl border border-indigo-700/50">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Manutenção e Diagnóstico</h1>
            <p className="text-xs text-slate-400">
              Integridade do banco de dados, auditoria de segurança e suporte técnico FinPDV
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar Diagnóstico</span>
        </button>
      </div>

      {/* Cards de Identificação da Instalação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start space-x-3">
          <HardDrive className="w-5 h-5 text-indigo-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Instalação Local
            </span>
            <p className="text-sm font-bold text-white truncate mt-1">
              {installationInfo?.installationId || 'Não registrado'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Versão: {installationInfo?.appVersion || '1.0.0'}</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start space-x-3">
          <Database className="w-5 h-5 text-emerald-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Banco SQLite
            </span>
            <p className="text-sm font-bold text-white truncate mt-1">finpdv.db (WAL Mode)</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Isolado de com.merceariauber.pos
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start space-x-3">
          <TerminalIcon className="w-5 h-5 text-amber-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Terminal Ativo
            </span>
            <p className="text-sm font-bold text-white truncate mt-1">
              {currentTerminal?.name || 'Caixa'} ({currentTerminal?.code || 'CX01'})
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Loja: {businessProfile?.tradeName || 'FinPDV'}
            </p>
          </div>
        </div>
      </div>

      {/* Seção 1: Integridade SQLite e Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-semibold text-white">Integridade Estrutural do SQLite</h3>
            </div>
            <button
              onClick={handleIntegrityCheck}
              disabled={runningCheck}
              className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runningCheck ? 'animate-spin' : ''}`} />
              <span>{runningCheck ? 'Verificando...' : 'Executar PRAGMA'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Executa <code className="bg-slate-800 text-indigo-300 px-1 py-0.5 rounded">PRAGMA integrity_check</code> completo
            no banco de dados operacional local para garantir ausência de corrupção ou páginas órfãs.
          </p>

          {integrityStatus && (
            <div className={`p-3 rounded-lg border text-xs font-mono ${
              integrityStatus.includes('OK')
                ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                : 'bg-red-950/40 border-red-700/50 text-red-300'
            }`}>
              <div className="flex items-center space-x-2">
                {integrityStatus.includes('OK') ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{integrityStatus}</span>
              </div>
            </div>
          )}

          {dbStats && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/40">
                <span className="text-[11px] text-slate-400 block">Produtos Cadastrados</span>
                <span className="text-lg font-bold text-white">{dbStats.products}</span>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/40">
                <span className="text-[11px] text-slate-400 block">Vendas Registradas</span>
                <span className="text-lg font-bold text-white">{dbStats.sales}</span>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/40">
                <span className="text-[11px] text-slate-400 block">Sessões de Caixa</span>
                <span className="text-lg font-bold text-white">{dbStats.cashSessions}</span>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/40">
                <span className="text-[11px] text-slate-400 block">Logs de Auditoria</span>
                <span className="text-lg font-bold text-white">{dbStats.auditLogs}</span>
              </div>
            </div>
          )}
        </div>

        {/* Seção 2: FinPDV Support (Modo de Suporte Seguro) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">FinPDV Support • Sessão Segura</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Permite habilitar acesso temporário para a equipe técnica de suporte do FinPDV.
            <strong> Sem senhas mestras e sem backdoors:</strong> o acesso é concedido mediante geração de um token
            de desafio auditado com validade de 4 horas.
          </p>

          {!supportSession ? (
            <div className="pt-2">
              <button
                onClick={handleCreateSupportSession}
                disabled={creatingSession}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                <Key className="w-4 h-4" />
                <span>{creatingSession ? 'Gerando Sessão...' : 'Habilitar Modo Suporte (4 Horas)'}</span>
              </button>
            </div>
          ) : (
            <div className="p-4 bg-emerald-950/40 border border-emerald-700/50 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold">
                <span>Sessão de Suporte Ativa</span>
                <span className="bg-emerald-800/60 px-2 py-0.5 rounded text-[10px]">Válido até 4h</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-emerald-800/40 font-mono text-center">
                <span className="text-xs text-slate-400 block mb-1">Challenge / Token de Autorização</span>
                <span className="text-lg font-bold text-emerald-400 tracking-wider select-all">
                  {supportSession.challenge}
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/70 text-center">
                Forneça este código ao time técnico FinPDV para autorização e auditoria da sessão.
              </p>
            </div>
          )}

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Regras de Segurança FinPDV Support:</p>
            <p>• Toda ação técnica é registrada na tabela de auditoria local.</p>
            <p>• Nenhum dado financeiro sai da máquina sem consentimento.</p>
            <p>• A sessão expira automaticamente e pode ser revogada a qualquer momento.</p>
          </div>
        </div>
      </div>

      {/* Seção 3: Tabela de Auditoria de Ações Críticas */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">Log de Auditoria de Ações Recentes</h3>
          </div>
          <span className="text-xs text-slate-400">Últimos {auditLogs.length} eventos</span>
        </div>

        {auditLogs.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4 text-center">Nenhum evento registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/50 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="p-2.5">Data/Hora</th>
                  <th className="p-2.5">Usuário / Papel</th>
                  <th className="p-2.5">Ação</th>
                  <th className="p-2.5">Entidade</th>
                  <th className="p-2.5">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition">
                    <td className="p-2.5 text-slate-400 font-mono whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-2.5">
                      <span className="font-medium text-white">{log.userId}</span>{' '}
                      <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800">
                        {log.role}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono text-indigo-300">{log.action}</td>
                    <td className="p-2.5 text-slate-400">{log.entity}</td>
                    <td className="p-2.5 text-slate-400 font-mono text-[11px] truncate max-w-xs">
                      {log.details || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
