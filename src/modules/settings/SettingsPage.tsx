import React, { useState, useEffect } from 'react';
import { enable, isEnabled, disable } from '@tauri-apps/plugin-autostart';
import { open } from '@tauri-apps/plugin-shell';
import { appLocalDataDir } from '@tauri-apps/api/path';
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
  Power,
  KeyRound,
  Play,
  FolderKanban,
  FileUp,
  Skull,
  Trash2,
  RefreshCw,
  CloudDownload,
  Loader2,
  Barcode,
  Globe
} from 'lucide-react';
import { useSettingsStore } from './settingsStore';
import { BackupRecord } from './types';
import { RestoreConfirmModal } from './components/RestoreConfirmModal';
import { getInstalledPrinters, testPrinter, triggerDrawer } from '../../core/hardware/printer';
import { checkForAppUpdates, installAndRestartApp, parseReleaseHighlights, UpdateStatus } from '../../core/updater/updaterService';
import { useFinPdvStore } from '../../core/finpdv/finpdvStore';
import { authService } from '../../core/auth/authService';

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
    restoreBackup,
    importBackup
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'BACKUP' | 'STORE' | 'HARDWARE'>('HARDWARE');
  const [formData, setFormData] = useState({ ...settings });
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupRecord | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [autostartActive, setAutostartActive] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Estado para o modal de zerar dados
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Estado do Auto-Updater
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'IDLE' });
  const [appVersion, setAppVersion] = useState('0.1.1');

  useEffect(() => {
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion().then(setAppVersion).catch(() => {}))
      .catch(() => {});
  }, []);

  const handleCheckUpdates = async () => {
    await checkForAppUpdates((status) => {
      setUpdateStatus(status);
      if (status.state === 'UP_TO_DATE') {
        showToast('Você já está utilizando a versão mais recente!');
      } else if (status.state === 'ERROR') {
        showToast(status.error || 'Erro ao checar atualizações.');
      }
    });
  };

  const handleInstallUpdate = async () => {
    await installAndRestartApp((status) => {
      setUpdateStatus(status);
      if (status.state === 'ERROR') {
        showToast(status.error || 'Falha ao instalar atualização.');
      }
    });
  };

  // Carrega autostart e lista de impressoras do Windows
  useEffect(() => {
    isEnabled().then(setAutostartActive).catch(() => {});
    
    getInstalledPrinters().then(printers => {
      setAvailablePrinters(printers);
      const savedPrinter = localStorage.getItem('mercado_selected_printer');
      if (savedPrinter && printers.includes(savedPrinter)) {
        setFormData(prev => ({ ...prev, printerName: savedPrinter }));
      } else if (printers.length > 0 && !formData.printerName) {
        setFormData(prev => ({ ...prev, printerName: printers[0] }));
      }
    });
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

  const handleSaveHardwareSettings = () => {
    updateSettings(formData);
    if (formData.printerName) {
      localStorage.setItem('mercado_selected_printer', formData.printerName);
    }
    showToast('Configurações de periféricos salvas com sucesso!');
  };

  const handleTestPrint = async () => {
    const printer = formData.printerName || availablePrinters[0];
    if (!printer) {
      alert('Nenhuma impressora disponível para teste.');
      return;
    }
    setIsTesting(true);
    try {
      await testPrinter(printer);
      showToast(`Cupom de teste enviado para "${printer}"!`);
    } catch (err: any) {
      alert(`Erro no teste de impressão: ${err.message || err}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestDrawer = async () => {
    const printer = formData.printerName || availablePrinters[0];
    if (!printer) {
      alert('Selecione a impressora conectada à gaveta.');
      return;
    }
    try {
      await triggerDrawer(printer);
      showToast('Pulso elétrico de abertura enviado para a gaveta!');
    } catch (err: any) {
      alert(`Erro no teste da gaveta: ${err.message || err}`);
    }
  };

  const handleGenerateBackup = async () => {
    try {
      const bkp = await createBackup('MANUAL');
      showToast(`Backup "${bkp.filename}" gerado e baixado no computador!`);
    } catch (err: any) {
      alert(`Erro ao gerar backup: ${err.message || err}`);
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackup) return;
    try {
      await restoreBackup(selectedBackup.id);
      setIsRestoreModalOpen(false);
      setSelectedBackup(null);
      showToast('Base de dados restaurada com sucesso!');
    } catch (err: any) {
      alert(`Falha na restauração do backup: ${err.message || err}`);
    }
  };

  const handleOpenBackupFolder = async () => {
    try {
      const dataDir = await appLocalDataDir();
      await open(dataDir);
    } catch (err) {
      console.error("Erro ao abrir pasta de backups:", err);
      alert("Não foi possível abrir a pasta de backups.");
    }
  };

  const handleImportBackup = async () => {
    try {
      await importBackup();
    } catch (err: any) {
      console.error("Erro ao importar backup:", err);
      if (err.message !== 'Dialog closed') {
        alert(`Falha na importação: ${err.message}`);
      }
    }
  };

  const handleOpenResetModal = () => {
    setIsResetModalOpen(true);
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
            onClick={() => setActiveTab('HARDWARE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'HARDWARE' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Periféricos (Impressora / Balança)</span>
          </button>

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
        </div>

        {activeTab === 'BACKUP' && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleOpenBackupFolder}
              className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <FolderKanban className="w-4 h-4 text-amber-400" />
              <span>Abrir Pasta</span>
            </button>
            <button
              onClick={handleImportBackup}
              className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <FileUp className="w-4 h-4 text-emerald-400" />
              <span>Importar Backup</span>
            </button>
            <button
              onClick={handleGenerateBackup}
              className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <HardDriveDownload className="w-4 h-4" />
              <span>Gerar Backup Agora</span>
            </button>
          </div>
        )}
      </div>

      {/* ABA 1: PERIFÉRICOS & HARDWARE */}
      {activeTab === 'HARDWARE' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm p-6 overflow-y-auto space-y-6 max-w-2xl">
          <div>
            <h3 className="font-bold text-base text-textMain">Comunicação Serial & Impressão Direta</h3>
            <p className="text-xs text-textMuted">Configuração de impressora térmica não fiscal, gaveta de dinheiro RJ11 e balanças de checkout.</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-textMain uppercase flex items-center space-x-2">
                <Printer className="w-4 h-4 text-primary" />
                <span>Impressora Térmica de Cupom (ESC/POS)</span>
              </span>
              <span className="text-[11px] text-primary font-bold">
                {availablePrinters.length} impressoras detectadas
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">
                Dispositivo de Impressão (Windows Spooler):
              </label>
              <select
                value={formData.printerName || ''}
                onChange={(e) => setFormData({ ...formData, printerName: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-primary/40 rounded-xl text-xs font-bold bg-surface text-slate-800 focus:outline-none focus:border-primary"
              >
                {availablePrinters.length === 0 && (
                  <option value="">Nenhuma impressora encontrada</option>
                )}
                {availablePrinters.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">Largura da Bobina</label>
              <select
                value={formData.printerWidthMm}
                onChange={(e) => setFormData({ ...formData, printerWidthMm: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-surface"
              >
                <option value="80">80mm (Padrão Varejo - EPSON, Bematech, Elgin, Daruma)</option>
                <option value="58">58mm (Bobina Estreita)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={isTesting}
                onClick={handleTestPrint}
                className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white p-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>{isTesting ? 'Enviando Teste...' : 'Testar Impressão Térmica'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestDrawer}
                className="bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Testar Abertura da Gaveta</span>
              </button>
            </div>
          </div>

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

          <button
            type="button"
            onClick={handleSaveHardwareSettings}
            className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Parâmetros de Hardware</span>
          </button>
        </div>
      )}

      {/* ABA 2: BACKUP & INTEGRIDADE */}
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
                <span className="text-[10px] text-emerald-700 font-bold">Download Físico Ativo</span>
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
              <span className="text-xs font-bold text-textMain uppercase tracking-wider">Histórico de Snapshots Físicos</span>
              <span className="text-[11px] text-textMuted">Clique em "Baixar" para salvar em pendrive ou nuvem</span>
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
                    <th className="px-4 py-3 text-right font-sans">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400 font-sans text-xs">
                        Nenhum backup gerado ainda. Clique em "Gerar Backup Agora" para criar sua primeira cópia.
                      </td>
                    </tr>
                  ) : (
                    backups.map((b) => (
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
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => useSettingsStore.getState().downloadBackup(b)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-colors"
                              title="Baixar arquivo físico .json"
                            >
                              <HardDriveDownload className="w-3 h-3 text-emerald-600" />
                              <span>Baixar</span>
                            </button>
                            <button
                              onClick={() => {
                                setSelectedBackup(b);
                                setIsRestoreModalOpen(true);
                              }}
                              className="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-colors"
                              title="Restaurar dados no banco de dados"
                            >
                              <RotateCcw className="w-3 h-3 text-amber-400" />
                              <span>Restaurar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: DADOS DA EMPRESA E SISTEMA */}
      {activeTab === 'STORE' && (
        <div className="flex-1 overflow-y-auto space-y-6 max-w-2xl">
          <form onSubmit={handleSaveStoreSettings} className="bg-surface rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
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

            {/* TOGGLE: INÍCIO AUTOMÁTICO */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
                  <Power className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-textMain">Iniciar automaticamente com o Sistema Operacional</p>
                  <p className="text-[11px] text-textMuted">Abre o Mercado POS assim que o computador ligar.</p>
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

          {/* CONSULTA AUTOMÁTICA DE PRODUTOS (BLUESOFT COSMOS & OPEN FOOD FACTS) */}
          <div className="bg-surface rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Barcode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-textMain">Consulta Automática de Produtos</h3>
                  <p className="text-xs text-textMuted">Identificação automática de descrição e categoria ao bipar códigos de barras.</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-textMain">Usar Bluesoft Cosmos como base primária</p>
                  <p className="text-[11px] text-textMuted">
                    Se desabilitado ou sem credenciais, o sistema usará o Open Food Facts automaticamente como fallback gratuito.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.cosmosEnabled || false}
                  onChange={(e) => setFormData({ ...formData, cosmosEnabled: e.target.checked })}
                  className="w-5 h-5 text-primary rounded focus:ring-primary cursor-pointer accent-primary"
                />
              </div>

              {formData.cosmosEnabled && (
                <div className="space-y-3 pt-3 border-t border-slate-200 animate-fade-in">
                  <div>
                    <label className="block text-xs font-semibold text-textMuted uppercase mb-1">
                      Token de Acesso (X-Cosmos-Token)
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="Insira seu token da API Bluesoft Cosmos"
                      value={formData.cosmosToken || ''}
                      onChange={(e) => setFormData({ ...formData, cosmosToken: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono bg-surface"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Armazenado localmente neste terminal. Não é compartilhado nem enviado no backup relacional.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textMuted uppercase mb-1">
                      User-Agent HTTP (Identificação da Aplicação)
                    </label>
                    <input
                      type="text"
                      placeholder="MercadoPOS"
                      value={formData.cosmosUserAgent || ''}
                      onChange={(e) => setFormData({ ...formData, cosmosUserAgent: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-surface"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  updateSettings(formData);
                  showToast('Configurações de consulta de produtos salvas!');
                }}
                className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Configurações de Consulta</span>
              </button>
            </div>
          </div>

          {/* ATUALIZAÇÕES REMOTAS (AUTO-UPDATER) */}
          <div className="bg-surface rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-textMain flex items-center space-x-2">
                  <CloudDownload className="w-5 h-5 text-primary" />
                  <span>Atualizações Globais do Sistema</span>
                </h3>
                <p className="text-xs text-textMuted mt-0.5">
                  Versão atual instalada: <strong className="font-mono text-slate-800">v{appVersion}</strong>
                </p>
              </div>

              <button
                type="button"
                disabled={updateStatus.state === 'CHECKING' || updateStatus.state === 'DOWNLOADING'}
                onClick={handleCheckUpdates}
                className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${updateStatus.state === 'CHECKING' ? 'animate-spin' : ''}`} />
                <span>{updateStatus.state === 'CHECKING' ? 'Buscando...' : 'Verificar Atualizações'}</span>
              </button>
            </div>

            {/* STATUS DO AUTO-UPDATER */}
            {updateStatus.state === 'AVAILABLE' && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-3 animate-fade-in">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-emerald-900 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Nova versão disponível para instalação: <strong>v{updateStatus.version}</strong></span>
                    </span>
                    <div className="bg-white/80 border border-emerald-100 rounded-lg p-2.5">
                      <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
                        Melhorias e Novidades:
                      </p>
                      <ul className="text-xs text-slate-700 space-y-1">
                        {parseReleaseHighlights(updateStatus.body, updateStatus.version).map((item, idx) => (
                          <li key={idx} className="flex items-center space-x-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleInstallUpdate}
                  className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all active:scale-95"
                >
                  <CloudDownload className="w-4 h-4" />
                  <span>Baixar e Atualizar Agora</span>
                </button>
              </div>
            )}

            {updateStatus.state === 'DOWNLOADING' && (() => {
              const downloadProgressPercent = (updateStatus.totalBytes && updateStatus.totalBytes > 0)
                ? Math.min(100, Math.round(((updateStatus.downloadedBytes || 0) / updateStatus.totalBytes) * 100))
                : 0;

              return (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl space-y-2 animate-fade-in">
                  <div className="flex items-center space-x-2 text-xs font-bold text-blue-900">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Baixando atualização ({downloadProgressPercent}%)...</span>
                  </div>
                  <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full transition-all duration-300"
                      style={{ width: `${downloadProgressPercent}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {updateStatus.state === 'DOWNLOADED' && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-900 font-bold flex items-center space-x-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Atualização pronta! O aplicativo será reiniciado em instantes...</span>
              </div>
            )}

            {updateStatus.state === 'UP_TO_DATE' && (
              <p className="text-xs text-emerald-700 font-medium flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Você está utilizando a versão mais recente do FinPDV.</span>
              </p>
            )}

            {updateStatus.state === 'ERROR' && (
              <p className="text-xs text-red-600 font-medium">
                {updateStatus.error}
              </p>
            )}
          </div>

          {/* ÁREA DE PERIGO: ZERAR DADOS */}
          <div className="bg-red-50/50 rounded-xl border border-red-200 p-6 space-y-3">
            <div className="flex items-center space-x-2 text-red-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Área Restrita: Zerar Todos os Dados do Sistema</span>
            </div>
            <p className="text-xs text-red-600 leading-relaxed">
              Esta ação apaga todo o catálogo de produtos, histórico de vendas, fechamentos de caixa e configurações salvas no banco SQLite. Use com extrema cautela apenas para reiniciar a loja.
            </p>
            <button
              type="button"
              onClick={handleOpenResetModal}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <Skull className="w-4 h-4" />
              <span>Zerar Dados do Sistema</span>
            </button>
          </div>
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

      {/* MODAL PARA ZERAR DADOS */}
      <ResetDataModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={async () => {
          await useSettingsStore.getState().resetAllData();
          setIsResetModalOpen(false);
          alert('Todos os dados do sistema foram apagados com sucesso! Uma cópia de emergência foi salva.');
          window.location.reload();
        }}
      />
    </div>
  );
}

/**
 * Modal de confirmação para a ação destrutiva de zerar o banco de dados.
 */
function ResetDataModal({ isOpen, onClose, onConfirm }: { isOpen: boolean; onClose: () => void; onConfirm: () => Promise<void>; }) {
  const { currentUser } = useFinPdvStore();
  const [confirmationText, setConfirmationText] = useState('');
  const [passwordText, setPasswordText] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const confirmationPhrase = 'ZERAR TUDO';

  useEffect(() => {
    if (isOpen) {
      setConfirmationText('');
      setPasswordText('');
      setAuthError(null);
      setIsDeleting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmClick = async () => {
    if (confirmationText !== confirmationPhrase || isDeleting) return;
    setAuthError(null);
    setIsDeleting(true);

    try {
      // Validar senha do Administrador logado
      if (currentUser) {
        const isValid = await authService.verifyCredential(passwordText, currentUser.passwordHash);
        const isPinValid = currentUser.pinHash ? await authService.verifyCredential(passwordText, currentUser.pinHash) : false;
        if (!isValid && !isPinValid) {
          setAuthError('Credencial de Administrador incorreta.');
          setIsDeleting(false);
          return;
        }
      }

      await onConfirm();
    } catch (err: any) {
      console.error('Erro ao confirmar exclusão:', err);
      setAuthError(err.message || 'Erro ao zerar dados.');
      setIsDeleting(false);
    }
  };

  const isFormFilled = confirmationText === confirmationPhrase && passwordText.length >= 4;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border-2 border-red-500 overflow-hidden animate-fade-in">
        <div className="p-5 bg-red-600 text-white flex items-center space-x-3">
          <Skull className="w-8 h-8 shrink-0" />
          <div>
            <h3 className="font-black text-lg">AÇÃO IRREVERSÍVEL PROTEGIDA</h3>
            <p className="text-xs text-red-100 mt-0.5">Confirmação de segurança de exclusão total.</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700">
            Você está prestes a <strong>apagar permanentemente todos os dados</strong> do sistema, incluindo:
          </p>
          <ul className="text-xs list-disc list-inside bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 text-slate-600">
            <li>Todos os produtos, códigos de barras e categorias</li>
            <li>Todo o histórico de vendas e itens vendidos</li>
            <li>Todos os fechamentos e movimentações de caixa</li>
            <li>Todos os clientes, fornecedores e compras</li>
          </ul>

          {authError && (
            <div className="p-2.5 bg-red-100 border border-red-300 rounded-lg text-red-700 text-xs font-semibold">
              {authError}
            </div>
          )}

          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Senha ou PIN do Administrador:
              </label>
              <input
                type="password"
                value={passwordText}
                onChange={(e) => setPasswordText(e.target.value)}
                placeholder="Digite sua senha ou PIN de Administrador"
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg font-mono text-center font-bold text-sm focus:border-red-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Digite <strong className="text-red-600">{confirmationPhrase}</strong> para autorizar:
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                disabled={isDeleting}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg font-mono text-center text-sm font-bold tracking-wider uppercase focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isDeleting}
              className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={!isFormFilled || isDeleting}
              className="bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'Apagando tudo...' : 'Autorizar e Zerar Dados'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}