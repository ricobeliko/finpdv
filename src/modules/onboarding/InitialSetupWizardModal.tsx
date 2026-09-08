import React, { useState } from 'react';
import { useFinPdvStore } from '../../core/finpdv/finpdvStore';
import { Building2, Store as StoreIcon, Monitor, Printer, ShieldCheck, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';

export const InitialSetupWizardModal: React.FC = () => {
  const { completeInitialSetup } = useFinPdvStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [tradeName, setTradeName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [storeName, setStoreName] = useState('Loja Principal');
  const [storeCode, setStoreCode] = useState('LJ01');
  const [storeAddress, setStoreAddress] = useState('');

  const [terminalName, setTerminalName] = useState('Caixa 01');
  const [terminalCode, setTerminalCode] = useState('CX01');
  const [printerName, setPrinterName] = useState('');

  const [adminFullName, setAdminFullName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminPin, setAdminPin] = useState('');

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!tradeName.trim()) {
        setError('O Nome Fantasia é obrigatório.');
        return;
      }
      if (!legalName.trim()) {
        setLegalName(tradeName.trim());
      }
    } else if (step === 2) {
      if (!storeName.trim() || !storeCode.trim()) {
        setError('Informe o nome e código da loja.');
        return;
      }
    } else if (step === 3) {
      if (!terminalName.trim() || !terminalCode.trim()) {
        setError('Informe o nome e código do terminal de caixa.');
        return;
      }
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!adminFullName.trim()) {
      setError('Informe o nome completo do Administrador.');
      return;
    }
    if (!adminUsername.trim()) {
      setError('Informe o usuário do Administrador.');
      return;
    }
    if (adminPassword.length < 6) {
      setError('A senha do Administrador deve ter no mínimo 6 caracteres.');
      return;
    }
    if (adminPassword !== adminConfirmPassword) {
      setError('As senhas digitadas não coincidem.');
      return;
    }

    try {
      setLoading(true);
      await completeInitialSetup({
        business: {
          tradeName,
          legalName: legalName || tradeName,
          cnpj,
          phone,
          email,
          address
        },
        store: {
          name: storeName,
          code: storeCode,
          address: storeAddress || address
        },
        terminal: {
          name: terminalName,
          code: terminalCode,
          printerName
        },
        adminUser: {
          username: adminUsername,
          fullName: adminFullName,
          passwordPlain: adminPassword,
          pinPlain: adminPin || undefined
        }
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao concluir configuração inicial.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 border-b border-indigo-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">FinPDV</h1>
                <p className="text-xs text-blue-200 font-medium">Assistente de Configuração Inicial</p>
              </div>
            </div>
            <span className="text-xs font-semibold bg-white/10 px-3 py-1.5 rounded-full border border-white/15 text-blue-100">
              Passo {step} de 5
            </span>
          </div>

          {/* Stepper Progress */}
          <div className="grid grid-cols-5 gap-2 mt-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= step ? 'bg-white' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Mensagem de Erro */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-950/60 border border-red-700/50 rounded-xl text-red-200 text-sm flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>{error}</span>
          </div>
        )}

        {/* Conteúdo dos Passos */}
        <div className="p-6 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-lg border-b border-slate-800 pb-2">
                <Building2 className="w-5 h-5" />
                <span>1. Identificação da Empresa</span>
              </div>
              <p className="text-xs text-slate-400">
                Estes dados serão utilizados no cabeçalho das vendas, relatórios e cupons fiscais/não-fiscais.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome Fantasia *
                  </label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="Ex: Supermercado Central"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Razão Social
                  </label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="Ex: Central Alimentos LTDA"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    CNPJ / CPF
                  </label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Endereço Completo
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-lg border-b border-slate-800 pb-2">
                <StoreIcon className="w-5 h-5" />
                <span>2. Dados da Loja / Filial</span>
              </div>
              <p className="text-xs text-slate-400">
                Identificação desta loja física para registro de operações e estoque local.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome da Loja *
                  </label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ex: Matriz Centro"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Código da Loja *
                  </label>
                  <input
                    type="text"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value)}
                    placeholder="LJ01"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-lg border-b border-slate-800 pb-2">
                <Monitor className="w-5 h-5" />
                <span>3. Configuração do Terminal de Caixa</span>
              </div>
              <p className="text-xs text-slate-400">
                Cada computador executando o FinPDV é um terminal independente com seu próprio número de caixa.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome do Terminal *
                  </label>
                  <input
                    type="text"
                    value={terminalName}
                    onChange={(e) => setTerminalName(e.target.value)}
                    placeholder="Ex: Caixa 01"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Código do Terminal *
                  </label>
                  <input
                    type="text"
                    value={terminalCode}
                    onChange={(e) => setTerminalCode(e.target.value)}
                    placeholder="CX01"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-lg border-b border-slate-800 pb-2">
                <Printer className="w-5 h-5" />
                <span>4. Impressora Térmica Não-Fiscal</span>
              </div>
              <p className="text-xs text-slate-400">
                Se você já possui uma impressora térmica ESC/POS instalada no Windows, informe o nome dela.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome da Fila de Impressão Windows (Opcional)
                </label>
                <input
                  type="text"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder="Ex: POS-58, EPSON TM-T20X ou deixe em branco"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Você poderá configurar ou alterar a impressora a qualquer momento na tela de Configurações.
                </p>
              </div>
            </div>
          )}

          {step === 5 && (
            <form onSubmit={handleFinish} className="space-y-4">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-lg border-b border-slate-800 pb-2">
                <ShieldCheck className="w-5 h-5" />
                <span>5. Criar Primeiro Administrador</span>
              </div>
              <div className="p-3 bg-indigo-950/40 border border-indigo-700/40 rounded-xl text-indigo-200 text-xs">
                <strong>Segurança FinPDV:</strong> Não existem senhas padrão de fábrica (como 1234). Defina uma senha segura para o Administrador do sistema.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome Completo do Admin *
                  </label>
                  <input
                    type="text"
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="Ex: Gerente Geral"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Usuário de Login *
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Senha do Administrador * (mínimo 6 caracteres)
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirmar Senha *
                  </label>
                  <input
                    type="password"
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    PIN Rápido Numérico (Opcional - para autorização rápida)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 8520"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Rodapé e Botões */}
        <div className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="flex items-center space-x-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar</span>
              </button>
            )}
          </div>

          <div>
            {step < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center space-x-1 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-indigo-600/30 transition"
              >
                <span>Avançar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={loading}
                className="flex items-center space-x-1 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{loading ? 'Finalizando...' : 'Concluir Instalação'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
