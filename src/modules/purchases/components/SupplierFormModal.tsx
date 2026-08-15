import React, { useState } from 'react';
import { X, Truck, Building2 } from 'lucide-react';
import { Supplier } from '../types';

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplierData: Omit<Supplier, 'id' | 'createdAt'>) => void;
  initialData?: Supplier | null;
}

export function SupplierFormModal({ isOpen, onClose, onSave, initialData }: SupplierFormModalProps) {
  if (!isOpen) return null;

  const [companyName, setCompanyName] = useState(initialData?.companyName || '');
  const [tradeName, setTradeName] = useState(initialData?.tradeName || '');
  const [document, setDocument] = useState(initialData?.document || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [contactName, setContactName] = useState(initialData?.contactName || '');
  const [email, setEmail] = useState(initialData?.email || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !document.trim()) {
      alert('Razão Social e CNPJ/CPF são obrigatórios.');
      return;
    }

    onSave({
      companyName: companyName.trim(),
      tradeName: tradeName.trim() || companyName.trim(),
      document: document.trim(),
      phone: phone.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-primary" />
            <span>{initialData ? 'Editar Fornecedor' : 'Cadastrar Novo Fornecedor'}</span>
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Razão Social *</label>
              <input
                type="text"
                required
                placeholder="Ex: Grãos do Sul Alimentos S.A."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Nome Fantasia</label>
              <input
                type="text"
                placeholder="Ex: Grãos do Sul"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">CNPJ / CPF *</label>
              <input
                type="text"
                required
                placeholder="00.000.000/0001-00"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Pessoa de Contato</label>
              <input
                type="text"
                placeholder="Ex: Carlos Representante"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Telefone / WhatsApp</label>
              <input
                type="text"
                placeholder="(53) 99999-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">E-mail Comercial</label>
            <input
              type="email"
              placeholder="pedidos@fornecedor.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-lg text-xs font-bold shadow-sm"
            >
              Salvar Fornecedor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}