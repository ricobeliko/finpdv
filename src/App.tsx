import React, { useState, useEffect } from 'react';
import { AppLayout, ModuleType } from './shared/layouts/AppLayout';
import { ProductsPage } from './modules/products/ProductsPage';
import { PosPage } from './modules/pos/PosPage';
import { CashPage } from './modules/cash/CashPage';
import { PurchasesPage } from './modules/purchases/PurchasesPage';
import { CustomersPage } from './modules/customers/CustomersPage';
import { ReportsPage } from './modules/reports/ReportsPage';
import { UsersPage } from './modules/users/UsersPage';
import { SettingsPage } from './modules/settings/SettingsPage';
import { MaintenancePage } from './modules/maintenance/MaintenancePage';
import { InitialSetupWizardModal } from './modules/onboarding/InitialSetupWizardModal';
import { useFinPdvStore } from './core/finpdv/finpdvStore';
import { useProductStore } from './modules/products/productStore';
import { useCashStore } from './modules/cash/cashStore';
import { useUserStore } from './modules/users/userStore';
import { SwitchUserDecisionModal, UserSelectModal } from './shared/components/SwitchUserModal';
import { CloseCashBlindModal, CashClosingReportModal } from './modules/cash/components/CashModals';
import { CashClosingSummary } from './modules/cash/types';
import { usePosStore } from './modules/pos/posStore';

import { useCustomerStore } from './modules/customers/customerStore';
import { useSettingsStore } from './modules/settings/settingsStore';
import { enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AutoUpdateNotification } from './shared/components/AutoUpdateNotification';

// Módulos restritos a administradores/gerentes
const ADMIN_ONLY_MODULES: ModuleType[] = ['SETTINGS', 'USERS', 'REPORTS', 'PURCHASES', 'PRODUCTS', 'MAINTENANCE'];

