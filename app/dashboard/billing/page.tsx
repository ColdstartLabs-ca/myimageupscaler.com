'use client';

import { CreditCard, Package, Receipt } from 'lucide-react';

export default function BillingPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <p className="text-slate-500 mt-1">
          Manage your subscription and payment methods
        </p>
      </div>

      {/* Current Plan */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Package size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Current Plan</h2>
            <p className="text-sm text-slate-500">Free Plan</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Credits remaining</p>
              <p className="text-2xl font-bold text-slate-900">5 / 5</p>
            </div>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              Upgrade Plan
            </button>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <CreditCard size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Payment Methods</h2>
            <p className="text-sm text-slate-500">Add or manage your payment methods</p>
          </div>
        </div>
        <div className="text-center py-8 text-slate-500">
          <p>No payment methods added yet</p>
          <button className="mt-4 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Add Payment Method
          </button>
        </div>
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Receipt size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Billing History</h2>
            <p className="text-sm text-slate-500">View your past invoices and receipts</p>
          </div>
        </div>
        <div className="text-center py-8 text-slate-500">
          <p>No billing history yet</p>
        </div>
      </div>
    </div>
  );
}
