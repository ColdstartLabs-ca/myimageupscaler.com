import { JSX, useState } from 'react';
import { AuthErrorHandler } from './components/auth/AuthErrorHandler';
import { Toast } from './components/common/Toast';
import { Layout } from './components/layout/Layout';
import { AuthenticationModal } from './components/modal/auth/AuthenticationModal';
import { TabNavigation } from './components/navigation/TabNavigation';
import { categories, initialAssets } from './mocks/data';
import { IAsset } from './types';
import { CategoryView } from './views/CategoryView';
import { SummaryView } from './views/SummaryView';

export const App = (): JSX.Element => {
  const [activeTab, setActiveTab] = useState<string>('summary');
  const [assets] = useState<IAsset[]>(initialAssets);

  return (
    <>
      <Layout>
        <AuthErrorHandler />
        <AuthenticationModal />
        <Toast />
        <TabNavigation categories={categories} activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1">
          {activeTab === 'summary' ? (
            <SummaryView assets={assets} />
          ) : (
            <CategoryView
              assets={assets.filter(asset => asset.category === activeTab)}
              category={categories.find(cat => cat.id === activeTab)!}
            />
          )}
        </main>
      </Layout>
    </>
  );
};
