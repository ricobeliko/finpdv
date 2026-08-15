import React, { useState, useEffect } from 'react';
import { enable, isEnabled, disable } from '@tauri-apps/plugin-autostart';
import { 
  Settings, 
  Database, 
  HardDriveDownload, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  Printer, 
  Scale, 
  Save,
  FileCheck,
  ShieldCheck,
  Clock,
  Power
} from 'lucide-react';
import { useSettingsStore } from './settingsStore';
import { BackupRecord } from './types';
import { RestoreConfirmModal } from './components/RestoreConfirmModal';

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function SettingsPage() {
  const { 
    settings, 
    backups, 
    isRestoring, 
    lastBackupDate, 
    updateSettings, 
    createBackup, 
    restoreBackup 
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'BACKUP' | 'STORE' | 'HARDWARE'>('BACKUP');
  const [formData, setFormData] = useState({ ...settings });
  const [selectedBackup, setSelectedBackup] = useState<BackupRecord | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [autostartActive, setAutostartActive] = useState(false);

  // Verifica ao carregar a página se o autostart já está ativo no Windows/Linux
  useEffect(() => {
    isEnabled().then(setAutostartActive).catch(() => {});
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Alterna o início automático com o Windows
  const handleToggleAutostart = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setAutostartActive(checked);
      showToast(checked ? 'Início automático ativado com sucesso!' : 'Início automático desativado!');
    } catch (err) {
      console.error('Erro ao alternar autostart:', err);
      showToast('Não foi possível alterar a configuração de autostart.');
    }
  };

  const handleSaveStoreSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
    showToast('Configurações salvas com sucesso!');
  };

  const handleGenerateBackup = () => {
    const bkp = createBackup('MANUAL');
    showToast(`Backup atômico "${bkp.filename}" gerado com sucesso!`);
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackup) return;
    await restoreBackup(selectedBackup.id);
    setIsRestoreModalOpen(false);
    setSelectedBackup(null);
    showToast('Base de dados restaurada com sucesso!');
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* TOAST FLUTUANTE */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 px-4 py-2.5 rounded-lg shadow-xl text-white text-xs font-bold flex items-center space-x-2 bg-slate-800 border border-slate-700 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-highlight" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER DO MÓDULO */}
      <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('BACKUP')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'BACKUP' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Backup & Integridade SQLite</span>
          </button>

          <button
            onClick={() => setActiveTab('STORE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'STORE' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Dados da Loja & Sistema</span>
          </button>

          <button
            onClick={() => setActiveTab('HARDWARE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'HARDWARE' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Periféricos (Balança / Impressora)</span>
          </button>
        </div>

        {activeTab === 'BACKUP' && (
          <button
            onClick={handleGenerateBackup}
            className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <HardDriveDownload className="w-4 h-4" />
            <span>Gerar Backup Agora</span>
          </button>
        )}
      </div>

      {/* ABA 1: BACKUP & INTEGRIDADE */}
      {activeTab === 'BACKUP' && (
        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase">Motor de Banco de Dados</p>
                <p className="text-base font-bold text-textMain mt-0.5">SQLite 3 (WAL Mode)</p>
                <span className="text-[10px] text-primary font-bold">100% Offline & Atômico</span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase">Última Cópia de Segurança</p>
                <p className="text-base font-bold text-slate-800 mt-0.5 font-mono">{lastBackupDate}</p>
                <span className="text-[10px] text-emerald-700 font-bold">Integridade Verificada</span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase">Cópias Disponíveis</p>
                <p className="text-base font-bold text-primary mt-0.5 font-mono">{backups.length} snapshots</p>
                <span className="text-[10px] text-textMuted">Pronto para restauração</span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <span className="text-xs font-bold text-textMain uppercase tracking-wider">Histórico de Snapshots Locais</span>
              <span className="text-[11px] text-textMuted">Armazenado no diretório da aplicação</span>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Arquivo / Nome</th>
                    <th className="px-4 py-3">Data / Horário</th>
                    <th className="px-4 py-3">Tamanho</th>
                    <th className="px-4 py-3 font-sans">Tipo</th>
                    <th className="px-4 py-3">Checksum</th>
                    <th className="px-4 py-3 text-right font-sans">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backups.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-800">{b.filename}</td>
                      <td className="px-4 py-3 text-textMuted">{b.createdAt}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBytes(b.sizeBytes)}</td>
                      <td className="px-4 py-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          b.type === 'AUTOMATIC' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {b.type === 'AUTOMATIC' ? 'AUTOMÁTICO' : 'MANUAL'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-textMuted text-[10px] truncate max-w-[140px]" title={b.checksum}>
                        {b.checksum}
                      </td>
                      <td className="px-4 py-3 text-right font-sans">
                        <button
                          onClick={() => {
                            setSelectedBackup(b);
                            setIsRestoreModalOpen(true);
                          }}
                          className="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 ml-auto"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-400" />
                          <span>Restaurar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: DADOS DA EMPRESA E SISTEMA */}
      {activeTab === 'STORE' && (
        <form onSubmit={handleSaveStoreSettings} className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm p-6 overflow-y-auto space-y-5 max-w-2xl">
          <div>
            <h3 className="font-bold text-base text-textMain">Identificação da Empresa & Cabeçalho de Cupom</h3>
            <p className="text-xs text-textMuted">Esses dados serão impressos no cabeçalho e rodapé dos comprovantes térmicos.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Razão Social</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Nome Fantasia</label>
              <input
                type="text"
                value={formData.tradeName}
                onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">CNPJ</label>
              <input
                type="text"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Telefone de Contato</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Endereço Completo</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Mensagem de Rodapé do Cupom</label>
            <input
              type="text"
              value={formData.receiptFooterMessage}
              onChange={(e) => setFormData({ ...formData, receiptFooterMessage: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          {/* TOGGLE: INÍCIO AUTOMÁTICO COM O WINDOWS / LINUX */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
                <Power className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-textMain">Iniciar automaticamente com o Sistema Operacional</p>
                <p className="text-[11px] text-textMuted">Abre o Mercado POS em modo tela cheia assim que o computador ligar.</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autostartActive}
              onChange={(e) => handleToggleAutostart(e.target.checked)}
              className="w-5 h-5 text-primary rounded focus:ring-primary cursor-pointer accent-primary"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Parâmetros da Loja</span>
            </button>
          </div>
        </form>
      )}

      {/* ABA 3: PERIFÉRICOS & HARDWARE */}
      {activeTab === 'HARDWARE' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm p-6 overflow-y-auto space-y-6 max-w-2xl">
          <div>
            <h3 className="font-bold text-base text-textMain">Comunicação Serial & Impressão</h3>
            <p className="text-xs text-textMuted">Configuração de balanças de checkout (Toledo/Filizola) e impressoras não fiscais.</p>
          </div>

          {/* BALANÇA SERIAL */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-textMain uppercase">
              <Scale className="w-4 h-4 text-primary" />
              <span>Balança de Checkout (Protocolo Toledo / Filizola)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">Porta COM</label>
                <select
                  value={formData.scalePort}
                  onChange={(e) => setFormData({ ...formData, scalePort: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-surface"
                >
                  <option value="COM1">COM1</option>
                  <option value="COM2">COM2</option>
                  <option value="COM3">COM3 (Padrão USB-Serial)</option>
                  <option value="COM4">COM4</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">Baud Rate</label>
                <select
                  value={formData.scaleBaudRate}
                  onChange={(e) => setFormData({ ...formData, scaleBaudRate: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-surface font-mono"
                >
                  <option value="4800">4800 bps</option>
                  <option value="9600">9600 bps (Recomendado)</option>
                  <option value="19200">19200 bps</option>
                </select>
              </div>
            </div>
          </div>

          {/* IMPRESSORA TÉRMICA */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-textMain uppercase">
              <Printer className="w-4 h-4 text-primary" />
              <span>Impressora Térmica de Cupom</span>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">Largura da Bobina</label>
              <select
                value={formData.printerWidthMm}
                onChange={(e) => setFormData({ ...formData, printerWidthMm: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-surface"
              >
                <option value="80">80mm (Padrão Varejo - EPSON TM-T20 / Bematech)</option>
                <option value="58">58mm (Bobina Estreita)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              updateSettings(formData);
              showToast('Periféricos configurados com sucesso!');
            }}
            className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Parâmetros de Hardware</span>
          </button>
        </div>
      )}

      {/* MODAL DE RESTAURAÇÃO */}
      <RestoreConfirmModal
        isOpen={isRestoreModalOpen}
        backup={selectedBackup}
        isRestoring={isRestoring}
        onClose={() => {
          setIsRestoreModalOpen(false);
          setSelectedBackup(null);
        }}
        onConfirm={handleExecuteRestore}
      />
    </div>
  );
}