export default function App() {
  const [currentModule, setCurrentModule] = useState<ModuleType>('POS');
  const { loadFromDb } = useProductStore();
  const { currentSession, initCash, closeSession } = useCashStore();
  const { currentUser, switchUser } = useUserStore();
  const { loadFromDb: loadCustomers } = useCustomerStore();
  const { isConfigured, loadFinPdvData } = useFinPdvStore();

  // Estados dos Modais de Troca
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showUserSelectModal, setShowUserSelectModal] = useState(false);
  const [showCloseCashModal, setShowCloseCashModal] = useState(false);
  const [closingSummary, setClosingSummary] = useState<CashClosingSummary | null>(null);

  useEffect(() => {
    loadFinPdvData();
    loadFromDb();
    initCash();
    loadCustomers();
    useSettingsStore.getState().checkMonthlyAutoBackup();
    useUserStore.getState().loadUsersFromDb();

    // Garante que a aplicação inicia em tela cheia (modo quiosque PDV), ocultando a barra de tarefas do Windows
    try {
      const win = getCurrentWindow();
      win.setFullscreen(true).catch(() => {
        win.maximize().catch(() => {});
      });
    } catch (_) {}

    // Ativa o início automático com o Windows
    isEnabled().then((active) => {
      if (!active) {
        enable().catch((err) => console.warn('Autostart enable:', err));
      }
    }).catch(() => {});
  }, []);

  // REDIRECIONA AUTOMATICAMENTE CASO O OPERADOR NÃO TENHA PERMISSÃO NA ABA ATUAL
  useEffect(() => {
    const role = currentUser?.roleId?.toUpperCase() || 'CASHIER';
    if (role === 'CASHIER' || role === 'CAIXA') {
      if (ADMIN_ONLY_MODULES.includes(currentModule)) {
        setCurrentModule('POS');
      }
    }
  }, [currentUser, currentModule]);

  // 1. Gatilho do botão "Trocar Operador"
  const handleRequestSwitchUser = () => {
    if (currentSession?.isOpen) {
      setShowDecisionModal(true);
    } else {
      setShowUserSelectModal(true);
    }
  };

  // 2. Opção: Pausar Caixa
  const handlePauseCash = () => {
    setShowDecisionModal(false);
    setShowUserSelectModal(true);
  };

  // 3. Opção: Encerrar Caixa
  const handleChooseCloseCash = () => {
    const posState = usePosStore.getState();
    if (posState.hasActiveSale()) {
      alert(`⚠️ ATENÇÃO: Há uma venda em andamento no PDV com ${posState.cart.length} item(ns).\n\nConclua a venda ou cancele os itens no PDV antes de encerrar o caixa.`);
      setShowDecisionModal(false);
      setCurrentModule('POS');
      return;
    }
    setShowDecisionModal(false);
    setShowCloseCashModal(true);
  };

  // 4. Confirmação do Fechamento Cego
  const handleConfirmCloseCash = async (countedCents: number) => {
    const posState = usePosStore.getState();
    if (posState.hasActiveSale()) {
      alert(`⚠️ ATENÇÃO: Há uma venda em andamento no PDV com ${posState.cart.length} item(ns).\n\nConclua ou cancele a venda antes de encerrar o caixa.`);
      setShowCloseCashModal(false);
      setCurrentModule('POS');
      return;
    }
    const summary = await closeSession(countedCents);
    setShowCloseCashModal(false);
    setClosingSummary(summary);
  };

  // 5. Após fechar o relatório do caixa
  const handleDismissClosingReport = () => {
    setClosingSummary(null);
    setShowUserSelectModal(true);
  };

  // 6. Seleção do novo operador
  const handleSelectNewUser = (userId: string) => {
    switchUser(userId);
    setShowUserSelectModal(false);
    setCurrentModule('POS'); // Garante que o novo operador entra direto no PDV
  };

  return (
    <>
      <AppLayout 
        activeModule={currentModule} 
        onNavigate={setCurrentModule}
        onRequestSwitchUser={handleRequestSwitchUser}
      >
        {currentModule === 'POS' && <PosPage />}
        {currentModule === 'PRODUCTS' && <ProductsPage />}
        {currentModule === 'CASH' && <CashPage />}
        {currentModule === 'PURCHASES' && <PurchasesPage />}
        {currentModule === 'CUSTOMERS' && <CustomersPage />}
        {currentModule === 'REPORTS' && <ReportsPage />}
        {currentModule === 'USERS' && <UsersPage />}
        {currentModule === 'SETTINGS' && <SettingsPage />}
        {currentModule === 'MAINTENANCE' && <MaintenancePage />}
      </AppLayout>

      {/* MODAL DO ASSISTENTE DE PRIMEIRO USO DO FINPDV */}
      {!isConfigured && <InitialSetupWizardModal />}

      {/* MODAL 1: TRAVA DE SEGURANÇA (PAUSAR VS ENCERRAR) */}
      <SwitchUserDecisionModal
        isOpen={showDecisionModal}
        operatorName={currentUser?.name || currentSession?.userName || 'Operador'}
        onPauseCash={handlePauseCash}
        onCloseCash={handleChooseCloseCash}
        onCancel={() => setShowDecisionModal(false)}
      />

      {/* MODAL 2: SELEÇÃO DE NOVO OPERADOR */}
      <UserSelectModal
        isOpen={showUserSelectModal}
        onSelectUser={handleSelectNewUser}
        onClose={() => setShowUserSelectModal(false)}
      />

      {/* MODAL 3: FECHAMENTO CEGO */}
      <CloseCashBlindModal
        isOpen={showCloseCashModal}
        onClose={() => setShowCloseCashModal(false)}
        onConfirm={handleConfirmCloseCash}
      />

      {/* MODAL 4: RELATÓRIO DO CAIXA ENCERRADO */}
      {closingSummary && (
        <CashClosingReportModal
          summary={closingSummary}
          onClose={handleDismissClosingReport}
        />
      )}

      {/* NOTIFICAÇÃO FLUTUANTE DE ATUALIZAÇÃO AUTOMÁTICA */}
      <AutoUpdateNotification />
    </>
  );
}