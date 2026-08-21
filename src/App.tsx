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
import { useProductStore } from './modules/products/productStore';
import { useCashStore } from './modules/cash/cashStore';
import { useUserStore } from './modules/users/userStore';
import { SwitchUserDecisionModal, UserSelectModal } from './shared/components/SwitchUserModal';
import { CloseCashBlindModal, CashClosingReportModal } from './modules/cash/components/CashModals';
import { CashClosingSummary } from './modules/cash/types';

import { useCustomerStore } from './modules/customers/customerStore';
import { enable, isEnabled } from '@tauri-apps/plugin-autostart';

// Módulos restritos a administradores/gerentes
const ADMIN_ONLY_MODULES: ModuleType[] = ['SETTINGS', 'USERS', 'REPORTS', 'PURCHASES', 'PRODUCTS'];

export default function App() {
  const [currentModule, setCurrentModule] = useState<ModuleType>('POS');
  const { loadFromDb } = useProductStore();
  const { currentSession, initCash, closeSession } = useCashStore();
  const { currentUser, switchUser } = useUserStore();
  const { loadFromDb: loadCustomers } = useCustomerStore();

  // Estados dos Modais de Troca
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showUserSelectModal, setShowUserSelectModal] = useState(false);
  const [showCloseCashModal, setShowCloseCashModal] = useState(false);
  const [closingSummary, setClosingSummary] = useState<CashClosingSummary | null>(null);

  useEffect(() => {
    loadFromDb();
    initCash();
    loadCustomers();

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
    setShowDecisionModal(false);
    setShowCloseCashModal(true);
  };

  // 4. Confirmação do Fechamento Cego
  const handleConfirmCloseCash = async (countedCents: number) => {
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
      </AppLayout>

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
    </>
  );
}