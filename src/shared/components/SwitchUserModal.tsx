import React from 'react';
import { 
  X, 
  User, 
  PauseCircle, 
  Lock, 
  ShieldAlert, 
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { useUserStore } from '../../modules/users/userStore';

interface SwitchUserDecisionModalProps {
  isOpen: boolean;
  operatorName: string;
  onPauseCash: () => void;
  onCloseCash: () => void;
  onCancel: () => void;
}

export function SwitchUserDecisionModal({
  isOpen,
  operatorName,
  onPauseCash,
  onCloseCash,
  onCancel,
}: SwitchUserDecisionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
        {/* CABEÇALHO */}
        <div className="bg-amber-500 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-6 h-6 text-amber-100" />
            <div>
              <h3 className="font-bold text-base leading-tight">Sessão de Caixa em Aberto</h3>
              <p className="text-xs text-amber-100 mt-0.5">Operador atual: {operatorName}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-white/80 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO / OPÇÕES OBRIGATÓRIAS */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-textMuted leading-relaxed">
            Existe um caixa ativo vinculado a <strong>{operatorName}</strong>. Para alternar de usuário, selecione como deseja prosseguir:
          </p>

          <div className="space-y-3">
            {/* OPÇÃO 1: PAUSAR CAIXA */}
            <button
              onClick={onPauseCash}
              className="w-full text-left p-4 rounded-xl border-2 border-slate-200 hover:border-primary hover:bg-emerald-50/40 transition-all flex items-start space-x-3.5 group"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <PauseCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-textMain">1. Pausar Caixa (Manter Sessão Aberta)</span>
                  <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-primary transition-colors" />
                </div>
                <p className="text-xs text-textMuted mt-1">
                  Mantém os valores, vendas e sessão gravados no banco para retorno posterior ou login temporário de outro operador/administrador.
                </p>
              </div>
            </button>

            {/* OPÇÃO 2: ENCERRAR CAIXA */}
            <button
              onClick={onCloseCash}
              className="w-full text-left p-4 rounded-xl border-2 border-slate-200 hover:border-danger hover:bg-red-50/40 transition-all flex items-start space-x-3.5 group"
            >
              <div className="w-10 h-10 rounded-lg bg-red-100 text-danger flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Lock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-textMain">2. Encerrar Caixa (Conferência Cega)</span>
                  <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-danger transition-colors" />
                </div>
                <p className="text-xs text-textMuted mt-1">
                  Realiza a contagem física das gavetas, apura quebra/sobra e finaliza formalmente a sessão deste operador.
                </p>
              </div>
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar e Continuar no Caixa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface UserSelectModalProps {
  isOpen: boolean;
  onSelectUser: (userId: string) => void;
  onClose: () => void;
}

export function UserSelectModal({ isOpen, onSelectUser, onClose }: UserSelectModalProps) {
  const { users, currentUser } = useUserStore();
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);
  const [credential, setCredential] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedUser(null);
      setCredential('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAuthenticateAndSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!credential.trim()) {
      setError('Informe a senha ou PIN do operador.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { authService } = await import('../../core/auth/authService');
      await authService.login(selectedUser.username, credential.trim());
      onSelectUser(selectedUser.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
        <div className="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-highlight" />
            <div>
              <h3 className="font-bold text-base leading-tight">
                {selectedUser ? `Confirmar Acesso: ${selectedUser.name}` : 'Selecionar Operador'}
              </h3>
              <p className="text-xs text-white/70">
                {selectedUser ? 'Digite a senha ou PIN para assumir a sessão' : 'Escolha o operador para iniciar a sessão'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {selectedUser ? (
          <form onSubmit={handleAuthenticateAndSwitch} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">
                Senha ou PIN de {selectedUser.name}
              </label>
              <input
                type="password"
                autoFocus
                required
                placeholder="Digite a senha ou PIN"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setCredential('');
                  setError(null);
                }}
                className="text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                ← Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {loading ? 'Validando...' : 'Autenticar e Entrar'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-2 max-h-80 overflow-y-auto">
            {users.filter((u) => u.isActive).map((u) => {
              const isCurrent = currentUser?.id === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-all ${
                    isCurrent 
                      ? 'border-primary bg-emerald-50/60 shadow-sm' 
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="font-bold text-sm text-textMain">{u.name}</p>
                      {isCurrent && (
                        <span className="text-[9px] bg-primary text-white font-bold px-1.5 py-0.2 rounded">
                          ATUAL
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-textMuted font-mono">@{u.username}</span>
                  </div>
                  <span className="bg-slate-200 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded">
                    {u.roleName}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}